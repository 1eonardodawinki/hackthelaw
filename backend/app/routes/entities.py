"""Entity routes — list extracted entities for a matter."""

from fastapi import APIRouter

from app.db import read_query

router = APIRouter(prefix="/api/entities", tags=["entities"])


@router.get("/{matter_id}")
async def list_entities(matter_id: str) -> list[dict]:
    """Return all entities extracted for a matter, grouped by type."""
    rows = await read_query(
        """
        MATCH (e:Entity)-[:BELONGS_TO]->(:Matter {id: $mid})
        RETURN e.id AS id, e.name AS name, e.entity_type AS type,
               e.description AS description, e.text AS text,
               e.matter_id AS matter_id, e.document_id AS document_id,
               labels(e) AS labels, e {.*} AS properties
        ORDER BY e.entity_type, e.name
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
