import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Layers, ListChecks, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2,
  Download, Eye, Share2, Heart, WifiOff, HardDriveDownload, Check, AlertTriangle, Youtube, Flame,
} from "lucide-react";
import { toast } from "sonner";
import {
  useFlashcards, useQuizQuestions, useBumpStreak, useRelatedMaterials, useIncrementDownload,
  useYoutubeRecommendations, useMaterialLikeStatus, useToggleMaterialLike, type MaterialWithCourse,
} from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import { saveMaterialOffline, getOfflineMaterial, useOnlineStatus } from "@/lib/offline";
import { forceDownload } from "@/lib/document-files";
import { DocumentViewer } from "@/components/DocumentViewer";
import type { Database } from "@/integrations/supabase/types";
import { Link } from "@tanstack/react-router";

type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];
type FlashcardRow = Database["public"]["Tables"]["flashcards"]["Row"];
type QuizRow = Database["public"]["Tables"]["quiz_questions"]["Row"];
type Material = MaterialWithCourse;

const TABS = [
  { id: "summary", label: "Summary", icon: FileText },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "quiz", label: "Quiz", icon: ListChecks },
] as const;
type Tab = (typeof TABS)[number]["id"];

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
  const { user } = useAuth();
  const bumpStreak = useBumpStreak();
  const isOnline = useOnlineStatus();
  const incrementDownload = useIncrementDownload();
  const { data: liked } = useMaterialLikeStatus(material.id);
  const toggleLike = useToggleMaterialLike();

  const [offlineSaved, setOfflineSaved] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  // These share a react-query cache key with the ones FlashcardDeck/Quiz
  // use, so this doesn't cause an extra network round trip — it just lets
  // "Save for offline" grab the same data once it's loaded.
  const { data: flashcardsForOffline } = useFlashcards(material.id);
  const { data: quizForOffline } = useQuizQuestions(material.id);

  const relatedPastPapers = useRelatedMaterials(material.course_code, {
    type: "Past Paper",
    excludeId: material.id,
    limit: 4,
  });
  const popularInCourse = useRelatedMaterials(material.course_code, { excludeId: material.id, limit: 4 });

  const videoQuery = [material.courses?.title, ...(material.tags ?? []).slice(0, 2)].filter(Boolean).join(" ") || material.title;
  const recommendedVideos = useYoutubeRecommendations(material.status === "ready" ? videoQuery : null);

  useEffect(() => {
    if (material.status === "ready") bumpStreak.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material.id, material.status]);

  useEffect(() => {
    let active = true;
    getOfflineMaterial(material.id).then((bundle) => {
      if (active) setOfflineSaved(!!bundle);
    });
    return () => {
      active = false;
    };
  }, [material.id]);

  async function handleSaveOffline() {
    setSavingOffline(true);
    try {
      await saveMaterialOffline({
        material,
        flashcards: offlineBundle?.flashcards ?? flashcardsForOffline ?? [],
        quiz: offlineBundle?.quiz ?? quizForOffline ?? [],
      });
      setOfflineSaved(true);
    } catch {
      // Offline storage isn't available in this browser — quietly no-op,
      // the button just won't flip to "saved."
    } finally {
      setSavingOffline(false);
    }
  }

  // Opens the in-website document viewer (see DocumentViewer) instead of
  // trying to open a new browser tab. That old approach was the actual
  // cause of "I tap View and nothing happens": it opened a blank tab
  // *before* an `await`, but for a non-PDF file the browser then just
  // tried to download the raw file into that blank tab with no visible
  // change — indistinguishable from doing nothing at all. This shows the
  // document right on the page instead, with Save/Download next to it.
  function handleView() {
    setViewerOpen(true);
  }

  // Forces an actual save-to-device download (rather than an inline
  // preview) via the shared forceDownload helper — same signed-URL +
  // Content-Disposition:attachment approach the DocumentViewer's own
  // Download button uses, so both behave identically.
  async function handleDownload() {
    if (!material.file_path) return;
    setDownloading(true);
    try {
      await forceDownload(material.file_path, material.title);
      incrementDownload.mutate(material.id);
    } catch {
      toast.error("Couldn't download that file right now — try again in a moment.");
    } finally {
      setDownloading(false);
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
        await navigator.share({ title: material.title, text: `Check out "${material.title}" on Learnova`, url });
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

  function handleLike() {
    if (!user) {
      toast.error("Sign in to like this.");
      return;
    }
    toggleLike.mutate(material.id);
  }

  const isOutdated = material.content_year != null && CURRENT_YEAR - material.content_year >= 5;
  const isProcessing = material.status === "processing";
  const isFailed = material.status === "failed";

  return (
    <div>
      {/* Utility row: view, download, share, like, offline, outdated flag —
          quiet by default, only shows what applies. Shown regardless of
          processing status: the raw file is already safely uploaded and
          viewable/downloadable even while AI-generated study tools are
          still being produced (or failed outright) — a document being
          "still generating" used to hide these buttons entirely, which is
          exactly what made a freshly-uploaded file look broken. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {material.file_path && (
          <>
            <button onClick={handleView} className={pillBtn}>
              <Eye className="h-3.5 w-3.5" /> View
            </button>
            <button onClick={handleDownload} disabled={downloading} className={pillBtn}>
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download
            </button>
          </>
        )}
        <button onClick={handleShare} className={pillBtn}>
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
        <button
          onClick={handleLike}
          disabled={toggleLike.isPending}
          className={`${pillBtn} ${liked ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/10" : ""}`}
        >
          <Heart className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
          {material.likes_count > 0 ? material.likes_count : "Like"}
        </button>
        <button
          onClick={handleSaveOffline}
          disabled={offlineSaved || savingOffline}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default ${
            offlineSaved ? "border-teal/40 bg-teal/10 text-teal" : "border-border bg-surface text-foreground hover:bg-muted"
          }`}
        >
          {savingOffline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : offlineSaved ? <Check className="h-3.5 w-3.5" /> : <HardDriveDownload className="h-3.5 w-3.5" />}
          {offlineSaved ? "Available offline" : "Save for offline"}
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
      </div>

      {isProcessing ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <div className="text-sm font-semibold text-foreground">Still generating study tools…</div>
          <p className="max-w-xs text-xs text-muted-foreground">
            This page updates itself the moment it's ready — no need to refresh. The file above is already yours to view or download in the meantime.
          </p>
        </div>
      ) : isFailed ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-foreground">
          <p>
            {material.processing_error
              ? "Generation didn't finish for this one. Here's why:"
              : "Generation didn't finish for this one. Try re-uploading it, or request it and an admin will take a look."}
          </p>
          {material.processing_error && (
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface px-3 py-2 font-mono text-xs text-destructive">
              {material.processing_error}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">The file itself is safe either way — view or download it above.</p>
        </div>
      ) : (
        <>
          <div className="relative flex gap-1 rounded-xl border border-border bg-surface-muted p-1">
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
                <span className={`relative z-10 flex items-center gap-1.5 ${tab === t.id ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
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
                    {material.summary || "No summary yet."}
                    {material.tags && material.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {material.tags.map((tag) => (
                          <span key={tag} className="rounded-md bg-teal/10 px-2 py-0.5 text-[11px] font-medium text-teal">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {tab === "flashcards" && <FlashcardDeck materialId={material.id} initialCards={offlineBundle?.flashcards} />}
                {tab === "quiz" && <Quiz materialId={material.id} initialQuestions={offlineBundle?.quiz} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {material.type === "Past Paper" && (relatedPastPapers.data?.length ?? 0) > 0 && (
            <RelatedList title="Similar past papers for this course" items={relatedPastPapers.data ?? []} />
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
                    {v.thumbnail && <img src={v.thumbnail} alt="" className="h-24 w-full object-cover" />}
                    <div className="p-2">
                      <div className="line-clamp-2 text-[11px] font-semibold text-foreground group-hover:text-primary">{v.title}</div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{v.channelTitle}</div>
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
      />
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
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-foreground">{m.title}</div>
              <div className="truncate text-[11px] text-muted-foreground">{m.type}{m.content_year ? ` · ${m.content_year}` : ""}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FlashcardDeck({ materialId, initialCards }: { materialId: string; initialCards?: FlashcardRow[] }) {
  const shouldFetch = !initialCards;
  const { data: fetchedCards, isLoading } = useFlashcards(shouldFetch ? materialId : "");
  const cards = initialCards ?? fetchedCards;

  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dir, setDir] = useState(1);

  if (shouldFetch && isLoading) return <SkeletonCard />;
  if (!cards?.length) return <EmptyState label="No flashcards for this one yet." />;

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
                  <span className={`text-[11px] font-semibold uppercase tracking-wide ${flipped ? "text-teal" : "text-copper"}`}>
                    {flipped ? "Answer" : "Question"}
                  </span>
                  <p className="text-base font-medium text-foreground">{flipped ? card.answer : card.question}</p>
                </motion.div>
              </AnimatePresence>
              <span className="text-xs text-muted-foreground">Tap to flip</span>
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => go(-1)} className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-xs text-muted-foreground">{i + 1} / {cards.length}</span>
        <button onClick={() => go(1)} className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Quiz({ materialId, initialQuestions }: { materialId: string; initialQuestions?: QuizRow[] }) {
  const shouldFetch = !initialQuestions;
  const { data: fetchedQuestions, isLoading } = useQuizQuestions(shouldFetch ? materialId : "");
  const questions = initialQuestions ?? fetchedQuestions;

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  if (shouldFetch && isLoading) return <SkeletonCard />;
  if (!questions?.length) return <EmptyState label="No quiz for this one yet." />;

  const score = questions.filter((q) => answers[q.id] === q.correct_index).length;

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
          <div className="text-sm font-semibold text-foreground">{qi + 1}. {q.question}</div>
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
                    isCorrect ? "border-teal/50 bg-teal/10 text-foreground"
                    : isWrongPick ? "border-destructive/50 bg-destructive/10 text-foreground"
                    : picked ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt}
                  <AnimatePresence>
                    {isCorrect && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><CheckCircle2 className="h-4 w-4 text-teal" /></motion.span>
                    )}
                    {isWrongPick && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><XCircle className="h-4 w-4 text-destructive" /></motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
          {submitted && q.explanation && <p className="mt-2 text-xs text-muted-foreground">{q.explanation}</p>}
        </motion.div>
      ))}
      {!submitted ? (
        <button
          onClick={() => setSubmitted(true)}
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
  return <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-8 text-center text-sm text-muted-foreground">{label}</div>;
    }
