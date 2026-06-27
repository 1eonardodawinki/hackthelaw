"use client";

import { useState, useEffect } from "react";
import {
  FileText, CheckCircle2, AlertTriangle, Copy, Clock,
  ChevronDown, ChevronRight, ArrowUpRight, Loader2,
} from "lucide-react";
import { getTimeline, getDocumentContent, type TimelineBatch, type TimelineData } from "@/lib/backend";
import { DocumentDiffDialog } from "@/components/quinn/document-diff-dialog";
import { DocumentLifecycle } from "@/components/quinn/document-lifecycle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status, score, parentFilename }: {
  status: string;
  score: number | null;
  parentFilename: string | null;
}) {
  if (status === "exact_duplicate") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
        <Copy className="size-3" />
        Duplicate
      </span>
    );
  }
  if (status === "evolved_version") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600">
        <ArrowUpRight className="size-3" />
        Evolved version
      </span>
    );
  }
  if (status === "near_duplicate") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
        <AlertTriangle className="size-3" />
        ~{Math.round((score ?? 0) * 100)}% match
      </span>
    );
  }
  if (status === "similar") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-600">
        <AlertTriangle className="size-3" />
        Changed significantly
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
      <CheckCircle2 className="size-3" />
      New
    </span>
  );
}

function DocumentPreviewDialog({
  doc,
  onClose,
}: {
  doc: TimelineBatch["documents"][0];
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocumentContent(doc.id)
      .then((data) => setContent(data.content))
      .catch(() => setContent("Could not load document content."))
      .finally(() => setLoading(false));
  }, [doc.id]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            {doc.filename}
          </DialogTitle>
          <DialogDescription>
            {doc.char_count.toLocaleString()} characters · {doc.entity_count} entities extracted
            {doc.uploaded_by_email && ` · uploaded by ${doc.uploaded_by_email.split("@")[0]}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">
              {content}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentCard({ doc, matterId, onViewDiff }: {
  doc: TimelineBatch["documents"][0];
  matterId: string;
  onViewDiff: (docId: string) => void;
}) {
  const [showLifecycle, setShowLifecycle] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const isDupe = doc.similarity_status === "exact_duplicate";
  const hasVersions = doc.version_chain.length > 0 || doc.similarity_status === "evolved_version" || doc.similarity_status === "near_duplicate";

  const uploaderInitial = doc.uploaded_by_email
    ? doc.uploaded_by_email[0].toUpperCase()
    : "?";
  const uploaderName = doc.uploaded_by_email
    ? doc.uploaded_by_email.split("@")[0]
    : "Unknown";

  return (
    <div className={`group rounded-md border transition-all hover:border-foreground/20 ${isDupe ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3 p-3">
        {/* Uploader avatar */}
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-bold text-foreground/70" title={doc.uploaded_by_email}>
          {uploaderInitial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(true)}
              className="truncate text-sm font-medium text-foreground hover:underline underline-offset-2 text-left"
            >
              {doc.filename}
            </button>
            <StatusBadge
              status={doc.similarity_status}
              score={doc.similarity_score}
              parentFilename={doc.similarity_parent_filename}
            />
          </div>

          {doc.version_number > 1 && (
            <div className="mt-0.5 text-[11px] text-amber-600">
              v{doc.version_number} of {doc.similarity_parent_filename}
            </div>
          )}

          {isDupe && doc.similarity_parent_filename && (
            <div className="mt-0.5 text-[11px] text-red-500">
              Same as {doc.similarity_parent_filename} — skipped
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/60">{uploaderName}</span>
            {doc.char_count > 0 && (
              <span>{doc.char_count.toLocaleString()} chars</span>
            )}
            {(doc.similarity_status === "near_duplicate" || doc.similarity_status === "evolved_version") && (
              <button
                onClick={() => onViewDiff(doc.id)}
                className="inline-flex items-center gap-0.5 text-amber-600 hover:underline"
              >
                View diff
                <ArrowUpRight className="size-3" />
              </button>
            )}
            {hasVersions && (
              <button
                onClick={() => setShowLifecycle(!showLifecycle)}
                className="inline-flex items-center gap-0.5 text-foreground/60 hover:text-foreground hover:underline"
              >
                {showLifecycle ? "Hide" : "View"} lifecycle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline lifecycle timeline */}
      {showLifecycle && (
        <div className="border-t bg-muted/20 px-3 py-4">
          <DocumentLifecycle documentId={doc.id} matterId={matterId} />
        </div>
      )}

      {/* Document preview dialog */}
      {showPreview && (
        <DocumentPreviewDialog doc={doc} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}

function BatchNode({ batch, matterId, onViewDiff }: {
  batch: TimelineBatch;
  matterId: string;
  onViewDiff: (docId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="relative flex gap-4">
      {/* Timeline rail */}
      <div className="flex flex-col items-center">
        {/* Dot */}
        <div className="relative z-10 flex size-8 items-center justify-center rounded-full border-2 border-foreground/20 bg-background text-xs font-bold text-foreground">
          {batch.batch_index}
        </div>
        {/* Vertical line */}
        <div className="w-px flex-1 bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-8">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold">
            {formatDate(batch.batch_date)}
          </span>
          <span className="text-xs text-muted-foreground">
            {batch.new_doc_count} document{batch.new_doc_count !== 1 ? "s" : ""}
          </span>
        </button>

        {/* Documents */}
        {expanded && (
          <div className="mt-3 space-y-2 animate-stagger">
            {batch.documents.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} matterId={matterId} onViewDiff={onViewDiff} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CaseTimeline({ matterId }: { matterId: string }) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diffDocId, setDiffDocId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getTimeline(matterId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [matterId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
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

  if (!data || data.batches.length === 0) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        No documents uploaded yet. Upload documents to see the case timeline.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      {/* Summary stats */}
      <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
        <div className="bg-background px-5 py-4">
          <div className="text-2xl font-light tabular-nums">{data.total_documents}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Documents
          </div>
        </div>
        <div className="bg-background px-5 py-4">
          <div className="flex items-baseline gap-1">
            <div className="text-2xl font-light tabular-nums">{data.batches.length}</div>
            {data.total_duplicates_skipped > 0 && (
              <span className="text-xs text-red-500">
                ({data.total_duplicates_skipped} dupes)
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Upload sessions
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {data.batches.map((batch) => (
          <BatchNode
            key={batch.batch_date}
            batch={batch}
            matterId={matterId}
            onViewDiff={setDiffDocId}
          />
        ))}

        {/* End dot */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <div className="flex size-3 items-center justify-center rounded-full bg-foreground/20" />
          </div>
          <span className="text-xs text-muted-foreground">
            <Clock className="mr-1 inline size-3" />
            {data.date_range.first === data.date_range.last
              ? `Started ${formatDate(data.date_range.first!)}`
              : `${formatDate(data.date_range.first!)} — ${formatDate(data.date_range.last!)}`}
          </span>
        </div>
      </div>

      {/* Diff dialog */}
      {diffDocId && (
        <DocumentDiffDialog
          documentId={diffDocId}
          onClose={() => setDiffDocId(null)}
        />
      )}
    </div>
  );
}
