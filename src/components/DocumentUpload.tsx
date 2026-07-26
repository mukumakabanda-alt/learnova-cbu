import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Upload, Loader2, CheckCircle2, FileWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractDocumentText, fileKindLabel, guessMaterialType } from "@/lib/document-text";
import { ensureFileExtension } from "@/lib/document-files";
import { useAuth } from "@/hooks/use-auth";
import { LearnovaAI } from "@/lib/learnova-ai";

const MATERIAL_TYPES = ["Notes", "Past Paper", "Slides", "Summary", "Assignment", "Outline"] as const;
type MaterialType = (typeof MATERIAL_TYPES)[number];

// Generation used to be a third stage here, blocking this screen for as
// long as the AI call took. It now happens in the background after the
// material is saved — see runBackgroundGeneration below and the study
// page, which shows live per-stage progress instead (StudyPanel.tsx).
const STAGES = ["Reading & uploading…", "Saving to your library…"];

function safeDbText(value: unknown, fallback = ""): string {
  return String(value ?? fallback)
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function safeFileName(name: string): string {
  const cleaned = safeDbText(name, "document")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/[._-]{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 160)
    .trim();
  return cleaned || "document";
}

function describeUploadError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Something went wrong uploading that file — mind trying again?";
}

function runAIOffMainThread(
  text: string,
  options: Parameters<typeof LearnovaAI.processDocument>[1],
): Promise<ReturnType<typeof LearnovaAI.processDocument>> {
  if (typeof Worker === "undefined") {
    return Promise.resolve(LearnovaAI.processDocument(text, options));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let worker: Worker | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      worker?.terminate();
    };

    const finish = (value: ReturnType<typeof LearnovaAI.processDocument>) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const fallbackToMainThread = (reason: unknown) => {
      console.error("AI worker unavailable, falling back to the main thread:", reason);
      try {
        finish(LearnovaAI.processDocument(text, options));
      } catch (e) {
        fail(e);
      }
    };

    try {
      worker = new Worker(new URL("../lib/learnova-ai/worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      fallbackToMainThread(e);
      return;
    }

    timer = setTimeout(() => fallbackToMainThread("timed out after 45s"), 45_000);

    worker.onmessage = (e: MessageEvent) => {
      if (e.data?.ok) finish(e.data.result);
      else fallbackToMainThread(e.data?.error);
    };
    worker.onerror = (err) => fallbackToMainThread(err);

    worker.postMessage({ text, options });
  });
}

// Runs after the material row already exists with status "processing" —
// deliberately not awaited by handleFile, so the student lands on the
// study page immediately and watches this fill in live (StudyPanel.tsx
// polls for it — see useMaterial in src/lib/queries.ts) instead of
// staring at the upload screen for however long generation takes.
//
// Primary path: the real, Gemini-backed pipeline
// (supabase/functions/process-material). It does its own DB writes and
// its own per-stage status tracking, so on success there's nothing left
// to do here.
//
// Fallback path: reached whenever that call itself couldn't be made
// (thrown/network-level failure, not a normal in-band error — the edge
// function handles its own errors and always still returns a response
// on success). This used to only fall back to the local engine when
// navigator.onLine was false — so a student who was online but hit a
// misconfigured or temporarily-down AI gateway (say, a missing
// LOVABLE_API_KEY) got nothing at all instead of a working local
// version. The local LearnovaAI engine now runs on ANY primary failure,
// online or not, so the student isn't left with a dead end either way —
// tagged generation_source: "local-fallback" so the study page can be
// honest about which kind of result it's showing and offer to
// regenerate with the real thing once whatever broke is fixed.
async function runBackgroundGeneration(params: {
  materialId: string;
  text: string;
  title: string;
  courseCode: string | null;
  finalType: MaterialType;
  validYear: number | null;
}): Promise<void> {
  const { materialId, text, title, courseCode, finalType, validYear } = params;
  let primaryError: unknown = null;

  try {
    const { error } = await supabase.functions.invoke("process-material", {
      body: { materialId, text, title },
    });
    if (error) throw error;
    return;
  } catch (e) {
    primaryError = e;
    console.error("AI gateway call failed, falling back to the local engine:", e);

    try {
      const result = await runAIOffMainThread(text, {
        title, contentYear: validYear, courseCode, type: finalType,
      });
      const summary = safeDbText(result.summary) || null;
      const tags = result.tags.map((tag) => safeDbText(tag)).filter(Boolean).slice(0, 10);
      const flashcards = result.flashcards
        .map((f) => ({ question: safeDbText(f.question), answer: safeDbText(f.answer), position: f.position }))
        .filter((f) => f.question && f.answer);
      const quiz = result.quiz
        .map((q) => ({
          question: safeDbText(q.question),
          options: q.options.map((option) => safeDbText(option)).filter(Boolean).slice(0, 4),
          correctIndex: Math.max(0, Math.min(q.options.length - 1, Number.isInteger(q.correctIndex) ? q.correctIndex : 0)),
          explanation: safeDbText(q.explanation),
          position: q.position,
        }))
        .filter((q) => q.question && q.options.length >= 2);

      // Fresh material, nothing to delete first — this only ever runs
      // once, right after the row is created.
      if (flashcards.length) {
        await supabase.from("flashcards").insert(
          flashcards.map((f) => ({ material_id: materialId, question: f.question, answer: f.answer, position: f.position })),
        );
      }
      if (quiz.length) {
        await supabase.from("quiz_questions").insert(
          quiz.map((q) => ({
            material_id: materialId, question: q.question, options: q.options,
            correct_index: q.correctIndex, explanation: q.explanation, position: q.position,
          })),
        );
      }

      const anySucceeded = !!summary || flashcards.length > 0 || quiz.length > 0;
      await supabase
        .from("materials")
        .update({
          status: anySucceeded ? "ready" : "failed",
          ...(summary ? { summary, tags: tags.length ? tags : [] } : {}),
          summary_status: summary ? "ready" : "failed",
          summary_error: summary ? null : "The local backup couldn't produce a summary for this document.",
          flashcards_status: flashcards.length ? "ready" : "failed",
          flashcards_error: flashcards.length ? null : "The local backup couldn't produce flashcards for this document.",
          quiz_status: quiz.length ? "ready" : "failed",
          quiz_error: quiz.length ? null : "The local backup couldn't produce a quiz for this document.",
          generation_source: "local-fallback",
          processing_error: anySucceeded
            ? `Generated with a lighter local version — the full AI pipeline didn't respond (${describeUploadError(primaryError)}). Tap Regenerate to try it again.`
            : `The AI pipeline didn't respond (${describeUploadError(primaryError)}), and the local backup couldn't find enough usable text either. Tap Regenerate to try again.`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", materialId);
    } catch (fallbackError) {
      console.error("Local fallback generation also failed:", fallbackError);
      await supabase
        .from("materials")
        .update({
          status: "failed",
          processing_error: describeUploadError(primaryError),
          summary_status: "failed",
          flashcards_status: "failed",
          quiz_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", materialId);
    }
  }
}

export function DocumentUpload({ courseCode }: { courseCode?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<MaterialType>("Notes");
  const [typeManuallySet, setTypeManuallySet] = useState(false);
  const [contentYear, setContentYear] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [fileSizeMB, setFileSizeMB] = useState<number | null>(null);
  const [ocrStage, setOcrStage] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleFile(file: File) {
    if (!user) {
      setError("Sign in first — it takes a minute, and it's how we credit your upload.");
      return;
    }
    if (file.size === 0) {
      setError("That file looks empty (0 bytes) — try exporting or downloading it again.");
      return;
    }

    setError(null);
    setDone(false);
    setBusy(true);
    setFileLabel(fileKindLabel(file));
    setFileSizeMB(file.size / (1024 * 1024));
    setStageIndex(0);
    setOcrStage(null);
    setOcrProgress(0);

    let finalType: MaterialType = type;
    if (!typeManuallySet) {
      finalType = guessMaterialType(file.name);
      setType(finalType);
    }

    try {
      // ensureFileExtension() covers files (very often ones saved via
      // WhatsApp on Android) whose name has no extension at all. This is
      // a fast, local check (worst case reads 16 bytes off the file
      // itself), so it happens before the parallel step below rather
      // than adding a real delay of its own.
      const originalName = await ensureFileExtension(safeFileName(file.name), file);
      const title = safeDbText(originalName.replace(/\.[a-z0-9]+$/i, ""), "Untitled material");
      const path = `${user.id}/${crypto.randomUUID()}-${originalName}`;

      // Reading the document's text and uploading its raw bytes are
      // independent of each other — both only need the original File —
      // so they now run in parallel instead of one after another. This
      // is what used to make uploads feel slow even for small files: a
      // document needing OCR can take 20-30+ seconds just to read
      // (fetching Tesseract's OCR engine over the network — see
      // document-text.ts), during which the file itself, even a large
      // one, now uploads in the background at the same time instead of
      // only starting once reading finished.
      const [{ text, pages, quality, confidence, confidenceNote }, uploadResult] = await Promise.all([
        extractDocumentText(file, (p) => {
          setOcrStage(p.stage);
          setOcrProgress(p.progress);
        }),
        supabase.storage.from("materials").upload(path, file),
      ]);
      if (uploadResult.error) throw uploadResult.error;

      // Refine the filename-only guess now that we have real content to
      // look at. Never overrides a category the person picked themselves.
      if (!typeManuallySet && quality !== "none") {
        finalType = guessMaterialType(file.name, text);
        setType(finalType);
      }

      const year = contentYear.trim() ? Number(contentYear.trim()) : null;
      const validYear = year && Number.isFinite(year) ? year : null;
      const willGenerate = quality !== "none";

      // Save the material now — status "processing" if there's text worth
      // generating study tools from, "catalog_only" if not. Generation
      // itself happens after this (see below): the student is taken
      // straight to the study page and watches it fill in live, rather
      // than this screen blocking until the AI call finishes.
      setStageIndex(1);
      const { data: material, error: insertError } = await supabase
        .from("materials")
        .insert({
          title,
          course_code: courseCode ?? null,
          type: finalType,
          content_year: validYear,
          pages,
          file_path: path,
          status: willGenerate ? "processing" : "catalog_only",
          source: "student",
          uploaded_by: user.id,
          tags: [],
          content_confidence: confidence,
          content_confidence_note: confidenceNote ?? null,
          summary: willGenerate
            ? null
            : "We couldn't automatically pull readable text out of this file, so there's no generated summary yet — but it's saved, downloadable, and part of the catalogue. Try re-uploading a text-based version (or ask an admin to take a look) if you'd like study tools for it.",
        })
        .select()
        .single();
      if (insertError) throw insertError;

      setDone(true);

      if (willGenerate) {
        void runBackgroundGeneration({
          materialId: material.id,
          text: safeDbText(text),
          title,
          courseCode: courseCode ?? null,
          finalType,
          validYear,
        });
      }

      setTimeout(() => navigate({ to: "/study/$id", params: { id: material.id } }), 400);
    } catch (e) {
      console.error("Upload failed:", e);
      setError(describeUploadError(e));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] text-muted-foreground">
        We'll guess a category from the file itself — tap one below anytime to set it yourself.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {MATERIAL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={busy}
            onClick={() => {
              setType(t);
              setTypeManuallySet(true);
            }}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
              type === t ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
        <AnimatePresence>
          {type === "Past Paper" && (
            <motion.input
              key="year-input"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 88 }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.18 }}
              value={contentYear}
              onChange={(e) => setContentYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              disabled={busy}
              placeholder="Year"
              inputMode="numeric"
              className="rounded-lg border border-input bg-surface px-2.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          )}
        </AnimatePresence>
      </div>

      <motion.div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={busy ? undefined : onDrop}
        animate={{ scale: dragging ? 1.015 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
      >
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            dragging
              ? "border-primary bg-primary/10"
              : busy
                ? "border-primary/40 bg-primary/5"
                : done
                  ? "border-teal/50 bg-teal/10"
                  : error
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border bg-surface-muted hover:border-primary/40"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />

          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid h-6 w-6 place-items-center">
                <CheckCircle2 className="h-6 w-6 text-teal" />
              </motion.div>
            ) : busy ? (
              <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </motion.div>
            ) : error ? (
              <motion.div key="error" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <FileWarning className="h-6 w-6 text-destructive" />
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Upload className="h-6 w-6 text-copper" />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="text-sm font-semibold text-foreground">
            <AnimatePresence mode="wait">
              <motion.span
                key={busy ? (stageIndex === 0 && ocrStage ? ocrStage : STAGES[stageIndex]) : done ? "done" : "idle"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="inline-block"
              >
                {busy
                  ? stageIndex === 0 && ocrStage
                    ? ocrStage
                    : STAGES[stageIndex]
                  : done
                    ? "Added to your catalogue"
                    : "Drop any document here, or tap to choose"}
              </motion.span>
            </AnimatePresence>
          </div>

          {busy && (
            <div className="h-1 w-40 overflow-hidden rounded-full bg-surface">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: "0%" }}
                animate={{
                  width: `${(((stageIndex === 0 && ocrStage ? ocrProgress : 1) + stageIndex) / STAGES.length) * 100}%`,
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}

          <p className="max-w-xs text-xs text-muted-foreground">
            {busy
              ? stageIndex === 0 && ocrStage
                ? "Scanned or photographed pages take longer to read — hang tight."
                : fileSizeMB && fileSizeMB > 8
                  ? `${fileLabel ?? "Document"} (${fileSizeMB.toFixed(1)} MB) — larger files take longer on slower connections, hang tight.`
                  : `${fileLabel ?? "Document"} — this can take a moment, don't close the tab.`
              : done
                ? "Your study tools are being generated now — you'll see them fill in on the next page."
                : "PDF, Word, PowerPoint, a photo of a page, or a zip of files — we'll do our best with anything you give it."}
          </p>
          {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
        </label>
      </motion.div>
    </div>
  );
}
