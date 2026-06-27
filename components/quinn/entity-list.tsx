"use client";

import { useEffect, useState, useMemo } from "react";
import { getEntities, getEntitiesByDocument, type EntityItem, type DocumentEntities } from "@/lib/backend";
import { UploadDocumentButton } from "@/components/quinn/upload-document";
import { FileText, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  Person: "bg-foreground/10",
  Organization: "bg-foreground/15",
  LawFirm: "bg-foreground/20",
  Court: "bg-foreground/20",
  Judge: "bg-foreground/15",
  Document: "bg-foreground/8",
  Clause: "bg-foreground/8",
  Section: "bg-foreground/8",
  Deadline: "bg-foreground/25",
  Date: "bg-foreground/10",
  TimeConstraint: "bg-foreground/25",
  MonetaryAmount: "bg-foreground/15",
  PaymentObligation: "bg-foreground/15",
  Obligation: "bg-foreground/12",
  Right: "bg-foreground/10",
  Restriction: "bg-foreground/20",
  Jurisdiction: "bg-foreground/12",
  GoverningLaw: "bg-foreground/12",
  RiskFactor: "bg-foreground/25",
  Liability: "bg-foreground/25",
  Definition: "bg-foreground/8",
  Statute: "bg-foreground/12",
  Observation: "bg-foreground/10",
  Institution: "bg-foreground/15",
  LegalConcept: "bg-foreground/12",
};

function getMonogramBg(type: string): string {
  return TYPE_COLORS[type] ?? "bg-foreground/10";
}

// ---------------------------------------------------------------------------
// Entity card (compact)
// ---------------------------------------------------------------------------

function EntityCard({
  entity,
  selected,
  onClick,
}: {
  entity: { id: string; name: string; type: string; description: string | null };
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-start gap-2.5 rounded-md border p-3 text-left transition-all ${
        selected
          ? "border-foreground/30 bg-muted/60 shadow-sm"
          : "hover:border-foreground/15 hover:bg-muted/30"
      }`}
    >
      <div
        className={`monogram size-7 text-[10px] text-foreground ${getMonogramBg(entity.type)}`}
      >
        {entity.name[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{entity.name}</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {entity.type}
        </div>
        {entity.description && (
          <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
            {entity.description}
          </p>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Document group — entities that came from one document
// ---------------------------------------------------------------------------

function DocumentEntityGroup({
  group,
  index,
  selectedEntity,
  onSelectEntity,
}: {
  group: DocumentEntities;
  index: number;
  selectedEntity: EntityItem | null;
  onSelectEntity: (entity: EntityItem) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const typeEntries = Object.entries(group.entities_by_type).sort(
    ([, a], [, b]) => b.length - a.length
  );

  return (
    <div className="relative flex gap-4">
      {/* Timeline rail */}
      <div className="flex flex-col items-center">
        <div className="relative z-10 flex size-8 items-center justify-center rounded-full border bg-background">
          <FileText className="size-3.5 text-muted-foreground" />
        </div>
        <div className="w-px flex-1 bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        {/* Document header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold truncate">
            {group.document_title || group.document_filename}
          </span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {group.entity_count} entities
          </span>
        </button>

        {/* Entities grouped by type */}
        {expanded && (
          <div className="mt-3 space-y-4 animate-stagger">
            {typeEntries.map(([type, entities]) => (
              <div key={type}>
                <div className="mb-1.5 flex items-center gap-2">
                  <div className={`size-2 rounded-full ${getMonogramBg(type)}`} />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {type}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {entities.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  {entities.map((entity) => (
                    <EntityCard
                      key={entity.id}
                      entity={entity}
                      selected={selectedEntity?.id === entity.id}
                      onClick={() => onSelectEntity(entity as unknown as EntityItem)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function EntityDetailPanel({ entity }: { entity: EntityItem }) {
  return (
    <div className="sticky top-4 space-y-5 rounded-lg border p-5">
      <div className="flex items-start gap-3">
        <div
          className={`monogram size-11 text-sm text-foreground ${getMonogramBg(entity.type)}`}
        >
          {entity.name[0]}
        </div>
        <div>
          <h3 className="text-base font-semibold">{entity.name}</h3>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {entity.type}
          </p>
        </div>
      </div>

      {entity.description && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Description
          </p>
          <p className="mt-1.5 text-sm leading-relaxed">{entity.description}</p>
        </div>
      )}

      {entity.text && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Source text
          </p>
          <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            {entity.text}
          </p>
        </div>
      )}

      {Object.entries(entity.properties).filter(
        ([k]) =>
          !["id", "name", "entity_type", "matter_id", "document_id", "extracted_at", "description", "text"].includes(k)
      ).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Properties
          </p>
          <dl className="mt-1.5 space-y-1.5">
            {Object.entries(entity.properties)
              .filter(
                ([k]) =>
                  !["id", "name", "entity_type", "matter_id", "document_id", "extracted_at", "description", "text"].includes(k)
              )
              .map(([key, value]) => (
                <div key={key} className="flex gap-2 text-sm">
                  <dt className="shrink-0 font-mono text-xs text-muted-foreground">{key}</dt>
                  <dd className="min-w-0 break-words">{String(value)}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EntityList({ matterId }: { matterId: string }) {
  const [docGroups, setDocGroups] = useState<DocumentEntities[]>([]);
  const [allEntities, setAllEntities] = useState<EntityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityItem | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getEntitiesByDocument(matterId),
      getEntities(matterId),
    ])
      .then(([groups, entities]) => {
        setDocGroups(groups);
        setAllEntities(entities);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [matterId]);

  // Type filter counts
  const typeGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const e of allEntities) {
      const t = e.type ?? "Unknown";
      groups[t] = (groups[t] ?? 0) + 1;
    }
    return Object.entries(groups).sort(([, a], [, b]) => b - a);
  }, [allEntities]);

  // Filter document groups by selected type
  const filteredGroups = useMemo(() => {
    if (!selectedType) return docGroups;
    return docGroups
      .map((g) => ({
        ...g,
        entities_by_type: selectedType
          ? { [selectedType]: g.entities_by_type[selectedType] || [] }
          : g.entities_by_type,
        entities: g.entities.filter((e) => e.type === selectedType),
        entity_count: (g.entities_by_type[selectedType] || []).length,
      }))
      .filter((g) => g.entity_count > 0);
  }, [docGroups, selectedType]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
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

  if (allEntities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-sm text-muted-foreground">
        <p>No entities extracted yet. Upload a document to get started.</p>
        <UploadDocumentButton matterId={matterId} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Type filter bar */}
      <div className="flex items-center gap-4 border-b pb-4">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Filter
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedType(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              !selectedType
                ? "bg-foreground text-background"
                : "border hover:bg-muted"
            }`}
          >
            All
            <span className="ml-1 tabular-nums opacity-60">{allEntities.length}</span>
          </button>
          {typeGroups.map(([type, count]) => (
            <button
              key={type}
              onClick={() => setSelectedType(selectedType === type ? null : type)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedType === type
                  ? "bg-foreground text-background"
                  : "border hover:bg-muted"
              }`}
            >
              {type}
              <span className="ml-1 tabular-nums opacity-60">{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Entity flowchart — grouped by document, ordered by time */}
        <div className="min-w-0 flex-1">
          {filteredGroups.map((group, i) => (
            <DocumentEntityGroup
              key={group.document_id}
              group={group}
              index={i}
              selectedEntity={selectedEntity}
              onSelectEntity={setSelectedEntity}
            />
          ))}

          {/* End dot */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <div className="size-3 rounded-full bg-foreground/20" />
            </div>
            <span className="text-xs text-muted-foreground">
              {allEntities.length} entities from {docGroups.length} document{docGroups.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Detail panel */}
        <div className="hidden w-80 shrink-0 lg:block">
          {selectedEntity ? (
            <EntityDetailPanel entity={selectedEntity} />
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed py-20 text-sm text-muted-foreground">
              Select an entity to inspect
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
