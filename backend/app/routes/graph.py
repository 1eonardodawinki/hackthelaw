"""Graph visualization endpoint — returns nodes + edges for rendering."""

from fastapi import APIRouter

from app.db import read_query

router = APIRouter(prefix="/api/graph", tags=["graph"])

# Map Neo4j labels to visual properties
NODE_COLORS = {
    "Matter": "#6366f1",     # indigo
    "Party": "#f59e0b",      # amber
    "Document": "#10b981",   # emerald
    "Deadline": "#ef4444",   # red
    "Version": "#8b5cf6",    # violet
    "Chunk": "#64748b",      # slate
}


@router.get("")
async def get_full_graph() -> dict:
    """Return the entire graph (all matters). Use for overview visualization."""
    return await _build_graph(matter_id=None)


@router.get("/{matter_id}")
async def get_matter_graph(matter_id: str) -> dict:
    """Return the subgraph for a single matter."""
    return await _build_graph(matter_id=matter_id)


async def _build_graph(matter_id: str | None) -> dict:
    if matter_id:
        # All nodes and relationships reachable from this matter (up to 3 hops)
        query = """
        MATCH (m:Matter {id: $mid})
        OPTIONAL MATCH path = (m)-[*1..3]-(connected)
        WITH collect(DISTINCT m) + collect(DISTINCT connected) AS all_nodes
        UNWIND all_nodes AS n
        WITH collect(DISTINCT n) AS nodes
        UNWIND nodes AS n1
        UNWIND nodes AS n2
        OPTIONAL MATCH (n1)-[r]->(n2)
        WHERE r IS NOT NULL
        RETURN
            collect(DISTINCT {
                id: elementId(n1),
                label: coalesce(n1.name, n1.title, n1.id),
                type: labels(n1)[0],
                properties: n1 {.id, .name, .title, .description, .client, .role, .doc_type, .due_at}
            }) AS nodes,
            collect(DISTINCT {
                source: elementId(n1),
                target: elementId(n2),
                type: type(r)
            }) AS edges
        """
        params = {"mid": matter_id}
    else:
        query = """
        MATCH (n)
        WHERE n:Matter OR n:Party OR n:Document OR n:Deadline OR n:Version
        WITH collect(DISTINCT n) AS nodes
        UNWIND nodes AS n1
        UNWIND nodes AS n2
        OPTIONAL MATCH (n1)-[r]->(n2)
        WHERE r IS NOT NULL
        RETURN
            collect(DISTINCT {
                id: elementId(n1),
                label: coalesce(n1.name, n1.title, n1.id),
                type: labels(n1)[0],
                properties: n1 {.id, .name, .title, .description, .client, .role, .doc_type, .due_at}
            }) AS nodes,
            collect(DISTINCT {
                source: elementId(n1),
                target: elementId(n2),
                type: type(r)
            }) AS edges
        """
        params = {}

    rows = await read_query(query, params)

    if not rows:
        return {"nodes": [], "edges": []}

    row = rows[0]

    # Deduplicate nodes by id and filter null edges
    seen_ids = set()
    unique_nodes = []
    for node in row["nodes"]:
        if node["id"] not in seen_ids:
            seen_ids.add(node["id"])
            node["color"] = NODE_COLORS.get(node["type"], "#94a3b8")
            unique_nodes.append(node)

    unique_edges = [
        e for e in row["edges"]
        if e["source"] is not None and e["target"] is not None and e["type"] is not None
    ]

    return {"nodes": unique_nodes, "edges": unique_edges}
