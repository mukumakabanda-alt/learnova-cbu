import { useEffect, useState } from "react";
import { FileText, Layers, ListChecks, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useFlashcards, useQuizQuestions, useBumpStreak } from "@/lib/queries";
import type { Database } from "@/integrations/supabase/types";

type Material = Database["public"]["Tables"]["materials"]["Row"];

export function StudyPanel({ material }: { material: Material }) {
  const [tab, setTab] = useState<"summary" | "flashcards" | "quiz">("summary");
  const bumpStreak = useBumpStreak();

  useEffect(() => {
    if (material.status === "ready") bumpStreak.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material.id, material.status]);

  if (material.status === "processing") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <div className="text-sm font-semibold text-foreground">Still generating study tools…</div>
        <p className="max-w-xs text-xs text-muted-foreground">This page updates itself the moment it's ready — no need to refresh.</p>
      </div>
    );
  }

  if (material.status === "failed") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-foreground">
        Generation failed for this document. Try re-uploading it, or request it and an admin will take a look.
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1 rounded-xl border border-border bg-surface-muted p-1">
        {[
          { id: "summary", label: "Summary", icon: FileText },
          { id: "flashcards", label: "Flashcards", icon: Layers },
          { id: "quiz", label: "Quiz", icon: ListChecks },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "summary" && (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-foreground">
            {material.summary || "No summary yet."}
          </div>
        )}
        {tab === "flashcards" && <FlashcardDeck materialId={material.id} />}
        {tab === "quiz" && <Quiz materialId={material.id} />}
      </div>
    </div>
  );
}

function FlashcardDeck({ materialId }: { materialId: string }) {
  const { data: cards, isLoading } = useFlashcards(materialId);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (isLoading) return <SkeletonCard />;
  if (!cards?.length) return <EmptyState label="No flashcards for this one yet." />;

  const card = cards[i];
  const go = (delta: number) => {
    setFlipped(false);
    setI((prev) => (prev + delta + cards.length) % cards.length);
  };

  return (
    <div>
      <button
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-[220px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6 text-center shadow-soft"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-copper">{flipped ? "Answer" : "Question"}</span>
        <p className="text-base font-medium text-foreground">{flipped ? card.answer : card.question}</p>
        <span className="text-xs text-muted-foreground">Tap to flip</span>
      </button>
      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => go(-1)} className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-xs text-muted-foreground">{i + 1} / {cards.length}</span>
        <button onClick={() => go(1)} className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Quiz({ materialId }: { materialId: string }) {
  const { data: questions, isLoading } = useQuizQuestions(materialId);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  if (isLoading) return <SkeletonCard />;
  if (!questions?.length) return <EmptyState label="No quiz for this one yet." />;

  const score = questions.filter((q) => answers[q.id] === q.correct_index).length;

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => (
        <div key={q.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="text-sm font-semibold text-foreground">{qi + 1}. {q.question}</div>
          <div className="mt-3 grid gap-2">
            {q.options.map((opt, oi) => {
              const picked = answers[q.id] === oi;
              const isCorrect = submitted && oi === q.correct_index;
              const isWrongPick = submitted && picked && oi !== q.correct_index;
              return (
                <button
                  key={oi}
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
                  {isCorrect && <CheckCircle2 className="h-4 w-4 text-teal" />}
                  {isWrongPick && <XCircle className="h-4 w-4 text-destructive" />}
                </button>
              );
            })}
          </div>
          {submitted && q.explanation && <p className="mt-2 text-xs text-muted-foreground">{q.explanation}</p>}
        </div>
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
        <div className="rounded-xl bg-gold-gradient p-4 text-center font-semibold text-gold-foreground">
          {score} / {questions.length} correct
        </div>
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
