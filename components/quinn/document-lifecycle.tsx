"use client";

import { useState, useEffect, useRef } from "react";
import {
  Loader2, User, Bot, GitBranch, ChevronRight,
  FileText, Sparkles, ArrowUpRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VersionNode {
  id: string;
  version: string;
  date: string;
  uploaded_by_email: string;
  change_type: "initial" | "major" | "minor" | "current" | "draft";
  similarity_score: number | null;
  entity_count: number;
  key_changes: string[];
  semantic_explanation: string;
}

interface ReviewEvent {
  id: string;
  type: "partner_review" | "ai_review";
  date: string;
  reviewer: string;
  linked_version: string;
}

interface DocumentLifecycle {
  document_name: string;
  document_type: string;
  total_versions: number;
  versions: VersionNode[];
  reviews: ReviewEvent[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CHANGE_CONFIG = {
  initial: {
    label: "INITIAL",
    ringColor: "ring-foreground/40",
    bgColor: "bg-foreground/10",
    fillColor: "bg-foreground",
    textColor: "text-foreground",
    badgeBg: "bg-foreground/10",
    badgeText: "text-foreground/70",
  },
  minor: {
    label: "MINOR",
    ringColor: "ring-foreground/30",
    bgColor: "bg-foreground/5",
    fillColor: "bg-foreground/70",
    textColor: "text-foreground/80",
    badgeBg: "bg-foreground/8",
    badgeText: "text-muted-foreground",
  },
  major: {
    label: "MAJOR",
    ringColor: "ring-amber-500/60",
    bgColor: "bg-amber-500/10",
    fillColor: "bg-amber-500",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-600 dark:text-amber-400",
  },
  current: {
    label: "CURRENT",
    ringColor: "ring-emerald-500/60",
    bgColor: "bg-emerald-500/10",
    fillColor: "bg-emerald-500",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-600 dark:text-emerald-400",
  },
  draft: {
    label: "DRAFT",
    ringColor: "ring-foreground/20",
    bgColor: "bg-transparent",
    fillColor: "bg-foreground/20",
    textColor: "text-muted-foreground",
    badgeBg: "bg-foreground/5",
    badgeText: "text-muted-foreground",
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Version Node
// ---------------------------------------------------------------------------

function VersionDot({
  node,
  index,
  isLast,
  nextNode,
  onClick,
}: {
  node: VersionNode;
  index: number;
  isLast: boolean;
  nextNode: VersionNode | null;
  onClick: () => void;
}) {
  const config = CHANGE_CONFIG[node.change_type];
  const isDraft = node.change_type === "draft";
  const isCurrent = node.change_type === "current";
  const isMajor = node.change_type === "major";

  // Determine connector style
  const showConnector = !isLast;
  const nextIsMajor = nextNode?.change_type === "major";
  const connectorDashed = nextIsMajor;

  return (
    <div
      className="lifecycle-node relative flex flex-col items-center"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Connector line to next node */}
      {showConnector && (
        <div
          className={`absolute left-[50%] top-[20px] h-[2px] z-0 ${
            connectorDashed
              ? "border-t-2 border-dashed border-foreground/15"
              : "bg-foreground/15"
          }`}
          style={{ width: "calc(100% + 0px)", transform: "translateX(0)" }}
        />
      )}

      {/* The dot */}
      <button
        onClick={onClick}
        className={`group relative z-10 flex size-10 items-center justify-center rounded-full ring-2 transition-all duration-300 hover:scale-110 ${config.ringColor} ${config.bgColor} ${isDraft ? "border-2 border-dashed border-foreground/20 ring-0" : ""} ${isCurrent ? "shadow-[0_0_16px_rgba(52,211,153,0.25)]" : ""}`}
      >
        <span className={`font-mono text-xs font-bold ${config.textColor}`}>
          {node.version}
        </span>

        {/* Pulse ring for current */}
        {isCurrent && (
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
        )}
      </button>

      {/* Version label */}
      <div className="mt-2 flex flex-col items-center gap-0.5">
        <span className="font-mono text-[11px] font-medium text-foreground/80">
          v{node.version}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatShortDate(node.date)}
        </span>
      </div>

      {/* Change type badge */}
      <span
        className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider ${config.badgeBg} ${config.badgeText}`}
      >
        {config.label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review Event (below the timeline)
// ---------------------------------------------------------------------------

function ReviewDot({
  review,
  versionIndex,
  totalVersions,
}: {
  review: ReviewEvent;
  versionIndex: number;
  totalVersions: number;
}) {
  const isAI = review.type === "ai_review";

  return (
    <div
      className="lifecycle-review-node flex flex-col items-center gap-1"
      style={{
        gridColumn: versionIndex + 1,
        animationDelay: `${(totalVersions + 1) * 80}ms`,
      }}
    >
      {/* Curved connector (SVG) */}
      <svg
        className="h-8 w-6 text-foreground/15"
        viewBox="0 0 24 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 0 C12 16, 12 16, 12 32"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      </svg>

      {/* Review dot */}
      <div
        className={`flex size-8 items-center justify-center rounded-full text-[10px] font-bold ${
          isAI
            ? "bg-blue-500/15 text-blue-500 ring-1 ring-blue-500/30"
            : "bg-foreground/10 text-foreground/70 ring-1 ring-foreground/20"
        }`}
      >
        {isAI ? "AI" : "PR"}
      </div>

      {/* Label */}
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        {isAI ? `AI Review` : review.reviewer}
      </span>
      <span className="text-[9px] text-muted-foreground/60">
        {formatShortDate(review.date)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Version Detail Dialog
// ---------------------------------------------------------------------------

function VersionDetailDialog({
  node,
  onClose,
}: {
  node: VersionNode;
  onClose: () => void;
}) {
  const config = CHANGE_CONFIG[node.change_type];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <span className={`inline-flex size-6 items-center justify-center rounded-full text-[10px] font-bold ${config.fillColor} text-background`}>
              {node.version}
            </span>
            Version {node.version}
          </DialogTitle>
          <DialogDescription>
            {formatShortDate(node.date)} · {node.uploaded_by_email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Change type */}
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${config.badgeBg} ${config.badgeText}`}>
              {config.label}
            </span>
            {node.similarity_score != null && (
              <span className="text-xs text-muted-foreground">
                {Math.round(node.similarity_score * 100)}% similarity
              </span>
            )}
          </div>

          {/* Entity count */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" />
            {node.entity_count} entities extracted
          </div>

          {/* Semantic explanation */}
          {node.semantic_explanation && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-foreground/80">
              {node.semantic_explanation}
            </div>
          )}

          {/* Key changes */}
          {node.key_changes.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Key Changes
              </div>
              <ul className="space-y-1">
                {node.key_changes.map((change, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/70">
                    <ChevronRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DocumentLifecycle({
  documentId,
  matterId,
}: {
  documentId: string;
  matterId: string;
}) {
  const [data, setData] = useState<DocumentLifecycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<VersionNode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

  useEffect(() => {
    setLoading(true);
    fetch(`${BACKEND}/api/documents/${encodeURIComponent(documentId)}/lifecycle`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [documentId, BACKEND]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        Could not load document lifecycle{error ? `: ${error}` : ""}
      </div>
    );
  }

  // Map reviews to their version indices
  const reviewsByVersion = new Map<string, ReviewEvent[]>();
  for (const review of data.reviews) {
    const list = reviewsByVersion.get(review.linked_version) || [];
    list.push(review);
    reviewsByVersion.set(review.linked_version, list);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-foreground/5">
          <GitBranch className="size-4 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{data.document_name}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {data.document_type}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {data.total_versions} version{data.total_versions !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Scrollable timeline */}
      <div
        ref={scrollRef}
        className="overflow-x-auto pb-4"
      >
        <div className="inline-flex min-w-full flex-col gap-2 px-4">
          {/* Version nodes row */}
          <div
            className="grid items-start gap-0"
            style={{
              gridTemplateColumns: `repeat(${data.versions.length}, minmax(80px, 1fr))`,
            }}
          >
            {data.versions.map((node, i) => (
              <VersionDot
                key={node.id}
                node={node}
                index={i}
                isLast={i === data.versions.length - 1}
                nextNode={data.versions[i + 1] ?? null}
                onClick={() => setSelectedVersion(node)}
              />
            ))}
          </div>

          {/* Review events row */}
          {data.reviews.length > 0 && (
            <div
              className="grid items-start gap-0"
              style={{
                gridTemplateColumns: `repeat(${data.versions.length}, minmax(80px, 1fr))`,
              }}
            >
              {data.versions.map((v, vi) => {
                const reviews = reviewsByVersion.get(v.id) || [];
                if (reviews.length === 0) return <div key={vi} />;
                return (
                  <div key={vi} className="flex flex-col items-center">
                    {reviews.map((review) => (
                      <ReviewDot
                        key={review.id}
                        review={review}
                        versionIndex={vi}
                        totalVersions={data.versions.length}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail dialog */}
      {selectedVersion && (
        <VersionDetailDialog
          node={selectedVersion}
          onClose={() => setSelectedVersion(null)}
        />
      )}
    </div>
  );
}
