// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — YouTube Video Suggester
// Constructs topic-optimized YouTube search URLs — no API key needed.
// Enhanced with domain-aware queries and figure-based suggestions.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import { extractKeywords, extractKeyTopics } from "./keyword-extractor";
import { detectDomain } from "./tokenizer";
import { extractFormulas } from "./formula-extractor";
import type { MaterialInfo, YoutubeSuggestion } from "./types";

function buildYoutubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function looksDescriptive(title: string): boolean {
  const cleaned = title.trim();
  if (cleaned.length < 12) return false;
  // "Test 1", "BEC 210", "Tut 3" — a short label plus a number and
  // nothing else isn't a topic; it's a filename. A query built from one
  // means nothing to YouTube's own search relevance.
  if (/^[a-z]{2,14}\s*\d{0,4}$/i.test(cleaned)) return false;
  if (/^(test|notes?|tutorial|tut|assignment|past\s*paper|exam|quiz|worksheet|handout|lecture)\s*\d*$/i.test(cleaned)) return false;
  return true;
}

function buildSearchQueries(material: MaterialInfo, text?: string | null): string[] {
  const queries: string[] = [];
  // A full extracted document text isn't always on hand when a query is
  // needed, but the summary Gemini already wrote for this material is —
  // a few real sentences about the actual content, which is a far
  // better signal than the 4-8 short topic tags this used to fall back
  // to directly. Crucially, it's also enough for domain detection and
  // formula spotting below to find anything at all, which they never
  // could from tags alone.
  const source = text ?? material.summary ?? null;
  const topics = source ? extractKeyTopics(source, 5) : (material.tags ?? []).slice(0, 5);
  const keywords = source ? extractKeywords(source, 10) : (material.tags ?? []).slice(0, 10);
  const domains = source ? detectDomain(source) : [];
  const formulas = source ? extractFormulas(source) : [];
  const level = "university";

  // Highest-signal queries first — bestYoutubeQuery() only ever uses the
  // first one, so the ordering here is not cosmetic. Course + the
  // document's actual main topic, with academic framing, so a slide on
  // "the budget constraint" doesn't surface a random popular "slope"
  // video that merely shares one keyword with it.
  if (material.courseTitle && topics.length > 0) {
    queries.push(`${material.courseTitle} ${topics[0]} ${level} lecture`);
  }
  if (material.course_code && topics.length > 0) {
    queries.push(`${material.course_code} ${topics[0]}`);
  }
  if (topics.length > 0) {
    queries.push(`${topics[0]} ${level} lecture explained`);
  }

  // Domain-specific framing — now actually reachable, since `source`
  // above no longer requires a full document dump to populate.
  if (domains.includes("mathematics") && keywords.length > 0) queries.push(`${keywords.slice(0, 2).join(" ")} worked example`);
  if (domains.includes("mathematics") && formulas.length > 0) queries.push(`${formulas[0].raw} explained`);
  if (domains.includes("physics") && topics.length > 0) queries.push(`${topics[0]} physics demonstration`);
  if (domains.includes("chemistry") && topics.length > 0) queries.push(`${topics[0]} chemistry experiment`);
  if (domains.includes("biology") && topics.length > 0) queries.push(`${topics[0]} biology animation`);
  if (domains.includes("computer_science") && keywords.length > 0) queries.push(`${keywords.slice(0, 2).join(" ")} programming tutorial`);
  if (domains.includes("economics") && topics.length > 0) queries.push(`${topics[0]} economics explained`);

  // Keyword-only fallback — still at least two real terms together, so
  // one generic word alone (e.g. "slope") can never be the whole query.
  if (keywords.length >= 2) queries.push(`${keywords.slice(0, 3).join(" ")} tutorial`);
  if (keywords.length > 0) queries.push(`${keywords.slice(0, 2).join(" ")} examples`);

  // Past-paper query — only for an actual past paper, not bolted onto
  // every material with a course title regardless of what it is.
  if (material.courseTitle && /past\s*paper|exam/i.test(material.type ?? "")) {
    queries.push(`${material.courseTitle} past paper solution`);
  }

  // Formula-specific queries.
  for (const formula of formulas.slice(0, 2)) {
    if (formula.description) queries.push(`${formula.description} formula derivation`);
  }

  // Title-based queries last, and only when the title actually reads
  // like a topic rather than a filename — "Test 1" tells YouTube
  // nothing about the academic subject.
  if (looksDescriptive(material.title)) {
    queries.push(`${material.title} explained`);
    queries.push(`${material.title} lecture`);
  }

  return [...new Set(queries)].filter((q) => q.trim().length > 3);
}

export function suggestYoutubeVideos(material: MaterialInfo, options: { limit?: number } = {}): YoutubeSuggestion[] {
  const { limit = 8 } = options;
  if (!material) return [];
  const queries = buildSearchQueries(material, material.text);
  return queries.slice(0, limit).map((query) => ({
    url: buildYoutubeSearchUrl(query), title: formatTitle(query), query,
  }));
}

function formatTitle(query: string): string {
  return query.split(" ").map((word) => {
    const small = ["the","of","in","on","at","to","for","and","or","a","an"];
    if (small.includes(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(" ");
}

export function bestYoutubeQuery(material: MaterialInfo): string | null {
  return buildSearchQueries(material, material.text)[0] ?? null;
}

export function youtubeSearchForTopic(topic: string, context?: string): string {
  return buildYoutubeSearchUrl(context ? `${topic} ${context}` : topic);
}
