// ═══════════════════════════════════════════════════════════════════
// Learnova AI (local engine) — Flashcard Generator
// Rule-based: formula-based cards, definition cards, cloze deletion,
// conceptual cards, sequence cards, difficulty tagging. No external
// APIs — deterministic pattern matching over the extracted text. This
// only runs as the offline fallback; see learnova-ai/index.ts.
// ═══════════════════════════════════════════════════════════════════

import { splitSentences, tokenizeContent, stem, STOP_WORDS, semanticTokenize } from "./tokenizer";
import { extractKeywords } from "./keyword-extractor";
import { extractFormulas, formulaToFlashcard } from "./formula-extractor";
import { extractEntities } from "./entity-extractor";
import { assessDifficulty } from "./structure-analyzer";
import type { Flashcard } from "./types";

interface Definition { term: string; definition: string; sentence: string; sentenceIndex: number; }

const DEFINITION_PATTERNS: { regex: RegExp; termGroup: number; defGroup: number }[] = [
  { regex: /^(.+?)\s+(?:is|are)\s+defined\s+as\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:is|are)\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+refers?\s+to\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+means?\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:is|are)\s+(?:called|known\s+as|termed|referred\s+to\s+as)\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:consists|is\s+composed)\s+of\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:involves|includes|encompasses|comprises)\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+can\s+be\s+defined\s+as\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:is|are)\s+characterized\s+by\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^the\s+definition\s+of\s+(.+?)\s+is\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:is|are)\s+a\s+(?:type|form|kind|class|category|subset)\s+of\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+represents?\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+describes?\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+denotes?\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  // New v2 patterns
  { regex: /^(.+?)\s+(?:is|are)\s+considered\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:is|are)\s+used\s+(?:for|to|in)\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:is|are)\s+based\s+on\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:is|are)\s+responsible\s+for\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:is|are)\s+measured\s+in\s+(.+)$/i, termGroup: 1, defGroup: 2 },
  { regex: /^(.+?)\s+(?:is|are)\s+expressed\s+(?:as|in|by)\s+(.+)$/i, termGroup: 1, defGroup: 2 },
];

function extractDefinitions(text: string): Definition[] {
  const sentences = splitSentences(text);
  const definitions: Definition[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (sentence.length < 20 || sentence.length > 300) continue;
    for (const pattern of DEFINITION_PATTERNS) {
      const match = sentence.match(pattern.regex);
      if (!match) continue;
      const term = match[pattern.termGroup].trim();
      const definition = match[pattern.defGroup].trim();
      const termWords = term.split(/\s+/);
      if (termWords.length > 8 || termWords.length === 0) continue;
      if (STOP_WORDS.has(termWords[0].toLowerCase())) continue;
      if (term.length < 3 || term.length > 80) continue;
      // The generic "X is/are Y" pattern above matches almost any
      // sentence containing "is"/"are" (e.g. "The exam is on Monday"),
      // not just real definitions. A short, few-word tail ("on Monday")
      // is the tell — genuine definitions almost always explain
      // *something* in more than a couple of words. This filters most
      // of that noise out without touching the more specific patterns
      // above it, which are already precise enough not to need it.
      const defWordCount = definition.split(/\s+/).filter(Boolean).length;
      if (definition.length < 25 || defWordCount < 4) continue;
      if (definition.length > 250) continue;
      const lowerTerm = term.toLowerCase();
      if (["it","they","this","that","these","those","there","here","what","which","who"].includes(lowerTerm)) continue;
      let cleanTerm = term;
      if (cleanTerm.toLowerCase().startsWith("the ") && termWords.length > 1) cleanTerm = cleanTerm.slice(4);
      definitions.push({ term: cleanTerm, definition, sentence, sentenceIndex: i });
      break;
    }
  }
  const seen = new Set<string>();
  return definitions.filter((d) => { const key = d.term.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
}

function generateClozeCards(text: string, keywords: string[], maxCards: number): Flashcard[] {
  const sentences = splitSentences(text);
  const cards: Flashcard[] = [];
  const usedSentences = new Set<number>();
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);
  for (const keyword of sortedKeywords) {
    if (cards.length >= maxCards) break;
    const keywordLower = keyword.toLowerCase();
    for (let i = 0; i < sentences.length; i++) {
      if (cards.length >= maxCards) break;
      if (usedSentences.has(i)) continue;
      const sentence = sentences[i];
      if (!sentence.toLowerCase().includes(keywordLower)) continue;
      const words = tokenizeContent(sentence);
      if (words.length < 8 || words.length > 40) continue;
      const blanked = sentence.replace(new RegExp(escapeRegex(keyword), "gi"), "______");
      if (!blanked.includes("______")) continue;
      cards.push({
        question: `Fill in the blank: ${blanked}`,
        answer: keyword,
        position: 0,
        difficulty: keyword.length > 15 ? "hard" : keyword.length > 8 ? "medium" : "easy",
        source: "cloze",
      });
      usedSentences.add(i);
      break;
    }
  }
  return cards;
}

function generateDefinitionCards(definitions: Definition[], maxCards: number): Flashcard[] {
  return definitions.slice(0, maxCards).map((d, i) => ({
    question: `What is ${d.term}?`,
    answer: d.definition,
    position: i,
    difficulty: d.definition.length > 100 ? "hard" : d.definition.length > 50 ? "medium" : "easy",
    source: "definition",
  }));
}

// Deliberately removed: this file used to have a generateTrueFalseCards()
// here. It matched sentences with a "factual" verb and produced a
// True/False card whose answer was *always* "True" — there was no
// negation step, so nothing in the deck ever generated a genuine false
// statement. A student who just answered "True" on every True/False
// card would score 100% on that whole card type without reading
// anything, which is worse than not having the card type at all.
// Reliable negation ("X causes Y" → a genuinely false variant) needs
// more than regex to do safely, so rather than ship a gameable question
// type from the offline fallback, that budget now goes to cloze cards
// (generateClozeCards), which don't have this failure mode.

function generateConceptualCards(text: string, keywords: string[], maxCards: number): Flashcard[] {
  const sentences = splitSentences(text);
  const cards: Flashcard[] = [];
  const entities = extractEntities(text);
  const concepts = entities.filter((e) => e.type === "concept" || e.type === "law" || e.type === "theory").slice(0, 10);

  for (const concept of concepts) {
    if (cards.length >= maxCards) break;
    // Find a sentence that mentions this concept
    const sentence = sentences.find((s) => s.toLowerCase().includes(concept.text.toLowerCase().split(/\s+/)[0]));
    if (!sentence || sentence.length < 30 || sentence.length > 250) continue;
    cards.push({
      question: `Explain the significance of ${concept.text} in the context of this document.`,
      answer: sentence.trim(),
      position: 0,
      difficulty: "hard",
      source: "conceptual",
    });
  }
  return cards;
}

function generateSequenceCards(text: string, maxCards: number): Flashcard[] {
  const sentences = splitSentences(text);
  const cards: Flashcard[] = [];
  // Look for sequence indicators
  const sequencePattern = /\b(?:first|second|third|then|next|finally|subsequently|after\s+that|before\s+that|step\s+\d+)\b/i;
  const sequenceSentences = sentences.filter((s) => sequencePattern.test(s) && s.length > 30 && s.length < 200);

  // Group nearby sequence sentences
  for (let i = 0; i < sequenceSentences.length - 1 && cards.length < maxCards; i += 2) {
    const s1 = sequenceSentences[i];
    const s2 = sequenceSentences[i + 1];
    cards.push({
      question: `What comes next after: "${s1.slice(0, 100)}..."?`,
      answer: s2.trim(),
      position: 0,
      difficulty: "medium",
      source: "sequence",
    });
  }
  return cards;
}

export function generateFlashcards(text: string, maxCards: number = 20): Flashcard[] {
  if (!text || !text.trim()) return [];
  const keywords = extractKeywords(text, 30);
  const definitions = extractDefinitions(text);
  const formulas = extractFormulas(text);
  const cards: Flashcard[] = [];

  // Strategy 1: Definition cards (highest quality)
  const defBudget = Math.min(Math.ceil(maxCards * 0.3), definitions.length);
  cards.push(...generateDefinitionCards(definitions, defBudget));

  // Strategy 2: Formula cards
  const formulaBudget = Math.min(Math.ceil(maxCards * 0.15), formulas.length);
  for (const formula of formulas.slice(0, formulaBudget)) {
    const fc = formulaToFlashcard(formula);
    cards.push({ question: fc.question, answer: fc.answer, position: 0, difficulty: "hard", source: "formula" });
  }

  // Strategy 3: Cloze deletion cards (also absorbs the budget that used
  // to go to the broken True/False generator — see the comment above
  // generateConceptualCards)
  const clozeBudget = Math.ceil(maxCards * 0.4);
  cards.push(...generateClozeCards(text, keywords, clozeBudget));

  // Strategy 4: Conceptual cards
  const conceptBudget = Math.ceil(maxCards * 0.1);
  cards.push(...generateConceptualCards(text, keywords, conceptBudget));

  // Strategy 5: Sequence cards
  const seqBudget = Math.ceil(maxCards * 0.05);
  cards.push(...generateSequenceCards(text, seqBudget));

  // Fill remaining with extra cloze
  if (cards.length < maxCards) {
    const remaining = maxCards - cards.length;
    cards.push(...generateClozeCards(text, keywords, remaining + 5).slice(0, remaining));
  }

  // Deduplicate
  const seenQ = new Set<string>();
  const unique = cards.filter((c) => { const key = c.question.toLowerCase().trim(); if (seenQ.has(key)) return false; seenQ.add(key); return true; });

  return unique.slice(0, maxCards).map((card, i) => ({ ...card, position: i }));
}

function escapeRegex(str: string): string { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
