// ═══════════════════════════════════════════════════════════════════
// Learnova AI — Keyword / Tag Extractor
// TF-IDF-based keyword extraction with n-gram phrase detection.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import { tokenize, tokenizeContent, termFrequency, stem, STOP_WORDS, extractNgrams } from "./tokenizer";

/** A scored keyword. */
interface ScoredKeyword {
  term: string;
  score: number;
  frequency: number;
}

/**
 * Compute TF-IDF scores for all terms in a document against a corpus.
 *
 * @param docText The document to extract keywords from
 * @param corpusTexts Array of other document texts (for IDF computation)
 * @returns Map of stemmed-term → TF-IDF score
 */
export function computeTfIdf(
  docText: string,
  corpusTexts: string[] = [],
): Map<string, number> {
  const docTf = termFrequency(docText);

  // Build document frequency (DF) — how many corpus docs contain each term
  const df = new Map<string, number>();
  const allCorpus = [...corpusTexts, docText];
  const N = allCorpus.length;

  for (const corpusText of allCorpus) {
    const terms = new Set(tokenizeContent(corpusText).map(stem));
    for (const term of terms) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  // TF-IDF = TF * log(N / DF)
  const tfidf = new Map<string, number>();
  for (const [term, tf] of docTf) {
    const dfVal = df.get(term) ?? 1;
    const idf = Math.log((N + 1) / (dfVal + 1)) + 1; // smoothed IDF
    tfidf.set(term, tf * idf);
  }

  return tfidf;
}

/**
 * Extract top keywords from a document.
 * Combines single-word TF-IDF scores with bigram/trigram phrase detection.
 *
 * @param text Document text
 * @param maxKeywords Maximum number of keywords to return
 * @param corpus Optional corpus of other texts for IDF
 * @returns Array of keyword strings (original form, not stemmed)
 */
export function extractKeywords(
  text: string,
  maxKeywords: number = 10,
  corpus: string[] = [],
): string[] {
  if (!text || !text.trim()) return [];

  // ── Single-word TF-IDF ──
  const tfidf = computeTfIdf(text, corpus);
  const scoredWords: ScoredKeyword[] = [];

  // Build a stem→original mapping for recovery
  const tokens = tokenize(text);
  const stemToOriginal = new Map<string, string>();
  const stemFreq = new Map<string, number>();
  for (const token of tokens) {
    if (STOP_WORDS.has(token) || token.length < 3) continue;
    const s = stem(token);
    stemToOriginal.set(s, token);
    stemFreq.set(s, (stemFreq.get(s) ?? 0) + 1);
  }

  for (const [stemmedTerm, score] of tfidf) {
    const original = stemToOriginal.get(stemmedTerm);
    if (original) {
      scoredWords.push({
        term: original,
        score,
        frequency: stemFreq.get(stemmedTerm) ?? 0,
      });
    }
  }

  scoredWords.sort((a, b) => b.score - a.score);

  // ── N-gram phrase extraction ──
  const bigrams = extractNgrams(text, 2);
  const trigrams = extractNgrams(text, 3);

  // Count n-gram frequencies
  const bigramFreq = new Map<string, number>();
  for (const bg of bigrams) {
    bigramFreq.set(bg, (bigramFreq.get(bg) ?? 0) + 1);
  }
  const trigramFreq = new Map<string, number>();
  for (const tg of trigrams) {
    trigramFreq.set(tg, (trigramFreq.get(tg) ?? 0) + 1);
  }

  // Score n-grams: frequency * avg word length
  const scoredPhrases: ScoredKeyword[] = [];
  for (const [phrase, freq] of bigramFreq) {
    if (freq >= 2) {
      scoredPhrases.push({ term: phrase, score: freq * 2, frequency: freq });
    }
  }
  for (const [phrase, freq] of trigramFreq) {
    if (freq >= 2) {
      scoredPhrases.push({ term: phrase, score: freq * 3, frequency: freq });
    }
  }

  scoredPhrases.sort((a, b) => b.score - a.score);

  // Merge: prefer phrases, then fill with single words
  const result: string[] = [];
  const usedStems = new Set<string>();

  // Add top phrases first (up to half the budget)
  const phraseBudget = Math.ceil(maxKeywords * 0.5);
  for (const p of scoredPhrases.slice(0, phraseBudget)) {
    if (result.length >= maxKeywords) break;
    result.push(p.term);
    // Mark constituent words as used
    for (const word of p.term.split(" ")) {
      usedStems.add(stem(word));
    }
  }

  // Fill remaining with single words
  for (const w of scoredWords) {
    if (result.length >= maxKeywords) break;
    const s = stem(w.term);
    if (!usedStems.has(s)) {
      result.push(w.term);
      usedStems.add(s);
    }
  }

  return result;
}

/**
 * Extract key topics — broader than keywords, these are the main
 * subject areas covered in the document. Uses a combination of
 * high-frequency capitalized terms and top TF-IDF terms.
 *
 * @param text Document text
 * @param maxTopics Maximum topics to return
 * @returns Array of topic strings
 */
export function extractKeyTopics(text: string, maxTopics: number = 5): string[] {
  if (!text || !text.trim()) return [];

  const topics: string[] = [];

  // 1. Find capitalized multi-word phrases (likely proper nouns / topic names)
  const capPhrases = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g);
  if (capPhrases) {
    const phraseFreq = new Map<string, number>();
    for (const phrase of capPhrases) {
      // Skip if it's just a common word capitalized at sentence start
      const lower = phrase.toLowerCase();
      if (STOP_WORDS.has(lower)) continue;
      phraseFreq.set(phrase, (phraseFreq.get(phrase) ?? 0) + 1);
    }
    const sorted = [...phraseFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([phrase]) => phrase);
    topics.push(...sorted.slice(0, maxTopics));
  }

  // 2. Fill with top TF-IDF keywords if we don't have enough
  if (topics.length < maxTopics) {
    const keywords = extractKeywords(text, maxTopics * 2);
    for (const kw of keywords) {
      if (topics.length >= maxTopics) break;
      if (!topics.some((t) => t.toLowerCase().includes(kw.toLowerCase()))) {
        topics.push(kw);
      }
    }
  }

  return topics.slice(0, maxTopics);
}

/**
 * Build a TF-IDF vector for a document (sparse map representation).
 * Used by the recommender for cosine similarity.
 */
export function buildTfIdfVector(
  text: string,
  corpus: string[] = [],
): Map<string, number> {
  return computeTfIdf(text, corpus);
}
