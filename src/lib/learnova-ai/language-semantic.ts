// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Language Detection & Semantic Analysis
// Detects document language, analyzes semantic structure, identifies
// topic clusters, sentiment, key arguments, and evidence statements.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import { tokenize, tokenizeContent, splitSentences, termFrequency, stem } from "./tokenizer";
import type { LanguageInfo, SemanticAnalysis, TopicCluster } from "./types";

// Language detection profiles (common word frequencies per language)
const LANGUAGE_PROFILES: { [lang: string]: Set<string> } = {
  English: new Set(["the", "and", "is", "of", "to", "in", "that", "it", "for", "was", "on", "are", "as", "with", "be", "this", "by", "an", "or", "have"]),
  French: new Set(["le", "la", "les", "de", "et", "est", "un", "une", "des", "du", "en", "que", "qui", "dans", "pour", "sur", "au", "aux", "ce", "se"]),
  Spanish: new Set(["el", "la", "los", "las", "de", "y", "es", "un", "una", "en", "que", "no", "se", "del", "al", "por", "con", "su", "para", "más"]),
  German: new Set(["der", "die", "das", "und", "ist", "ein", "eine", "den", "von", "mit", "sich", "auf", "für", "nicht", "auch", "als", "bei", "durch", "nach", "über"]),
  Portuguese: new Set(["o", "a", "os", "as", "de", "e", "é", "um", "uma", "em", "que", "não", "se", "do", "da", "por", "com", "para", "mais", "como"]),
  Italian: new Set(["il", "la", "lo", "le", "di", "e", "è", "un", "una", "in", "che", "non", "si", "del", "al", "per", "con", "su", "più", "come"]),
  Dutch: new Set(["de", "het", "een", "en", "is", "van", "in", "te", "dat", "op", "voor", "met", "zijn", "niet", "ook", "als", "bij", "door", "naar", "uit"]),
  Bemba: new Set(["na", "ba", "ku", "mu", "pa", "ya", "wa", "cha", "ka", "ta", "lya", "mwa", "bwa", "sha", "pa", "nka", "umw", "aba", "ifi", "uku"]),
  Nyanja: new Set(["ndi", "kuti", "pa", "mu", "ku", "ya", "wa", "cha", "ka", "ta", "mo", "cho", "pho", "mwa", "bwa", "sha", "ya", "za", "la", "ma"]),
  Chinese: new Set(["的", "是", "在", "和", "了", "有", "为", "以", "及", "或", "不", "也", "这", "那", "就", "都", "还", "而", "对", "被"]),
  Arabic: new Set(["في", "من", "على", "إلى", "عن", "أن", "هذا", "هذه", "التي", "الذي", "كان", "قد", "ما", "لا", "به", "له", "هم", "هو", "هي", "مع"]),
};

/**
 * Detect the primary language of text and check for multilingual content.
 */
export function detectLanguage(text: string): LanguageInfo {
  if (!text || text.trim().length < 20) {
    return { primary: "Unknown", confidence: 0, isMultilingual: false, detectedLanguages: [] };
  }

  const tokens = tokenize(text.toLowerCase());
  if (tokens.length === 0) {
    return { primary: "Unknown", confidence: 0, isMultilingual: false, detectedLanguages: [] };
  }

  // Score each language
  const scores: { language: string; score: number; ratio: number }[] = [];

  for (const [language, commonWords] of Object.entries(LANGUAGE_PROFILES)) {
    let matchCount = 0;
    for (const token of tokens) {
      if (commonWords.has(token)) matchCount++;
    }
    const ratio = matchCount / Math.min(tokens.length, 200);
    scores.push({ language, score: matchCount, ratio });
  }

  scores.sort((a, b) => b.score - a.score);

  const top = scores[0];
  const second = scores[1];

  // Check for CJK characters (Chinese, Japanese, Korean)
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  if (cjkChars > text.length * 0.1) {
    const cjkRatio = cjkChars / text.length;
    scores.unshift({ language: "Chinese/Japanese/Korean", score: cjkChars, ratio: cjkRatio });
  }

  // Check for Arabic script
  const arabicChars = (text.match(/[\u0600-\u06ff]/g) || []).length;
  if (arabicChars > text.length * 0.1) {
    scores.unshift({ language: "Arabic", score: arabicChars, ratio: arabicChars / text.length });
  }

  // Re-sort
  scores.sort((a, b) => b.score - a.score);

  const primary = scores[0]?.language ?? "Unknown";
  const confidence = scores[0] ? Math.min(1, scores[0].ratio * 5) : 0; // scale up ratio
  const isMultilingual = scores.length > 1 && scores[1].score > scores[0].score * 0.3 && scores[1].score > 5;

  const detectedLanguages = scores
    .filter((s) => s.score > 2)
    .slice(0, 3)
    .map((s) => ({ language: s.language, ratio: s.ratio }));

  return { primary, confidence, isMultilingual, detectedLanguages };
}

// ═══════════════════════════════════════════════════════════════════
// Semantic Analysis
// ═══════════════════════════════════════════════════════════════════

/**
 * Perform deep semantic analysis of text.
 * Identifies topic clusters, sentiment, key arguments, and evidence.
 */
export function analyzeSemantics(text: string): SemanticAnalysis {
  if (!text || text.trim().length < 50) {
    return {
      topics: [],
      sentiment: "academic",
      complexity: 0,
      coherenceScore: 0,
      keyArguments: [],
      evidenceStatements: [],
    };
  }

  const topics = clusterTopics(text);
  const sentiment = detectSentiment(text);
  const complexity = calculateComplexity(text);
  const coherenceScore = calculateCoherence(text);
  const keyArguments = extractArguments(text);
  const evidenceStatements = extractEvidence(text);

  return { topics, sentiment, complexity, coherenceScore, keyArguments, evidenceStatements };
}

/**
 * Cluster sentences into topic clusters using term-frequency similarity.
 */
function clusterTopics(text: string): TopicCluster[] {
  const sentences = splitSentences(text);
  if (sentences.length < 3) return [];

  // Build sentence TF vectors
  const sentenceTfs = sentences.map((s) => termFrequency(s));

  // Global term frequency
  const globalTf = new Map<string, number>();
  for (const tf of sentenceTfs) {
    for (const [term, freq] of tf) {
      globalTf.set(term, (globalTf.get(term) ?? 0) + freq);
    }
  }

  // Get top global terms
  const topTerms = [...globalTf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term]) => term);

  // Assign each sentence to the topic (top term) it shares most with
  const topicMap = new Map<string, { sentences: string[]; keywords: Set<string> }>();

  for (let i = 0; i < sentences.length; i++) {
    const tf = sentenceTfs[i];
    let bestTopic: string | null = null;
    let bestScore = 0;

    for (const term of topTerms) {
      const freq = tf.get(term);
      if (freq && freq > 0) {
        if (freq > bestScore) {
          bestScore = freq;
          bestTopic = term;
        }
      }
    }

    if (bestTopic) {
      if (!topicMap.has(bestTopic)) {
        topicMap.set(bestTopic, { sentences: [], keywords: new Set() });
      }
      const topic = topicMap.get(bestTopic)!;
      topic.sentences.push(sentences[i]);
      // Add top terms from this sentence as keywords
      for (const [term, freq] of tf) {
        if (freq >= 1) topic.keywords.add(term);
      }
    }
  }

  // Convert to TopicCluster[]
  const clusters: TopicCluster[] = [];
  for (const [label, data] of topicMap) {
    if (data.sentences.length < 1) continue;
    const weight = data.sentences.length / sentences.length;
    clusters.push({
      label,
      keywords: [...data.keywords].slice(0, 10),
      sentences: data.sentences.slice(0, 5),
      weight,
    });
  }

  return clusters.sort((a, b) => b.weight - a.weight).slice(0, 8);
}

/**
 * Detect sentiment / tone of text.
 */
function detectSentiment(text: string): "positive" | "neutral" | "negative" | "academic" {
  const lower = text.toLowerCase();

  const positiveWords = ["good", "great", "excellent", "beneficial", "advantage", "positive", "effective", "successful", "improve", "enhance", "optimal", "significant", "promising", "innovative", "breakthrough"];
  const negativeWords = ["bad", "poor", "negative", "disadvantage", "failure", "problem", "issue", "concern", "risk", "error", "flaw", "limitation", "drawback", "detrimental", "harmful"];
  const academicWords = ["study", "research", "analysis", "hypothesis", "methodology", "results", "conclusion", "evidence", "data", "experiment", "theory", "literature", "empirical", "qualitative", "quantitative"];

  let pos = 0, neg = 0, acad = 0;
  for (const w of positiveWords) if (lower.includes(w)) pos++;
  for (const w of negativeWords) if (lower.includes(w)) neg++;
  for (const w of academicWords) if (lower.includes(w)) acad++;

  if (acad > pos && acad > neg) return "academic";
  if (pos > neg && pos > 2) return "positive";
  if (neg > pos && neg > 2) return "negative";
  return "neutral";
}

/**
 * Calculate text complexity (0-1).
 */
function calculateComplexity(text: string): number {
  const sentences = splitSentences(text);
  const words = tokenizeContent(text);
  if (sentences.length === 0 || words.length === 0) return 0;

  const avgSentLen = words.length / sentences.length;
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const lexicalDiversity = uniqueWords.size / words.length;

  // Complexity = weighted combination
  const sentLenScore = Math.min(1, avgSentLen / 30);
  const diversityScore = Math.min(1, lexicalDiversity * 2);

  return (sentLenScore * 0.4 + diversityScore * 0.6);
}

/**
 * Calculate coherence score (0-1) — how well sentences connect.
 * Based on overlap of terms between consecutive sentences.
 */
function calculateCoherence(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return 1;

  const sentenceTfs = sentences.map((s) => termFrequency(s));
  let totalOverlap = 0;

  for (let i = 1; i < sentences.length; i++) {
    const prev = sentenceTfs[i - 1];
    const curr = sentenceTfs[i];
    let overlap = 0;
    for (const [term] of curr) {
      if (prev.has(term)) overlap++;
    }
    totalOverlap += overlap / Math.max(curr.size, 1);
  }

  return totalOverlap / (sentences.length - 1);
}

/**
 * Extract key arguments (claim + reasoning patterns).
 */
function extractArguments(text: string): string[] {
  const sentences = splitSentences(text);
  const arguments_: string[] = [];

  // Look for argument indicator patterns
  const argPatterns: RegExp[] = [
    /\b(?:therefore|thus|hence|consequently|it\s+follows\s+that|this\s+implies|this\s+suggests|we\s+can\s+conclude)\b/i,
    /\b(?:argue|claim|contend|assert|maintain|propose|demonstrate|prove|show\s+that)\b/i,
    /\b(?:because|since|due\s+to|owing\s+to|as\s+a\s+result\s+of)\b/i,
    /\b(?:however|nevertheless|nonetheless|despite|although|whereas|conversely)\b/i,
  ];

  for (const sentence of sentences) {
    if (argPatterns.some((p) => p.test(sentence)) && sentence.length > 30 && sentence.length < 300) {
      arguments_.push(sentence.trim());
    }
  }

  return arguments_.slice(0, 10);
}

/**
 * Extract evidence statements (data, statistics, citations).
 */
function extractEvidence(text: string): string[] {
  const sentences = splitSentences(text);
  const evidence: string[] = [];

  // Look for evidence indicators
  const evidencePatterns: RegExp[] = [
    /\b\d+(?:\.\d+)?%/i, // percentages
    /\b\d{4}\b/i, // years
    /\b(?:study|studies|research|experiment|survey|data|results?|findings?|evidence)\b/i,
    /\b(?:according\s+to|based\s+on|reported\s+by|found\s+that|shown\s+by|demonstrated\s+by)\b/i,
    /\[\d+\]/i, // numeric citations
    /\(\w+\s+(?:et\s+al\.?\s+)?\d{4}\)/i, // author-date citations
  ];

  for (const sentence of sentences) {
    if (evidencePatterns.some((p) => p.test(sentence)) && sentence.length > 25 && sentence.length < 300) {
      evidence.push(sentence.trim());
    }
  }

  return evidence.slice(0, 10);
}
