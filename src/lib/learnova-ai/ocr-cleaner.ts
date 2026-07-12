// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — OCR Cleanup & Text Normalization
// Cleans messy OCR output: fixes broken words, recovers sentence
// boundaries, removes artifacts, reconstructs hyphenated words,
// fixes encoding issues, and normalizes whitespace.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

export interface OcrCleanupResult {
  cleaned: string;
  originalLength: number;
  cleanedLength: number;
  fixesApplied: string[];
  qualityScore: number; // 0-1, estimated quality after cleanup
}

/**
 * Clean up messy OCR text. Applies a pipeline of fixes:
 * 1. Encoding artifact removal
 * 2. Hyphenated line-break recovery
 * 3. Broken word merging (spaces inside words)
 * 4. Sentence boundary reconstruction
 * 5. Artifact character removal
 * 6. Whitespace normalization
 * 7. Common OCR character confusion fixes
 * 8. Duplicate line removal
 */
export function cleanOcrText(text: string): OcrCleanupResult {
  if (!text) return { cleaned: "", originalLength: 0, cleanedLength: 0, fixesApplied: [], qualityScore: 0 };

  const fixes: string[] = [];
  let result = text;
  const originalLength = text.length;

  // 1. Fix encoding artifacts
  const encodingBefore = result.length;
  result = result
    .replace(/[\uFFFD\u00BF]/g, "") // replacement chars
    .replace(/\u2018|\u2019/g, "'") // smart quotes → straight
    .replace(/\u201C|\u201D/g, '"') // smart double quotes
    .replace(/\u2013|\u2014/g, "-") // en/em dash → hyphen
    .replace(/\u2026/g, "...") // ellipsis
    .replace(/\u00A0/g, " ") // non-breaking space
    .replace(/\u2022|\u25CF|\u25AA|\u25AB/g, "• ") // bullet points
    .replace(/[\u200B-\u200F\uFEFF]/g, ""); // zero-width chars
  if (result.length !== encodingBefore) fixes.push("encoding artifacts");

  // 2. Fix common OCR character confusions
  const ocrConfusions: [RegExp, string | ((match: string) => string)][] = [
    // rn → m (very common OCR error)
    [/\brn(?=ing|ed|s\b)/g, "m"],
    // 0 → o in words
    [/\b(\w*)0(\w*)\b/g, (match: string) => {
      // Only fix if the word with 'o' is more likely a real word
      if (/^[a-z]+$/.test(match.replace("0", "o")) && /\d/.test(match)) {
        return match.replace(/0/g, "o");
      }
      return match;
    }],
    // l → I at start of words (common in some fonts)
    // Skip — too risky, causes false positives
    // | → l or I
    [/\|/g, "l"],
    // ~ → - (sometimes OCR misreads hyphens)
    [/\s~\s/g, " - "],
    // @ → a (rare but happens)
    [/\b@(\w)/g, "a$1"],
    // Fix broken apostrophes: don_t → don't
    [/(\w)['_](t|s|re|ve|ll|m|d)\b/gi, "$1'$2"],
    // Fix = → - in non-math contexts
    [/(?<!\d)\s=\s/g, " - "],
  ];
  for (const [pattern, replacement] of ocrConfusions) {
    const before = result;
    result = result.replace(pattern, replacement as string);
    if (before !== result) { fixes.push("OCR character confusion"); break; }
  }

  // 3. Recover hyphenated line breaks: "comp-\nuter" → "computer"
  const hyphenBefore = result;
  result = result.replace(/(\w)-\s*\n\s*(\w)/g, "$1$2");
  // Also handle soft hyphens at line ends without explicit hyphen
  result = result.replace(/(\w)\s*\n\s*([a-z])/g, (match, first, second) => {
    // Only merge if the first line ends with a partial word (no sentence-ending punctuation)
    if (/[.!?;:]/.test(first[first.length - 1])) return match;
    // Check if merging creates a known pattern (longer word)
    const merged = first + second;
    if (merged.length > 3 && merged.length < 20) return merged;
    return match;
  });
  if (result !== hyphenBefore) fixes.push("hyphenated line breaks");

  // 4. Merge broken words: "com puter" → "computer"
  // This happens when OCR inserts spaces mid-word
  const brokenBefore = result;
  result = result.replace(/(\w)\s{1,2}(\w)\b/g, (match, a, b) => {
    // Only merge very short fragments (1-2 chars) that look like word fragments
    if (a.length <= 2 && b.length <= 2) return a + b;
    // Merge if the combined word looks more natural
    const combined = a + b;
    // Heuristic: if a is 1-2 chars and doesn't end a common word
    if (a.length <= 2 && !["is", "am", "be", "do", "go", "no", "so", "to", "of", "in", "on", "at", "or", "as", "by", "he", "we", "me", "us", "it", "an", "if", "my", "up"].includes(a.toLowerCase())) {
      return combined;
    }
    return match;
  });
  if (result !== brokenBefore) fixes.push("broken word merging");

  // 5. Remove OCR artifact lines (headers, footers, page numbers)
  const artifactBefore = result;
  result = result
    // Remove standalone page numbers
    .replace(/^\s*\d{1,4}\s*$/gm, "")
    // Remove repeated header/footer patterns
    .replace(/^(Page|Pg|P\.)\s*\d+/gim, "")
    // Remove standalone special character lines
    .replace(/^\s*[^\w\s]{3,}\s*$/gm, "")
    // Remove "Figure X." without content (artifact)
    .replace(/^Figure\s+\d+\.?\s*$/gim, "")
    // Remove "Table X." without content
    .replace(/^Table\s+\d+\.?\s*$/gim, "");
  if (result !== artifactBefore) fixes.push("artifact removal");

  // 6. Remove duplicate consecutive lines (common in scanned docs)
  const dedupBefore = result;
  const lines = result.split("\n");
  const deduped: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const prevTrimmed = deduped.length > 0 ? deduped[deduped.length - 1].trim() : "";
    if (trimmed && trimmed === prevTrimmed && trimmed.length > 10) {
      // Skip duplicate
      continue;
    }
    deduped.push(lines[i]);
  }
  result = deduped.join("\n");
  if (result !== dedupBefore) fixes.push("duplicate line removal");

  // 7. Normalize whitespace
  const wsBefore = result;
  result = result
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "")
    .trim();
  if (result !== wsBefore) fixes.push("whitespace normalization");

  // 8. Reconstruct sentence boundaries
  // OCR often merges sentences without proper spacing
  const sentBefore = result;
  result = result
    // Add space after period if missing (but not for decimals or abbreviations)
    .replace(/\.([A-Z])/g, ". $1")
    // Add space after question mark / exclamation if missing
    .replace(/([?!])([A-Z""'])/g, "$1 $2")
    // Fix comma spacing
    .replace(/,([^\s\d])/g, ", $1")
    // Fix colon spacing
    .replace(/:([^\s\d])/g, ": $1")
    // Fix semicolon spacing
    .replace(/;([^\s])/g, "; $1");
  if (result !== sentBefore) fixes.push("sentence boundary reconstruction");

  // 9. Fix common OCR word substitutions using context
  const contextBefore = result;
  const commonFixes: [RegExp, string][] = [
    [/\bth e\b/gi, "the"],
    [/\btha t\b/gi, "that"],
    [/\bo f\b/gi, "of"],
    [/\ba nd\b/gi, "and"],
    [/\bi n\b/gi, "in"],
    [/\bt o\b/gi, "to"],
    [/\bi s\b/gi, "is"],
    [/\ba t\b/gi, "at"],
    [/\bi t\b/gi, "it"],
    [/\bo r\b/gi, "or"],
    [/\ba s\b/gi, "as"],
    [/\bfo r\b/gi, "for"],
    [/\bno t\b/gi, "not"],
    [/\bwi th\b/gi, "with"],
    [/\bthi s\b/gi, "this"],
    [/\bha ve\b/gi, "have"],
    [/\bbe en\b/gi, "been"],
    [/\bwhic h\b/gi, "which"],
    [/\bwher e\b/gi, "where"],
    [/\bwhe n\b/gi, "when"],
    [/\bwha t\b/gi, "what"],
    [/\bfromthe\b/gi, "from the"],
    [/\bofthe\b/gi, "of the"],
    [/\btothe\b/gi, "to the"],
    [/\binthe\b/gi, "in the"],
    [/\bforthe\b/gi, "for the"],
    [/\bonthe\b/gi, "on the"],
    [/\bbythe\b/gi, "by the"],
    [/\bathe\b/gi, "a the"],
    [/\bandthe\b/gi, "and the"],
    [/\bisthe\b/gi, "is the"],
    [/\bthatthe\b/gi, "that the"],
  ];
  for (const [pattern, replacement] of commonFixes) {
    result = result.replace(pattern, replacement);
  }
  if (result !== contextBefore) fixes.push("word substitution");

  // Calculate quality score
  const cleanedLength = result.length;
  const ratio = cleanedLength / Math.max(originalLength, 1);
  const hasReasonableContent = result.split(/\s+/).filter((w) => w.length > 3).length > 10;
  const qualityScore = hasReasonableContent ? Math.min(1, ratio * 0.8 + 0.2) : 0.3;

  return {
    cleaned: result,
    originalLength,
    cleanedLength,
    fixesApplied: fixes,
    qualityScore,
  };
}

/**
 * Detect if text likely came from OCR (has common OCR artifacts).
 */
export function isLikelyOcr(text: string): boolean {
  if (!text) return false;
  let ocrSignals = 0;

  // Check for common OCR artifacts
  if (/\uFFFD/.test(text)) ocrSignals++; // replacement chars
  if (/\|/.test(text) && !/\|\|/.test(text)) ocrSignals++; // pipe instead of l
  if (/\b\w{1,2}\s\w{1,2}\s\w{1,2}\b/.test(text)) ocrSignals++; // broken words
  if (/^\s*\d{1,4}\s*$/m.test(text)) ocrSignals++; // page numbers
  if (/\w-\n\w/.test(text)) ocrSignals++; // hyphenated breaks
  if (/\bth e\b/i.test(text)) ocrSignals++; // broken common words
  if (/[~@]{2,}/.test(text)) ocrSignals++; // artifact characters
  if (/[\u200B-\u200F]/.test(text)) ocrSignals++; // zero-width chars

  // Low ratio of actual words to total tokens
  const tokens = text.split(/\s+/);
  const wordRatio = tokens.filter((t) => /^[a-zA-Z]{3,}$/.test(t)).length / Math.max(tokens.length, 1);
  if (wordRatio < 0.4) ocrSignals++;

  return ocrSignals >= 2;
}

/**
 * Estimate OCR confidence based on text quality indicators.
 */
export function estimateOcrConfidence(text: string): number {
  if (!text || text.trim().length < 10) return 0;

  let score = 0.5; // start at 50%

  // Good indicators
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 15);
  if (sentences.length > 3) score += 0.1;
  if (sentences.length > 10) score += 0.1;

  // Words with proper length distribution
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / Math.max(words.length, 1);
  if (avgWordLen >= 4 && avgWordLen <= 8) score += 0.1;

  // Bad indicators
  if (/\uFFFD/.test(text)) score -= 0.15;
  if (/\b\w\s\w\s\w\b/.test(text)) score -= 0.1; // broken words
  if (/^\s*\d+\s*$/m.test(text)) score -= 0.05; // page numbers

  // Ratio of real words
  const realWords = words.filter((w) => /^[a-zA-Z']{2,}$/.test(w)).length;
  const realRatio = realWords / Math.max(words.length, 1);
  if (realRatio < 0.5) score -= 0.15;
  if (realRatio > 0.7) score += 0.1;

  return Math.max(0, Math.min(1, score));
}
