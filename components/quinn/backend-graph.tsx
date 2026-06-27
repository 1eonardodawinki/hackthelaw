"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { InteractiveNvlWrapper } from "@neo4j-nvl/react";
import type { Node as NvlNode, Relationship as NvlRelationship } from "@neo4j-nvl/base";
import { getGraph, type GraphNode } from "@/lib/backend";

export function BackendGraph({ matterId }: { matterId?: string }) {
  const [data, setData] = useState<{
    nodes: (GraphNode & { size?: number })[];
    edges: { source: string; target: string; type: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGraph(matterId)
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [matterId]);

  const { nodes, rels } = useMemo(() => {
    if (!data) return { nodes: [] as NvlNode[], rels: [] as NvlRelationship[] };

    const nodes: NvlNode[] = data.nodes.map((n) => ({
      id: n.id,
      caption: n.label,
      color: n.color,
      size: (n as { size?: number }).size ?? 20,
      pinned: false,
    }));

    const rels: NvlRelationship[] = data.edges.map((e, i) => ({
      id: `${e.source}-${e.type}-${e.target}-${i}`,
      from: e.source,
      to: e.target,
      caption: e.type.replace(/_/g, " ").toLowerCase(),
      color: "#d1d5db",
    }));

    return { nodes, rels };
  }, [data]);

  const handleNodeClick = useCallback(
    (node: NvlNode) => {
      if (!data) return;
      setSelected(data.nodes.find((n) => n.id === node.id) ?? null);
    },
    [data]
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive">
        Couldn&apos;t reach the backend: {error}
      </div>
    );
  }

  if (!data) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading graph...</div>;
  }

  if (data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No entities to visualize. Upload a document first.
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <InteractiveNvlWrapper
        nodes={nodes}
        rels={rels}
        nvlOptions={{
          disableTelemetry: true,
          layout: "d3Force",
          initialZoom: 1,
          minZoom: 0.1,
          maxZoom: 5,
          renderer: "canvas",
          relationshipThreshold: 0.4,
        }}
        mouseEventCallbacks={{
          onNodeClick: handleNodeClick,
          onCanvasClick: () => setSelected(null),
          onDrag: true,
          onDragStart: true,
          onDragEnd: true,
          onPan: true,
          onZoom: true,
        }}
        style={{ width: "100%", height: "100%" }}
      />

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 rounded-md border bg-card/90 px-3 py-2 text-[10px] backdrop-blur-sm">
        {Array.from(new Set(data.nodes.map((n) => n.type)))
          .sort()
          .map((type) => {
            const node = data.nodes.find((n) => n.type === type);
            return (
              <span key={type} className="flex items-center gap-1">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: node?.color ?? "#94a3b8" }}
                />
                {type}
              </span>
            );
          })}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="absolute right-3 top-3 max-h-[80%] w-72 overflow-y-auto rounded-md border bg-card p-4 text-xs shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{selected.label}</span>
            <button
              onClick={() => setSelected(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <span className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium">
            {selected.type}
          </span>
          <dl className="mt-3 space-y-1.5">
            {Object.entries(selected.properties)
              .filter(
                ([k, v]) =>
                  v !== null &&
                  !["id", "entity_type", "matter_id", "document_id", "extracted_at"].includes(k)
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {key.replace(/_/g, " ")}
                  </dt>
                  <dd className="break-words text-foreground">{String(value)}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}
