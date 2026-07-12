// ═══════════════════════════════════════════════════════════════════
// Learnova AI v3 — Zambian English & Local Language Normalizer
//
// Handles British English, Zambian English, local abbreviations,
// course codes, lecturer shorthand, and student note conventions.
//
// Examples it handles:
//   "Sir said imp."     → "The lecturer said this is important."
//   "Important CA."     → "Important Continuous Assessment."
//   "Likely Exam."      → "This is likely to appear in the exam."
//   "NB"                → "Note well" (Nota Bene)
//   "Revise"            → "Review this topic"
//   "ECO301"            → course code (kept as-is, tagged)
//   "Tut"               → "Tutorial"
//   "Ass"               → "Assignment"
//   "Past paper"        → "Past examination paper"
//
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import type { LocalTerm, NormalizedText } from "./types";

// ── Local term dictionary ──

const LOCAL_TERMS: LocalTerm[] = [
  // Student shorthand
  { term: "imp", meaning: "important", category: "shorthand", expansion: "important", context: "Lecturer emphasis" },
  { term: "imp.", meaning: "important", category: "shorthand", expansion: "important", context: "Lecturer emphasis" },
  { term: "NB", meaning: "nota bene — note well", category: "abbreviation", expansion: "Note well (important)", context: "Important note" },
  { term: "nb", meaning: "nota bene — note well", category: "abbreviation", expansion: "Note well (important)", context: "Important note" },
  { term: "rev", meaning: "revise", category: "shorthand", expansion: "revise", context: "Study instruction" },
  { term: "revise", meaning: "review this topic", category: "shorthand", expansion: "review this topic thoroughly", context: "Study instruction" },
  { term: "rev.", meaning: "revise", category: "shorthand", expansion: "revise", context: "Study instruction" },
  { term: "Likely Exam", meaning: "likely to appear in exam", category: "shorthand", expansion: "This is likely to appear in the examination", context: "Exam preparation" },
  { term: "Likely Exam.", meaning: "likely to appear in exam", category: "shorthand", expansion: "This is likely to appear in the examination", context: "Exam preparation" },
  { term: "Sir said", meaning: "the lecturer said", category: "lecturer", expansion: "The lecturer said", context: "Lecturer reference" },
  { term: "Madam said", meaning: "the lecturer said", category: "lecturer", expansion: "The lecturer said", context: "Lecturer reference" },
  { term: "Dr said", meaning: "the lecturer said", category: "lecturer", expansion: "The lecturer said", context: "Lecturer reference" },
  { term: "Profe said", meaning: "the professor said", category: "lecturer", expansion: "The professor said", context: "Lecturer reference" },

  // Assessment types
  { term: "CA", meaning: "Continuous Assessment", category: "abbreviation", expansion: "Continuous Assessment", context: "Assessment type" },
  { term: "CA.", meaning: "Continuous Assessment", category: "abbreviation", expansion: "Continuous Assessment", context: "Assessment type" },
  { term: "Test", meaning: "class test", category: "abbreviation", expansion: "class test", context: "Assessment type" },
  { term: "Ass", meaning: "Assignment", category: "abbreviation", expansion: "Assignment", context: "Assessment type" },
  { term: "Ass.", meaning: "Assignment", category: "abbreviation", expansion: "Assignment", context: "Assessment type" },
  { term: "Asgmt", meaning: "Assignment", category: "abbreviation", expansion: "Assignment", context: "Assessment type" },
  { term: "Tut", meaning: "Tutorial", category: "abbreviation", expansion: "Tutorial", context: "Class type" },
  { term: "Tut.", meaning: "Tutorial", category: "abbreviation", expansion: "Tutorial", context: "Class type" },
  { term: "Lab", meaning: "Laboratory session", category: "abbreviation", expansion: "Laboratory session", context: "Class type" },
  { term: "Sem", meaning: "Seminar", category: "abbreviation", expansion: "Seminar", context: "Class type" },
  { term: "Lec", meaning: "Lecture", category: "abbreviation", expansion: "Lecture", context: "Class type" },
  { term: "Lec.", meaning: "Lecture", category: "abbreviation", expansion: "Lecture", context: "Class type" },

  // Grading
  { term: "HD", meaning: "High Distinction", category: "abbreviation", expansion: "High Distinction", context: "Grade" },
  { term: "D", meaning: "Distinction", category: "abbreviation", expansion: "Distinction", context: "Grade" },
  { term: "CR", meaning: "Credit", category: "abbreviation", expansion: "Credit", context: "Grade" },
  { term: "P", meaning: "Pass", category: "abbreviation", expansion: "Pass", context: "Grade" },
  { term: "F", meaning: "Fail", category: "abbreviation", expansion: "Fail", context: "Grade" },

  // Zambian education context
  { term: "UNZA", meaning: "University of Zambia", category: "abbreviation", expansion: "University of Zambia", context: "Institution" },
  { term: "CBU", meaning: "Copperbelt University", category: "abbreviation", expansion: "Copperbelt University", context: "Institution" },
  { term: "MUN", meaning: "Mulungushi University", category: "abbreviation", expansion: "Mulungushi University", context: "Institution" },
  { term: "ZIALE", meaning: "Zambia Institute of Advanced Legal Education", category: "abbreviation", expansion: "Zambia Institute of Advanced Legal Education", context: "Institution" },
  { term: "Examinations Council", meaning: "Examinations Council of Zambia", category: "abbreviation", expansion: "Examinations Council of Zambia (ECZ)", context: "Institution" },
  { term: "ECZ", meaning: "Examinations Council of Zambia", category: "abbreviation", expansion: "Examinations Council of Zambia", context: "Institution" },

  // British English spelling normalization (Zambia uses British English)
  { term: "colour", meaning: "color", category: "abbreviation", expansion: "color", context: "British spelling" },
  { term: "behaviour", meaning: "behavior", category: "abbreviation", expansion: "behavior", context: "British spelling" },
  { term: "organise", meaning: "organize", category: "abbreviation", expansion: "organize", context: "British spelling" },
  { term: "organised", meaning: "organized", category: "abbreviation", expansion: "organized", context: "British spelling" },
  { term: "recognise", meaning: "recognize", category: "abbreviation", expansion: "recognize", context: "British spelling" },
  { term: "analyse", meaning: "analyze", category: "abbreviation", expansion: "analyze", context: "British spelling" },
  { term: "analysed", meaning: "analyzed", category: "abbreviation", expansion: "analyzed", context: "British spelling" },
  { term: "centre", meaning: "center", category: "abbreviation", expansion: "center", context: "British spelling" },
  { term: "fibre", meaning: "fiber", category: "abbreviation", expansion: "fiber", context: "British spelling" },
  { term: "metre", meaning: "meter", category: "abbreviation", expansion: "meter", context: "British spelling" },
  { term: "litre", meaning: "liter", category: "abbreviation", expansion: "liter", context: "British spelling" },
  { term: "programme", meaning: "program", category: "abbreviation", expansion: "program", context: "British spelling" },
  { term: "catalogue", meaning: "catalog", category: "abbreviation", expansion: "catalog", context: "British spelling" },
  { term: "dialogue", meaning: "dialog", category: "abbreviation", expansion: "dialog", context: "British spelling" },
  { term: "favour", meaning: "favor", category: "abbreviation", expansion: "favor", context: "British spelling" },
  { term: "honour", meaning: "honor", category: "abbreviation", expansion: "honor", context: "British spelling" },
  { term: "labour", meaning: "labor", category: "abbreviation", expansion: "labor", context: "British spelling" },
  { term: "neighbour", meaning: "neighbor", category: "abbreviation", expansion: "neighbor", context: "British spelling" },
  { term: "flavour", meaning: "flavor", category: "abbreviation", expansion: "flavor", context: "British spelling" },
  { term: "tumour", meaning: "tumor", category: "abbreviation", expansion: "tumor", context: "British spelling" },
  { term: "defence", meaning: "defense", category: "abbreviation", expansion: "defense", context: "British spelling" },
  { term: "offence", meaning: "offense", category: "abbreviation", expansion: "offense", context: "British spelling" },
  { term: "licence", meaning: "license", category: "abbreviation", expansion: "license", context: "British spelling" },
  { term: "practise", meaning: "practice", category: "abbreviation", expansion: "practice", context: "British spelling (verb)" },
  { term: "travelling", meaning: "traveling", category: "abbreviation", expansion: "traveling", context: "British spelling" },
  { term: "cancelled", meaning: "canceled", category: "abbreviation", expansion: "canceled", context: "British spelling" },
  { term: "labelled", meaning: "labeled", category: "abbreviation", expansion: "labeled", context: "British spelling" },
  { term: "modelling", meaning: "modeling", category: "abbreviation", expansion: "modeling", context: "British spelling" },

  // Zambian local terms
  { term: "kwacha", meaning: "Zambian currency (ZMW)", category: "slang", expansion: "Zambian Kwacha (currency)", context: "Currency" },
  { term: "Kwacha", meaning: "Zambian currency (ZMW)", category: "slang", expansion: "Zambian Kwacha (currency)", context: "Currency" },
  { term: "ngwee", meaning: "Zambian coin (1/100 of Kwacha)", category: "slang", expansion: "Ngwee (Zambian coin)", context: "Currency" },
  { term: "insaka", meaning: "traditional gathering/discussion", category: "slang", expansion: "Insaka (traditional community gathering)", context: "Culture" },
  { term: "ubuntu", meaning: "humanity towards others", category: "slang", expansion: "Ubuntu (African philosophy of humanity towards others)", context: "Philosophy" },
  { term: "chibemba", meaning: "Bemba language", category: "slang", expansion: "Bemba language", context: "Language" },
  { term: "cinyanja", meaning: "Nyanja/Chewa language", category: "slang", expansion: "Nyanja (Chewa) language", context: "Language" },

  // Exam-related shorthand
  { term: "pp", meaning: "past paper", category: "shorthand", expansion: "past examination paper", context: "Exam preparation" },
  { term: "pp.", meaning: "past paper", category: "shorthand", expansion: "past examination paper", context: "Exam preparation" },
  { term: "Past paper", meaning: "past examination paper", category: "shorthand", expansion: "past examination paper", context: "Exam preparation" },
  { term: "mock", meaning: "mock examination", category: "shorthand", expansion: "mock examination (practice exam)", context: "Exam preparation" },
  { term: "Mock", meaning: "mock examination", category: "shorthand", expansion: "mock examination (practice exam)", context: "Exam preparation" },

  // Course-related
  { term: "pre-req", meaning: "prerequisite", category: "abbreviation", expansion: "prerequisite", context: "Course requirement" },
  { term: "co-req", meaning: "corequisite", category: "abbreviation", expansion: "corequisite", context: "Course requirement" },
  { term: "sem", meaning: "semester", category: "abbreviation", expansion: "semester", context: "Academic period" },
  { term: "Sem", meaning: "semester", category: "abbreviation", expansion: "semester", context: "Academic period" },
  { term: "Semester 1", meaning: "first semester", category: "abbreviation", expansion: "First Semester", context: "Academic period" },
  { term: "Semester 2", meaning: "second semester", category: "abbreviation", expansion: "Second Semester", context: "Academic period" },
  { term: "yr", meaning: "year", category: "abbreviation", expansion: "year", context: "Academic period" },
  { term: "Yr", meaning: "year", category: "abbreviation", expansion: "year", context: "Academic period" },
  { term: "1st yr", meaning: "first year", category: "abbreviation", expansion: "First Year", context: "Academic level" },
  { term: "2nd yr", meaning: "second year", category: "abbreviation", expansion: "Second Year", context: "Academic level" },
  { term: "3rd yr", meaning: "third year", category: "abbreviation", expansion: "Third Year", context: "Academic level" },
  { term: "4th yr", meaning: "fourth year", category: "abbreviation", expansion: "Fourth Year", context: "Academic level" },
  { term: "final yr", meaning: "final year", category: "abbreviation", expansion: "Final Year", context: "Academic level" },
  { term: "Final yr", meaning: "final year", category: "abbreviation", expansion: "Final Year", context: "Academic level" },

  // Common note-taking shorthand
  { term: "w/", meaning: "with", category: "shorthand", expansion: "with", context: "Note shorthand" },
  { term: "w/o", meaning: "without", category: "shorthand", expansion: "without", context: "Note shorthand" },
  { term: "b/c", meaning: "because", category: "shorthand", expansion: "because", context: "Note shorthand" },
  { term: "re:", meaning: "regarding", category: "shorthand", expansion: "regarding", context: "Note shorthand" },
  { term: "viz", meaning: "namely", category: "abbreviation", expansion: "namely", context: "Note shorthand" },
  { term: "q.v.", meaning: "which see", category: "abbreviation", expansion: "which see (cross-reference)", context: "Note shorthand" },
  { term: "cf", meaning: "compare", category: "abbreviation", expansion: "compare", context: "Note shorthand" },
  { term: "vs", meaning: "versus", category: "abbreviation", expansion: "versus", context: "Note shorthand" },
];

// Build lookup maps for speed
const TERM_MAP = new Map<string, LocalTerm>();
const TERM_REGEX_PATTERNS: { regex: RegExp; term: LocalTerm }[] = [];

for (const term of LOCAL_TERMS) {
  TERM_MAP.set(term.term.toLowerCase(), term);
  // Build regex for whole-word matching (case-sensitive for abbreviations)
  const isAbbrev = term.category === "abbreviation" || term.category === "shorthand";
  const flags = isAbbrev ? "g" : "gi";
  const escaped = term.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  TERM_REGEX_PATTERNS.push({
    regex: new RegExp(`\\b${escaped}\\b`, flags),
    term,
  });
}

// Course code pattern: 3-4 letters + 3 digits (e.g., ECO301, BIO101, CS201)
const COURSE_CODE_PATTERN = /\b([A-Z]{2,4})\s?(\d{3,4})\b/g;

/**
 * Normalize text by expanding local abbreviations, shorthand, and
 * standardizing British/Zambian English spellings.
 */
export function normalizeLocalText(text: string): NormalizedText {
  if (!text) return { text: "", expansions: [], detectedLocalisms: [], confidence: 1 };

  let normalized = text;
  const expansions: { original: string; expanded: string; category: string }[] = [];
  const detectedLocalisms: LocalTerm[] = [];
  const detectedTerms = new Set<string>();

  // 1. Expand abbreviations and shorthand
  for (const { regex, term } of TERM_REGEX_PATTERNS) {
    const r = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = r.exec(normalized)) !== null) {
      const original = match[0];
      if (detectedTerms.has(original.toLowerCase())) continue;
      detectedTerms.add(original.toLowerCase());

      detectedLocalisms.push(term);
      expansions.push({
        original,
        expanded: term.expansion,
        category: term.category,
      });
    }
  }

  // Apply expansions (replace in text)
  for (const { regex, term } of TERM_REGEX_PATTERNS) {
    // For abbreviations, be careful not to replace within larger words
    if (term.category === "abbreviation" && term.term.length <= 3) {
      // Use word-boundary matching
      normalized = normalized.replace(regex, term.expansion);
    } else if (term.category === "shorthand" || term.category === "lecturer") {
      normalized = normalized.replace(regex, term.expansion);
    } else if (term.category === "slang") {
      // Don't replace slang, just tag it
    } else {
      // British English: normalize to American for consistent processing
      normalized = normalized.replace(regex, term.expansion);
    }
  }

  // 2. Handle "Sir said X" → "The lecturer said X"
  normalized = normalized.replace(/\bSir said\b/gi, "The lecturer said");
  normalized = normalized.replace(/\bMadam said\b/gi, "The lecturer said");
  normalized = normalized.replace(/\bDr\.? said\b/gi, "The lecturer said");
  normalized = normalized.replace(/\bProf\.? said\b/gi, "The professor said");

  // 3. Handle "Important CA" → "Important Continuous Assessment"
  normalized = normalized.replace(/\bImportant CA\b/gi, "Important Continuous Assessment");
  normalized = normalized.replace(/\bCA\b(?=\s*(?:is|was|will|on|in|at|for|to)\b)/gi, "Continuous Assessment");

  // 4. Handle "Likely Exam" → "This is likely to appear in the examination"
  normalized = normalized.replace(/\bLikely Exam\b/gi, "This is likely to appear in the examination");

  // 5. Handle standalone "NB" → "Note well (important)"
  normalized = normalized.replace(/\bNB\b(?![a-z])/g, "Note well (important)");

  // 6. Handle "imp." → "important"
  normalized = normalized.replace(/\bimp\./gi, "important");

  // 7. Detect and tag course codes (don't expand, just identify)
  const courseCodes: string[] = [];
  const courseRegex = new RegExp(COURSE_CODE_PATTERN.source, "g");
  let codeMatch: RegExpExecArray | null;
  while ((codeMatch = courseRegex.exec(text)) !== null) {
    courseCodes.push(codeMatch[0]);
    detectedLocalisms.push({
      term: codeMatch[0],
      meaning: `Course code: ${codeMatch[1]} ${codeMatch[2]}`,
      category: "course_code",
      expansion: codeMatch[0], // keep as-is
      context: "Course identifier",
    });
  }

  // 8. Confidence based on how many localisms were detected vs text length
  const localismRatio = detectedLocalisms.length / Math.max(text.split(/\s+/).length, 1);
  const confidence = Math.max(0.5, 1 - localismRatio * 0.1);

  return {
    text: normalized,
    expansions,
    detectedLocalisms,
    confidence,
  };
}

/**
 * Detect if text contains local/Zambian English patterns.
 */
export function hasLocalPatterns(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return LOCAL_TERMS.some((term) => {
    const escaped = term.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(lower);
  }) || COURSE_CODE_PATTERN.test(text);
}

/**
 * Get all known local terms (for UI display or settings).
 */
export function getLocalTerms(): LocalTerm[] {
  return LOCAL_TERMS;
}
