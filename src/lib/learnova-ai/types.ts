// ═══════════════════════════════════════════════════════════════════
// Learnova AI v3 — Type Definitions (Trillion Edition)
// Adds: reasoning, student memory, adaptive learning, resilience, cache
// ═══════════════════════════════════════════════════════════════════

// ── Existing v2 types (kept for compatibility) ──

export interface Flashcard {
  question: string;
  answer: string;
  position: number;
  difficulty?: "easy" | "medium" | "hard";
  source?: "definition" | "cloze" | "truefalse" | "formula" | "conceptual" | "sequence";
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  position: number;
  type?: "mcq" | "truefalse" | "fillblank" | "sequence" | "matching" | "formula";
  difficulty?: "easy" | "medium" | "hard";
}

// ── Reasoning types (NEW v3) ──

export type ReasoningType = "deductive" | "inductive" | "abductive" | "causal" | "analogical" | "conditional";

export interface ReasoningStep {
  step: number;
  type: ReasoningType;
  premise: string;
  inference: string;
  conclusion: string;
  confidence: number; // 0-1
  evidence: string[];
}

export interface ReasoningChain {
  id: string;
  topic: string;
  steps: ReasoningStep[];
  finalConclusion: string;
  confidence: number;
  alternativeConclusions: { conclusion: string; confidence: number }[];
  assumptions: string[];
  fallacies: string[];
}

export interface CausalRelation {
  cause: string;
  effect: string;
  strength: "strong" | "moderate" | "weak";
  evidence: string;
  bidirectional: boolean;
}

export interface LogicalInference {
  rule: string;
  premises: string[];
  conclusion: string;
  valid: boolean;
  type: ReasoningType;
}

// ── Student memory types (NEW v3) ──

export interface StudentProfile {
  id: string;
  name: string;
  courses: string[];
  // Performance tracking
  quizHistory: QuizAttempt[];
  flashcardHistory: FlashcardAttempt[];
  studySessions: StudySession[];
  // Topic mastery
  topicMastery: Map<string, TopicMastery>;
  // Behavior
  downloadHistory: string[];
  timeSpentPerTopic: Map<string, number>;
  revisionFrequency: Map<string, number>;
  lastStudyDate: string | null;
  streakDays: number;
  // Preferences (learned)
  preferredDifficulty: "easy" | "medium" | "hard";
  preferredStudyTime: number | null; // hour of day
  averageSessionLength: number; // minutes
  // Weakness analysis
  weakTopics: string[];
  strongTopics: string[];
  neglectedTopics: string[];
  // Adaptive data
  recommendedDailyMinutes: number;
  totalStudyMinutes: number;
}

export interface QuizAttempt {
  materialId: string;
  courseCode: string | null;
  score: number;
  total: number;
  date: string;
  topicsCovered: string[];
  weakQuestions: string[];
  timeSpent: number; // seconds
}

export interface FlashcardAttempt {
  materialId: string;
  cardId: string;
  correct: boolean;
  date: string;
  timeToAnswer: number; // seconds
  topic: string;
}

export interface StudySession {
  date: string;
  materialId: string;
  duration: number; // minutes
  courseCode: string | null;
  topics: string[];
  activities: ("reading" | "flashcards" | "quiz" | "browsing")[];
}

export interface TopicMastery {
  topic: string;
  level: number; // 0-1
  attempts: number;
  correctAttempts: number;
  lastReviewed: string | null;
  daysSinceReview: number;
  trend: "improving" | "stable" | "declining";
  relatedTopics: string[];
}

// ── Adaptive recommendation types (NEW v3) ──

export interface AdaptiveRecommendation {
  materialId: string;
  title: string;
  reason: string;
  priority: "critical" | "high" | "medium" | "low";
  type: "review" | "learn" | "practice" | "remediate" | "advance" | "explore";
  estimatedTime: number;
  topics: string[];
  difficulty: "easy" | "medium" | "hard";
  rationale: string;
}

export interface StudyPlan {
  date: string;
  totalMinutes: number;
  sessions: StudyPlanSession[];
  focus: string;
  goal: string;
}

export interface StudyPlanSession {
  order: number;
  type: "warmup" | "review" | "learn" | "practice" | "test" | "cooldown";
  materialId: string | null;
  title: string;
  duration: number;
  topics: string[];
  reason: string;
}

export interface StudentInsight {
  type: "strength" | "weakness" | "pattern" | "warning" | "achievement" | "suggestion";
  title: string;
  description: string;
  actionable: boolean;
  action: string | null;
  priority: "info" | "low" | "medium" | "high";
}

// ── Resilience types (NEW v3) ──

export interface ModuleResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  fallbackUsed: boolean;
  degraded: boolean;
  processingTime: number;
}

export interface PipelineResult {
  results: Map<string, ModuleResult<unknown>>;
  overallSuccess: boolean;
  degradedModules: string[];
  criticalFailures: string[];
}

// ── Cache types (NEW v3) ──

export interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  size: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

// ── Zambian English types (NEW v3) ──

export interface LocalTerm {
  term: string;
  meaning: string;
  category: "abbreviation" | "shorthand" | "slang" | "course_code" | "lecturer";
  expansion: string;
  context: string;
}

export interface NormalizedText {
  text: string;
  expansions: { original: string; expanded: string; category: string }[];
  detectedLocalisms: LocalTerm[];
  confidence: number;
}

// ── Processed document (upgraded v3) ──

export interface ProcessedDocument {
  summary: string;
  tldr: string;
  tags: string[];
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  isOutdated: boolean;
  outdatedComment: string | null;
  keyTopics: string[];
  formulas: ExtractedFormula[];
  entities: ExtractedEntity[];
  concepts: ConceptNode[];
  knowledgeGraph: KnowledgeGraph;
  structure: DocumentStructure;
  difficulty: DifficultyAssessment;
  readability: ReadabilityScore;
  references: ExtractedReference[];
  tables: ExtractedTable[];
  language: LanguageInfo;
  studyPath: StudyPathNode[];
  qualityScore: number;
  figureDescriptions: FigureDescription[];
  keyTakeaways: string[];
  glossary: GlossaryEntry[];
  prerequisiteTopics: string[];
  relatedConcepts: string[];
  // v3 additions
  reasoningChains: ReasoningChain[];
  causalRelations: CausalRelation[];
  inferences: LogicalInference[];
  normalizedText: NormalizedText | null;
  processingMeta: {
    totalTime: number;
    moduleTimes: Map<string, number>;
    degradedModules: string[];
    cacheHits: string[];
  };
}

// ── Semantic analysis types ──

export interface SemanticAnalysis {
  topics: TopicCluster[];
  sentiment: "positive" | "neutral" | "negative" | "academic";
  complexity: number;
  coherenceScore: number;
  keyArguments: string[];
  evidenceStatements: string[];
}

export interface TopicCluster {
  label: string;
  keywords: string[];
  sentences: string[];
  weight: number;
}

// ── Progressive learning types ──

export interface ProgressionPlan {
  levels: ProgressionLevel[];
  totalEstimatedTime: number;
  currentLevel: string;
  nextSteps: string[];
}

export interface ProgressionLevel {
  level: string;
  description: string;
  materials: string[];
  skills: string[];
  estimatedTime: number;
}

// ── Re-export v2 types ──

export interface ExtractedFormula {
  raw: string;
  latex: string | null;
  type: "math" | "chemical" | "physics" | "logic" | "unknown";
  variables: string[];
  description: string | null;
  context: string | null;
  position: number;
}

export interface ExtractedEntity {
  text: string;
  type: "person" | "organization" | "location" | "date" | "number" | "concept" | "law" | "theory" | "equation" | "chemical" | "unit" | "term";
  frequency: number;
  contexts: string[];
  aliases: string[];
}

export interface ConceptNode {
  id: string;
  label: string;
  type: "topic" | "concept" | "entity" | "formula" | "law" | "method";
  weight: number;
  definition: string | null;
  relatedIds: string[];
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface KnowledgeGraph {
  nodes: ConceptNode[];
  edges: KnowledgeGraphEdge[];
  clusters: ConceptCluster[];
}

export interface ConceptCluster {
  id: string;
  label: string;
  nodeIds: string[];
  summary: string;
}

export interface DocumentSection {
  id: string;
  title: string;
  level: number;
  startIndex: number;
  endIndex: number;
  content: string;
  children: DocumentSection[];
}

export interface DocumentStructure {
  sections: DocumentSection[];
  hasTableOfContents: boolean;
  hasReferences: boolean;
  hasAppendix: boolean;
  estimatedReadingTime: number;
  wordCount: number;
  sectionCount: number;
}

export interface DifficultyAssessment {
  level: "beginner" | "intermediate" | "advanced" | "expert";
  score: number;
  factors: string[];
  recommendedAudience: string;
}

export interface ReadabilityScore {
  fleschKincaid: number;
  gradeLevel: number;
  readingEase: string;
  averageSentenceLength: number;
  complexWordRatio: number;
}

export interface ExtractedReference {
  raw: string;
  authors: string[];
  title: string | null;
  year: number | null;
  source: string | null;
  type: "journal" | "book" | "web" | "conference" | "unknown";
}

export interface ExtractedTable {
  title: string | null;
  headers: string[];
  rows: string[][];
  caption: string | null;
}

export interface LanguageInfo {
  primary: string;
  confidence: number;
  isMultilingual: boolean;
  detectedLanguages: { language: string; ratio: number }[];
}

export interface StudyPathNode {
  id: string;
  title: string;
  type: "review" | "learn" | "practice" | "test" | "explore";
  description: string;
  estimatedTime: number;
  prerequisites: string[];
  difficulty: "easy" | "medium" | "hard";
}

export interface FigureDescription {
  caption: string;
  figureNumber: string | null;
  type: "chart" | "diagram" | "equation" | "table" | "image" | "graph" | "unknown";
  referencedIn: string[];
  description: string;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  firstOccurrence: number;
  relatedTerms: string[];
}

export interface MaterialInfo {
  id: string;
  title: string;
  summary?: string | null;
  tags?: string[] | null;
  content_year?: number | null;
  type?: string | null;
  course_code?: string | null;
  courseTitle?: string | null;
  text?: string | null;
}

export interface Recommendation {
  id: string;
  title: string;
  type: string | null;
  content_year: number | null;
  similarity: number;
  reason: string;
  conceptOverlap: string[];
}

export interface YoutubeSuggestion {
  url: string;
  title: string;
  query: string;
}

export interface ProcessOptions {
  title: string;
  contentYear?: number | null;
  courseCode?: string | null;
  type?: string | null;
  maxSummarySentences?: number;
  maxFlashcards?: number;
  maxQuizQuestions?: number;
  maxTags?: number;
  extractFormulas?: boolean;
  extractEntities?: boolean;
  buildKnowledgeGraph?: boolean;
  analyzeStructure?: boolean;
  assessDifficulty?: boolean;
  extractReferences?: boolean;
  extractTables?: boolean;
  detectLanguage?: boolean;
  generateStudyPath?: boolean;
  cleanOcr?: boolean;
  analyzeFigures?: boolean;
  // v3 additions
  enableReasoning?: boolean;
  normalizeLocalLanguage?: boolean;
  studentProfile?: StudentProfile;
}

export interface RecommendOptions {
  limit?: number;
  excludeId?: string;
  sameCourseOnly?: boolean;
}

export interface OutdatedResult {
  isOutdated: boolean;
  yearsOld: number | null;
  comment: string | null;
  severity: "none" | "warning" | "critical";
}
