"""CRUD routes for Matters, Parties, Documents, and Deadlines."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.db import read_query, write_query
from app.models import (
    MatterCreate,
    Matter,
    PartyCreate,
    Party,
    DocumentCreate,
    Document,
    DeadlineCreate,
    Deadline,
)

router = APIRouter(prefix="/api/matters", tags=["matters"])


# ---------------------------------------------------------------------------
# Matters
# ---------------------------------------------------------------------------


@router.get("")
async def list_matters() -> list[dict]:
    return await read_query(
        """
        MATCH (m:Matter)
        OPTIONAL MATCH (m)-[:HAS_PARTY]->(p:Party)
        OPTIONAL MATCH (d:Document)-[:BELONGS_TO]->(m)
        OPTIONAL MATCH (dl:Deadline)-[:BELONGS_TO]->(m)
        WITH m,
             count(DISTINCT p) AS party_count,
             count(DISTINCT d) AS doc_count,
             count(DISTINCT dl) AS deadline_count
        RETURN m {.id, .name, .description, .client, .tags, .created_at, .updated_at} AS matter,
               party_count, doc_count, deadline_count
        ORDER BY m.name
        """
    )


@router.get("/{matter_id}")
async def get_matter(matter_id: str) -> dict:
    rows = await read_query(
        "MATCH (m:Matter {id: $id}) RETURN m {.*} AS matter",
        {"id": matter_id},
    )
    if not rows:
        raise HTTPException(404, f"Matter '{matter_id}' not found")

    parties = await read_query(
        "MATCH (:Matter {id: $id})-[:HAS_PARTY]->(p:Party) RETURN p {.*} AS party",
        {"id": matter_id},
    )
    documents = await read_query(
        "MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $id}) RETURN d {.*} AS document",
        {"id": matter_id},
    )
    deadlines = await read_query(
        "MATCH (dl:Deadline)-[:BELONGS_TO]->(:Matter {id: $id}) RETURN dl {.*} AS deadline ORDER BY dl.due_at",
        {"id": matter_id},
    )

    return {
        "matter": rows[0]["matter"],
        "parties": [r["party"] for r in parties],
        "documents": [r["document"] for r in documents],
        "deadlines": [r["deadline"] for r in deadlines],
    }


@router.post("", status_code=201)
async def create_matter(body: MatterCreate) -> dict:
    rows = await write_query(
        """
        MERGE (m:Matter {id: $id})
        ON CREATE SET m.name = $name,
                      m.description = $description,
                      m.client = $client,
                      m.tags = $tags,
                      m.created_at = datetime(),
                      m.updated_at = datetime()
        ON MATCH SET  m.name = $name,
                      m.description = $description,
                      m.client = $client,
                      m.tags = $tags,
                      m.updated_at = datetime()
        RETURN m {.*} AS matter
        """,
        body.model_dump(),
    )
    return rows[0]


@router.delete("/{matter_id}", status_code=204)
async def delete_matter(matter_id: str):
    await write_query(
        "MATCH (m:Matter {id: $id}) DETACH DELETE m",
        {"id": matter_id},
    )


# ---------------------------------------------------------------------------
# Parties (scoped to a matter)
# ---------------------------------------------------------------------------


@router.get("/{matter_id}/parties")
async def list_parties(matter_id: str) -> list[dict]:
    rows = await read_query(
        "MATCH (:Matter {id: $mid})-[:HAS_PARTY]->(p:Party) RETURN p {.*} AS party",
        {"mid": matter_id},
    )
    return [r["party"] for r in rows]


@router.post("/{matter_id}/parties", status_code=201)
async def add_party(matter_id: str, body: PartyCreate) -> dict:
    rows = await write_query(
        """
        MATCH (m:Matter {id: $mid})
        MERGE (p:Party {id: $id})
        ON CREATE SET p.name = $name, p.role = $role
        ON MATCH SET  p.name = $name, p.role = $role
        MERGE (m)-[:HAS_PARTY]->(p)
        RETURN p {.*} AS party
        """,
        {"mid": matter_id, **body.model_dump()},
    )
    if not rows:
        raise HTTPException(404, f"Matter '{matter_id}' not found")
    return rows[0]


@router.delete("/{matter_id}/parties/{party_id}", status_code=204)
async def remove_party(matter_id: str, party_id: str):
    await write_query(
        """
        MATCH (:Matter {id: $mid})-[r:HAS_PARTY]->(p:Party {id: $pid})
        DELETE r
        """,
        {"mid": matter_id, "pid": party_id},
    )


# ---------------------------------------------------------------------------
# Documents (scoped to a matter)
# ---------------------------------------------------------------------------


@router.get("/{matter_id}/documents")
async def list_documents(matter_id: str) -> list[dict]:
    rows = await read_query(
        "MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $mid}) RETURN d {.*} AS document",
        {"mid": matter_id},
    )
    return [r["document"] for r in rows]


@router.post("/{matter_id}/documents", status_code=201)
async def add_document(matter_id: str, body: DocumentCreate) -> dict:
    rows = await write_query(
        """
        MATCH (m:Matter {id: $mid})
        MERGE (d:Document {id: $id})
        ON CREATE SET d.title = $title,
                      d.doc_type = $doc_type,
                      d.matter_id = $mid,
                      d.created_at = datetime()
        ON MATCH SET  d.title = $title,
                      d.doc_type = $doc_type
        MERGE (d)-[:BELONGS_TO]->(m)
        RETURN d {.*} AS document
        """,
        {"mid": matter_id, **body.model_dump()},
    )
    if not rows:
        raise HTTPException(404, f"Matter '{matter_id}' not found")
    return rows[0]


# ---------------------------------------------------------------------------
# Deadlines (scoped to a matter)
# ---------------------------------------------------------------------------


@router.get("/{matter_id}/deadlines")
async def list_deadlines(matter_id: str) -> list[dict]:
    rows = await read_query(
        """
        MATCH (dl:Deadline)-[:BELONGS_TO]->(:Matter {id: $mid})
        RETURN dl {.*} AS deadline ORDER BY dl.due_at
        """,
        {"mid": matter_id},
    )
    return [r["deadline"] for r in rows]


@router.post("/{matter_id}/deadlines", status_code=201)
async def add_deadline(matter_id: str, body: DeadlineCreate) -> dict:
    rows = await write_query(
        """
        MATCH (m:Matter {id: $mid})
        MERGE (dl:Deadline {id: $id})
        ON CREATE SET dl.title = $title,
                      dl.due_at = datetime($due_at),
                      dl.description = $description,
                      dl.matter_id = $mid
        ON MATCH SET  dl.title = $title,
                      dl.due_at = datetime($due_at),
                      dl.description = $description
        MERGE (dl)-[:BELONGS_TO]->(m)
        RETURN dl {.*} AS deadline
        """,
        {"mid": matter_id, **body.model_dump() | {"due_at": body.due_at.isoformat()}},
    )
    if not rows:
        raise HTTPException(404, f"Matter '{matter_id}' not found")
    return rows[0]
