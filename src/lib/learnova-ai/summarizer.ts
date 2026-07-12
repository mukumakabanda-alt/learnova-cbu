// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Advanced TextRank Summarizer
// Upgraded with: semantic attention scoring, academic signal boosting,
// position-aware extraction, coherence optimization, and multi-level
// summary generation (TL;DR, structured, detailed).
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import { splitSentences, tokenizeContent, termFrequency, stem, semanticTokenize, ACADEMIC_SIGNALS, detectDomain } from "./tokenizer";

interface ScoredSentence {
  text: string;
  index: number;
  score: number;
  semanticScore: number;
  positionScore: number;
  lengthScore: number;
}

function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dot = 0, magA = 0, magB = 0;
  for (const [term, freqA] of vecA) {
    magA += freqA * freqA;
    const freqB = vecB.get(term);
    if (freqB !== undefined) dot += freqA * freqB;
  }
  for (const [, freqB] of vecB) magB += freqB * freqB;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function semanticAttentionScore(sentence: string): number {
  const tagged = semanticTokenize(sentence);
  let score = 0;
  for (const token of tagged) {
    switch (token.category) {
      case "signal": score += 3; break;
      case "connector": score += 1.5; break;
      case "intensifier": score += 1; break;
      case "noun": score += 0.5; break;
      case "adjective": score += 0.3; break;
      case "hedge": score -= 0.5; break;
      default: score += 0.1;
    }
  }
  const lower = sentence.toLowerCase();
  for (const signal of ACADEMIC_SIGNALS) {
    if (lower.includes(signal)) score += 1;
  }
  if (/\b(?:is|are)\s+defined\s+as\b/i.test(sentence)) score += 3;
  if (/\b(?:refers?\s+to|means?|denotes?)\b/i.test(sentence)) score += 2;
  if (/\b(?:important|crucial|essential|key|primary|fundamental|critical)\b/i.test(sentence)) score += 2;
  if (/\d{4}|\d+%|\d+\.\d+/.test(sentence)) score += 1;
  const domains = detectDomain(sentence);
  score += domains.length * 0.5;
  return score;
}

export function summarize(text: string, maxSentences: number = 7): string {
  if (!text || !text.trim()) return "";
  if (maxSentences < 1) maxSentences = 1;
  const sentences = splitSentences(text);
  if (sentences.length === 0) return "";
  if (sentences.length <= maxSentences) return sentences.join(" ");

  const n = sentences.length;
  const tfVectors = sentences.map((s) => termFrequency(s));
  const simMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(tfVectors[i], tfVectors[j]);
      simMatrix[i][j] = sim;
      simMatrix[j][i] = sim;
    }
  }
  const rowSums = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) rowSums[i] += simMatrix[i][j];
  for (let i = 0; i < n; i++) {
    if (rowSums[i] > 0) for (let j = 0; j < n; j++) simMatrix[i][j] /= rowSums[i];
  }

  const damping = 0.85;
  let scores = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 50; iter++) {
    const newScores = new Array(n).fill((1 - damping) / n);
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      let rankSum = 0;
      for (let j = 0; j < n; j++) if (i !== j) rankSum += simMatrix[j][i] * scores[j];
      newScores[i] = (1 - damping) / n + damping * rankSum;
      maxDelta = Math.max(maxDelta, Math.abs(newScores[i] - scores[i]));
    }
    scores = newScores;
    if (maxDelta < 1e-6) break;
  }

  const scored: ScoredSentence[] = sentences.map((text, index) => {
    const wordLen = tokenizeContent(text).length;
    const semanticScore = semanticAttentionScore(text);
    const positionScore = Math.max(0, 1 - index / n) * 0.15;
    const lengthScore = wordLen < 5 ? 0.3 : wordLen > 60 ? 0.7 : 1.0;
    const combinedScore = scores[index] * 0.6 + (semanticScore / 20) * 0.25 + positionScore * 0.15;
    return { text, index, score: combinedScore * lengthScore, semanticScore, positionScore, lengthScore };
  });

  const top = scored.slice().sort((a, b) => b.score - a.score).slice(0, maxSentences).sort((a, b) => a.index - b.index);
  return top.map((s) => s.text).join(" ");
}

export function tldr(text: string): string {
  if (!text || !text.trim()) return "";
  const sentences = splitSentences(text);
  if (sentences.length === 0) return "";
  if (sentences.length === 1) return sentences[0];
  return summarize(text, 1) || sentences[0];
}

export function structuredSummary(text: string, maxSentences: number = 7): {
  main: string; keyPoints: string[]; takeaways: string[];
} {
  if (!text || !text.trim()) return { main: "", keyPoints: [], takeaways: [] };
  const sentences = splitSentences(text);
  if (sentences.length === 0) return { main: "", keyPoints: [], takeaways: [] };

  const main = summarize(text, maxSentences);
  const mainSet = new Set(main.split(". ").map((s) => s.trim()));
  const tfVectors = sentences.map((s) => termFrequency(s));
  const globalTf = new Map<string, number>();
  for (const vec of tfVectors) for (const [term, freq] of vec) globalTf.set(term, (globalTf.get(term) ?? 0) + freq);

  const scored = sentences.map((text, index) => {
    let density = 0;
    for (const [term, freq] of tfVectors[index]) density += freq * (globalTf.get(term) ?? 0);
    const semScore = semanticAttentionScore(text);
    return { text, index, score: density + semScore, inMain: mainSet.has(text.trim()) };
  });

  const keyPoints = scored.filter((s) => !s.inMain).sort((a, b) => b.score - a.score).slice(0, 5).sort((a, b) => a.index - b.index).map((s) => s.text);
  const takeawayPatterns = /\b(?:in\s+conclusion|in\s+summary|to\s+summarize|overall|ultimately|in\s+essence|the\s+key\s+(?:point|takeaway|message)|therefore|thus|hence|consequently)\b/i;
  let takeaways = sentences.filter((s) => takeawayPatterns.test(s) && s.length > 30 && s.length < 200).slice(0, 3);
  if (takeaways.length === 0) {
    takeaways = scored.sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.index - b.index).map((s) => s.text);
  }
  return { main, keyPoints, takeaways };
}

export function multiLevelSummary(text: string): {
  tldr: string; keyPoints: string[]; detailed: string; takeaways: string[];
} {
  return { tldr: tldr(text), detailed: structuredSummary(text, 7).main, ...structuredSummary(text, 7) };
}
