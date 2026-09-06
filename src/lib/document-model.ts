export type DocumentBlockKind =
  | "heading"
  | "paragraph"
  | "list-item"
  | "table"
  | "formula"
  | "question"
  | "figure"
  | "unknown";

export type DocumentBlock = {
  kind: DocumentBlockKind;
  text: string;
  sourceIndex: number;
};

export type DocumentUnit = {
  index: number;
  label: string;
  extraction: "native" | "ocr" | "mixed" | "structured" | "unknown";
  text: string;
  blocks: DocumentBlock[];
  confidence: number;
};

export type AcademicDocumentModel = {
  version: 1;
  format: string;
  documentType: string;
  units: DocumentUnit[];
  headings: string[];
  formulas: string[];
  questions: string[];
  tables: string[];
  coverage: number;
  extractionConfidence: number;
  signals: {
    abnormalCharacterRatio: number;
    repeatedTokenRatio: number;
    readableUnitRatio: number;
    headingCount: number;
    formulaCount: number;
    questionCount: number;
  };
};

function classifyLine(line: string): DocumentBlockKind {
  if (/^(question\s+\d+|\d+[.)]\s+|[a-z][.)]\s+)/i.test(line)) return "question";
  if (/^(?:[-*•]|\d+[.)])\s+/.test(line)) return "list-item";
  if (/\b(?:det|var|lim|sum|sqrt|lambda|pi|mu|sigma)\b|[=∑√λπ]|\^\d|\b[A-Z]\s*=\s*/i.test(line)) return "formula";
  if (/\|.+\||\t.+\t/.test(line)) return "table";
  if (line.length <= 100 && (/^[A-Z\d][A-Z\d\s:&(),'-]+$/.test(line) || /^(unit|chapter|topic|lecture|slide|section)\b/i.test(line))) return "heading";
  return "paragraph";
}

function qualitySignals(text: string) {
  const chars = Array.from(text);
  const abnormal = chars.filter((c) => /[�□■]|[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F\u0370-\u03FF\u2000-\u206F]/u.test(c)).length;
  const words = text.toLowerCase().match(/[a-z]{2,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const repeated = Array.from(counts.values()).filter((count) => count > 12).reduce((sum, count) => sum + count - 12, 0);
  return {
    abnormalCharacterRatio: chars.length ? abnormal / chars.length : 1,
    repeatedTokenRatio: words.length ? repeated / words.length : 1,
  };
}

export function buildAcademicDocumentModel(input: {
  format: string;
  documentType?: string;
  units: Array<{ label: string; text: string; extraction?: DocumentUnit["extraction"]; confidence?: number }>;
}): AcademicDocumentModel {
  const units: DocumentUnit[] = input.units.map((unit, index) => {
    const blocks = unit.text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text, sourceIndex) => ({ kind: classifyLine(text), text, sourceIndex }));
    return {
      index: index + 1,
      label: unit.label,
      extraction: unit.extraction ?? "unknown",
      text: unit.text,
      blocks,
      confidence: unit.confidence ?? (unit.text.length >= 25 ? 0.9 : 0.1),
    };
  });
  const allBlocks = units.flatMap((unit) => unit.blocks);
  const text = units.map((unit) => unit.text).join("\n");
  const signals = qualitySignals(text);
  const readableUnits = units.filter((unit) => unit.text.trim().length >= 20).length;
  const readableUnitRatio = units.length ? readableUnits / units.length : 0;
  const averageUnitConfidence = units.length ? units.reduce((sum, unit) => sum + unit.confidence, 0) / units.length : 0;
  const structureBonus = Math.min(0.12, allBlocks.filter((block) => block.kind !== "paragraph").length / Math.max(100, allBlocks.length * 8));
  const extractionConfidence = Math.max(
    0,
    Math.min(1, averageUnitConfidence * 0.55 + readableUnitRatio * 0.35 + structureBonus - signals.abnormalCharacterRatio * 2 - signals.repeatedTokenRatio),
  );
  return {
    version: 1,
    format: input.format,
    documentType: input.documentType ?? "unknown",
    units,
    headings: allBlocks.filter((block) => block.kind === "heading").map((block) => block.text).slice(0, 100),
    formulas: allBlocks.filter((block) => block.kind === "formula").map((block) => block.text).slice(0, 100),
    questions: allBlocks.filter((block) => block.kind === "question").map((block) => block.text).slice(0, 200),
    tables: allBlocks.filter((block) => block.kind === "table").map((block) => block.text).slice(0, 100),
    coverage: readableUnitRatio,
    extractionConfidence: Math.round(extractionConfidence * 100) / 100,
    signals: {
      ...signals,
      readableUnitRatio,
      headingCount: allBlocks.filter((block) => block.kind === "heading").length,
      formulaCount: allBlocks.filter((block) => block.kind === "formula").length,
      questionCount: allBlocks.filter((block) => block.kind === "question").length,
    },
  };
}

export function serializeDocumentForStudy(model: AcademicDocumentModel): string {
  return model.units
    .map((unit) => `=== ${unit.label} ===\n${unit.blocks.map((block) => `[${block.kind}] ${block.text}`).join("\n")}`)
    .join("\n\n");
}