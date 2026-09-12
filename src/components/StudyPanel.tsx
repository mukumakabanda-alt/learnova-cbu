import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Layers,
  ListChecks,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Maximize2,
  Share2,
  Bookmark,
  BookmarkCheck,
  WifiOff,
  Check,
  AlertTriangle,
  Youtube,
  Flame,
  RefreshCw,
  Info,
  HelpCircle,
  Map as MapIcon,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  useFlashcards,
  useQuizQuestions,
  useBumpStreak,
  useRelatedMaterials,
  useIncrementDownload,
  useYoutubeRecommendations,
  useSavedMaterials,
  useToggleSaved,
  useRegenerateMaterial,
  type MaterialWithCourse,
} from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import {
  saveMaterialOffline,
  touchLastOpened,
  useOfflineStatus,
  useOnlineStatus,
} from "@/lib/offline";
import {
  forceDownload,
  forceDownloadBundleAsZip,
  fetchFileForOffline,
  originalFileName,
} from "@/lib/document-files";
import { extractDocumentText } from "@/lib/document-text";
import { DocumentViewer, InlineDocumentPreview } from "@/components/DocumentViewer";
import { LearnovaAI } from "@/lib/learnova-ai";
import { loadStudentProfile, saveStudentProfile } from "@/lib/student-profile";
import type { Database } from "@/integrations/supabase/types";
import { Link } from "@tanstack/react-router";

type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];
type FlashcardRow = Database["public"]["Tables"]["flashcards"]["Row"];
type QuizRow = Database["public"]["Tables"]["quiz_questions"]["Row"];
type Material = MaterialWithCourse;
type StageStatus = "pending" | "ready" | "failed" | string;

// A past paper, a course outline and an assignment brief aren't "notes
// with a quiz bolted on" — they get their own tab and their own content
// (see StudyKitView below), reading materials.study_kit instead of the
// flashcards/quiz tables. Notes/Slides/Summary/anything unrecognised
// keep the exact original three tabs, unchanged.
type MaterialKind = "past-paper" | "outline" | "assignment" | "standard";
function materialKindOf(materialType: string | null | undefined): MaterialKind {
  const t = (materialType ?? "").toLowerCase();
  if (t.includes("past paper") || t.includes("exam")) return "past-paper";
  if (t.includes("outline")) return "outline";
  if (t.includes("assignment")) return "assignment";
  return "standard";
}

const STANDARD_TABS = [
  { id: "summary", label: "Summary", icon: FileText },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "quiz", label: "Quiz", icon: ListChecks },
] as const;
const PAST_PAPER_TABS = [
  { id: "summary", label: "Summary", icon: FileText },
  { id: "kit", label: "Q&A", icon: HelpCircle },
] as const;
const OUTLINE_TABS = [
  { id: "summary", label: "Summary", icon: FileText },
  { id: "kit", label: "Key Topics", icon: MapIcon },
] as const;
const ASSIGNMENT_TABS = [
  { id: "summary", label: "Summary", icon: FileText },
  { id: "kit", label: "Requirements", icon: ClipboardCheck },
] as const;
type Tab = "summary" | "flashcards" | "quiz" | "kit";

const CURRENT_YEAR = new Date().getFullYear();

const pillBtn =
  "inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50";

export function StudyPanel({
  material,
  offlineBundle = null,
}: {
  material: Material;
  /** When set, flashcards/quiz render from this cached snapshot instead of the network — used for offline viewing. */
  offlineBundle?: { flashcards: FlashcardRow[]; quiz: QuizRow[] } | null;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const { user, isAdmin } = useAuth();
  const bumpStreak = useBumpStreak();
  const isOnline = useOnlineStatus();
  const incrementDownload = useIncrementDownload();

  // "Save" used to only exist inside the full-screen viewer's toolbar —
  // meaning it was hidden behind the same extra tap as the document
  // itself. It's a primary action now, next to Download/Share/Like.
  const { data: saved } = useSavedMaterials();
  const isSaved = (saved ?? []).some((s) => s.material_id === material.id);
  const toggleSaved = useToggleSaved();

  // Download and "Save for offline" used to be two separate buttons that
  // both quietly did almost the same thing — confusing, and it meant
  // downloading a file never visibly registered anywhere. They're one
  // button now: Download saves the file to the device AND the in-app
  // Library in one tap, and the button itself becomes the status —
  // "Download" flips to "Downloaded" the moment it's cached, tap again
  // to remove. useOfflineStatus is reactive (see src/lib/offline.ts), so
  // this stays in sync if the same material is downloaded from
  // somewhere else too.
  const { downloaded, verified } = useOfflineStatus(material.id);
  const [downloading, setDownloading] = useState(false);
  const [removingOffline, setRemovingOffline] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [regeneratingLocally, setRegeneratingLocally] = useState(false);

  // These share a react-query cache key with the ones FlashcardDeck/Quiz
  // use, so this doesn't cause an extra network round trip.
  const { data: flashcardsForOffline } = useFlashcards(material.id);
  const { data: quizForOffline } = useQuizQuestions(material.id);

  const relatedPastPapers = useRelatedMaterials(material.course_code, {
    type: "Past Paper",
    excludeId: material.id,
    limit: 4,
  });
  const popularInCourse = useRelatedMaterials(material.course_code, {
    excludeId: material.id,
    limit: 4,
  });

  // A smarter, domain-aware search query — built by the local Learnova AI
  // engine from the material's course, tags and type (see
  // bestYoutubeQuery in src/lib/learnova-ai/youtube-suggester.ts) — feeds
  // the same real YouTube Data API lookup the app already had
  // (useYoutubeRecommendations → supabase/functions/youtube-recommendations),
  // so what renders below is actual videos with real titles and
  // thumbnails, not a link to a search results page. Falls back to the
  // simpler course+tags string only if the AI engine has nothing better.
  const videoQuery =
    material.status === "ready"
      ? (LearnovaAI.bestYoutubeQuery({
          id: material.id,
          title: material.title,
          summary: material.summary,
          tags: material.tags,
          content_year: material.content_year,
          type: material.type,
          course_code: material.course_code,
          courseTitle: material.courses?.title,
        }) ??
        ([material.courses?.title, ...(material.tags ?? []).slice(0, 2)]
          .filter(Boolean)
          .join(" ") ||
          material.title))
      : null;
  const recommendedVideos = useYoutubeRecommendations(videoQuery);

  const regenerateMutation = useRegenerateMaterial();
  const regenerating = regeneratingLocally || regenerateMutation.isPending;

  useEffect(() => {
    if (material.status === "ready") bumpStreak.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material.id, material.status]);

  // If this material is already saved offline, opening its page counts
  // as "opening" it for the Library's "recently opened" ordering — the
  // closest thing offline has to Spotify's "Recently played." (The
  // inline preview below also touches this on a successful file load —
  // harmless if it fires twice, and this one still covers materials
  // with no file attached.)
  useEffect(() => {
    touchLastOpened(material.id);
  }, [material.id]);

  function handleExpand() {
    setViewerOpen(true);
  }

  // Downloads to the device AND caches the real file for the Offline
  // Library in the same action — see the comment on the `downloaded`
  // state above for why these used to be two separate, confusing
  // buttons.
  async function handleDownload() {
    if (!material.file_path) return;
    setDownloading(true);
    try {
      const extraFilePaths = material.extra_file_paths ?? [];
      const isBundle = extraFilePaths.length > 0;

      if (isBundle) {
        await forceDownloadBundleAsZip([material.file_path, ...extraFilePaths], material.title);
        // The zip is what the student keeps; caching each page
        // separately here too is what lets this same study page keep
        // working with zero signal afterwards, same promise as any
        // other Download.
        const [cover, ...extras] = await Promise.all(
          [material.file_path, ...extraFilePaths].map((p) => fetchFileForOffline(p)),
        );
        if (!cover) throw new Error("Couldn't fetch the cover page.");
        const extrasComplete = extras.every((e) => e !== null);
        incrementDownload.mutate(material.id);
        await saveMaterialOffline({
          material,
          flashcards: offlineBundle?.flashcards ?? flashcardsForOffline ?? [],
          quiz: offlineBundle?.quiz ?? quizForOffline ?? [],
          fileBlob: cover.blob,
          fileMime: cover.mime,
          extraFileBlobs: extrasComplete ? extras.map((e) => e!.blob) : undefined,
          extraFileMimes: extrasComplete ? extras.map((e) => e!.mime) : undefined,
        });
      } else {
        const blob = await forceDownload(material.file_path, material.title);
        incrementDownload.mutate(material.id);
        await saveMaterialOffline({
          material,
          flashcards: offlineBundle?.flashcards ?? flashcardsForOffline ?? [],
          quiz: offlineBundle?.quiz ?? quizForOffline ?? [],
          fileBlob: blob,
          fileMime: blob.type,
        });
      }
      toast.success("Downloaded — also in your Library, opens with zero signal from here on.");
      // Feeds the local Learnova AI student-memory system so "documents
      // downloaded" on the dashboard is accurate — see
      // src/lib/student-profile.ts.
      if (user)
        saveStudentProfile(
          LearnovaAI.recordDownload(
            loadStudentProfile(user.id, user.email ?? "Student"),
            material.id,
          ),
        );
    } catch {
      toast.error("Couldn't download that file right now — try again in a moment.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleRemoveDownload() {
    setRemovingOffline(true);
    try {
      const { removeOfflineMaterial } = await import("@/lib/offline");
      await removeOfflineMaterial(material.id);
      toast.success("Removed from your Library.");
    } catch {
      toast.error("Couldn't remove this from your Library right now.");
    } finally {
      setRemovingOffline(false);
    }
  }

  // Shares the app's own page link (not a raw storage URL, which would
  // expire in seconds and leak the storage path) — works for anyone,
  // signed in or not, once the file itself is ready (see the storage RLS
  // policy added for anon reads on ready/catalog_only materials).
  async function handleShare() {
    const url = `${window.location.origin}/study/${material.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: material.title,
          text: `Check out "${material.title}" on Learnova`,
          url,
        });
      } catch {
        // The person cancelled the native share sheet — not a real error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — share it with anyone, signed in or not.");
    } catch {
      toast.error("Couldn't copy the link automatically — copy it from the address bar instead.");
    }
  }

  function handleToggleSave() {
    if (!user) {
      toast.error("Sign in to save this.");
      return;
    }
    toggleSaved.mutate({ materialId: material.id, save: !isSaved });
  }

  // Feeds every quiz attempt into the local Learnova AI student-memory
  // system (src/lib/learnova-ai/student-memory.ts) — this is what powers
  // "weak topics" / "strong topics" / quiz score on the dashboard. Stored
  // on-device (localStorage, see src/lib/student-profile.ts) since
  // there's no server-side table for it yet.
  function handleQuizSubmitted(
    score: number,
    total: number,
    weakQuestions: string[],
    timeSpentSeconds: number,
  ) {
    if (!user) return;
    const profile = loadStudentProfile(user.id, user.email ?? "Student");
    const updated = LearnovaAI.recordQuizAttempt(profile, {
      materialId: material.id,
      courseCode: material.course_code,
      score,
      total,
      date: new Date().toISOString(),
      topicsCovered: material.tags && material.tags.length ? material.tags : [material.type],
      weakQuestions,
      timeSpent: timeSpentSeconds,
    });
    saveStudentProfile(updated);
  }

  // Re-reads the originally uploaded file and asks the real AI pipeline
  // to try again — used when generation failed outright, when one stage
  // (say, just the quiz) failed while the others succeeded, or when a
  // material only has the local-fallback version and a real AI pipeline
  // is reachable now. There's no separate "extracted text" storage — the
  // stored file is the source of truth — so this re-runs the same
  // extraction the original upload did (see document-text.ts) before
  // calling the edge function again.
  async function handleRegenerate() {
    if (!user) {
      toast.error("Sign in to regenerate this material's study tools.");
      return;
    }
    if (!material.file_path) {
      toast.error("There's no saved file for this material to regenerate from.");
      return;
    }
    setRegeneratingLocally(true);
    try {
      const fetched = await fetchFileForOffline(material.file_path);
      if (!fetched) throw new Error("Couldn't re-read the saved file.");
      const filename = originalFileName(material.file_path, material.title);
      const file = new File([fetched.blob], filename, { type: fetched.mime });
      const { text, quality, confidence, model } = await extractDocumentText(file);
      if (quality === "none" || !text.trim() || confidence < 0.5) {
        toast.error(
          "Study tools aren't available because this file couldn't be read with enough confidence.",
        );
        return;
      }
      await regenerateMutation.mutateAsync({
        materialId: material.id,
        text,
        title: material.title,
        confidence,
        documentModel: model,
      });
      toast.success("Regenerating — this page updates itself as it finishes.");
    } catch (e) {
      toast.error(
        e instanceof Error && e.message
          ? e.message
          : "Couldn't restart generation right now — try again in a moment.",
      );
    } finally {
      setRegeneratingLocally(false);
    }
  }

  const isOutdated = material.content_year != null && CURRENT_YEAR - material.content_year >= 5;
  const isProcessing = material.status === "processing";
  const isFailed = material.status === "failed";
  const summaryStatus: StageStatus = material.summary_status ?? "ready";
  const flashcardsStatus: StageStatus = material.flashcards_status ?? "ready";
  const quizStatus: StageStatus = material.quiz_status ?? "ready";
  const anyStageFailed =
    summaryStatus === "failed" || flashcardsStatus === "failed" || quizStatus === "failed";
  const confidenceNote = material.content_confidence_note ?? "";
  const isLowConfidence =
    material.content_confidence != null &&
    (material.content_confidence < 0.45 ||
      /couldn't be read|may be missing|unreadable/i.test(confidenceNote));
  const isLocalFallback = material.generation_source === "local-fallback";
  const canRegenerate = !!material.file_path && isAdmin;
  const kind = materialKindOf(material.type);
  const TABS =
    kind === "past-paper"
      ? PAST_PAPER_TABS
      : kind === "outline"
        ? OUTLINE_TABS
        : kind === "assignment"
          ? ASSIGNMENT_TABS
          : STANDARD_TABS;
  const kitLabel =
    kind === "past-paper"
      ? "Questions & answers"
      : kind === "outline"
        ? "Key topics"
        : "Requirements";

  return (
    <div>
      {/* PREVIEW — first thing on the page now, no tap required to see it. */}
      <div className="mb-4">
        <InlineDocumentPreview
          materialId={material.id}
          filePath={material.file_path}
          title={material.title}
          extraFilePaths={material.extra_file_paths}
        />
      </div>

      {/* Actions row: quiet by default, only shows what applies. Shown
          regardless of processing status — the raw file is already
          safely uploaded and viewable/downloadable even while
          AI-generated study tools are still being produced (or failed
          outright); a document being "still generating" used to hide
          these buttons entirely, which is exactly what made a
          freshly-uploaded file look broken. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {material.file_path && (
          <>
            <button onClick={handleExpand} className={pillBtn}>
              <Maximize2 className="h-3.5 w-3.5" /> Expand
            </button>
            <button
              onClick={downloaded ? handleRemoveDownload : handleDownload}
              disabled={downloading || removingOffline}
              className={`${pillBtn} ${verified ? "border-teal/40 bg-teal/10 text-teal hover:bg-teal/10" : downloaded ? "border-copper/40 bg-copper/10 text-copper hover:bg-copper/10" : ""}`}
              title={
                verified
                  ? "Offline ready — opens with zero signal. Tap to remove."
                  : downloaded
                    ? "Downloaded, but offline verification is incomplete. Tap to retry or remove."
                    : "Download — saves to your device and your offline Library"
              }
            >
              {downloading || removingOffline ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : verified ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {verified ? "Offline ready" : downloaded ? "Downloaded" : "Download"}
            </button>
          </>
        )}
        <button
          onClick={handleToggleSave}
          disabled={toggleSaved.isPending}
          className={`${pillBtn} ${isSaved ? "border-primary/40 bg-primary/10 text-copper hover:bg-primary/10" : ""}`}
        >
          {isSaved ? (
            <BookmarkCheck className="h-3.5 w-3.5" />
          ) : (
            <Bookmark className="h-3.5 w-3.5" />
          )}
          {isSaved ? "Saved" : "Save"}
        </button>
        <button onClick={handleShare} className={pillBtn}>
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
        {!isOnline && (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-surface-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <WifiOff className="h-3.5 w-3.5" /> You're offline
          </span>
        )}
        {isOutdated && (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-copper/30 bg-copper/10 px-3 py-1.5 text-xs font-medium text-copper">
            <AlertTriangle className="h-3.5 w-3.5" /> From {material.content_year} — may be outdated
          </span>
        )}
        {isLowConfidence && (
          <span
            className="inline-flex items-center gap-1.5 rounded-xl border border-copper/30 bg-copper/10 px-3 py-1.5 text-xs font-medium text-copper"
            title={material.content_confidence_note ?? undefined}
          >
            <Info className="h-3.5 w-3.5" />{" "}
            {material.content_confidence_note ?? "Some document content could not be read reliably"}
          </span>
        )}
      </div>

      {isProcessing ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <div className="text-sm font-semibold text-foreground">Generating your study tools…</div>
          <div className="text-xs text-muted-foreground">
            Reading, organizing, and grounding the document…
          </div>
          <p className="max-w-xs text-xs text-muted-foreground">
            This page updates itself as each part finishes — no need to refresh. The file above is
            already yours to view or download in the meantime.
          </p>
        </div>
      ) : isFailed ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-foreground">
          <p>Generation didn't finish for this one.</p>
          {material.processing_error && (
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface px-3 py-2 font-mono text-xs text-destructive">
              {material.processing_error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canRegenerate ? (
              <button
                onClick={handleRegenerate}
                disabled={regenerating || !isOnline}
                className={pillBtn}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
                {regenerating
                  ? "Regenerating…"
                  : !isOnline
                    ? "Regenerate (needs internet)"
                    : "Regenerate"}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">
                Try re-uploading it, or request it and an admin will take a look.
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The file itself is safe either way — view or download it above.
          </p>
        </div>
      ) : (
        <>
          {isLocalFallback && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-copper/30 bg-copper/10 px-3 py-2 text-xs font-medium text-copper">
              <span>
                These study tools came from a lighter local version — the full AI pipeline didn't
                respond when this was generated.
              </span>
              {canRegenerate && (
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating || !isOnline}
                  className="inline-flex shrink-0 items-center gap-1 font-semibold disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${regenerating ? "animate-spin" : ""}`} />{" "}
                  {regenerating ? "Regenerating…" : "Regenerate with AI"}
                </button>
              )}
            </div>
          )}
          {anyStageFailed && !isLocalFallback && (
            <div className="mb-4 space-y-1.5">
              {summaryStatus === "failed" && (
                <StageRow
                  label="Summary"
                  status="failed"
                  error={material.summary_error}
                  onRegenerate={canRegenerate ? handleRegenerate : undefined}
                  regenerating={regenerating}
                />
              )}
              {flashcardsStatus === "failed" && (
                <StageRow
                  label="Flashcards"
                  status="failed"
                  error={material.flashcards_error}
                  onRegenerate={canRegenerate ? handleRegenerate : undefined}
                  regenerating={regenerating}
                />
              )}
              {quizStatus === "failed" && (
                <StageRow
                  label="Quiz"
                  status="failed"
                  error={material.quiz_error}
                  onRegenerate={canRegenerate ? handleRegenerate : undefined}
                  regenerating={regenerating}
                />
              )}
            </div>
          )}

          <div className="sticky top-16 z-20 relative flex gap-1 rounded-xl border border-border bg-surface-muted/95 p-1 shadow-soft backdrop-blur">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors"
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="study-tab-pill"
                    className="absolute inset-0 rounded-lg bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span
                  className={`relative z-10 flex items-center gap-1.5 ${tab === t.id ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 min-h-[160px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {tab === "summary" && (
                  <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-foreground">
                    {summaryStatus === "pending" ? (
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Still generating the
                        summary…
                      </span>
                    ) : summaryStatus === "failed" ? (
                      <div className="text-muted-foreground">
                        <p>{material.summary_error || "The summary couldn't be generated."}</p>
                        {canRegenerate && (
                          <button
                            onClick={handleRegenerate}
                            disabled={regenerating || !isOnline}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${regenerating ? "animate-spin" : ""}`}
                            />{" "}
                            Regenerate
                          </button>
                        )}
                      </div>
                    ) : (
                      material.summary || "No summary yet."
                    )}
                    {material.tags && material.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {material.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-teal/10 px-2 py-0.5 text-[11px] font-medium text-teal"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {tab === "flashcards" && (
                  <FlashcardDeck
                    materialId={material.id}
                    initialCards={offlineBundle?.flashcards}
                    status={flashcardsStatus}
                    error={material.flashcards_error}
                    onRegenerate={canRegenerate ? handleRegenerate : undefined}
                    regenerating={regenerating || !isOnline}
                  />
                )}
                {tab === "quiz" && (
                  <Quiz
                    materialId={material.id}
                    initialQuestions={offlineBundle?.quiz}
                    onSubmit={handleQuizSubmitted}
                    status={quizStatus}
                    error={material.quiz_error}
                    onRegenerate={canRegenerate ? handleRegenerate : undefined}
                    regenerating={regenerating || !isOnline}
                  />
                )}
                {tab === "kit" && kind !== "standard" && (
                  <StudyKitView
                    kind={kind}
                    studyKit={material.study_kit}
                    errorHint={material.processing_error}
                    canRegenerate={canRegenerate}
                    onRegenerate={handleRegenerate}
                    regenerating={regenerating || !isOnline}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {material.type === "Past Paper" && (relatedPastPapers.data?.length ?? 0) > 0 && (
            <RelatedList
              title="Similar past papers for this course"
              items={relatedPastPapers.data ?? []}
            />
          )}
          {(popularInCourse.data?.length ?? 0) > 0 && (
            <RelatedList title="Popular in this course" items={popularInCourse.data ?? []} />
          )}
          {(recommendedVideos.data?.length ?? 0) > 0 && (
            <div className="mt-8">
              <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-copper">
                <Youtube className="h-3.5 w-3.5" /> Recommended videos
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {recommendedVideos.data!.map((v) => (
                  <a
                    key={v.videoId}
                    href={`https://www.youtube.com/watch?v=${v.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group w-44 shrink-0 overflow-hidden rounded-xl border border-border bg-card hover:border-primary/30"
                  >
                    {v.thumbnail && (
                      <img src={v.thumbnail} alt="" className="h-24 w-full object-cover" />
                    )}
                    <div className="p-2">
                      <div className="line-clamp-2 text-[11px] font-semibold text-foreground group-hover:text-primary">
                        {v.title}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {v.channelTitle}
                      </div>
                      {v.reason && (
                        <div className="mt-1 line-clamp-2 text-[9px] text-muted-foreground">
                          {v.reason}
                        </div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <DocumentViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        materialId={material.id}
        filePath={material.file_path}
        title={material.title}
        material={material}
      />
    </div>
  );
}

function StageRow({
  label,
  status,
  error,
  onRegenerate,
  regenerating,
}: {
  label: string;
  status: StageStatus;
  error?: string | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        {status === "ready" ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal" />
        ) : status === "failed" ? (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        )}
        <span className="shrink-0 font-medium text-foreground">{label}</span>
        <span className="truncate text-muted-foreground">
          {status === "ready"
            ? "Ready"
            : status === "failed"
              ? error || "Couldn't generate"
              : "Generating…"}
        </span>
      </div>
      {status === "failed" && onRegenerate && (
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${regenerating ? "animate-spin" : ""}`} /> Regenerate
        </button>
      )}
    </div>
  );
}

function RelatedList({ title, items }: { title: string; items: MaterialRow[] }) {
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-copper">
        <Flame className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="grid gap-2">
        {items.map((m) => (
          <Link
            key={m.id}
            to="/study/$id"
            params={{ id: m.id }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 hover:border-primary/30"
          >
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-foreground">{m.title}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {m.type}
                {m.content_year ? ` · ${m.content_year}` : ""}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// The adaptive second tab — content and shape depend entirely on `kind`,
// reading materials.study_kit (a flexible JSON column; see the migration
// and process-material for exactly what each kind writes into it).
function StudyKitView({
  kind,
  studyKit,
  errorHint,
  canRegenerate,
  onRegenerate,
  regenerating,
}: {
  kind: Exclude<MaterialKind, "standard">;
  studyKit: unknown;
  errorHint: string | null;
  canRegenerate: boolean;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  if (!studyKit || typeof studyKit !== "object") {
    return (
      <FailedState
        label={errorHint || "This part couldn't be generated."}
        onRegenerate={canRegenerate ? onRegenerate : undefined}
        regenerating={regenerating}
      />
    );
  }
  const kit = studyKit as Record<string, any>;

  if (kind === "past-paper") {
    const questions: { number: string; text: string; marks: number | null }[] = Array.isArray(
      kit.questions,
    )
      ? kit.questions
      : [];
    const guidanceByNumber = new Map<string, string>(
      (Array.isArray(kit.answer_guidance) ? kit.answer_guidance : []).map((a: any) => [
        String(a.question_number),
        String(a.guidance ?? ""),
      ]),
    );
    const topics: string[] = Array.isArray(kit.topics_tested) ? kit.topics_tested : [];
    if (questions.length === 0)
      return <EmptyState label="No questions extracted from this paper yet." />;
    return (
      <div className="space-y-3">
        {(topics.length > 0 || kit.difficulty) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {kit.difficulty && (
              <span className="rounded-md bg-copper/10 px-2 py-0.5 text-[11px] font-medium text-copper">
                {kit.difficulty}
              </span>
            )}
            {topics.map((t) => (
              <span
                key={t}
                className="rounded-md bg-teal/10 px-2 py-0.5 text-[11px] font-medium text-teal"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        {questions.map((q, i) => (
          <PastPaperQuestion
            key={i}
            question={q}
            guidance={guidanceByNumber.get(q.number) || null}
          />
        ))}
      </div>
    );
  }

  if (kind === "outline") {
    const topics: { title: string; description: string }[] = Array.isArray(kit.topics)
      ? kit.topics
      : [];
    const plan: string[] = Array.isArray(kit.revision_plan) ? kit.revision_plan : [];
    const outcomes: string[] = Array.isArray(kit.learning_outcomes) ? kit.learning_outcomes : [];
    if (topics.length === 0)
      return <EmptyState label="No topic list extracted from this outline yet." />;
    return (
      <div className="space-y-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-copper">
            Topics covered
          </div>
          <div className="mt-3 grid gap-2">
            {topics.map((t, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{t.title}</div>
                  {t.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        {plan.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">
              Suggested revision order
            </div>
            <ol className="mt-3 space-y-2">
              {plan.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground">
                  <span className="shrink-0 font-semibold text-primary">{i + 1}.</span> {s}
                </li>
              ))}
            </ol>
          </div>
        )}
        {outcomes.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">
              You should be able to
            </div>
            <ul className="mt-3 space-y-1.5">
              {outcomes.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" /> {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // assignment
  const requirements: string[] = Array.isArray(kit.requirements) ? kit.requirements : [];
  const deliverables: string[] = Array.isArray(kit.deliverables) ? kit.deliverables : [];
  const checklist: string[] = Array.isArray(kit.checklist) ? kit.checklist : [];
  const deadlineNote: string | null =
    typeof kit.deadline_note === "string" ? kit.deadline_note : null;
  if (requirements.length === 0)
    return <EmptyState label="No requirements extracted from this brief yet." />;
  return (
    <div className="space-y-5">
      {deadlineNote && (
        <div className="flex items-center gap-1.5 rounded-xl border border-copper/30 bg-copper/10 px-3 py-2 text-xs font-medium text-copper">
          <AlertTriangle className="h-3.5 w-3.5" /> {deadlineNote}
        </div>
      )}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-copper">
          Requirements
        </div>
        <ul className="mt-3 space-y-1.5">
          {requirements.map((s, i) => (
            <li key={i} className="text-sm text-foreground">
              • {s}
            </li>
          ))}
        </ul>
      </div>
      {deliverables.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-copper">
            Deliverables
          </div>
          <ul className="mt-3 space-y-1.5">
            {deliverables.map((s, i) => (
              <li key={i} className="text-sm text-foreground">
                • {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {checklist.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-copper">
            Getting started
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Structure and process only — this won't write the assignment for you.
          </p>
          <div className="mt-3 space-y-2">
            {checklist.map((s, i) => (
              <ChecklistItem key={i} text={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Attempt-first, reveal-after — the same self-testing spirit as the
// flashcard/quiz flip interaction elsewhere on this page, since a past
// paper is for practising against, not reading passively.
function PastPaperQuestion({
  question,
  guidance,
}: {
  question: { number: string; text: string; marks: number | null };
  guidance: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">
          Q{question.number}. {question.text}
        </div>
        {question.marks != null && (
          <span className="shrink-0 rounded-md bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {question.marks} marks
          </span>
        )}
      </div>
      {guidance &&
        (revealed ? (
          <div className="mt-3 rounded-xl border border-teal/20 bg-teal/5 p-3 text-sm text-foreground">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-teal">
              Answer guidance
            </div>
            {guidance}
          </div>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
          >
            <HelpCircle className="h-3.5 w-3.5" /> Reveal answer guidance
          </button>
        ))}
    </div>
  );
}

// Session-only (not persisted) — just lets a student visually track
// progress through a checklist while they work, the same way they'd tick
// items on a printed sheet.
function ChecklistItem({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => setDone((d) => !d)}
      className={`flex w-full items-start gap-2.5 rounded-xl border p-3 text-left text-sm transition-colors ${
        done
          ? "border-teal/40 bg-teal/5 text-muted-foreground line-through"
          : "border-border bg-card text-foreground"
      }`}
    >
      <span
        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${done ? "border-teal bg-teal text-white" : "border-border"}`}
      >
        {done && <Check className="h-3 w-3" />}
      </span>
      {text}
    </button>
  );
}

function FlashcardDeck({
  materialId,
  initialCards,
  status,
  error,
  onRegenerate,
  regenerating,
}: {
  materialId: string;
  initialCards?: FlashcardRow[];
  status?: StageStatus;
  error?: string | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const shouldFetch = !initialCards;
  const { data: fetchedCards, isLoading } = useFlashcards(shouldFetch ? materialId : "");
  const cards = initialCards ?? fetchedCards;

  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dir, setDir] = useState(1);

  if (shouldFetch && isLoading) return <SkeletonCard />;
  if (!cards?.length) {
    if (status === "pending") return <PendingState label="Flashcards are still generating…" />;
    if (status === "failed")
      return (
        <FailedState
          label={error || "Flashcards couldn't be generated."}
          onRegenerate={onRegenerate}
          regenerating={regenerating}
        />
      );
    return <EmptyState label="No flashcards for this one yet." />;
  }

  const card = cards[i];
  const go = (delta: number) => {
    setFlipped(false);
    setDir(delta);
    setI((prev) => (prev + delta + cards.length) % cards.length);
  };

  return (
    <div>
      <div className="min-h-[220px]" style={{ perspective: 1200 }}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={i}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -dir * 40 }}
            transition={{ duration: 0.2 }}
          >
            <button
              onClick={() => setFlipped((f) => !f)}
              className="flex min-h-[220px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6 text-center shadow-soft"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={flipped ? "answer" : "question"}
                  initial={{ rotateX: 90, opacity: 0 }}
                  animate={{ rotateX: 0, opacity: 1 }}
                  exit={{ rotateX: -90, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col items-center gap-3"
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wide ${flipped ? "text-teal" : "text-copper"}`}
                  >
                    {flipped ? "Answer" : "Question"}
                  </span>
                  <p className="text-base font-medium text-foreground">
                    {flipped ? card.answer : card.question}
                  </p>
                </motion.div>
              </AnimatePresence>
              <span className="text-xs text-muted-foreground">Tap to flip</span>
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => go(-1)}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground">
          {i + 1} / {cards.length}
        </span>
        <button
          onClick={() => go(1)}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Quiz({
  materialId,
  initialQuestions,
  onSubmit,
  status,
  error,
  onRegenerate,
  regenerating,
}: {
  materialId: string;
  initialQuestions?: QuizRow[];
  /** Called once, right when "Check answers" is tapped — feeds the local Learnova AI student-memory system. */
  onSubmit?: (
    score: number,
    total: number,
    weakQuestions: string[],
    timeSpentSeconds: number,
  ) => void;
  status?: StageStatus;
  error?: string | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const shouldFetch = !initialQuestions;
  const { data: fetchedQuestions, isLoading } = useQuizQuestions(shouldFetch ? materialId : "");
  const questions = initialQuestions ?? fetchedQuestions;

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const startedAtRef = useRef(Date.now());

  if (shouldFetch && isLoading) return <SkeletonCard />;
  if (!questions?.length) {
    if (status === "pending") return <PendingState label="The quiz is still generating…" />;
    if (status === "failed")
      return (
        <FailedState
          label={error || "The quiz couldn't be generated."}
          onRegenerate={onRegenerate}
          regenerating={regenerating}
        />
      );
    return <EmptyState label="No quiz for this one yet." />;
  }

  const score = questions.filter((q) => answers[q.id] === q.correct_index).length;

  function handleCheckAnswers() {
    setSubmitted(true);
    onSubmit?.(
      score,
      questions!.length,
      questions!.filter((q) => answers[q.id] !== q.correct_index).map((q) => q.question),
      Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => (
        <motion.div
          key={q.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: Math.min(qi * 0.05, 0.4) }}
          className="rounded-2xl border border-border bg-card p-4"
        >
          <div className="text-sm font-semibold text-foreground">
            {qi + 1}. {q.question}
          </div>
          <div className="mt-3 grid gap-2">
            {q.options.map((opt, oi) => {
              const picked = answers[q.id] === oi;
              const isCorrect = submitted && oi === q.correct_index;
              const isWrongPick = submitted && picked && oi !== q.correct_index;
              return (
                <motion.button
                  key={oi}
                  whileTap={submitted ? undefined : { scale: 0.98 }}
                  disabled={submitted}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                    isCorrect
                      ? "border-teal/50 bg-teal/10 text-foreground"
                      : isWrongPick
                        ? "border-destructive/50 bg-destructive/10 text-foreground"
                        : picked
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border bg-surface text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt}
                  <AnimatePresence>
                    {isCorrect && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <CheckCircle2 className="h-4 w-4 text-teal" />
                      </motion.span>
                    )}
                    {isWrongPick && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <XCircle className="h-4 w-4 text-destructive" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
          {submitted && q.explanation && (
            <p className="mt-2 text-xs text-muted-foreground">{q.explanation}</p>
          )}
        </motion.div>
      ))}
      {!submitted ? (
        <button
          onClick={handleCheckAnswers}
          disabled={Object.keys(answers).length < questions.length}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          Check answers
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="rounded-xl bg-gold-gradient p-4 text-center font-semibold text-gold-foreground"
        >
          {score} / {questions.length} correct
        </motion.div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-muted" />;
}
function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
function PendingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface-muted p-8 text-center text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}
function FailedState({
  label,
  onRegenerate,
  regenerating,
}: {
  label: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-8 text-center text-sm text-muted-foreground">
      <p>{label}</p>
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />{" "}
          {regenerating ? "Regenerating…" : "Regenerate"}
        </button>
      )}
    </div>
  );
}
