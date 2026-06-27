"use client";

import { useEffect, useState, useMemo } from "react";
import { getEntities, type EntityItem } from "@/lib/backend";
import { UploadDocumentButton } from "@/components/quinn/upload-document";

const TYPE_ICONS: Record<string, string> = {
  Person: "👤",
  Organization: "🏢",
  LawFirm: "⚖️",
  Court: "🏛️",
  Judge: "👨‍⚖️",
  Document: "📄",
  Clause: "§",
  Section: "§",
  Deadline: "⏰",
  Date: "📅",
  TimeConstraint: "⏱️",
  MonetaryAmount: "💰",
  PaymentObligation: "💸",
  Obligation: "📋",
  Right: "✅",
  Restriction: "🚫",
  Jurisdiction: "🌍",
  GoverningLaw: "📜",
  RiskFactor: "⚠️",
  Liability: "⚠️",
  Definition: "📖",
  Statute: "📕",
  Observation: "💡",
  Institution: "🏛️",
  LegalConcept: "⚖️",
};

function getIcon(type: string): string {
  return TYPE_ICONS[type] ?? "📌";
}

export function EntityList({ matterId }: { matterId: string }) {
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityItem | null>(null);

  useEffect(() => {
    setLoading(true);
    getEntities(matterId)
      .then((data) => {
        setEntities(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [matterId]);

  const typeGroups = useMemo(() => {
    const groups: Record<string, EntityItem[]> = {};
    for (const e of entities) {
      const t = e.type ?? "Unknown";
      (groups[t] ??= []).push(e);
    }
    return Object.entries(groups).sort(([, a], [, b]) => b.length - a.length);
  }, [entities]);

  const filtered = selectedType
    ? entities.filter((e) => e.type === selectedType)
    : entities;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading entities...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-sm text-muted-foreground">
        <p>No entities extracted yet. Upload a document to get started.</p>
        <UploadDocumentButton matterId={matterId} />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Left: type filters + entity list */}
      <div className="w-80 shrink-0 space-y-4">
        {/* Type filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedType(null)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              !selectedType ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            All ({entities.length})
          </button>
          {typeGroups.map(([type, items]) => (
            <button
              key={type}
              onClick={() => setSelectedType(selectedType === type ? null : type)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                selectedType === type ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              {getIcon(type)} {type} ({items.length})
            </button>
          ))}
        </div>

        {/* Entity list */}
        <div className="space-y-0.5">
          {filtered.map((entity) => (
            <button
              key={entity.id}
              onClick={() => setSelectedEntity(entity)}
              className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
                selectedEntity?.id === entity.id
                  ? "bg-muted"
                  : "hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{getIcon(entity.type)}</span>
                <span className="truncate text-sm font-medium">{entity.name}</span>
              </div>
              <p className="mt-0.5 truncate pl-6 text-xs text-muted-foreground">
                {entity.description ?? entity.type}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="min-w-0 flex-1">
        {selectedEntity ? (
          <div className="rounded-lg border p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{getIcon(selectedEntity.type)}</span>
                <h3 className="text-lg font-semibold">{selectedEntity.name}</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{selectedEntity.type}</p>
            </div>

            {selectedEntity.description && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
                <p className="mt-1 text-sm">{selectedEntity.description}</p>
              </div>
            )}

            {selectedEntity.text && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Text</p>
                <p className="mt-1 whitespace-pre-wrap rounded bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                  {selectedEntity.text}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Properties</p>
              <dl className="mt-1 space-y-1">
                {Object.entries(selectedEntity.properties)
                  .filter(([k]) => !["id", "name", "entity_type", "matter_id", "document_id", "extracted_at", "description", "text"].includes(k))
                  .map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-sm">
                      <dt className="shrink-0 text-muted-foreground">{key}:</dt>
                      <dd className="min-w-0 break-words">{String(value)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            Select an entity to view details
          </div>
        )}
      </div>
    </div>
  );
}
