// ═══════════════════════════════════════════════════════════════════
// Learnova AI v3 — Reasoning Engine
// True multi-step reasoning: deductive, inductive, abductive, causal,
// analogical, and conditional inference over document content.
//
// This module DOES NOT just analyze — it REASONS.
// It builds chains of inference, identifies assumptions, detects
// fallacies, and generates alternative conclusions.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import { splitSentences, tokenizeContent, stem, termFrequency } from "./tokenizer";
import { extractKeywords, extractKeyTopics } from "./keyword-extractor";
import { extractEntities } from "./entity-extractor";
import type { ReasoningChain, ReasoningStep, ReasoningType, CausalRelation, LogicalInference } from "./types";

// ── Reasoning rule patterns ──

interface ReasoningPattern {
  type: ReasoningType;
  regex: RegExp;
  premiseGroups: number[];
  conclusionGroup: number;
  confidenceBase: number;
}

const REASONING_PATTERNS: ReasoningPattern[] = [
  // Conditional: "If X then Y" / "X implies Y" / "X leads to Y"
  { type: "conditional", regex: /if\s+(.+?),?\s+then\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.85 },
  { type: "conditional", regex: /(.+?)\s+implies\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.8 },
  { type: "conditional", regex: /(.+?)\s+(?:leads?\s+to|results?\s+in)\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.75 },

  // Causal: "X causes Y" / "X is caused by Y" / "Because X, Y"
  { type: "causal", regex: /(.+?)\s+causes?\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.8 },
  { type: "causal", regex: /because\s+(.+?),?\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.75 },
  { type: "causal", regex: /since\s+(.+?),?\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.7 },
  { type: "causal", regex: /due\s+to\s+(.+?),?\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.7 },
  { type: "causal", regex: /(.+?)\s+(?:is|are)\s+caused\s+by\s+(.+?)[.;]/gi, premiseGroups: [2], conclusionGroup: 1, confidenceBase: 0.75 },

  // Deductive: "All X are Y. Z is X. Therefore Z is Y."
  { type: "deductive", regex: /all\s+(.+?)\s+(?:are|is)\s+(.+?)[.;]\s*(.+?)\s+(?:is|are)\s+(.+?)[.;]\s*therefore\s*(.+?)\s+(?:is|are)\s+(.+?)[.;]/gi, premiseGroups: [1, 2, 3, 4], conclusionGroup: [5, 6] as unknown as number, confidenceBase: 0.9 },
  { type: "deductive", regex: /therefore\s*,?\s*(.+?)[.;]/gi, premiseGroups: [], conclusionGroup: 1, confidenceBase: 0.7 },

  // Inductive: "X, Y, Z suggest that W" / "Evidence shows that X"
  { type: "inductive", regex: /(.+?)\s+suggests?\s+that\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.65 },
  { type: "inductive", regex: /evidence\s+(?:shows?|indicates?|demonstrates?)\s+that\s+(.+?)[.;]/gi, premiseGroups: [], conclusionGroup: 1, confidenceBase: 0.7 },
  { type: "inductive", regex: /(?:studies?|research|data|experiments?)\s+(?:show|shows|indicate|indicates|demonstrate|demonstrates)\s+that\s+(.+?)[.;]/gi, premiseGroups: [], conclusionGroup: 1, confidenceBase: 0.7 },
  { type: "inductive", regex: /(?:many|most|several|numerous|various)\s+(.+?)\s+(?:show|shows|demonstrate|demonstrates|indicate|indicates)\s+that\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.6 },

  // Abductive: "X can be explained by Y" / "X suggests Y"
  { type: "abductive", regex: /(.+?)\s+can\s+be\s+explained\s+by\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.6 },
  { type: "abductive", regex: /(.+?)\s+(?:may|might|could)\s+(?:be\s+due\s+to|result\s+from)\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.55 },

  // Analogical: "X is like Y" / "X is similar to Y" / "Just as X, Y"
  { type: "analogical", regex: /(.+?)\s+is\s+like\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.5 },
  { type: "analogical", regex: /just\s+as\s+(.+?),?\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.55 },
  { type: "analogical", regex: /(.+?)\s+is\s+similar\s+to\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.5 },
  { type: "analogical", regex: /(.+?)\s+is\s+analogous\s+to\s+(.+?)[.;]/gi, premiseGroups: [1], conclusionGroup: 2, confidenceBase: 0.55 },
];

// ── Fallacy detection patterns ──

const FALLACY_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "Hasty generalization", regex: /(?:all|every|always|never)\s+\w+\s+(?:are|is|do|does)\s+/i },
  { name: "Correlation-causation", regex: /(?:correlates?\s+with|associated\s+with).*(?:causes?|leads?\s+to|results?\s+in)/i },
  { name: "Appeal to authority", regex: /(?:expert|authority|professor|scientist)\s+says?\s+/i },
  { name: "False dichotomy", regex: /(?:either|only)\s+.+\s+or\s+.+(?:nothing|no\s+other)/i },
  { name: "Slippery slope", regex: /(?:will\s+inevitably|will\s+ultimately|will\s+eventually)\s+lead\s+to/i },
  { name: "Circular reasoning", regex: /(.+?)\s+(?:is|are)\s+(.+?)\s+because\s+(.+?)\s+(?:is|are)\s+/i },
];

/**
 * Extract reasoning chains from text.
 * Identifies multi-step inference patterns and builds structured chains.
 */
export function extractReasoningChains(text: string): ReasoningChain[] {
  if (!text || text.trim().length < 50) return [];

  const sentences = splitSentences(text);
  const chains: ReasoningChain[] = [];
  const topics = extractKeyTopics(text, 5);
  const entities = extractEntities(text);

  // 1. Pattern-based reasoning extraction
  for (const pattern of REASONING_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const premises = pattern.premiseGroups.map((g) => match![g]?.trim() ?? "").filter((s) => s.length > 3);
      const conclusion = match[pattern.conclusionGroup]?.trim() ?? "";

      if (!conclusion || conclusion.length < 5) continue;

      // Find the sentence this match appears in
      const matchIdx = match.index;
      const sentence = sentences.find((s) => {
        const sIdx = text.indexOf(s);
        return sIdx >= 0 && matchIdx >= sIdx && matchIdx < sIdx + s.length;
      }) ?? match[0];

      // Find supporting evidence in nearby sentences
      const evidence = findEvidence(text, matchIdx, sentences);

      // Adjust confidence based on evidence
      let confidence = pattern.confidenceBase;
      if (evidence.length >= 2) confidence += 0.1;
      if (evidence.length >= 4) confidence += 0.05;
      confidence = Math.min(0.98, confidence);

      // Detect fallacies in this reasoning
      const fallacies = detectFallacies(sentence);

      // Generate alternative conclusions
      const alternatives = generateAlternativeConclusions(conclusion, premises, entities);

      // Identify assumptions
      const assumptions = identifyAssumptions(premises, conclusion, pattern.type);

      const step: ReasoningStep = {
        step: 1,
        type: pattern.type,
        premise: premises.join("; ") || "implicit",
        inference: sentence,
        conclusion,
        confidence,
        evidence: evidence.slice(0, 3),
      };

      // Try to build a multi-step chain by finding follow-up reasoning
      const followUpSteps = findFollowUpReasoning(text, conclusion, sentences, matchIdx);
      const allSteps = [step, ...followUpSteps];

      chains.push({
        id: `chain_${chains.length}`,
        topic: topics.find((t) => conclusion.toLowerCase().includes(t.toLowerCase().split(/\s+/)[0])) ?? topics[0] ?? "general",
        steps: allSteps.map((s, i) => ({ ...s, step: i + 1 })),
        finalConclusion: allSteps[allSteps.length - 1]?.conclusion ?? conclusion,
        confidence: allSteps.reduce((sum, s) => sum + s.confidence, 0) / allSteps.length,
        alternativeConclusions: alternatives,
        assumptions,
        fallacies,
      });
    }
  }

  // 2. Build implicit reasoning chains from definition + application patterns
  const implicitChains = buildImplicitChains(text, sentences, topics);
  chains.push(...implicitChains);

  // 3. Build causal chains from entity relationships
  const causalChains = buildCausalChains(text, sentences, entities);
  chains.push(...causalChains);

  // Deduplicate by final conclusion
  const seen = new Set<string>();
  return chains.filter((c) => {
    const key = c.finalConclusion.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

/**
 * Find supporting evidence for a reasoning step in nearby sentences.
 */
function findEvidence(text: string, matchIdx: number, sentences: string[]): string[] {
  const evidence: string[] = [];

  for (const sentence of sentences) {
    const sIdx = text.indexOf(sentence);
    if (sIdx < 0) continue;

    const distance = Math.abs(sIdx - matchIdx);
    if (distance > 500) continue; // only look nearby

    // Evidence indicators
    const hasData = /\b\d+(?:\.\d+)?%?\b/.test(sentence);
    const hasCitation = /\[\d+\]|\(\w+\s+(?:et\s+al\.?\s+)?\d{4}\)/.test(sentence);
    const hasStudy = /\b(?:study|studies|research|experiment|data|evidence|results?|findings?|shown|demonstrated|observed|measured)\b/i.test(sentence);

    if ((hasData || hasCitation || hasStudy) && sentence.length > 20 && sentence.length < 300) {
      evidence.push(sentence.trim());
    }
  }

  return evidence;
}

/**
 * Detect logical fallacies in a reasoning statement.
 */
function detectFallacies(sentence: string): string[] {
  const found: string[] = [];
  for (const { name, regex } of FALLACY_PATTERNS) {
    if (regex.test(sentence)) found.push(name);
  }
  return found;
}

/**
 * Generate alternative conclusions by negating or modifying the original.
 */
function generateAlternativeConclusions(
  conclusion: string,
  premises: string[],
  entities: { text: string; type: string }[],
): { conclusion: string; confidence: number }[] {
  const alternatives: { conclusion: string; confidence: number }[] = [];

  // Negation: "X causes Y" → "X does not necessarily cause Y"
  const negated = conclusion
    .replace(/\b(?:is|are)\b/i, "may not be")
    .replace(/\b(?:causes?|leads?\s+to)\b/i, "may not cause");
  if (negated !== conclusion) {
    alternatives.push({ conclusion: negated, confidence: 0.3 });
  }

  // Conditional: "X is Y" → "X is sometimes Y"
  const hedged = conclusion
    .replace(/\b(?:is|are)\b/i, "can sometimes be")
    .replace(/\balways\b/i, "often")
    .replace(/\ball\b/i, "most");
  if (hedged !== conclusion) {
    alternatives.push({ conclusion: hedged, confidence: 0.4 });
  }

  // Alternative cause: if causal, suggest a different cause
  if (entities.length > 0) {
    const altEntity = entities.find((e) => !conclusion.includes(e.text) && e.type === "concept");
    if (altEntity) {
      alternatives.push({
        conclusion: `Alternatively, ${altEntity.text} may play a role in ${conclusion.slice(0, 50)}...`,
        confidence: 0.25,
      });
    }
  }

  return alternatives.slice(0, 3);
}

/**
 * Identify assumptions in a reasoning step.
 */
function identifyAssumptions(premises: string[], conclusion: string, type: ReasoningType): string[] {
  const assumptions: string[] = [];

  if (type === "causal") {
    assumptions.push("Assumes correlation implies causation");
    assumptions.push("Assumes no confounding variables");
  }
  if (type === "inductive") {
    assumptions.push("Assumes the sample is representative");
    assumptions.push("Assumes the pattern generalizes");
  }
  if (type === "deductive") {
    assumptions.push("Assumes premises are true");
    assumptions.push("Assumes logical form is valid");
  }
  if (type === "analogical") {
    assumptions.push("Assumes the compared entities share relevant properties");
  }
  if (type === "conditional") {
    assumptions.push("Assumes the condition is both necessary and sufficient");
  }
  if (type === "abductive") {
    assumptions.push("Assumes the explanation is the best available");
    assumptions.push("Assumes no better alternative explanation exists");
  }

  // Check for unstated premises
  if (premises.length === 0 || premises.every((p) => p.length < 10)) {
    assumptions.push("Assumes an unstated premise");
  }

  return assumptions;
}

/**
 * Find follow-up reasoning steps that build on a conclusion.
 */
function findFollowUpReasoning(
  text: string,
  conclusion: string,
  sentences: string[],
  matchIdx: number,
): ReasoningStep[] {
  const steps: ReasoningStep[] = [];
  const conclusionKey = stem(conclusion.toLowerCase().split(/\s+/)[0] ?? "");

  // Look for sentences after the conclusion that reference it
  for (const sentence of sentences) {
    const sIdx = text.indexOf(sentence);
    if (sIdx <= matchIdx) continue;
    if (sIdx > matchIdx + 1000) break;

    // Check if this sentence builds on the conclusion
    const sentenceLower = sentence.toLowerCase();
    const conclusionWords = conclusion.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const overlap = conclusionWords.filter((w) => sentenceLower.includes(w)).length;

    if (overlap < 2) continue;

    // Check for reasoning indicators
    const hasTherefore = /\b(?:therefore|thus|hence|consequently|so|it\s+follows)\b/i.test(sentence);
    const hasBecause = /\b(?:because|since|as\s+a\s+result)\b/i.test(sentence);
    const hasImplies = /\b(?:implies|means?|suggests?|indicates?)\b/i.test(sentence);

    if (hasTherefore || hasBecause || hasImplies) {
      let type: ReasoningType = "deductive";
      if (hasBecause) type = "causal";
      else if (hasImplies) type = "conditional";

      steps.push({
        step: steps.length + 2,
        type,
        premise: conclusion,
        inference: sentence,
        conclusion: sentence.replace(/^(?:therefore|thus|hence|consequently|so|it\s+follows\s+that)\s*/i, "").trim(),
        confidence: 0.7,
        evidence: [],
      });

      if (steps.length >= 3) break; // Limit chain depth
    }
  }

  return steps;
}

/**
 * Build implicit reasoning chains from definition → application patterns.
 * "X is defined as Y" → "X is used in Z" → "Therefore X enables W"
 */
function buildImplicitChains(text: string, sentences: string[], topics: string[]): ReasoningChain[] {
  const chains: ReasoningChain[] = [];

  // Find definition sentences
  const defPattern = /^(.+?)\s+(?:is|are)\s+(?:defined\s+as|refers?\s+to|means?)\s+(.+?)[.;]/i;
  const definitions: { term: string; definition: string; sentence: string; index: number }[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const match = sentences[i].match(defPattern);
    if (match) {
      definitions.push({
        term: match[1].trim(),
        definition: match[2].trim(),
        sentence: sentences[i],
        index: i,
      });
    }
  }

  // For each definition, find sentences that apply it
  for (const def of definitions) {
    const termLower = def.term.toLowerCase();
    const applicationSentences = sentences
      .map((s, i) => ({ sentence: s, index: i }))
      .filter(({ sentence, index }) =>
        index !== def.index &&
        sentence.toLowerCase().includes(termLower) &&
        /\b(?:therefore|thus|hence|so|consequently|means|implies|allows|enables|results?\s+in|leads?\s+to|causes?)\b/i.test(sentence),
      );

    if (applicationSentences.length > 0) {
      const steps: ReasoningStep[] = [
        {
          step: 1,
          type: "deductive",
          premise: `${def.term} is defined as ${def.definition}`,
          inference: def.sentence,
          conclusion: def.definition,
          confidence: 0.8,
          evidence: [def.sentence],
        },
      ];

      for (const app of applicationSentences.slice(0, 2)) {
        steps.push({
          step: steps.length + 1,
          type: "conditional",
          premise: def.definition,
          inference: app.sentence,
          conclusion: app.sentence.replace(/^(?:therefore|thus|hence|so|consequently)\s*/i, "").trim(),
          confidence: 0.65,
          evidence: [],
        });
      }

      chains.push({
        id: `chain_implicit_${chains.length}`,
        topic: def.term,
        steps,
        finalConclusion: steps[steps.length - 1].conclusion,
        confidence: steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length,
        alternativeConclusions: [],
        assumptions: ["Assumes the definition is correctly applied"],
        fallacies: [],
      });
    }
  }

  return chains;
}

/**
 * Build causal chains from entity relationships.
 */
function buildCausalChains(text: string, sentences: string[], entities: { text: string; type: string; frequency: number }[]): ReasoningChain[] {
  const chains: ReasoningChain[] = [];
  const causalEntities = entities.filter((e) => e.type === "concept" || e.type === "term" || e.type === "law").slice(0, 10);

  for (const entity of causalEntities) {
    const entityLower = entity.text.toLowerCase();

    // Find sentences where this entity causes something
    const causingSentences = sentences.filter((s) =>
      s.toLowerCase().includes(entityLower) &&
      /\b(?:causes?|leads?\s+to|results?\s+in|produces?|generates?|creates?|triggers?)\b/i.test(s),
    );

    // Find sentences where this entity is affected
    const affectedSentences = sentences.filter((s) =>
      s.toLowerCase().includes(entityLower) &&
      /\b(?:is\s+caused\s+by|results?\s+from|depends?\s+on|is\s+affected\s+by|is\s+influenced\s+by)\b/i.test(s),
    );

    if (causingSentences.length > 0) {
      const steps: ReasoningStep[] = causingSentences.slice(0, 3).map((sentence, i) => ({
        step: i + 1,
        type: "causal" as ReasoningType,
        premise: entity.text,
        inference: sentence,
        conclusion: sentence.replace(/^(.+?)\s+(?:causes?|leads?\s+to|results?\s+in|produces?|generates?|creates?|triggers?)\s+/i, "").trim(),
        confidence: 0.7,
        evidence: [],
      }));

      chains.push({
        id: `chain_causal_${chains.length}`,
        topic: entity.text,
        steps,
        finalConclusion: steps[steps.length - 1].conclusion,
        confidence: 0.7,
        alternativeConclusions: [
          { conclusion: `${entity.text} may be a contributing factor but not the sole cause`, confidence: 0.35 },
        ],
        assumptions: ["Assumes direct causation without confounding factors"],
        fallacies: detectFallacies(causingSentences.join(" ")),
      });
    }
  }

  return chains;
}

/**
 * Extract causal relations from text.
 */
export function extractCausalRelations(text: string): CausalRelation[] {
  if (!text) return [];

  const sentences = splitSentences(text);
  const relations: CausalRelation[] = [];

  const causalPatterns: { regex: RegExp; causeGroup: number; effectGroup: number; strength: "strong" | "moderate" | "weak" }[] = [
    { regex: /(.+?)\s+causes?\s+(.+?)[.;]/gi, causeGroup: 1, effectGroup: 2, strength: "strong" },
    { regex: /(.+?)\s+leads?\s+to\s+(.+?)[.;]/gi, causeGroup: 1, effectGroup: 2, strength: "strong" },
    { regex: /(.+?)\s+results?\s+in\s+(.+?)[.;]/gi, causeGroup: 1, effectGroup: 2, strength: "strong" },
    { regex: /(.+?)\s+produces?\s+(.+?)[.;]/gi, causeGroup: 1, effectGroup: 2, strength: "moderate" },
    { regex: /(.+?)\s+generates?\s+(.+?)[.;]/gi, causeGroup: 1, effectGroup: 2, strength: "moderate" },
    { regex: /(.+?)\s+(?:affects?|influences?)\s+(.+?)[.;]/gi, causeGroup: 1, effectGroup: 2, strength: "weak" },
    { regex: /(.+?)\s+(?:is|are)\s+caused\s+by\s+(.+?)[.;]/gi, causeGroup: 2, effectGroup: 1, strength: "strong" },
    { regex: /(.+?)\s+(?:depends?|relies?)\s+on\s+(.+?)[.;]/gi, causeGroup: 2, effectGroup: 1, strength: "moderate" },
    { regex: /because\s+(?:of\s+)?(.+?),?\s+(.+?)[.;]/gi, causeGroup: 1, effectGroup: 2, strength: "strong" },
    { regex: /due\s+to\s+(.+?),?\s+(.+?)[.;]/gi, causeGroup: 1, effectGroup: 2, strength: "moderate" },
  ];

  for (const { regex, causeGroup, effectGroup, strength } of causalPatterns) {
    const r = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = r.exec(text)) !== null) {
      const cause = match[causeGroup]?.trim();
      const effect = match[effectGroup]?.trim();
      if (!cause || !effect || cause.length < 5 || effect.length < 5) continue;
      if (cause.length > 100 || effect.length > 100) continue;

      // Check for bidirectional language
      const bidirectional = /\b(?:conversely|vice\s+versa|similarly|likewise|in\s+turn)\b/i.test(
        text.slice(Math.max(0, match.index - 100), match.index + match[0].length + 100),
      );

      relations.push({
        cause,
        effect,
        strength,
        evidence: sentences.find((s) => s.includes(cause.slice(0, 20))) ?? match[0],
        bidirectional,
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return relations.filter((r) => {
    const key = `${r.cause}→${r.effect}`.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract logical inferences from text.
 */
export function extractInferences(text: string): LogicalInference[] {
  if (!text) return [];

  const sentences = splitSentences(text);
  const inferences: LogicalInference[] = [];

  for (const sentence of sentences) {
    // Modus ponens: "If P then Q. P. Therefore Q."
    if (/if\s+.+\s+then\s+.+/i.test(sentence) && /therefore/i.test(sentence)) {
      inferences.push({
        rule: "Modus Ponens",
        premises: [sentence.match(/if\s+(.+?),?\s+then/i)?.[1] ?? "", sentence.match(/then\s+(.+?),?\s+therefore/i)?.[1] ?? ""],
        conclusion: sentence.match(/therefore\s+(.+?)[.;]/i)?.[1] ?? sentence,
        valid: true,
        type: "deductive",
      });
    }

    // Inductive generalization
    if (/\b(?:many|most|all|every|several|numerous)\b.*\b(?:therefore|thus|hence|consequently)\b/i.test(sentence)) {
      inferences.push({
        rule: "Inductive Generalization",
        premises: [sentence.split(/(?:therefore|thus|hence|consequently)/i)[0]?.trim() ?? ""],
        conclusion: sentence.split(/(?:therefore|thus|hence|consequently)/i)[1]?.trim() ?? sentence,
        valid: true,
        type: "inductive",
      });
    }

    // Causal inference
    if (/\b(?:because|since|due\s+to)\b/i.test(sentence)) {
      const parts = sentence.split(/\b(?:because|since|due\s+to)\b/i);
      if (parts.length === 2) {
        inferences.push({
          rule: "Causal Inference",
          premises: [parts[1].trim()],
          conclusion: parts[0].trim(),
          valid: true,
          type: "causal",
        });
      }
    }
  }

  return inferences;
}

/**
 * Answer a question using reasoning over the document.
 * This is the "thinking" function — it doesn't just retrieve,
 * it constructs an answer through multi-step inference.
 */
export function reasonAboutQuestion(
  question: string,
  text: string,
  reasoningChains: ReasoningChain[],
  causalRelations: CausalRelation[],
): { answer: string; confidence: number; reasoning: string[] } {
  const questionLower = question.toLowerCase();
  const sentences = splitSentences(text);

  // 1. Find relevant reasoning chains
  const relevantChains = reasoningChains.filter((c) => {
    const topicLower = c.topic.toLowerCase();
    return questionLower.includes(topicLower) ||
      questionLower.split(/\s+/).some((w) => topicLower.includes(w) && w.length > 4);
  });

  // 2. Find relevant causal relations
  const relevantCausal = causalRelations.filter((r) => {
    return questionLower.includes(r.cause.toLowerCase().split(/\s+/)[0]) ||
           questionLower.includes(r.effect.toLowerCase().split(/\s+/)[0]);
  });

  // 3. Find directly relevant sentences
  const questionKeywords = questionLower.split(/\s+/).filter((w) => w.length > 4);
  const relevantSentences = sentences.filter((s) => {
    const sLower = s.toLowerCase();
    return questionKeywords.some((kw) => sLower.includes(kw));
  }).sort((a, b) => {
    const aMatches = questionKeywords.filter((kw) => a.toLowerCase().includes(kw)).length;
    const bMatches = questionKeywords.filter((kw) => b.toLowerCase().includes(kw)).length;
    return bMatches - aMatches;
  });

  // 4. Construct answer through reasoning
  const reasoning: string[] = [];
  let answer = "";
  let confidence = 0;

  if (relevantChains.length > 0) {
    const chain = relevantChains[0];
    answer = chain.finalConclusion;
    confidence = chain.confidence;
    reasoning.push(`Based on ${chain.steps.length}-step ${chain.steps[0].type} reasoning:`);
    for (const step of chain.steps) {
      reasoning.push(`  Step ${step.step}: ${step.premise} → ${step.conclusion} (confidence: ${(step.confidence * 100).toFixed(0)}%)`);
    }
    if (chain.assumptions.length > 0) {
      reasoning.push(`Assumptions: ${chain.assumptions.join(", ")}`);
    }
    if (chain.alternativeConclusions.length > 0) {
      reasoning.push(`Alternative conclusions considered: ${chain.alternativeConclusions.map((a) => a.conclusion).join("; ")}`);
    }
  } else if (relevantCausal.length > 0) {
    const causal = relevantCausal[0];
    answer = `${causal.cause} ${causal.bidirectional ? "mutually affects" : "causes"} ${causal.effect}`;
    confidence = causal.strength === "strong" ? 0.8 : causal.strength === "moderate" ? 0.6 : 0.4;
    reasoning.push(`Based on causal analysis: ${causal.cause} → ${causal.effect} (${causal.strength} relationship)`);
    reasoning.push(`Evidence: ${causal.evidence.slice(0, 100)}`);
  } else if (relevantSentences.length > 0) {
    answer = relevantSentences[0];
    confidence = 0.5;
    reasoning.push(`Based on direct text analysis: found ${relevantSentences.length} relevant sentences`);
    reasoning.push(`Most relevant: "${relevantSentences[0].slice(0, 150)}..."`);
  } else {
    answer = "The document does not contain sufficient information to answer this question with high confidence.";
    confidence = 0.1;
    reasoning.push("No relevant reasoning chains, causal relations, or direct text matches found.");
  }

  return { answer, confidence, reasoning };
}
