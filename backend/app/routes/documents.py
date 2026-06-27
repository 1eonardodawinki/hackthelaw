"""Document ingestion routes — upload, confirm provenance, extract with AI.

Flow:
  1. POST /api/documents/upload         → extract text, return preview
  2. POST /api/documents/confirm        → user confirms provenance, saves to graph
  3. POST /api/documents/{id}/extract   → run Strands agent to extract entities
"""

import os
import uuid
import time
import tempfile

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from app.db import read_query, write_query
from app.ingest.extract_text import extract_text, content_hash

router = APIRouter(prefix="/api/documents", tags=["documents"])

# In-memory store for pending uploads (pre-confirmation)
# In production this would be Redis or a DB table
_pending_uploads: dict[str, dict] = {}


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------------------
# Step 1: Upload — extract text and return preview
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    matter_id: str = Form(...),
    title: str = Form(""),
) -> dict:
    """Upload a PDF or text file. Returns extracted text preview for confirmation.

    The document is NOT saved to the graph yet — call /confirm to finalize.
    """
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    # Determine content type
    ct = file.content_type or ""
    if file.filename.endswith(".pdf"):
        ct = "application/pdf"
    elif file.filename.endswith((".md", ".txt", ".text")):
        ct = "text/plain"

    if ct not in ("application/pdf", "text/plain", "text/markdown"):
        raise HTTPException(400, f"Unsupported file type: {ct}. Use PDF, .txt, or .md")

    # Verify matter exists
    rows = await read_query("MATCH (m:Matter {id: $id}) RETURN m.id AS id", {"id": matter_id})
    if not rows:
        raise HTTPException(404, f"Matter '{matter_id}' not found")

    # Save to temp file and extract text
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        text = extract_text(tmp_path, ct)
    finally:
        os.unlink(tmp_path)

    if not text.strip():
        raise HTTPException(422, "Could not extract any text from the file")

    # Generate preview and store pending
    upload_id = str(uuid.uuid4())
    c_hash = content_hash(text)

    # Check for duplicate
    existing = await read_query(
        "MATCH (v:Version {content_hash: $hash}) RETURN v.id AS id, v.document_id AS doc_id LIMIT 1",
        {"hash": c_hash},
    )

    _pending_uploads[upload_id] = {
        "upload_id": upload_id,
        "matter_id": matter_id,
        "title": title or file.filename,
        "filename": file.filename,
        "content_type": ct,
        "text": text,
        "content_hash": c_hash,
        "char_count": len(text),
        "line_count": text.count("\n") + 1,
    }

    return {
        "upload_id": upload_id,
        "filename": file.filename,
        "title": title or file.filename,
        "content_hash": c_hash,
        "char_count": len(text),
        "line_count": text.count("\n") + 1,
        "preview": text[:2000],  # First 2000 chars as preview
        "full_text": text,
        "duplicate": existing[0] if existing else None,
    }


# ---------------------------------------------------------------------------
# Step 2: Confirm — user confirms provenance and saves to graph
# ---------------------------------------------------------------------------

class ConfirmRequest(BaseModel):
    upload_id: str
    source: str  # "human" | "ai" | "ocr" | "upload"
    author: str | None = None  # required if source=human
    model: str | None = None   # required if source=ai
    doc_type: str = ""         # "contract", "petition", "notes", "email", etc.


@router.post("/confirm")
async def confirm_document(body: ConfirmRequest) -> dict:
    """Confirm provenance and save the document + version to the graph."""
    pending = _pending_uploads.pop(body.upload_id, None)
    if not pending:
        raise HTTPException(404, f"Upload '{body.upload_id}' not found or already confirmed")

    # Validate provenance
    if body.source == "human" and not body.author:
        raise HTTPException(422, "author is required when source is 'human'")
    if body.source == "ai" and not body.model:
        raise HTTPException(422, "model is required when source is 'ai'")
    if body.source not in ("human", "ai", "ocr", "upload"):
        raise HTTPException(422, f"Invalid source: {body.source}. Use: human, ai, ocr, upload")

    matter_id = pending["matter_id"]
    document_id = f"{matter_id}::doc::{str(uuid.uuid4())[:8]}"
    version_id = f"{document_id}::v1"
    ts = _now_ms()

    # Create Document node
    await write_query(
        """
        MATCH (m:Matter {id: $mid})
        CREATE (d:Document {
            id: $did, title: $title, doc_type: $doc_type,
            matter_id: $mid, filename: $filename, created_at: $ts
        })
        CREATE (d)-[:BELONGS_TO]->(m)
        """,
        {
            "mid": matter_id, "did": document_id,
            "title": pending["title"], "doc_type": body.doc_type,
            "filename": pending["filename"], "ts": ts,
        },
    )

    # Create Version node (immutable snapshot with provenance)
    await write_query(
        """
        MATCH (d:Document {id: $did})
        CREATE (v:Version {
            id: $vid, version_no: 1, source: $source,
            content: $content, content_hash: $hash,
            author: $author, model: $model, created_at: $ts,
            document_id: $did
        })
        CREATE (d)-[:HAS_VERSION]->(v)
        """,
        {
            "did": document_id, "vid": version_id,
            "source": body.source, "content": pending["text"],
            "hash": pending["content_hash"],
            "author": body.author, "model": body.model, "ts": ts,
        },
    )

    # Create Episode tracking this ingestion
    episode_id = str(uuid.uuid4())
    await write_query(
        """
        CREATE (e:Episode {
            id: $eid, kind: 'DOCUMENT_INGESTED',
            label: $label, payloadRef: $did, createdAt: $ts
        })
        WITH e
        MATCH (d:Document {id: $did})
        MERGE (e)-[:MENTIONS]->(d)
        """,
        {
            "eid": episode_id,
            "label": f"Document uploaded: {pending['title']}",
            "did": document_id, "ts": ts,
        },
    )

    return {
        "document_id": document_id,
        "version_id": version_id,
        "episode_id": episode_id,
        "content_hash": pending["content_hash"],
        "source": body.source,
        "title": pending["title"],
    }


# ---------------------------------------------------------------------------
# Step 3: Extract — run Strands agent to parse document into graph nodes
# ---------------------------------------------------------------------------

class ExtractRequest(BaseModel):
    provider: str = "anthropic"           # "anthropic", "openai", "ollama"
    model_name: str = "claude-haiku-4-5-20251001"
    api_key: str = ""                     # user provides their key
    api_endpoint: str = ""                # custom endpoint (e.g. Ollama URL)


@router.post("/{document_id}/extract")
async def extract_document(document_id: str, body: ExtractRequest) -> dict:
    """Run the AI extraction agent on a saved document.

    The agent reads the document text and creates Party, Deadline, Clause,
    and Note nodes in the graph, linked to this document's matter.
    """
    # Fetch document and its latest version text
    rows = await read_query(
        """
        MATCH (d:Document {id: $did})-[:HAS_VERSION]->(v:Version)
        RETURN d.matter_id AS matter_id, d.title AS title, v.content AS content, v.id AS version_id
        ORDER BY v.version_no DESC LIMIT 1
        """,
        {"did": document_id},
    )
    if not rows:
        raise HTTPException(404, f"Document '{document_id}' not found or has no versions")

    row = rows[0]
    matter_id = row["matter_id"]
    text = row["content"]

    # Use API key from request, fall back to env
    api_key = body.api_key
    if not api_key and body.provider == "anthropic":
        from app.config import settings
        api_key = settings.anthropic_api_key

    if not api_key and body.provider in ("anthropic", "openai"):
        raise HTTPException(422, f"API key required for provider '{body.provider}'. Pass it in the request or set ANTHROPIC_API_KEY in .env.")

    from app.ingest.extraction_agent import run_extraction

    result = await run_extraction(
        document_text=text,
        matter_id=matter_id,
        document_id=document_id,
        provider=body.provider,
        model_name=body.model_name,
        api_key=api_key,
        api_endpoint=body.api_endpoint,
    )

    return {
        "document_id": document_id,
        "matter_id": matter_id,
        "episode_id": result["episode_id"],
        "entities_extracted": len(result["entities"]),
        "relations_extracted": len(result["relations"]),
        "entities": result["entities"],
        "relations": result["relations"],
    }


# ---------------------------------------------------------------------------
# List documents for a matter (convenience)
# ---------------------------------------------------------------------------

@router.get("/by-matter/{matter_id}")
async def list_documents_for_matter(matter_id: str) -> list[dict]:
    """List all documents for a matter, with version count."""
    rows = await read_query(
        """
        MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $mid})
        OPTIONAL MATCH (d)-[:HAS_VERSION]->(v:Version)
        WITH d, count(v) AS version_count, max(v.created_at) AS latest_version_at
        RETURN d {.id, .title, .doc_type, .filename, .created_at} AS doc,
               version_count, latest_version_at
        ORDER BY d.created_at DESC
        """,
        {"mid": matter_id},
    )
    return [
        {**r["doc"], "version_count": r["version_count"], "latest_version_at": r["latest_version_at"]}
        for r in rows
    ]
