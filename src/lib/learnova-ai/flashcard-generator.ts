// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Advanced Flashcard Generator
// Upgraded with: formula-based cards, conceptual cards, sequence cards,
// difficulty tagging, and enhanced definition extraction.
// No external APIs. Pure TypeScript.
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
      if (definition.length < 10 || definition.length > 250) continue;
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

function generateTrueFalseCards(text: string, keywords: string[], maxCards: number): Flashcard[] {
  const sentences = splitSentences(text);
  const cards: Flashcard[] = [];
  for (let i = 0; i < sentences.length && cards.length < maxCards; i++) {
    const sentence = sentences[i].trim();
    if (sentence.length < 30 || sentence.length > 200) continue;
    const hasFactualVerb = /\b(is|are|was|were|has|have|contains|consists|produces|requires|causes|results\s+in|leads\s+to|depends\s+on)\b/i.test(sentence);
    if (!hasFactualVerb) continue;
    const words = tokenizeContent(sentence);
    if (words.length < 8 || words.length > 35) continue;
    const sentenceLower = sentence.toLowerCase();
    const keyword = keywords.find((k) => sentenceLower.includes(k.toLowerCase()));
    if (!keyword) continue;
    cards.push({ question: `True or False: ${sentence}`, answer: "True", position: 0, difficulty: "easy", source: "truefalse" });
  }
  return cards;
}

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

  // Strategy 2: Formula cards (new in v2)
  const formulaBudget = Math.min(Math.ceil(maxCards * 0.15), formulas.length);
  for (const formula of formulas.slice(0, formulaBudget)) {
    const fc = formulaToFlashcard(formula);
    cards.push({ question: fc.question, answer: fc.answer, position: 0, difficulty: "hard", source: "formula" });
  }

  // Strategy 3: Cloze deletion cards
  const clozeBudget = Math.ceil(maxCards * 0.3);
  cards.push(...generateClozeCards(text, keywords, clozeBudget));

  // Strategy 4: Conceptual cards (new in v2)
  const conceptBudget = Math.ceil(maxCards * 0.1);
  cards.push(...generateConceptualCards(text, keywords, conceptBudget));

  // Strategy 5: True/false cards
  const tfBudget = Math.ceil(maxCards * 0.1);
  cards.push(...generateTrueFalseCards(text, keywords, tfBudget));

  // Strategy 6: Sequence cards (new in v2)
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
