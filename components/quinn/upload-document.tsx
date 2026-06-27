"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle2, Sparkles, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Step = "pick-file" | "source" | "extracting" | "done";

interface ExtractResult {
  entities_extracted: number;
  relations_extracted: number;
  entities: { type: string; name: string }[];
  relations: { from: string; to: string; type: string }[];
}

export function UploadDocumentButton({ matterId }: { matterId?: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick-file");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [uploadId, setUploadId] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);

  function reset() {
    setStep("pick-file");
    setError(null);
    setLoading(false);
    setFileName("");
    setUploadId("");
    setCharCount(0);
    setExtractResult(null);
  }

  async function handleFileSelected() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setError(null);

    try {
      // Auto-create a matter if none provided
      const mId = matterId ?? `matter-${Date.now()}`;
      if (!matterId) {
        await fetch(`${BACKEND}/api/matters`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: mId, name: file.name.replace(/\.[^.]+$/, ""), description: "" }),
        });
      }

      // Upload
      const form = new FormData();
      form.append("file", file);
      form.append("matter_id", mId);

      const res = await fetch(`${BACKEND}/api/documents/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setUploadId(data.upload_id);
      setCharCount(data.char_count);
      setStep("source");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSourceSelected(source: "human" | "ai") {
    setLoading(true);
    setError(null);
    setStep("extracting");

    try {
      // Confirm with provenance
      const confirmRes = await fetch(`${BACKEND}/api/documents/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_id: uploadId,
          source,
          author: source === "human" ? "uploaded by user" : null,
          model: source === "ai" ? "unknown" : null,
          doc_type: "",
        }),
      });
      if (!confirmRes.ok) throw new Error(await confirmRes.text());
      const confirmed = await confirmRes.json();

      // Extract
      const extractRes = await fetch(
        `${BACKEND}/api/documents/${encodeURIComponent(confirmed.document_id)}/extract`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "anthropic",
            model_name: "claude-haiku-4-5-20251001",
          }),
        }
      );
      if (!extractRes.ok) throw new Error(await extractRes.text());
      const data: ExtractResult = await extractRes.json();
      setExtractResult(data);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2.5 h-7 gap-1.5 text-[0.8rem] font-medium transition-all hover:bg-muted hover:text-foreground"
      >
        <Upload className="size-3.5" />
        Upload document
      </DialogTrigger>

      <DialogContent className="max-w-md">
        {/* Step 1: Pick file */}
        {step === "pick-file" && (
          <>
            <DialogHeader>
              <DialogTitle>Upload a document</DialogTitle>
              <DialogDescription>
                Drop a PDF or text file. The AI will analyze it and build your knowledge graph.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <label
                htmlFor="doc-file"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-6 py-10 text-center transition-colors hover:border-muted-foreground/50 hover:bg-muted/40"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Reading {fileName}...</span>
                  </>
                ) : (
                  <>
                    <Upload className="size-8 text-muted-foreground/60" />
                    <span className="text-sm font-medium">Click to select a file</span>
                    <span className="text-xs text-muted-foreground">PDF, .txt, or .md</span>
                  </>
                )}
                <input
                  id="doc-file"
                  type="file"
                  accept=".pdf,.txt,.md,.text"
                  className="hidden"
                  ref={fileRef}
                  onChange={handleFileSelected}
                  disabled={loading}
                />
              </label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}

        {/* Step 2: Human or AI? */}
        {step === "source" && (
          <>
            <DialogHeader>
              <DialogTitle>Is this document human or AI generated?</DialogTitle>
              <DialogDescription>
                {fileName} — {charCount.toLocaleString()} characters extracted
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 py-6">
              <button
                onClick={() => handleSourceSelected("human")}
                disabled={loading}
                className="flex flex-col items-center gap-3 rounded-lg border-2 border-muted-foreground/20 p-6 transition-all hover:border-foreground/40 hover:bg-muted/40 active:scale-[0.98]"
              >
                <User className="size-8 text-muted-foreground" />
                <span className="text-sm font-medium">Human-authored</span>
              </button>
              <button
                onClick={() => handleSourceSelected("ai")}
                disabled={loading}
                className="flex flex-col items-center gap-3 rounded-lg border-2 border-muted-foreground/20 p-6 transition-all hover:border-foreground/40 hover:bg-muted/40 active:scale-[0.98]"
              >
                <Bot className="size-8 text-muted-foreground" />
                <span className="text-sm font-medium">AI-generated</span>
              </button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}

        {/* Step 3: Extracting */}
        {step === "extracting" && (
          <>
            <DialogHeader>
              <DialogTitle>Analyzing document...</DialogTitle>
              <DialogDescription>
                The AI is reading {fileName} and extracting entities, relationships, dates, and obligations.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <Sparkles className="size-8 animate-pulse text-amber-500" />
              <span className="text-sm">Building knowledge graph...</span>
            </div>
            {error && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{error}</p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Close</Button>
                </DialogFooter>
              </div>
            )}
          </>
        )}

        {/* Step 4: Done */}
        {step === "done" && extractResult && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-500" />
                Done
              </DialogTitle>
              <DialogDescription>
                Extracted {extractResult.entities_extracted} entities and {extractResult.relations_extracted} relationships from {fileName}.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-52 overflow-y-auto py-2">
              <div className="flex flex-wrap gap-1.5">
                {extractResult.entities.map((e, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                    <span className="font-medium">{e.type}</span>
                    <span className="text-muted-foreground truncate max-w-40">{e.name}</span>
                  </span>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => { setOpen(false); reset(); window.location.reload(); }}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
