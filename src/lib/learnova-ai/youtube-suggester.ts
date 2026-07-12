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

function buildSearchQueries(material: MaterialInfo, text?: string | null): string[] {
  const queries: string[] = [];
  const topics = text ? extractKeyTopics(text, 5) : (material.tags ?? []).slice(0, 5);
  const keywords = text ? extractKeywords(text, 10) : (material.tags ?? []).slice(0, 10);
  const domains = text ? detectDomain(text) : [];
  const formulas = text ? extractFormulas(text) : [];

  // Course + topic
  if (material.courseTitle && topics.length > 0) queries.push(`${material.courseTitle} ${topics[0]}`);
  // Title + lecture
  queries.push(`${material.title} lecture`);
  // Title + explained
  queries.push(`${material.title} explained`);
  // Keywords + tutorial
  if (keywords.length >= 2) queries.push(`${keywords.slice(0, 3).join(" ")} tutorial`);
  // Course + past paper
  if (material.courseTitle) queries.push(`${material.courseTitle} past paper solution`);
  // Topic + university lecture
  if (topics.length > 0) queries.push(`${topics[0]} university lecture`);
  // Keywords + examples
  if (keywords.length > 0) queries.push(`${keywords.slice(0, 2).join(" ")} examples`);
  // Course code + topic
  if (material.course_code && topics.length > 0) queries.push(`${material.course_code} ${topics[0]}`);

  // Domain-specific queries (new in v2)
  if (domains.includes("mathematics")) {
    if (keywords.length > 0) queries.push(`${keywords.slice(0, 2).join(" ")} worked example math`);
    if (formulas.length > 0) queries.push(`${formulas[0].raw} explained math`);
  }
  if (domains.includes("physics")) {
    if (topics.length > 0) queries.push(`${topics[0]} physics demonstration`);
  }
  if (domains.includes("chemistry")) {
    if (topics.length > 0) queries.push(`${topics[0]} chemistry experiment`);
  }
  if (domains.includes("biology")) {
    if (topics.length > 0) queries.push(`${topics[0]} biology animation`);
  }
  if (domains.includes("computer_science")) {
    if (keywords.length > 0) queries.push(`${keywords.slice(0, 2).join(" ")} programming tutorial code`);
  }
  if (domains.includes("economics")) {
    if (topics.length > 0) queries.push(`${topics[0]} economics explained real world`);
  }

  // Formula-specific queries
  for (const formula of formulas.slice(0, 2)) {
    if (formula.description) queries.push(`${formula.description} formula derivation`);
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
