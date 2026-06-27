"""Entity routes — list extracted entities for a matter, with temporal context."""

from __future__ import annotations

from fastapi import APIRouter

from app.db import read_query

router = APIRouter(prefix="/api/entities", tags=["entities"])


@router.get("/{matter_id}")
async def list_entities(matter_id: str) -> list[dict]:
    """Return all entities extracted for a matter, with source document info."""
    rows = await read_query(
        """
        MATCH (e:Entity)-[:BELONGS_TO]->(:Matter {id: $mid})
        OPTIONAL MATCH (d:Document {id: e.document_id})
        RETURN e.id AS id, e.name AS name, e.entity_type AS type,
               e.description AS description, e.text AS text,
               e.matter_id AS matter_id, e.document_id AS document_id,
               e.extracted_at AS extracted_at,
               d.filename AS source_filename, d.title AS source_title,
               labels(e) AS labels, e {.*} AS properties
        ORDER BY e.extracted_at, e.entity_type, e.name
        """,
        {"mid": matter_id},
    )
    return rows


@router.get("/{matter_id}/summary")
async def entity_summary(matter_id: str) -> dict:
    """Return a count of entities by type for a matter."""
    rows = await read_query(
        """
        MATCH (e:Entity)-[:BELONGS_TO]->(:Matter {id: $mid})
        RETURN e.entity_type AS type, count(*) AS count
        ORDER BY count DESC
        """,
        {"mid": matter_id},
    )
    return {
        "matter_id": matter_id,
        "total": sum(r["count"] for r in rows),
        "by_type": {r["type"]: r["count"] for r in rows},
    }


@router.get("/{matter_id}/by-document")
async def entities_by_document(matter_id: str) -> list[dict]:
    """Return entities grouped by source document, ordered by extraction time.

    This powers the time-based entity flowchart.
    """
    # Get all documents for this matter, ordered by creation time
    docs = await read_query(
        """
        MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $mid})
        RETURN d.id AS id, d.title AS title, d.filename AS filename, d.created_at AS created_at
        ORDER BY d.created_at
        """,
        {"mid": matter_id},
    )

    result = []
    for doc in docs:
        entities = await read_query(
            """
            MATCH (e:Entity {document_id: $did})-[:BELONGS_TO]->(:Matter {id: $mid})
            RETURN e.id AS id, e.name AS name, e.entity_type AS type,
                   e.description AS description, e.extracted_at AS extracted_at
            ORDER BY e.entity_type, e.name
            """,
            {"did": doc["id"], "mid": matter_id},
        )

        if entities:
            # Group entities by type within this document
            by_type: dict[str, list[dict]] = {}
            for e in entities:
                t = e.get("type", "Unknown")
                by_type.setdefault(t, []).append(e)

            result.append({
                "document_id": doc["id"],
                "document_title": doc.get("title") or doc.get("filename") or doc["id"],
                "document_filename": doc.get("filename", ""),
                "created_at": doc.get("created_at"),
                "entity_count": len(entities),
                "entities_by_type": by_type,
                "entities": entities,
            })

    return result
