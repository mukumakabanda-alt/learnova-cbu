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

const STAGES = ["Reading document…", "Uploading…", "Generating summary, flashcards & quiz…", "Adding to catalogue…"];

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

// Supabase's Postgrest/Storage errors are real Error instances in this
// project's SDK version, but this handles any thrown value defensively —
// a plain object with a `.message` (or a raw string) still surfaces its
// real reason instead of silently falling back to the generic copy.
function describeUploadError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Something went wrong uploading that file — mind trying again?";
}

// Runs the (synchronous, sometimes slow) LearnovaAI engine inside a Web
// Worker instead of blocking the main thread. Measured: a realistic
// ~60,000-character upload (a combined set of notes, or one longer
// scanned chapter) takes several seconds of pure computation — on the
// main thread that freezes the whole upload screen for that whole time,
// which on a phone reads as "the app just died." Falls back to running
// on the main thread (the previous behavior) if Workers aren't
// available, the worker fails to start, or it times out — so this can
// never make an upload fail outright, only ever change WHERE the same
// computation happens.
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

export function DocumentUpload({ courseCode }: { courseCode?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<MaterialType>("Notes");
  // Tracks whether the person has explicitly tapped a category themselves —
  // once they have, the auto-suggestion below backs off completely and
  // never overwrites their choice.
  const [typeManuallySet, setTypeManuallySet] = useState(false);
  const [contentYear, setContentYear] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
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
    setStageIndex(0);
    setOcrStage(null);
    setOcrProgress(0);

    // Auto-categorize from the filename alone, unless the person already
    // picked a category themselves before choosing the file — in which
    // case their choice is left alone completely, both now and after the
    // real text is extracted below. `finalType` (a plain local variable,
    // not the `type` state — state updates don't land synchronously, so
    // reading `type` again later in this same function would still see
    // the old value) is what actually gets saved.
    let finalType: MaterialType = type;
    if (!typeManuallySet) {
      finalType = guessMaterialType(file.name);
      setType(finalType);
    }

    try {
      // 1. Read — pulls whatever text we can out of literally any file
      // type, including running OCR for scanned PDFs and photos. This
      // never throws for "unsupported format"; a file we can't get clean
      // text from still uploads, it just won't get auto-generated study
      // tools (see the `quality` branch below).
      const { text, pages, quality } = await extractDocumentText(file, (p) => {
        setOcrStage(p.stage);
        setOcrProgress(p.progress);
      });

      // Refine the filename-only guess now that we have real content to
      // look at (catches e.g. "notes.pdf" that's actually a past exam
      // paper). Never overrides a category the person picked themselves.
      if (!typeManuallySet && quality !== "none") {
        finalType = guessMaterialType(file.name, text);
        setType(finalType);
      }

      // 2. Upload the raw file — always happens, regardless of how well
      // the text extraction went, so downloads always work.
      setStageIndex(1);
      // ensureFileExtension() covers files (very often ones saved via
      // WhatsApp on Android) whose name has no extension at all — without
      // it the stored path has no dot in it anywhere, which broke the
      // in-app preview entirely (previewKind() had nothing to detect) and
      // left the downloaded copy unable to open correctly too.
      const originalName = ensureFileExtension(safeFileName(file.name), file.type);
      const title = safeDbText(originalName.replace(/\.[a-z0-9]+$/i, ""), "Untitled material");
      const path = `${user.id}/${crypto.randomUUID()}-${originalName}`;
      const { error: uploadError } = await supabase.storage.from("materials").upload(path, file);
      if (uploadError) throw uploadError;

      const year = contentYear.trim() ? Number(contentYear.trim()) : null;
      const validYear = year && Number.isFinite(year) ? year : null;

      // 3. Generate study tools — off the main thread via a Web Worker
      // (see runAIOffMainThread above), so this costs nothing, needs no
      // network round trip to any external model, and doesn't freeze the
      // upload screen on a large document. A short/empty extraction
      // skips this step entirely — the material is still saved either
      // way, same as before.
      setStageIndex(2);
      let summary: string | null = null;
      let tags: string[] = [];
      let flashcards: { question: string; answer: string; position: number }[] = [];
      let quiz: { question: string; options: string[]; correctIndex: number; explanation: string; position: number }[] = [];

      if (quality !== "none") {
        try {
          const result = await runAIOffMainThread(safeDbText(text), {
            title,
            contentYear: validYear,
            courseCode: courseCode ?? null,
            type: finalType,
          });
          summary = safeDbText(result.summary) || null;
          tags = result.tags.map((tag) => safeDbText(tag)).filter(Boolean).slice(0, 10);
          flashcards = result.flashcards.map((f) => ({ question: safeDbText(f.question), answer: safeDbText(f.answer), position: f.position })).filter((f) => f.question && f.answer);
          quiz = result.quiz.map((q) => ({
            question: safeDbText(q.question),
            options: q.options.map((option) => safeDbText(option)).filter(Boolean).slice(0, 4),
            correctIndex: Math.max(0, Math.min(q.options.length - 1, Number.isInteger(q.correctIndex) ? q.correctIndex : 0)),
            explanation: safeDbText(q.explanation),
            position: q.position,
          })).filter((q) => q.question && q.options.length >= 2);
        } catch (e) {
          // The engine is designed to degrade gracefully on its own and
          // this shouldn't normally throw, but if it somehow does (or the
          // worker AND its main-thread fallback both fail), the upload
          // still falls through to catalog_only below rather than
          // failing outright.
          console.error("Learnova AI processing failed:", e);
        }
      }

      // 4. Catalogue it — one insert, already carrying the AI's results.
      setStageIndex(3);
      // Any ONE of summary/flashcards/quiz succeeding is enough to mark
      // this "ready" — this used to require summary specifically
      // (hasStudyTools = quality !== "none" && !!summary), which meant
      // that if the summarizer alone came back empty, perfectly good
      // flashcards and quiz questions that HAD been generated were
      // thrown away too, and the whole material got filed as
      // catalog_only. The three are independent outputs of the same
      // run — one being weak or empty shouldn't discard the other two.
      const hasAnyStudyTools = quality !== "none" && (!!summary || flashcards.length > 0 || quiz.length > 0);
      const { data: material, error: insertError } = await supabase
        .from("materials")
        .insert({
          title,
          course_code: courseCode ?? null,
          type: finalType,
          content_year: validYear,
          pages,
          file_path: path,
          status: hasAnyStudyTools ? "ready" : "catalog_only",
          source: "student",
          uploaded_by: user.id,
          tags: tags.length ? tags : [],
          summary:
            summary ??
            "We couldn't automatically pull readable text out of this file, so there's no generated summary yet — but it's saved, downloadable, and part of the catalogue. Try re-uploading a text-based version (or ask an admin to take a look) if you'd like study tools for it.",
        })
        .select()
        .single();
      if (insertError) throw insertError;

      // 5. Save the flashcards & quiz alongside it — attempted whenever
      // extraction produced usable text at all, independently of whether
      // the summary specifically came out non-empty (see note above).
      // Best-effort: if either insert fails, the material itself is
      // already safely saved above — it just opens to "no flashcards/
      // quiz yet" instead of erroring the whole upload. (If this is
      // still failing, check that the flashcard/quiz RLS migration
      // actually ran against your live database via Supabase's SQL
      // Editor — see the top of this message.)
      if (quality !== "none") {
        if (flashcards.length) {
          const { error: fcError } = await supabase
            .from("flashcards")
            .insert(flashcards.map((f) => ({ material_id: material.id, question: f.question, answer: f.answer, position: f.position })));
          if (fcError) console.error("Saving flashcards failed:", fcError);
        }
        if (quiz.length) {
          const { error: quizError } = await supabase.from("quiz_questions").insert(
            quiz.map((q) => ({
              material_id: material.id,
              question: q.question,
              options: q.options,
              correct_index: q.correctIndex,
              explanation: q.explanation,
              position: q.position,
            })),
          );
          if (quizError) console.error("Saving quiz failed:", quizError);
        }
      }

      setDone(true);
      setTimeout(() => navigate({ to: "/study/$id", params: { id: material.id } }), 500);
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
                : `${fileLabel ?? "Document"} — this can take a moment, don't close the tab.`
              : "PDF, Word, PowerPoint, a photo of a page, or a zip of files — we'll do our best with anything you give it."}
          </p>
          {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
        </label>
      </motion.div>
    </div>
  );
}
