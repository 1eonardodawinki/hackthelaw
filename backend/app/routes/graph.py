"""Graph visualization endpoint — returns nodes + edges for rendering.

Filters out structural noise (Episode nodes, BELONGS_TO/MENTIONS edges)
to show only meaningful entity relationships.
"""

from fastapi import APIRouter

from app.db import read_query

router = APIRouter(prefix="/api/graph", tags=["graph"])

NODE_COLORS = {
    "Matter": "#6366f1",         # indigo
    "Person": "#f59e0b",         # amber
    "Organization": "#0ea5e9",   # sky
    "LawFirm": "#0ea5e9",
    "Institution": "#0ea5e9",
    "Party": "#f59e0b",
    "Court": "#a855f7",          # purple
    "Judge": "#a855f7",
    "Document": "#10b981",       # emerald
    "Clause": "#22c55e",         # green
    "Section": "#22c55e",
    "Deadline": "#ef4444",       # red
    "Date": "#f97316",           # orange
    "TimeConstraint": "#f97316",
    "MonetaryAmount": "#eab308", # yellow
    "PaymentObligation": "#eab308",
    "Obligation": "#f97316",     # orange
    "Right": "#14b8a6",          # teal
    "Jurisdiction": "#6366f1",
    "GoverningLaw": "#6366f1",
    "Statute": "#8b5cf6",        # violet
    "LegalConcept": "#8b5cf6",
    "RiskFactor": "#ef4444",
    "Liability": "#ef4444",
    "Observation": "#64748b",    # slate
    "Version": "#8b5cf6",
}

# These edge types are structural plumbing — hide them from the visualization
HIDDEN_EDGE_TYPES = {"BELONGS_TO", "MENTIONS", "HAS_VERSION", "HAS_CHUNK"}

# These node labels are internal — hide them
HIDDEN_NODE_LABELS = {"Episode", "Version", "Chunk"}

NODE_SIZES = {
    "Matter": 35,
    "Person": 25,
    "Organization": 25,
    "Institution": 25,
    "Document": 22,
    "Clause": 18,
    "Section": 18,
}

DEFAULT_COLOR = "#94a3b8"
DEFAULT_SIZE = 20


def _get_type(labels: list[str]) -> str:
    """Pick the most specific label (skip 'Entity')."""
    for label in labels:
        if label != "Entity":
            return label
    return labels[0] if labels else "Unknown"


@router.get("")
async def get_full_graph() -> dict:
    return await _build_graph(matter_id=None)


@router.get("/{matter_id}")
async def get_matter_graph(matter_id: str) -> dict:
    return await _build_graph(matter_id=matter_id)


async def _build_graph(matter_id: str | None) -> dict:
    if matter_id:
        node_query = """
        MATCH (m:Matter {id: $mid})
        OPTIONAL MATCH (e:Entity)-[:BELONGS_TO]->(m)
        WITH collect(DISTINCT m) + collect(DISTINCT e) AS all_nodes
        UNWIND all_nodes AS n
        WITH n WHERE n IS NOT NULL
        RETURN DISTINCT elementId(n) AS eid, labels(n) AS labels,
               coalesce(n.name, n.title, n.id) AS label,
               n {.*} AS props
        """
        edge_query = """
        MATCH (m:Matter {id: $mid})
        OPTIONAL MATCH (e1:Entity)-[:BELONGS_TO]->(m)
        OPTIONAL MATCH (e2:Entity)-[:BELONGS_TO]->(m)
        WITH e1, e2
        WHERE e1 IS NOT NULL AND e2 IS NOT NULL
        MATCH (e1)-[r]->(e2)
        RETURN DISTINCT elementId(e1) AS source, elementId(e2) AS target,
               type(r) AS rel_type
        """
        params = {"mid": matter_id}
    else:
        node_query = """
        MATCH (n)
        WHERE (n:Matter OR n:Entity) AND NOT n:Episode
        RETURN DISTINCT elementId(n) AS eid, labels(n) AS labels,
               coalesce(n.name, n.title, n.id) AS label,
               n {.*} AS props
        """
        edge_query = """
        MATCH (a)-[r]->(b)
        WHERE (a:Matter OR a:Entity) AND (b:Matter OR b:Entity)
          AND NOT a:Episode AND NOT b:Episode
        RETURN DISTINCT elementId(a) AS source, elementId(b) AS target,
               type(r) AS rel_type
        """
        params = {}

    node_rows = await read_query(node_query, params)
    edge_rows = await read_query(edge_query, params)

    # Build nodes — skip hidden labels
    nodes = []
    node_ids = set()
    for row in node_rows:
        eid = row["eid"]
        labels = row["labels"]
        if any(lbl in HIDDEN_NODE_LABELS for lbl in labels):
            continue
        if eid in node_ids:
            continue
        node_ids.add(eid)
        entity_type = _get_type(labels)
        nodes.append({
            "id": eid,
            "label": row["label"],
            "type": entity_type,
            "color": NODE_COLORS.get(entity_type, DEFAULT_COLOR),
            "size": NODE_SIZES.get(entity_type, DEFAULT_SIZE),
            "properties": row["props"] or {},
        })

    # Build edges — skip structural noise
    edges = []
    for row in edge_rows:
        rel_type = row["rel_type"]
        if rel_type in HIDDEN_EDGE_TYPES:
            continue
        if row["source"] in node_ids and row["target"] in node_ids:
            edges.append({
                "source": row["source"],
                "target": row["target"],
                "type": rel_type,
            })

    return {"nodes": nodes, "edges": edges}
