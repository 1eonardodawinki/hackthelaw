/**
 * Client for calling the FastAPI backend.
 *
 * In development: calls localhost:8000 directly.
 * In production: should go through a reverse proxy / same origin.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    // Don't cache server-side fetches in Next.js
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Backend ${res.status}: ${body}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Matters
// ---------------------------------------------------------------------------

export async function listMatters() {
  return request<
    {
      matter: Record<string, unknown>;
      party_count: number;
      doc_count: number;
      deadline_count: number;
    }[]
  >("/api/matters");
}

export async function getMatter(id: string) {
  return request<{
    matter: Record<string, unknown>;
    parties: Record<string, unknown>[];
    documents: Record<string, unknown>[];
    deadlines: Record<string, unknown>[];
  }>(`/api/matters/${encodeURIComponent(id)}`);
}

export async function createMatter(body: {
  id: string;
  name: string;
  description?: string;
  client?: string;
  tags?: string[];
}) {
  return request("/api/matters", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Graph visualization
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  color: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function getGraph(matterId?: string): Promise<GraphData> {
  const path = matterId
    ? `/api/graph/${encodeURIComponent(matterId)}`
    : "/api/graph";
  return request<GraphData>(path);
}
