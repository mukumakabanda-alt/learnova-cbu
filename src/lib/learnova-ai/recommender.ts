// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Advanced Recommender Engine
// Upgraded with: concept overlap analysis, semantic similarity,
// knowledge-graph-based recommendations, and enhanced next-read.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import { termFrequency, stem, tokenizeContent, coOccurrenceMatrix } from "./tokenizer";
import { computeTfIdf, extractKeywords, extractKeyTopics } from "./keyword-extractor";
import { extractEntities } from "./entity-extractor";
import type { MaterialInfo, Recommendation, RecommendOptions } from "./types";

function cosineSim(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dot = 0, magA = 0, magB = 0;
  const [small, large] = vecA.size < vecB.size ? [vecA, vecB] : [vecB, vecA];
  for (const [term, freqA] of small) {
    magA += freqA * freqA;
    const freqB = large.get(term);
    if (freqB !== undefined) dot += freqA * freqB;
  }
  for (const [, freq] of large) magB += freq * freq;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function materialToText(m: MaterialInfo): string {
  return [m.title, m.summary ?? "", m.courseTitle ?? "", (m.tags ?? []).join(" "), m.text ?? ""].filter(Boolean).join(" ");
}

function extractConceptOverlap(current: MaterialInfo, candidate: MaterialInfo): string[] {
  const currentTags = new Set((current.tags ?? []).map((t) => t.toLowerCase()));
  const candidateTags = (candidate.tags ?? []).map((t) => t.toLowerCase());
  const overlap = candidateTags.filter((t) => currentTags.has(t));
  // Also check entity overlap
  const currentEntities = extractEntities(current.summary ?? current.title).map((e) => e.text.toLowerCase());
  const candidateEntities = extractEntities(candidate.summary ?? candidate.title).map((e) => e.text.toLowerCase());
  const entityOverlap = candidateEntities.filter((e) => currentEntities.includes(e));
  return [...new Set([...overlap, ...entityOverlap])].slice(0, 5);
}

export function recommendMaterials(
  current: MaterialInfo, allMaterials: MaterialInfo[],
  options: RecommendOptions = {},
): Recommendation[] {
  const { limit = 6, excludeId, sameCourseOnly = false } = options;
  if (!current || allMaterials.length === 0) return [];

  let candidates = allMaterials.filter((m) => m.id !== current.id && m.id !== excludeId);
  if (sameCourseOnly && current.course_code) candidates = candidates.filter((m) => m.course_code === current.course_code);
  if (candidates.length === 0) return [];

  const allDocs = [current, ...candidates];
  const corpusTexts = allDocs.map(materialToText);
  const currentText = materialToText(current);
  const currentVec = computeTfIdf(currentText, corpusTexts.slice(1));

  const recommendations: Recommendation[] = [];
  for (const candidate of candidates) {
    const candidateText = materialToText(candidate);
    const candidateCorpus = corpusTexts.filter((_, i) => allDocs[i].id !== candidate.id);
    const candidateVec = computeTfIdf(candidateText, candidateCorpus);
    const similarity = cosineSim(currentVec, candidateVec);
    const conceptOverlap = extractConceptOverlap(current, candidate);
    const reason = generateReason(current, candidate, similarity, conceptOverlap);
    recommendations.push({ id: candidate.id, title: candidate.title, type: candidate.type ?? null, content_year: candidate.content_year ?? null, similarity, reason, conceptOverlap });
  }

  recommendations.sort((a, b) => b.similarity - a.similarity);
  return recommendations.slice(0, limit);
}

function generateReason(current: MaterialInfo, candidate: MaterialInfo, similarity: number, overlap: string[]): string {
  const reasons: string[] = [];
  if (current.course_code && candidate.course_code && current.course_code === candidate.course_code) reasons.push("Same course");
  if (overlap.length > 0) reasons.push(`Shared concepts: ${overlap.slice(0, 3).join(", ")}`);
  if (similarity > 0.6) reasons.push("Very similar content");
  else if (similarity > 0.3) reasons.push("Related content");
  else reasons.push("Complementary reading");
  if (current.type && candidate.type && current.type !== candidate.type) reasons.push(`Different format (${candidate.type})`);
  return reasons.join(" · ");
}

export function suggestNextRead(current: MaterialInfo, allMaterials: MaterialInfo[]): Recommendation | null {
  if (!current || allMaterials.length === 0) return null;
  const candidates = allMaterials.filter((m) => m.id !== current.id);
  if (candidates.length === 0) return null;
  const recs = recommendMaterials(current, allMaterials, { limit: candidates.length });
  if (recs.length === 0) return null;

  const currentTerms = new Set(tokenizeContent(materialToText(current)).map(stem));
  const scored = recs.map((rec) => {
    const candidate = candidates.find((m) => m.id === rec.id);
    if (!candidate) return { rec, gapScore: 0, noveltyRatio: 0 };
    const candidateTerms = new Set(tokenizeContent(materialToText(candidate)).map(stem));
    let novelTerms = 0;
    for (const term of candidateTerms) if (!currentTerms.has(term)) novelTerms++;
    const noveltyRatio = candidateTerms.size > 0 ? novelTerms / candidateTerms.size : 0;
    const gapScore = rec.similarity * 0.6 + noveltyRatio * 0.4;
    return { rec, gapScore, noveltyRatio };
  });

  scored.sort((a, b) => b.gapScore - a.gapScore);
  const best = scored[0];
  const rec = best.rec;
  const noveltyPercent = Math.round((best.noveltyRatio ?? 0) * 100);
  const simPercent = Math.round(rec.similarity * 100);
  return { ...rec, reason: `Best next read — ${simPercent}% similar, ${noveltyPercent}% new content. ${rec.reason}` };
}

export function findRelatedPastPapers(current: MaterialInfo, allMaterials: MaterialInfo[], limit: number = 5): Recommendation[] {
  const pastPapers = allMaterials.filter((m) =>
    m.id !== current.id &&
    (m.type?.toLowerCase().includes("past paper") || m.type?.toLowerCase().includes("exam") || m.type?.toLowerCase().includes("question paper")),
  );
  if (pastPapers.length === 0) return [];
  return recommendMaterials(current, pastPapers, { limit });
}

export function findRelatedDocuments(current: MaterialInfo, allMaterials: MaterialInfo[], limit: number = 5): Recommendation[] {
  const docs = allMaterials.filter((m) =>
    m.id !== current.id &&
    !m.type?.toLowerCase().includes("past paper") && !m.type?.toLowerCase().includes("exam") && !m.type?.toLowerCase().includes("question paper"),
  );
  if (docs.length === 0) return [];
  return recommendMaterials(current, docs, { limit });
}
