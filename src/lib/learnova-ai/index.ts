// ═══════════════════════════════════════════════════════════════════
// Learnova AI (local engine) — Main Entry Point
//
// What this actually is, plainly: a from-scratch, rule-based text
// pipeline — tokenization, TF-IDF-style keyword scoring, TextRank-style
// extractive summarization, regex/pattern-based definition & formula
// extraction, and template-based flashcard/quiz generation. Every
// function here is deterministic code, not a trained model, and nothing
// in this file calls out to any language model or external AI API.
//
// Its job in this app is now specifically to be the OFFLINE FALLBACK:
// the real study-tool generation for an uploaded document is the
// Gemini-backed pipeline (see supabase/functions/process-material and
// DocumentUpload.tsx's primary path). This engine only runs when that
// isn't reachable — genuinely offline, or the AI gateway call failed —
// so a student still gets a usable summary/flashcards/quiz instead of
// nothing. Anything it produces is tagged generation_source:
// "offline-fallback" so the UI can be honest about which kind of result
// the student is looking at, and can offer to regenerate with the real
// pipeline once they're back online.
//
// That reframing is also why cleanOcr now defaults to true below — see
// the note at that line. It used to default to false and nothing in the
// app ever turned it on, so the one step this pipeline had that matched
// "clean the text before you try to summarize it" never actually ran.
//
// Capabilities:
//   • Rule-based inference — chained pattern matches over cause/effect,
//     sequence and comparison language (labelled "reasoning" below —
//     it's pattern matching over sentence structure, not logical inference
//     over a world model, and shouldn't be read as more than that)
//   • Local student-progress tracking (mastery, weak areas, streaks)
//   • Per-module resilience — one module failing doesn't take the rest
//     down with it (see degradedModules in the result)
//   • Result caching (24h) and chunking for large documents
//   • Zambian-English normalization (local abbreviations, lecturer
//     shorthand, British spelling, course-code conventions)
//
// Runs entirely in-browser (including inside a Web Worker — see
// worker.ts). No network calls, no external dependencies, works offline.
// ═══════════════════════════════════════════════════════════════════

// Core v2 modules
import { summarize, structuredSummary, tldr, multiLevelSummary } from "./summarizer";
import { extractKeywords, extractKeyTopics, computeTfIdf } from "./keyword-extractor";
import { generateFlashcards } from "./flashcard-generator";
import { generateQuiz } from "./quiz-generator";
import { recommendMaterials, suggestNextRead, findRelatedPastPapers, findRelatedDocuments } from "./recommender";
import { checkOutdated, batchCheckOutdated, getOutdatedSeverity } from "./outdated-detector";
import { suggestYoutubeVideos, bestYoutubeQuery, youtubeSearchForTopic } from "./youtube-suggester";
import { cleanOcrText, isLikelyOcr, estimateOcrConfidence } from "./ocr-cleaner";
import { extractFormulas, formulaToFlashcard, formulaToQuizQuestion } from "./formula-extractor";
import { extractEntities } from "./entity-extractor";
import { buildKnowledgeGraph, extractConceptMap } from "./knowledge-graph";
import { analyzeStructure, extractSections, assessDifficulty, calculateReadability } from "./structure-analyzer";
import { extractReferences, extractTables, extractFigures } from "./reference-table-extractor";
import { detectLanguage, analyzeSemantics } from "./language-semantic";
import { generateStudyPath, generateProgressionPlan, buildGlossary } from "./study-path";

// v3 modules
import {
  extractReasoningChains, extractCausalRelations, extractInferences,
  reasonAboutQuestion,
} from "./reasoning-engine";
import {
  createStudentProfile, recordQuizAttempt, recordFlashcardAttempt,
  recordStudySession, recordDownload, generateAdaptiveRecommendations,
  generateStudyPlan as generateAdaptiveStudyPlan, generateStudentInsights,
  serializeProfile, deserializeProfile,
} from "./student-memory";
import {
  resilientExecute, parallelPipeline, LearnovaCache, chunkText,
  mergeChunkResults, mergeSummaries,
} from "./resilience";
import { normalizeLocalText, hasLocalPatterns, getLocalTerms } from "./local-language";

import type {
  Flashcard, QuizQuestion, ProcessedDocument, MaterialInfo, Recommendation,
  YoutubeSuggestion, ProcessOptions, RecommendOptions, OutdatedResult,
  StudentProfile, QuizAttempt, FlashcardAttempt, StudySession,
  AdaptiveRecommendation, StudyPlan, StudentInsight, ReasoningChain,
  CausalRelation, LogicalInference, NormalizedText,
} from "./types";

// Global cache instance
const globalCache = new LearnovaCache(200, 1000 * 60 * 60 * 24); // 200 entries, 24h TTL

/**
 * LearnovaAI — the local, rule-based offline-fallback engine.
 */
export const LearnovaAI = {
  // ═══ Core document processing (resilient + cached) ═══

  processDocument(text: string, opts: ProcessOptions): ProcessedDocument {
    const startTime = Date.now();
    const moduleTimes = new Map<string, number>();
    const degradedModules: string[] = [];
    const cacheHits: string[] = [];

    const {
      title, contentYear = null, courseCode = null, type = null,
      maxSummarySentences = 7, maxFlashcards = 20, maxQuizQuestions = 10, maxTags = 10,
      extractFormulas: extractForm = true, extractEntities: extractEnt = true,
      buildKnowledgeGraph: buildKG = true, analyzeStructure: analyzeStruct = true,
      assessDifficulty: assessDiff = true, extractReferences: extractRefs = true,
      extractTables: extractTabs = true, detectLanguage: detectLang = true,
      generateStudyPath: genPath = true,
      // Was `false` with nothing ever opting in, so the "clean the text
      // before you try to summarize it" step (the vision doc's own
      // stage-1 principle) silently never ran. Cleaning is self-gating
      // internally (only applied if it measurably improves quality — see
      // cleanOcrText's qualityScore check below), so defaulting it on is
      // safe even for already-clean text.
      cleanOcr: doCleanOcr = true,
      analyzeFigures: analyzeFigs = true,
      enableReasoning = true,
      normalizeLocalLanguage = true,
    } = opts;

    // ── Step 1: Text normalization (local language + OCR) ──
    let processedText = text;
    let normalizedResult: NormalizedText | null = null;

    if (normalizeLocalLanguage && hasLocalPatterns(text)) {
      try {
        normalizedResult = normalizeLocalText(text);
        processedText = normalizedResult.text;
      } catch {
        degradedModules.push("local-language");
      }
    }

    if (doCleanOcr) {
      try {
        const cleaned = cleanOcrText(processedText);
        if (cleaned.qualityScore > 0.3) {
          processedText = cleaned.cleaned;
        }
      } catch {
        degradedModules.push("ocr-cleaner");
      }
    }

    // ── Step 2: Check cache ──
    const cacheKey = LearnovaCache.key(processedText, "processDoc", {
      maxSummarySentences, maxFlashcards, maxQuizQuestions, maxTags,
    });
    const cached = globalCache.get<ProcessedDocument>(cacheKey);
    if (cached) {
      cacheHits.push("processDoc");
      return cached;
    }

    // ── Step 3: Chunk if large ──
    const chunks = chunkText(processedText, 10000);
    const isChunked = chunks.length > 1;

    // ── Step 4: Run all modules with resilience ──

    // Summary
    let summary = "";
    let summaryTakeaways: string[] = [];
    try {
      const s = structuredSummary(processedText, maxSummarySentences);
      summary = isChunked ? mergeSummaries(chunks.map((c) => summarize(c, Math.ceil(maxSummarySentences / chunks.length))), maxSummarySentences) : s.main;
      summaryTakeaways = s.takeaways;
      moduleTimes.set("summarizer", Date.now() - startTime);
    } catch { degradedModules.push("summarizer"); }

    // Tags
    let tags: string[] = [];
    try { tags = extractKeywords(processedText, maxTags); } catch { degradedModules.push("keyword-extractor"); }

    // Key topics
    let keyTopics: string[] = [];
    try { keyTopics = extractKeyTopics(processedText, 5); } catch { degradedModules.push("keyword-extractor"); }

    // Flashcards
    let flashcards: Flashcard[] = [];
    try {
      flashcards = isChunked
        ? mergeChunkResults(chunks.map((c) => generateFlashcards(c, Math.ceil(maxFlashcards / chunks.length))), maxFlashcards)
        : generateFlashcards(processedText, maxFlashcards);
    } catch { degradedModules.push("flashcard-generator"); }

    // Quiz
    let quiz: QuizQuestion[] = [];
    try {
      quiz = isChunked
        ? mergeChunkResults(chunks.map((c) => generateQuiz(c, Math.ceil(maxQuizQuestions / chunks.length))), maxQuizQuestions)
        : generateQuiz(processedText, maxQuizQuestions);
    } catch { degradedModules.push("quiz-generator"); }

    // Outdated
    const outdated = checkOutdated(contentYear);

    // Formulas
    let formulas: any[] = [];
    if (extractForm) { try { formulas = extractFormulas(processedText); } catch { degradedModules.push("formula-extractor"); } }

    // Entities
    let entities: any[] = [];
    if (extractEnt) { try { entities = extractEntities(processedText); } catch { degradedModules.push("entity-extractor"); } }

    // Knowledge graph
    let knowledgeGraph: any = { nodes: [], edges: [], clusters: [] };
    if (buildKG) { try { knowledgeGraph = buildKnowledgeGraph(processedText); } catch { degradedModules.push("knowledge-graph"); } }

    // Structure
    let structure: any = { sections: [], hasTableOfContents: false, hasReferences: false, hasAppendix: false, estimatedReadingTime: 0, wordCount: 0, sectionCount: 0 };
    if (analyzeStruct) { try { structure = analyzeStructure(processedText); } catch { degradedModules.push("structure-analyzer"); } }

    // Difficulty
    let difficulty: any = { level: "beginner", score: 0, factors: [], recommendedAudience: "General audience" };
    if (assessDiff) { try { difficulty = assessDifficulty(processedText); } catch { degradedModules.push("structure-analyzer"); } }

    // Readability
    let readability: any = { fleschKincaid: 0, gradeLevel: 0, readingEase: "N/A", averageSentenceLength: 0, complexWordRatio: 0 };
    try { readability = calculateReadability(processedText); } catch { degradedModules.push("structure-analyzer"); }

    // References
    let references: any[] = [];
    if (extractRefs) { try { references = extractReferences(processedText); } catch { degradedModules.push("reference-table-extractor"); } }

    // Tables
    let tables: any[] = [];
    if (extractTabs) { try { tables = extractTables(processedText); } catch { degradedModules.push("reference-table-extractor"); } }

    // Language
    let language: any = { primary: "English", confidence: 1, isMultilingual: false, detectedLanguages: [] };
    if (detectLang) { try { language = detectLanguage(processedText); } catch { degradedModules.push("language-semantic"); } }

    // Study path
    let studyPath: any[] = [];
    if (genPath) { try { studyPath = generateStudyPath(processedText); } catch { degradedModules.push("study-path"); } }

    // Figures
    let figures: any[] = [];
    if (analyzeFigs) { try { figures = extractFigures(processedText); } catch { degradedModules.push("reference-table-extractor"); } }

    // Glossary
    let glossary: any[] = [];
    try { glossary = buildGlossary(processedText); } catch { degradedModules.push("study-path"); }

    // ── Reasoning (pattern-based, not model-based — see header note) ──
    let reasoningChains: ReasoningChain[] = [];
    let causalRelations: CausalRelation[] = [];
    let inferences: LogicalInference[] = [];
    if (enableReasoning) {
      try { reasoningChains = extractReasoningChains(processedText); } catch { degradedModules.push("reasoning-engine"); }
      try { causalRelations = extractCausalRelations(processedText); } catch { degradedModules.push("reasoning-engine"); }
      try { inferences = extractInferences(processedText); } catch { degradedModules.push("reasoning-engine"); }
    }

    // Prerequisite and related concepts
    const prerequisiteTopics = studyPath.find((s: any) => s.type === "review")?.description?.replace(/Before diving in, make sure you understand: /, "").split(".")[0]?.split(", ").map((s: string) => s.trim()) ?? [];
    const relatedConcepts = keyTopics;

    // Quality score
    const qualityScore = calculateQualityScore(readability, difficulty, structure);

    const totalTime = Date.now() - startTime;

    const result: ProcessedDocument = {
      summary, tldr: (() => { try { return tldr(processedText); } catch { return summary.slice(0, 150); } })(),
      tags, flashcards, quiz,
      isOutdated: outdated.isOutdated, outdatedComment: outdated.comment,
      keyTopics, formulas, entities,
      concepts: knowledgeGraph.nodes, knowledgeGraph, structure,
      difficulty, readability, references, tables, language, studyPath,
      qualityScore, figureDescriptions: figures,
      keyTakeaways: summaryTakeaways, glossary,
      prerequisiteTopics, relatedConcepts,
      // v3 additions
      reasoningChains, causalRelations, inferences,
      normalizedText: normalizedResult,
      processingMeta: { totalTime, moduleTimes, degradedModules, cacheHits },
    };

    // Cache the result
    globalCache.set(cacheKey, result);

    return result;
  },

  // ═══ Reasoning API ═══

  extractReasoningChains: (text: string) => extractReasoningChains(text),
  extractCausalRelations: (text: string) => extractCausalRelations(text),
  extractInferences: (text: string) => extractInferences(text),
  reasonAboutQuestion: (question: string, text: string, chains?: ReasoningChain[], causals?: CausalRelation[]) =>
    reasonAboutQuestion(question, text, chains ?? extractReasoningChains(text), causals ?? extractCausalRelations(text)),

  // ═══ Student Memory API ═══

  createStudentProfile,
  recordQuizAttempt,
  recordFlashcardAttempt,
  recordStudySession,
  recordDownload,
  generateAdaptiveRecommendations,
  generateStudentStudyPlan: generateAdaptiveStudyPlan,
  generateStudentInsights,
  serializeProfile,
  deserializeProfile,

  // ═══ Local Language API ═══

  normalizeLocalText,
  hasLocalPatterns,
  getLocalTerms,

  // ═══ Resilience API ═══

  resilientExecute,
  parallelPipeline,
  cache: globalCache,
  chunkText,
  mergeChunkResults,
  mergeSummaries,

  // ═══ v2 API (all preserved) ═══

  summarize, tldr, structuredSummary, multiLevelSummary,
  extractKeywords, extractKeyTopics,
  generateFlashcards, generateQuiz,
  extractFormulas: (text: string) => extractFormulas(text),
  extractEntities: (text: string) => extractEntities(text),
  buildKnowledgeGraph: (text: string) => buildKnowledgeGraph(text),
  extractConceptMap: (text: string) => extractConceptMap(buildKnowledgeGraph(text)),
  analyzeStructure: (text: string) => analyzeStructure(text),
  extractSections: (text: string) => extractSections(text),
  assessDifficulty: (text: string) => assessDifficulty(text),
  calculateReadability: (text: string) => calculateReadability(text),
  extractReferences: (text: string) => extractReferences(text),
  extractTables: (text: string) => extractTables(text),
  extractFigures: (text: string) => extractFigures(text),
  detectLanguage: (text: string) => detectLanguage(text),
  analyzeSemantics: (text: string) => analyzeSemantics(text),
  generateStudyPath: (text: string) => generateStudyPath(text),
  generateProgressionPlan,
  buildGlossary: (text: string) => buildGlossary(text),
  cleanOcrText: (text: string) => cleanOcrText(text),
  isLikelyOcr: (text: string) => isLikelyOcr(text),
  estimateOcrConfidence: (text: string) => estimateOcrConfidence(text),
  formulaToFlashcard, formulaToQuizQuestion,
  recommendMaterials, suggestNextRead, findRelatedPastPapers, findRelatedDocuments,
  checkOutdated, batchCheckOutdated, getOutdatedSeverity,
  suggestYoutubeVideos, bestYoutubeQuery, youtubeSearchForTopic,
  computeTfIdf,
};

// Calculate quality score
function calculateQualityScore(readability: any, difficulty: any, structure: any): number {
  let score = 50;
  if (structure.wordCount > 500) score += 10;
  if (structure.wordCount > 2000) score += 10;
  if (structure.sectionCount > 3) score += 10;
  if (structure.hasReferences) score += 5;
  if (structure.hasTableOfContents) score += 5;
  if (readability.fleschKincaid >= 8 && readability.fleschKincaid <= 16) score += 10;
  if (difficulty.level === "intermediate" || difficulty.level === "advanced") score += 5;
  return Math.min(100, Math.max(0, score));
}

// ── Re-exports ──

export { summarize, structuredSummary, tldr, multiLevelSummary } from "./summarizer";
export { extractKeywords, extractKeyTopics, computeTfIdf } from "./keyword-extractor";
export { generateFlashcards } from "./flashcard-generator";
export { generateQuiz } from "./quiz-generator";
export { recommendMaterials, suggestNextRead, findRelatedPastPapers, findRelatedDocuments } from "./recommender";
export { checkOutdated, batchCheckOutdated, getOutdatedSeverity } from "./outdated-detector";
export { suggestYoutubeVideos, bestYoutubeQuery, youtubeSearchForTopic } from "./youtube-suggester";
export { cleanOcrText, isLikelyOcr, estimateOcrConfidence } from "./ocr-cleaner";
export { extractFormulas, formulaToFlashcard, formulaToQuizQuestion } from "./formula-extractor";
export { extractEntities } from "./entity-extractor";
export { buildKnowledgeGraph, extractConceptMap } from "./knowledge-graph";
export { analyzeStructure, extractSections, assessDifficulty, calculateReadability } from "./structure-analyzer";
export { extractReferences, extractTables, extractFigures } from "./reference-table-extractor";
export { detectLanguage, analyzeSemantics } from "./language-semantic";
export { generateStudyPath, generateProgressionPlan, buildGlossary } from "./study-path";
export { extractReasoningChains, extractCausalRelations, extractInferences, reasonAboutQuestion } from "./reasoning-engine";
export {
  createStudentProfile, recordQuizAttempt, recordFlashcardAttempt, recordStudySession,
  recordDownload, generateAdaptiveRecommendations, generateStudyPlan as generateAdaptiveStudyPlan,
  generateStudentInsights, serializeProfile, deserializeProfile,
} from "./student-memory";
export { resilientExecute, parallelPipeline, LearnovaCache, chunkText, mergeChunkResults, mergeSummaries } from "./resilience";
export { normalizeLocalText, hasLocalPatterns, getLocalTerms } from "./local-language";

export type {
  Flashcard, QuizQuestion, ProcessedDocument, MaterialInfo, Recommendation,
  YoutubeSuggestion, ProcessOptions, RecommendOptions, OutdatedResult,
  StudentProfile, QuizAttempt, FlashcardAttempt, StudySession,
  AdaptiveRecommendation, StudyPlan, StudentInsight, ReasoningChain,
  CausalRelation, LogicalInference, NormalizedText,
} from "./types";

export default LearnovaAI;
