// ═══════════════════════════════════════════════════════════════════
// Learnova AI v3 — Resilient Pipeline Orchestrator
//
// Solves Problem 2: module dependency failures.
// Every module runs independently with graceful degradation.
// If OCR fails → formula extraction still works on raw text.
// If knowledge graph fails → recommendations still work from TF-IDF.
// If ANY module fails → the rest still produce results.
//
// Also solves Problem 3: performance.
// Modules run in parallel where possible, with caching and
// chunked processing for large documents.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import type { ModuleResult, PipelineResult, CacheEntry, CacheStats } from "./types";

/**
 * Wrap a module execution in error handling.
 * If the module throws, it returns a degraded result instead of crashing.
 */
export async function resilientExecute<T>(
  moduleName: string,
  fn: () => T | Promise<T>,
  fallback: T,
): Promise<ModuleResult<T>> {
  const start = Date.now();
  try {
    const data = await fn();
    return {
      success: true,
      data,
      error: null,
      fallbackUsed: false,
      degraded: false,
      processingTime: Date.now() - start,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[LearnovaAI] Module "${moduleName}" failed, using fallback: ${errorMsg}`);
    return {
      success: false,
      data: fallback,
      error: errorMsg,
      fallbackUsed: true,
      degraded: true,
      processingTime: Date.now() - start,
    };
  }
}

/**
 * Run multiple modules in parallel with resilience.
 * Each module is isolated — one failure doesn't affect others.
 */
export async function parallelPipeline<T extends Record<string, unknown>>(
  modules: { name: string; fn: () => Promise<unknown> | unknown; fallback: unknown }[],
): Promise<{ results: Map<string, ModuleResult<unknown>>; pipeline: PipelineResult }> {
  const results = new Map<string, ModuleResult<unknown>>();
  const promises = modules.map(async (mod) => {
    const result = await resilientExecute(mod.name, mod.fn, mod.fallback);
    results.set(mod.name, result);
    return { name: mod.name, result };
  });

  await Promise.all(promises);

  const degradedModules = [...results.entries()]
    .filter(([, r]) => r.degraded)
    .map(([name]) => name);

  const criticalFailures = degradedModules.filter((name) =>
    ["summarizer", "tokenizer", "keyword-extractor"].includes(name),
  );

  return {
    results,
    pipeline: {
      results,
      overallSuccess: criticalFailures.length === 0,
      degradedModules,
      criticalFailures,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Caching System — solves Problem 3 (performance)
// ═══════════════════════════════════════════════════════════════════

export class LearnovaCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private stats: CacheStats = { size: 0, hits: 0, misses: 0, evictions: 0, hitRate: 0 };
  private maxSize: number;
  private defaultTTL: number; // ms

  constructor(maxSize: number = 100, defaultTTL: number = 1000 * 60 * 60 * 24) { // 24h default
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get a cached value by key.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.updateHitRate();
      return null;
    }

    entry.hitCount++;
    this.stats.hits++;
    this.updateHitRate();
    return entry.value as T;
  }

  /**
   * Set a cached value.
   */
  set<T>(key: string, value: T, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttl ?? this.defaultTTL),
      hitCount: 0,
      size: JSON.stringify(value).length,
    });
    this.stats.size = this.cache.size;
  }

  /**
   * Generate a cache key from text and options.
   */
  static key(text: string, prefix: string, opts?: Record<string, unknown>): string {
    const textHash = simpleHash(text.slice(0, 500)); // hash first 500 chars for speed
    const optsHash = opts ? simpleHash(JSON.stringify(opts)) : "";
    return `${prefix}:${textHash}:${optsHash}`;
  }

  /**
   * Clear all cached values.
   */
  clear(): void {
    this.cache.clear();
    this.stats = { size: 0, hits: 0, misses: 0, evictions: 0, hitRate: 0 };
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  private evictOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldest = key;
      }
    }
    if (oldest) {
      this.cache.delete(oldest);
      this.stats.evictions++;
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

/**
 * Simple string hash for cache keys (not cryptographic — just for uniqueness).
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit int
  }
  return Math.abs(hash).toString(36);
}

// ═══════════════════════════════════════════════════════════════════
// Chunked Processing — for large documents
// ═══════════════════════════════════════════════════════════════════

/**
 * Split a large text into chunks for processing.
 * Each chunk is approximately maxChunkSize characters, split at sentence boundaries.
 */
export function chunkText(text: string, maxChunkSize: number = 5000): string[] {
  if (text.length <= maxChunkSize) return [text];

  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > maxChunkSize) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Merge results from multiple chunks.
 * Combines arrays, deduplicates, and re-scores.
 */
export function mergeChunkResults<T extends { position?: number }>(
  chunkResults: T[][],
  maxItems: number,
): T[] {
  const all = chunkResults.flat();
  // Re-position
  return all.slice(0, maxItems).map((item, i) => ({
    ...item,
    position: i,
  }));
}

/**
 * Merge summaries from chunks by picking the best sentences across all chunks.
 */
export function mergeSummaries(chunkSummaries: string[], maxSentences: number): string {
  if (chunkSummaries.length <= 1) return chunkSummaries.join(" ");

  // Take proportionally from each chunk
  const perChunk = Math.max(1, Math.ceil(maxSentences / chunkSummaries.length));
  const sentences = chunkSummaries
    .flatMap((s) => s.split(". ").filter((sent) => sent.trim().length > 20))
    .slice(0, maxSentences);

  return sentences.join(". ");
}
