// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Formula Extraction & Analysis
// Extracts mathematical, chemical, and physics formulas from text.
// Converts to LaTeX-like representation, identifies variables,
// and generates formula-based flashcards and quiz questions.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import type { ExtractedFormula } from "./types";

/**
 * Extract formulas from text. Detects:
 * - Inline math: $...$ or \(...\)
 * - Display math: $$...$$ or \[...\]
 * - Plain-text formulas: E = mc², F = ma, etc.
 * - Chemical equations: H₂O → 2H₂ + O₂
 * - Logic expressions: A ∧ B → C
 */
export function extractFormulas(text: string): ExtractedFormula[] {
  if (!text) return [];

  const formulas: ExtractedFormula[] = [];
  let position = 0;

  // 1. Extract LaTeX-style formulas: $...$ and $$...$$
  const latexInline = text.match(/\$([^$\n]+)\$/g) || [];
  const latexDisplay = text.match(/\$\$([^$]+)\$\$/g) || [];
  const latexParen = text.match(/\\\(([^)]+)\\\)/g) || [];
  const latexBracket = text.match(/\\\[([^\]]+)\\\]/g) || [];

  for (const match of [...latexDisplay, ...latexBracket]) {
    const raw = match.replace(/\$+|\\\[\]|\\\]|\$/g, "").trim();
    if (raw.length < 2) continue;
    formulas.push({
      raw,
      latex: raw,
      type: classifyFormula(raw),
      variables: extractVariables(raw),
      description: findNearbyDescription(text, match),
      context: findContext(text, match),
      position: position++,
    });
  }

  for (const match of [...latexInline, ...latexParen]) {
    const raw = match.replace(/\$+|\\\(|\\\)/g, "").trim();
    if (raw.length < 2) continue;
    formulas.push({
      raw,
      latex: raw,
      type: classifyFormula(raw),
      variables: extractVariables(raw),
      description: findNearbyDescription(text, match),
      context: findContext(text, match),
      position: position++,
    });
  }

  // 2. Extract plain-text formulas: X = Y patterns
  // Match patterns like: E = mc², F = ma, v = u + at, etc.
  const plainFormulaPattern = /(?:^|\s)([A-Za-z][A-Za-z0-9\s\^√∑∫∏÷×±≈≠≤≥∞∂∇∇²³⁴⁵⁶⁷⁸⁹⁰₁₂₃₄₅₆₇₈₉₀().,/+\-*=√]+=[^.\n]{2,80})/g;
  const plainMatches = text.match(plainFormulaPattern) || [];

  for (const match of plainMatches) {
    const raw = match.trim();
    // Filter out non-formula matches (assignments, comparisons in prose)
    if (isLikelyFormula(raw)) {
      formulas.push({
        raw,
        latex: plainToLatex(raw),
        type: classifyFormula(raw),
        variables: extractVariables(raw),
        description: findNearbyDescription(text, raw),
        context: findContext(text, raw),
        position: position++,
      });
    }
  }

  // 3. Extract chemical equations
  const chemPattern = /(?:^|\s)((?:[A-Z][a-z]?\d*\s*(?:[→←⇌\->]+|reacts\s+with)\s*)+[A-Z][a-z]?\d*(?:\s*[→←⇌\->]+\s*[A-Z][a-z]?\d*)+)/g;
  const chemMatches = text.match(chemPattern) || [];
  for (const match of chemMatches) {
    const raw = match.trim();
    if (raw.length < 5) continue;
    formulas.push({
      raw,
      latex: null,
      type: "chemical",
      variables: extractChemicalComponents(raw),
      description: findNearbyDescription(text, raw),
      context: findContext(text, raw),
      position: position++,
    });
  }

  // 4. Extract physics laws (named formulas with context)
  const physicsLawPattern = /((?:Newton|Ohm|Einstein|Coulomb|Kirchhoff|Boyle|Charles|Planck|Faraday|Lenz|Snell|Hooke|Stefan|Wien|Gauss|Ampere|Maxwell|Bernoulli|Archimedes|Pascal|Avogadro|Beer|Lambert)\s*(?:'s)?\s*(?:law|equation|principle|rule)?[^.\n]{5,100})/gi;
  const physicsMatches = text.match(physicsLawPattern) || [];
  for (const match of physicsMatches) {
    const raw = match.trim();
    formulas.push({
      raw,
      latex: null,
      type: "physics",
      variables: extractVariables(raw),
      description: findNearbyDescription(text, raw),
      context: findContext(text, raw),
      position: position++,
    });
  }

  // Deduplicate by raw formula text
  const seen = new Set<string>();
  return formulas.filter((f) => {
    const key = f.raw.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Classify a formula as math, chemical, physics, or logic.
 */
function classifyFormula(raw: string): "math" | "chemical" | "physics" | "logic" | "unknown" {
  const lower = raw.toLowerCase();

  // Chemical: contains element symbols and arrows
  if (/[A-Z][a-z]?\d*.*[→←⇌]/.test(raw) || /\b(?:H[2-9]?O|CO[2-9]?|NaCl|HCl|H[2-9]SO[2-9]|NaOH|KOH|CH[2-9]?|C[2-9]H[2-9]?|O[2-9]?|N[2-9]?|NH[2-9]?)\b/.test(raw)) {
    return "chemical";
  }

  // Logic: contains logical operators
  if (/[∧∨¬→↔⇒⇔∀∃]/.test(raw) || /\b(?:AND|OR|NOT|IMPLIES|IFF|XOR)\b/i.test(raw)) {
    return "logic";
  }

  // Physics: contains physics constants or units
  if (/\b(?:c|m|g|G|h|k|e|F|E|p|v|a|t|T|P|V|I|R|Q|W|λ|ν|μ|σ|ε|ρ|ω|α|β|γ|θ|φ|ψ|τ|η|Φ|Ψ|Ω)\b.*[=≈]/.test(raw) &&
      /\b(?:m\/s|kg|N|J|W|Pa|Hz|V|A|Ω|C|T|Wb|lm|cd|mol|K|°C|eV|dyn|erg|bar|atm|torr|cal|BTU|hp|dB|rad|sr)\b/.test(raw)) {
    return "physics";
  }

  // Math: contains math operators or symbols
  if (/[∑∫∏∂∇√∞±≈≠≤≥αβγδεζηθλμπρσφψω]/.test(raw) || /[a-z]\s*[=]\s*[a-z0-9]/i.test(raw)) {
    return "math";
  }

  return "unknown";
}

/**
 * Extract variable names from a formula.
 */
function extractVariables(raw: string): string[] {
  const variables = new Set<string>();

  // Single letter variables: E, m, c, F, v, etc.
  const singleLetter = raw.match(/\b([a-zA-Z])(?!\w)/g) || [];
  for (const v of singleLetter) {
    // Skip common non-variable words
    if (!["a", "A", "I", "x", "y", "z", "n", "N", "t", "T", "f", "F", "g", "G", "k", "K", "c", "C", "v", "V", "p", "P", "E", "e", "m", "M", "r", "R", "s", "S", "h", "H", "d", "D", "u", "U", "w", "W", "l", "L", "i", "I", "j", "J", "q", "Q", "λ", "μ", "σ", "ρ", "ω", "α", "β", "γ", "θ", "φ", "ψ", "τ", "η", "Δ", "Σ", "Π", "∫"].includes(v)) continue;
    variables.add(v);
  }

  // Subscripted variables: v_0, T_c, etc.
  const subscripted = raw.match(/([a-zA-Z])_([a-zA-Z0-9])/g) || [];
  for (const v of subscripted) variables.add(v);

  // Greek letters
  const greek = raw.match(/[αβγδεζηθικλμνξπρστυφχψω]/g) || [];
  for (const v of greek) variables.add(v);

  return [...variables];
}

/**
 * Extract chemical components from a chemical equation.
 */
function extractChemicalComponents(raw: string): string[] {
  const elements = raw.match(/[A-Z][a-z]?\d*/g) || [];
  return [...new Set(elements)];
}

/**
 * Convert plain-text formula to a LaTeX-like representation.
 */
function plainToLatex(raw: string): string {
  let latex = raw;

  // Superscripts: x² → x^2
  latex = latex.replace(/([a-zA-Z0-9)])([²³⁴⁵⁶⁷⁸⁹⁰¹])/g, (match, base, sup) => {
    const map: Record<string, string> = { "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁰": "0", "¹": "1" };
    return `${base}^{${map[sup] ?? sup}}`;
  });

  // Subscripts: H₂O → H_2O
  latex = latex.replace(/[₂₃₄₅₆₇₈₉₀₁]/g, (match) => {
    const map: Record<string, string> = { "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "₀": "0", "₁": "1" };
    return `_${map[match] ?? match}`;
  });

  // Greek letters
  const greekMap: Record<string, string> = {
    "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta", "ε": "\\epsilon",
    "θ": "\\theta", "λ": "\\lambda", "μ": "\\mu", "ν": "\\nu", "π": "\\pi",
    "ρ": "\\rho", "σ": "\\sigma", "τ": "\\tau", "φ": "\\phi", "ω": "\\omega",
    "Δ": "\\Delta", "Σ": "\\Sigma", "Π": "\\Pi", "Ω": "\\Omega", "Φ": "\\Phi",
  };
  for (const [greek, latexEq] of Object.entries(greekMap)) {
    latex = latex.replace(new RegExp(greek, "g"), latexEq);
  }

  // Operators
  latex = latex.replace(/×/g, "\\times").replace(/÷/g, "\\div");
  latex = latex.replace(/√/g, "\\sqrt").replace(/∑/g, "\\sum");
  latex = latex.replace(/∫/g, "\\int").replace(/∏/g, "\\prod");
  latex = latex.replace(/∞/g, "\\infty").replace(/±/g, "\\pm");
  latex = latex.replace(/≈/g, "\\approx").replace(/≠/g, "\\neq");
  latex = latex.replace(/≤/g, "\\leq").replace(/≥/g, "\\geq");
  latex = latex.replace(/∂/g, "\\partial").replace(/∇/g, "\\nabla");

  return latex;
}

/**
 * Check if a string is likely a formula (not just prose with an equals sign).
 */
function isLikelyFormula(raw: string): boolean {
  const trimmed = raw.trim();

  // Must contain an equals sign
  if (!trimmed.includes("=")) return false;

  // Must be short enough to be a formula
  if (trimmed.length > 100) return false;

  // Must have math-like characters
  const hasMathChars = /[a-zA-Z]\s*[=]\s*[a-zA-Z0-9]/.test(trimmed) ||
    /[∑∫∏∂∇√∞±≈≠≤≥²³⁴⁵⁶⁷⁸⁹⁰]/.test(trimmed) ||
    /[a-zA-Z]\d/.test(trimmed) ||
    /[αβγδεζηθλμπρσφψωΔΣΠΩ]/.test(trimmed);

  // Must NOT be prose (no long words on both sides)
  const sides = trimmed.split("=");
  if (sides.length !== 2) return false;
  const leftWords = sides[0].trim().split(/\s+/);
  const rightWords = sides[1].trim().split(/\s+/);

  // If either side has more than 4 words, it's probably prose
  if (leftWords.length > 4 || rightWords.length > 4) return false;

  return hasMathChars;
}

/**
 * Find a description of a formula in nearby text.
 * Looks for patterns like "where E is energy", "E represents energy".
 */
function findNearbyDescription(text: string, formula: string): string | null {
  const idx = text.indexOf(formula);
  if (idx === -1) return null;

  // Look in the 300 chars after the formula for "where X is..." patterns
  const after = text.slice(idx + formula.length, idx + formula.length + 300);
  const whereMatch = after.match(/where\s+(.+?)(?:[.;]|\n)/i);
  if (whereMatch) return whereMatch[1].trim();

  // Look before the formula for "The formula for X is..."
  const before = text.slice(Math.max(0, idx - 200), idx);
  const beforeMatch = before.match(/(?:formula|equation|expression)\s+for\s+(.+?)\s+(?:is|:)/i);
  if (beforeMatch) return beforeMatch[1].trim();

  return null;
}

/**
 * Get the surrounding sentence as context.
 */
function findContext(text: string, formula: string): string | null {
  const idx = text.indexOf(formula);
  if (idx === -1) return null;

  // Find sentence boundaries
  let start = idx;
  while (start > 0 && !/[.!?]\s/.test(text[start - 1])) start--;
  let end = idx + formula.length;
  while (end < text.length && !/[.!?]/.test(text[end])) end++;

  return text.slice(start, end + 1).trim();
}

/**
 * Generate a flashcard question from a formula.
 */
export function formulaToFlashcard(formula: ExtractedFormula): { question: string; answer: string } {
  if (formula.description) {
    return {
      question: `What is the formula for ${formula.description}?`,
      answer: formula.raw,
    };
  }

  if (formula.type === "chemical") {
    return {
      question: `Complete the chemical equation: ${formula.raw.split(/[→←⇌]/)[0]?.trim()} → ?`,
      answer: formula.raw.split(/[→←⇌]/)[1]?.trim() ?? formula.raw,
    };
  }

  if (formula.variables.length > 0) {
    return {
      question: `What does the formula "${formula.raw}" represent? What are the variables?`,
      answer: `Variables: ${formula.variables.join(", ")}. ${formula.context ?? ""}`,
    };
  }

  return {
    question: `What is the formula: ${formula.raw}?`,
    answer: formula.context ?? formula.raw,
  };
}

/**
 * Generate a quiz question from a formula.
 */
export function formulaToQuizQuestion(
  formula: ExtractedFormula,
  otherFormulas: ExtractedFormula[],
): { question: string; options: string[]; correctIndex: number; explanation: string } | null {
  if (!formula.description && !formula.context) return null;

  const question = formula.description
    ? `Which formula represents ${formula.description}?`
    : `Which formula is associated with the following: "${formula.context?.slice(0, 80)}..."?`;

  const correct = formula.raw;
  const distractors = otherFormulas
    .filter((f) => f.raw !== formula.raw && f.type === formula.type)
    .slice(0, 3)
    .map((f) => f.raw);

  // Pad with generic distractors if not enough
  while (distractors.length < 3) {
    distractors.push(`N/A ${distractors.length + 1}`);
  }

  const options = [correct, ...distractors];
  // Shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  const correctIndex = options.indexOf(correct);

  return {
    question,
    options,
    correctIndex,
    explanation: `The correct formula is: ${formula.raw}. ${formula.context ?? ""}`,
  };
}
