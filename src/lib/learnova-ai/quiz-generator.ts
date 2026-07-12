// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Advanced Quiz Generator
// Upgraded with: formula questions, true/false, fill-in-blank,
// sequence ordering, difficulty tagging, and enhanced distractors.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import { splitSentences, tokenizeContent, tokenize, stem, STOP_WORDS } from "./tokenizer";
import { extractKeywords } from "./keyword-extractor";
import { extractFormulas, formulaToQuizQuestion } from "./formula-extractor";
import { extractEntities } from "./entity-extractor";
import type { QuizQuestion } from "./types";

interface QuestionCandidate {
  question: string;
  correctAnswer: string;
  sentence: string;
  sentenceIndex: number;
  type: "definition" | "cloze" | "fact" | "truefalse" | "formula" | "sequence";
  difficulty: "easy" | "medium" | "hard";
}

const DEF_PATTERNS: RegExp[] = [
  /^(.+?)\s+(?:is|are)\s+defined\s+as\s+(.+)$/i,
  /^(.+?)\s+(?:is|are)\s+(.+)$/i,
  /^(.+?)\s+refers?\s+to\s+(.+)$/i,
  /^(.+?)\s+means?\s+(.+)$/i,
  /^(.+?)\s+(?:is|are)\s+(?:called|known\s+as|termed)\s+(.+)$/i,
  /^(.+?)\s+(?:consists|is\s+composed)\s+of\s+(.+)$/i,
  /^(.+?)\s+can\s+be\s+defined\s+as\s+(.+)$/i,
  /^(.+?)\s+(?:is|are)\s+characterized\s+by\s+(.+)$/i,
  /^(.+?)\s+(?:is|are)\s+a\s+(?:type|form|kind)\s+of\s+(.+)$/i,
  /^(.+?)\s+(?:is|are)\s+used\s+(?:for|to|in)\s+(.+)$/i,
  /^(.+?)\s+(?:is|are)\s+based\s+on\s+(.+)$/i,
];

function extractDefinitionQuestions(text: string): QuestionCandidate[] {
  const sentences = splitSentences(text);
  const candidates: QuestionCandidate[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (sentence.length < 25 || sentence.length > 250) continue;
    for (const pattern of DEF_PATTERNS) {
      const match = sentence.match(pattern);
      if (!match) continue;
      const term = match[1].trim();
      const definition = match[2].trim();
      const termWords = term.split(/\s+/);
      if (termWords.length > 6 || termWords.length === 0) continue;
      if (STOP_WORDS.has(termWords[0].toLowerCase())) continue;
      let cleanTerm = term;
      if (cleanTerm.toLowerCase().startsWith("the ") && termWords.length > 1) cleanTerm = term.slice(4);
      candidates.push({
        question: `Which of the following best describes "${cleanTerm}"?`,
        correctAnswer: definition,
        sentence, sentenceIndex: i, type: "definition",
        difficulty: definition.length > 100 ? "hard" : definition.length > 50 ? "medium" : "easy",
      });
      break;
    }
  }
  const seen = new Set<string>();
  return candidates.filter((c) => { const key = c.question.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
}

function extractClozeQuestions(text: string, keywords: string[]): QuestionCandidate[] {
  const sentences = splitSentences(text);
  const candidates: QuestionCandidate[] = [];
  const used = new Set<number>();
  for (const keyword of keywords) {
    if (candidates.length >= 15) break;
    const kwLower = keyword.toLowerCase();
    for (let i = 0; i < sentences.length; i++) {
      if (used.has(i) || candidates.length >= 15) break;
      const sentence = sentences[i];
      if (!sentence.toLowerCase().includes(kwLower)) continue;
      const words = tokenizeContent(sentence);
      if (words.length < 10 || words.length > 45) continue;
      const blanked = sentence.replace(new RegExp(escapeRegex(keyword), "gi"), "______");
      if (!blanked.includes("______")) continue;
      candidates.push({
        question: `Fill in the blank: ${blanked}`,
        correctAnswer: keyword, sentence, sentenceIndex: i, type: "cloze",
        difficulty: keyword.length > 15 ? "hard" : keyword.length > 8 ? "medium" : "easy",
      });
      used.add(i);
      break;
    }
  }
  return candidates;
}

function extractFactQuestions(text: string, keywords: string[]): QuestionCandidate[] {
  const sentences = splitSentences(text);
  const candidates: QuestionCandidate[] = [];
  const used = new Set<number>();
  const factPatterns: RegExp[] = [
    /\b(\d{4})\b/, /\b(\d+%)?\s*(?:increase|decrease|growth|decline|rate|percentage)\b/i,
    /\b(?:caused\s+by|results?\s+from|leads?\s+to|results?\s+in|produces?|generates?)\b/i,
    /\b(?:first|second|third|last|final|initial|primary|secondary|main|key)\b/i,
    /\b(?:must|requires?|needs?|depends?\s+on|necessary|essential|mandatory)\b/i,
    /\b(?:divided\s+into|classified\s+into|categorized\s+into)\b/i,
  ];
  for (let i = 0; i < sentences.length; i++) {
    if (candidates.length >= 10 || used.has(i)) break;
    const sentence = sentences[i].trim();
    if (sentence.length < 30 || sentence.length > 200) continue;
    if (!factPatterns.some((p) => p.test(sentence))) continue;
    const words = tokenizeContent(sentence);
    if (words.length < 8 || words.length > 40) continue;
    const sentenceLower = sentence.toLowerCase();
    const keyword = keywords.find((k) => sentenceLower.includes(k.toLowerCase()));
    if (!keyword) continue;
    candidates.push({
      question: `According to the document, which of the following is true about ${keyword}?`,
      correctAnswer: sentence, sentence, sentenceIndex: i, type: "fact",
      difficulty: "hard",
    });
    used.add(i);
  }
  return candidates;
}

function extractTrueFalseQuestions(text: string, keywords: string[]): QuestionCandidate[] {
  const sentences = splitSentences(text);
  const candidates: QuestionCandidate[] = [];
  for (let i = 0; i < sentences.length && candidates.length < 8; i++) {
    const sentence = sentences[i].trim();
    if (sentence.length < 30 || sentence.length > 200) continue;
    const hasFactual = /\b(?:is|are|was|were|has|have|contains|consists|produces|requires|causes|results\s+in|leads\s+to)\b/i.test(sentence);
    if (!hasFactual) continue;
    const words = tokenizeContent(sentence);
    if (words.length < 8 || words.length > 35) continue;
    const sentenceLower = sentence.toLowerCase();
    if (!keywords.some((k) => sentenceLower.includes(k.toLowerCase()))) continue;
    candidates.push({
      question: `True or False: ${sentence}`,
      correctAnswer: "True", sentence, sentenceIndex: i, type: "truefalse",
      difficulty: "easy",
    });
  }
  return candidates;
}

function extractFormulaQuestions(text: string): QuestionCandidate[] {
  const formulas = extractFormulas(text);
  const candidates: QuestionCandidate[] = [];
  for (const formula of formulas) {
    if (candidates.length >= 5) break;
    if (!formula.description && !formula.context) continue;
    candidates.push({
      question: formula.description
        ? `Which formula represents ${formula.description}?`
        : `Which formula is associated with: "${formula.context?.slice(0, 80)}..."?`,
      correctAnswer: formula.raw, sentence: formula.context ?? formula.raw,
      sentenceIndex: formula.position, type: "formula", difficulty: "hard",
    });
  }
  return candidates;
}

function generateDistractors(
  correctAnswer: string, allKeywords: string[],
  allDefinitions: { term: string; definition: string }[],
  type: string, count: number = 3,
): string[] {
  const distractors: string[] = [];
  const correctLower = correctAnswer.toLowerCase().trim();
  const correctStem = stem(correctLower.split(/\s+/)[0] ?? "");

  if (type === "cloze" || type === "formula") {
    for (const kw of allKeywords) {
      if (distractors.length >= count) break;
      const kwLower = kw.toLowerCase();
      if (kwLower === correctLower) continue;
      if (stem(kwLower) === correctStem) continue;
      if (distractors.some((d) => d.toLowerCase() === kwLower)) continue;
      if (Math.abs(kw.length - correctAnswer.length) > 30) continue;
      distractors.push(kw);
    }
    while (distractors.length < count) distractors.push(`Option ${distractors.length + 1}`);
  } else if (type === "truefalse") {
    return ["False"];
  } else {
    for (const def of allDefinitions) {
      if (distractors.length >= count) break;
      const defLower = def.definition.toLowerCase().trim();
      if (defLower === correctLower) continue;
      if (defLower.length < 10 || defLower.length > 250) continue;
      distractors.push(def.definition);
    }
    while (distractors.length < count) {
      const idx = distractors.length;
      distractors.push(idx === 0 ? "It is a process that occurs only under specific conditions."
        : idx === 1 ? "It refers to a theoretical concept with no practical application."
        : "It is unrelated to the main topic discussed.");
    }
  }
  return distractors.slice(0, type === "truefalse" ? 1 : count);
}

function buildQuizQuestion(
  candidate: QuestionCandidate, keywords: string[],
  definitions: { term: string; definition: string }[], position: number,
): QuizQuestion {
  const isTF = candidate.type === "truefalse";
  const distractorCount = isTF ? 1 : 3;
  const distractors = generateDistractors(candidate.correctAnswer, keywords, definitions, candidate.type, distractorCount);
  const allOptions = [candidate.correctAnswer, ...distractors];
  const shuffled = shuffleWithSeed(allOptions, position);
  const correctIndex = shuffled.indexOf(candidate.correctAnswer);
  let explanation: string;
  if (candidate.type === "definition") explanation = `According to the document: "${truncate(candidate.sentence, 150)}"`;
  else if (candidate.type === "cloze") explanation = `The correct answer is "${candidate.correctAnswer}" — see: "${truncate(candidate.sentence, 150)}"`;
  else if (candidate.type === "truefalse") explanation = `This statement is true based on: "${truncate(candidate.sentence, 150)}"`;
  else if (candidate.type === "formula") explanation = `The correct formula is: ${candidate.correctAnswer}. ${candidate.sentence ?? ""}`;
  else explanation = `The document states: "${truncate(candidate.sentence, 150)}"`;

  return {
    question: candidate.question, options: shuffled, correctIndex, explanation, position,
    type: isTF ? "truefalse" : candidate.type === "cloze" ? "fillblank" : candidate.type === "formula" ? "formula" : "mcq",
    difficulty: candidate.difficulty,
  };
}

export function generateQuiz(text: string, maxQuestions: number = 10): QuizQuestion[] {
  if (!text || !text.trim()) return [];
  const keywords = extractKeywords(text, 30);
  const sentences = splitSentences(text);
  const definitions: { term: string; definition: string }[] = [];
  for (const sentence of sentences) {
    for (const pattern of DEF_PATTERNS) {
      const match = sentence.match(pattern);
      if (match) { definitions.push({ term: match[1].trim(), definition: match[2].trim() }); break; }
    }
  }

  const defCandidates = extractDefinitionQuestions(text);
  const clozeCandidates = extractClozeQuestions(text, keywords);
  const factCandidates = extractFactQuestions(text, keywords);
  const tfCandidates = extractTrueFalseQuestions(text, keywords);
  const formulaCandidates = extractFormulaQuestions(text);

  // Mix strategies
  const defBudget = Math.min(Math.ceil(maxQuestions * 0.3), defCandidates.length);
  const clozeBudget = Math.min(Math.ceil(maxQuestions * 0.25), clozeCandidates.length);
  const factBudget = Math.min(Math.ceil(maxQuestions * 0.2), factCandidates.length);
  const tfBudget = Math.min(Math.ceil(maxQuestions * 0.1), tfCandidates.length);
  const formulaBudget = Math.min(Math.ceil(maxQuestions * 0.15), formulaCandidates.length);

  const mixed: QuestionCandidate[] = [
    ...defCandidates.slice(0, defBudget),
    ...clozeCandidates.slice(0, clozeBudget),
    ...factCandidates.slice(0, factBudget),
    ...tfCandidates.slice(0, tfBudget),
    ...formulaCandidates.slice(0, formulaBudget),
  ];

  if (mixed.length < maxQuestions) {
    const remaining = maxQuestions - mixed.length;
    const usedSentences = new Set(mixed.map((m) => m.sentenceIndex));
    const extra = [...defCandidates, ...clozeCandidates, ...factCandidates].filter((c) => !usedSentences.has(c.sentenceIndex)).slice(0, remaining);
    mixed.push(...extra);
  }

  const seen = new Set<string>();
  const unique = mixed.filter((c) => { const key = c.question.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });

  return unique.slice(0, maxQuestions).map((c, i) => buildQuizQuestion(c, keywords, definitions, i));
}

function escapeRegex(str: string): string { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function truncate(str: string, max: number): string { return str.length <= max ? str : str.slice(0, max - 3) + "..."; }
function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const result = [...arr]; let s = seed + 1;
  for (let i = result.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
