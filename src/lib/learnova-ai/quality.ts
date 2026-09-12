import type { Flashcard, QuizQuestion } from "./types";

const WORD_RE = /[a-z0-9][a-z0-9'-]{2,}/gi;

function words(value: string): Set<string> {
  return new Set((value.toLowerCase().match(WORD_RE) ?? []).filter((word) => word.length > 2));
}

/** Conservative lexical support signal used when a model verifier is unavailable. */
export function evidenceSupport(answer: string, source: string): number {
  const answerWords = words(answer);
  if (answerWords.size === 0) return 0;
  const sourceWords = words(source);
  let supported = 0;
  for (const word of answerWords) if (sourceWords.has(word)) supported++;
  return Math.round((supported / answerWords.size) * 100) / 100;
}

export function validateQuizQuestion(question: QuizQuestion, source: string): string[] {
  const flags: string[] = [];
  const options = question.options.map((option) => option.trim().toLowerCase());
  if (options.length < 2 || options.length > 4) flags.push("invalid-option-count");
  if (new Set(options).size !== options.length) flags.push("duplicate-options");
  if (
    !Number.isInteger(question.correctIndex) ||
    question.correctIndex < 0 ||
    question.correctIndex >= options.length
  ) {
    flags.push("invalid-correct-index");
  }
  if (!question.explanation?.trim()) flags.push("missing-explanation");
  if (evidenceSupport(question.options[question.correctIndex] ?? "", source) < 0.35)
    flags.push("weak-source-support");
  return flags;
}

export function validateFlashcard(card: Flashcard, source: string): string[] {
  const flags: string[] = [];
  if (!card.question.trim() || !card.answer.trim()) flags.push("missing-content");
  if (card.question.trim().length < 8) flags.push("weak-question");
  if (evidenceSupport(card.answer, source) < 0.35) flags.push("weak-source-support");
  return flags;
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
