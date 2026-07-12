// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Document Structure Analyzer
// Parses document into hierarchical sections, detects TOC, references,
// appendix, estimates reading time, and analyzes document organization.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import { tokenizeContent, wordCount } from "./tokenizer";
import type { DocumentStructure, DocumentSection } from "./types";

/**
 * Analyze document structure — sections, hierarchy, metadata.
 */
export function analyzeStructure(text: string): DocumentStructure {
  if (!text || !text.trim()) {
    return {
      sections: [],
      hasTableOfContents: false,
      hasReferences: false,
      hasAppendix: false,
      estimatedReadingTime: 0,
      wordCount: 0,
      sectionCount: 0,
    };
  }

  const sections = extractSections(text);
  const hasTableOfContents = detectTableOfContents(text);
  const hasReferences = detectReferences(text);
  const hasAppendix = detectAppendix(text);
  const wc = wordCount(text);
  const readingTime = Math.ceil(wc / 200); // 200 wpm average

  return {
    sections,
    hasTableOfContents,
    hasReferences,
    hasAppendix,
    estimatedReadingTime: readingTime,
    wordCount: wc,
    sectionCount: sections.length,
  };
}

/**
 * Extract hierarchical sections from document text.
 * Detects headings by patterns: numbered sections, ALL CAPS lines,
 * Markdown-style headers, and short lines followed by longer content.
 */
export function extractSections(text: string): DocumentSection[] {
  if (!text) return [];

  const lines = text.split("\n");
  const sections: DocumentSection[] = [];
  let currentSection: DocumentSection | null = null;
  let contentBuffer: string[] = [];

  // Heading patterns
  const headingPatterns: { regex: RegExp; level: number }[] = [
    { regex: /^(#{1,6})\s+(.+)$/, level: 0 }, // Markdown: # Heading
    { regex: /^(\d+(?:\.\d+)*)\s+(.+)$/, level: 0 }, // Numbered: 1.2.3 Title
    { regex: /^(Chapter\s+\d+|CHAPTER\s+\d+)\s*[:.]?\s*(.*)$/i, level: 1 },
    { regex: /^(Section\s+\d+|SECTION\s+\d+)\s*[:.]?\s*(.*)$/i, level: 2 },
    { regex: /^(Part\s+[IVXLC]+|PART\s+[IVXLC]+)\s*[:.]?\s*(.*)$/i, level: 1 },
    { regex: /^(Abstract|Introduction|Methodology|Methods|Results|Discussion|Conclusion|References|Bibliography|Appendix|Acknowledgments)\s*$/i, level: 1 },
    { regex: /^([A-Z][A-Z\s]{5,60})$/, level: 2 }, // ALL CAPS heading
  ];

  function getHeadingLevel(line: string): { level: number; title: string } | null {
    for (const { regex, level: baseLevel } of headingPatterns) {
      const match = line.match(regex);
      if (match) {
        let title = match[2] ?? match[1] ?? match[0];
        let level = baseLevel;

        // For Markdown, level = number of # signs
        if (match[1] && /^#+$/.test(match[1])) {
          level = match[1].length;
        }

        // For numbered sections, level = depth of numbering
        if (/^\d/.test(match[0])) {
          const nums = match[0].match(/^(\d+(?:\.\d+)*)/)?.[1] ?? "";
          level = nums.split(".").length;
        }

        // Clean up title
        title = title.trim().replace(/^[:.]+\s*/, "");

        // Skip if it's too long to be a heading (probably a sentence)
        if (title.split(/\s+/).length > 15) return null;

        return { level, title };
      }
    }
    return null;
  }

  function flushSection() {
    if (currentSection) {
      currentSection.content = contentBuffer.join("\n").trim();
      currentSection.endIndex = sections.length;
      sections.push(currentSection);
    }
    contentBuffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      contentBuffer.push("");
      continue;
    }

    const heading = getHeadingLevel(trimmed);
    if (heading) {
      flushSection();
      currentSection = {
        id: `sec_${sections.length}`,
        title: heading.title,
        level: heading.level,
        startIndex: sections.length,
        endIndex: sections.length,
        content: "",
        children: [],
      };
    } else if (currentSection) {
      contentBuffer.push(trimmed);
    } else {
      // Content before any heading — create an implicit introduction
      contentBuffer.push(trimmed);
      if (contentBuffer.length > 5 && !currentSection) {
        currentSection = {
          id: "sec_intro",
          title: "Introduction",
          level: 0,
          startIndex: 0,
          endIndex: 0,
          content: "",
          children: [],
        };
      }
    }
  }

  flushSection();

  // Build hierarchy
  return buildHierarchy(sections);
}

/**
 * Build parent-child relationships in sections.
 */
function buildHierarchy(flat: DocumentSection[]): DocumentSection[] {
  const result: DocumentSection[] = [];
  const stack: DocumentSection[] = [];

  for (const section of flat) {
    // Pop stack until we find a parent with lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      result.push(section);
    } else {
      stack[stack.length - 1].children.push(section);
    }
    stack.push(section);
  }

  return result;
}

/**
 * Detect if document has a table of contents.
 */
function detectTableOfContents(text: string): boolean {
  const tocPatterns: RegExp[] = [
    /\btable\s+of\s+contents?\b/i,
    /\bcontents?\s*[:.]\s*\n/i,
    /\bindex\s*[:.]\s*\n/i,
    /^\s*\d+\s+\.\s*\.\s*\.\s*\.\s*\d+\s*$/m, // dotted leaders
  ];
  return tocPatterns.some((p) => p.test(text));
}

/**
 * Detect if document has a references/bibliography section.
 */
function detectReferences(text: string): boolean {
  const refPatterns: RegExp[] = [
    /^\s*references?\s*$/im,
    /^\s*bibliography\s*$/im,
    /^\s*works\s+cited\s*$/im,
    /\[\d+\]\s+[A-Z][a-z]+,\s+[A-Z]/m, // [1] Author, X.
    /\(\w+\s+(?:et\s+al\.?\s+)?\d{4}\)/m, // (Author et al. 2023)
  ];
  return refPatterns.some((p) => p.test(text));
}

/**
 * Detect if document has an appendix.
 */
function detectAppendix(text: string): boolean {
  const appendixPatterns: RegExp[] = [
    /^\s*appendix\s+[a-z\d]/im,
    /^\s*appendices?\s*$/im,
    /^\s*supplementary\s+(?:material|information)\s*$/im,
  ];
  return appendixPatterns.some((p) => p.test(text));
}

// ═══════════════════════════════════════════════════════════════════
// Difficulty Assessment & Readability Scoring
// ═══════════════════════════════════════════════════════════════════

import { countSyllables, isComplexWord, splitSentences, detectDomain } from "./tokenizer";
import type { DifficultyAssessment, ReadabilityScore } from "./types";

/**
 * Assess document difficulty based on readability, domain complexity,
 * vocabulary level, and concept density.
 */
export function assessDifficulty(text: string): DifficultyAssessment {
  if (!text || text.trim().length < 50) {
    return {
      level: "beginner",
      score: 0,
      factors: [],
      recommendedAudience: "General audience",
    };
  }

  const factors: string[] = [];
  let score = 0;

  // 1. Readability
  const readability = calculateReadability(text);
  if (readability.fleschKincaid > 12) { score += 25; factors.push("high grade-level readability"); }
  else if (readability.fleschKincaid > 9) { score += 15; factors.push("moderate readability"); }
  else if (readability.fleschKincaid > 6) { score += 5; factors.push("accessible readability"); }

  // 2. Domain complexity
  const domains = detectDomain(text);
  if (domains.includes("mathematics") || domains.includes("physics")) { score += 20; factors.push("technical domain (math/physics)"); }
  else if (domains.length > 0) { score += 10; factors.push(`domain: ${domains[0]}`); }

  // 3. Vocabulary complexity
  const words = tokenizeContent(text);
  const complexWords = words.filter(isComplexWord);
  const complexRatio = complexWords.length / Math.max(words.length, 1);
  if (complexRatio > 0.25) { score += 20; factors.push("high proportion of complex vocabulary"); }
  else if (complexRatio > 0.15) { score += 10; factors.push("moderate complex vocabulary"); }

  // 4. Sentence complexity
  const sentences = splitSentences(text);
  const avgSentLen = sentences.length > 0 ? words.length / sentences.length : 0;
  if (avgSentLen > 25) { score += 15; factors.push("long, complex sentences"); }
  else if (avgSentLen > 18) { score += 8; factors.push("moderate sentence length"); }

  // 5. Concept density (unique content words per sentence)
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const conceptDensity = sentences.length > 0 ? uniqueWords.size / sentences.length : 0;
  if (conceptDensity > 15) { score += 15; factors.push("high concept density"); }
  else if (conceptDensity > 10) { score += 7; factors.push("moderate concept density"); }

  // 6. Presence of formulas
  if (/[∑∫∏∂∇√∞±≈≠≤≥]/.test(text) || /\$[^$]+\$/.test(text)) {
    score += 10;
    factors.push("contains mathematical formulas");
  }

  // Determine level
  let level: DifficultyAssessment["level"];
  let audience: string;
  if (score >= 70) { level = "expert"; audience = "Graduate students and researchers"; }
  else if (score >= 45) { level = "advanced"; audience = "Upper-level undergraduate students"; }
  else if (score >= 25) { level = "intermediate"; audience = "Undergraduate students"; }
  else { level = "beginner"; audience = "General audience and first-year students"; }

  return { level, score, factors, recommendedAudience: audience };
}

/**
 * Calculate readability scores (Flesch-Kincaid, grade level, reading ease).
 */
export function calculateReadability(text: string): ReadabilityScore {
  if (!text || text.trim().length < 10) {
    return { fleschKincaid: 0, gradeLevel: 0, readingEase: "N/A", averageSentenceLength: 0, complexWordRatio: 0 };
  }

  const sentences = splitSentences(text);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const complexWords = words.filter(isComplexWord);

  const wordCount = words.length;
  const sentenceCount = Math.max(sentences.length, 1);
  const avgSentLen = wordCount / sentenceCount;
  const syllablesPerWord = syllableCount / Math.max(wordCount, 1);
  const complexWordRatio = complexWords.length / Math.max(wordCount, 1);

  // Flesch Reading Ease: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  const readingEaseRaw = 206.835 - 1.015 * avgSentLen - 84.6 * syllablesPerWord;

  // Flesch-Kincaid Grade Level: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
  const fleschKincaid = 0.39 * avgSentLen + 11.8 * syllablesPerWord - 15.59;

  let readingEase: string;
  if (readingEaseRaw >= 90) readingEase = "Very Easy (5th grade)";
  else if (readingEaseRaw >= 80) readingEase = "Easy (6th grade)";
  else if (readingEaseRaw >= 70) readingEase = "Fairly Easy (7th grade)";
  else if (readingEaseRaw >= 60) readingEase = "Standard (8-9th grade)";
  else if (readingEaseRaw >= 50) readingEase = "Fairly Difficult (10-12th grade)";
  else if (readingEaseRaw >= 30) readingEase = "Difficult (College level)";
  else readingEase = "Very Difficult (Graduate level)";

  return {
    fleschKincaid: Math.max(0, fleschKincaid),
    gradeLevel: Math.max(0, Math.round(fleschKincaid)),
    readingEase,
    averageSentenceLength: avgSentLen,
    complexWordRatio,
  };
}
