// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Reference & Table Extractor
// Parses academic references (APA, MLA, Chicago, Harvard styles),
// extracts tables from text, and detects figure/image references.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import type { ExtractedReference, ExtractedTable, FigureDescription } from "./types";

/**
 * Extract academic references from text.
 * Supports APA, MLA, Chicago, Harvard, and numeric [1] citation styles.
 */
export function extractReferences(text: string): ExtractedReference[] {
  if (!text) return [];

  const references: ExtractedReference[] = [];
  const seen = new Set<string>();

  // Find the references section (if any)
  const refSectionMatch = text.match(/(?:^|\n)\s*(References|Bibliography|Works\s+Cited|REFERENCES|BIBLIOGRAPHY)\s*[:.]?\s*\n([\s\S]*?)(?:\n\s*(?:Appendix|Appendices|Acknowledg|Supplementary|$))/i);
  const refSection = refSectionMatch ? refSectionMatch[2] : text;

  // APA style: Author, A. A., & Author, B. B. (Year). Title. Source.
  const apaPattern = /([A-Z][a-z]+,\s+[A-Z]\.(?:\s*[A-Z]\.)?(?:,\s*&\s*[A-Z][a-z]+,\s+[A-Z]\.(?:\s*[A-Z]\.)?)*)\s*\((\d{4})\)\.\s*(.+?)\.\s*(.+?)\./g;

  // MLA style: Author. "Title." Source, Year.
  const mlaPattern = /([A-Z][a-z]+(?:,\s+[A-Z][a-z]+)?)\.\s*"(.+?)"\.\s*(.+?),\s*(\d{4})\./g;

  // Numeric: [1] Author, Title, Source, Year.
  const numericPattern = /\[(\d+)\]\s+([A-Z][^.\n]+)\.\s+([^.\n]+)\.\s*(?:(\d{4}))?/g;

  // Harvard: Author, A. Year. Title. Source.
  const harvardPattern = /([A-Z][a-z]+,\s+[A-Z]\.(?:\s*[A-Z]\.)?)\s*(\d{4})\s+(.+?)\.\s*(.+?)\./g;

  // Inline citations: (Author, 2023) or (Author et al., 2023)
  const inlinePattern = /\(([A-Z][a-z]+(?:\s+et\s+al\.?)?,\s+(\d{4}))\)/g;

  // URL-based references
  const urlPattern = /(https?:\/\/[^\s]+)/g;

  // Process APA
  let match: RegExpExecArray | null;
  const apaRegex = new RegExp(apaPattern.source, "g");
  while ((match = apaRegex.exec(refSection)) !== null) {
    const raw = match[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    references.push({
      raw,
      authors: match[1].split(/,\s*&\s*|,\s*/).map((a) => a.trim()),
      title: match[3]?.trim() ?? null,
      year: parseInt(match[2]) || null,
      source: match[4]?.trim() ?? null,
      type: "journal",
    });
  }

  // Process MLA
  const mlaRegex = new RegExp(mlaPattern.source, "g");
  while ((match = mlaRegex.exec(refSection)) !== null) {
    const raw = match[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    references.push({
      raw,
      authors: [match[1].trim()],
      title: match[2]?.trim() ?? null,
      year: parseInt(match[4]) || null,
      source: match[3]?.trim() ?? null,
      type: "book",
    });
  }

  // Process numeric
  const numRegex = new RegExp(numericPattern.source, "g");
  while ((match = numRegex.exec(refSection)) !== null) {
    const raw = match[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    references.push({
      raw,
      authors: match[2]?.split(/,\s*/).map((a) => a.trim()) ?? [],
      title: match[3]?.trim() ?? null,
      year: match[4] ? parseInt(match[4]) : null,
      source: null,
      type: "unknown",
    });
  }

  // Process Harvard
  const harvardRegex = new RegExp(harvardPattern.source, "g");
  while ((match = harvardRegex.exec(refSection)) !== null) {
    const raw = match[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    references.push({
      raw,
      authors: [match[1].trim()],
      title: match[3]?.trim() ?? null,
      year: parseInt(match[2]) || null,
      source: match[4]?.trim() ?? null,
      type: "journal",
    });
  }

  // Process inline citations
  const inlineRegex = new RegExp(inlinePattern.source, "g");
  while ((match = inlineRegex.exec(text)) !== null) {
    const raw = match[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    references.push({
      raw,
      authors: [match[1].split(",")[0].trim()],
      title: null,
      year: parseInt(match[2]) || null,
      source: null,
      type: "unknown",
    });
  }

  // Process URLs
  const urlRegex = new RegExp(urlPattern.source, "g");
  while ((match = urlRegex.exec(text)) !== null) {
    const raw = match[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    references.push({
      raw,
      authors: [],
      title: null,
      year: null,
      source: raw,
      type: "web",
    });
  }

  return references;
}

/**
 * Extract tables from text.
 * Detects pipe-delimited, tab-delimited, and aligned-column tables.
 */
export function extractTables(text: string): ExtractedTable[] {
  if (!text) return [];

  const tables: ExtractedTable[] = [];
  const lines = text.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Detect table start: pipe-delimited or multiple tabs
    if (line.includes("|") && line.split("|").length >= 3) {
      // Pipe-delimited table
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      const table = parsePipeTable(tableLines);
      if (table) {
        // Look for a caption before the table
        const captionIdx = i - tableLines.length - 1;
        const caption = captionIdx >= 0 ? lines[captionIdx].trim() : null;
        table.caption = caption;
        tables.push(table);
      }
      continue;
    }

    // Detect aligned-column tables (lines with multiple spaces between columns)
    if (line.length > 20 && /\s{3,}/.test(line) && i + 1 < lines.length) {
      const nextLine = lines[i + 1]?.trim() ?? "";
      if (nextLine.length > 20 && /\s{3,}/.test(nextLine)) {
        // Possible aligned table
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().length > 10 && /\s{3,}/.test(lines[i].trim())) {
          tableLines.push(lines[i].trim());
          i++;
        }
        const table = parseAlignedTable(tableLines);
        if (table && table.rows.length > 1) {
          tables.push(table);
        }
        continue;
      }
    }

    // Detect "Table N." captions
    const tableCaptionMatch = line.match(/^Table\s+(\d+)[.:]\s*(.*)$/i);
    if (tableCaptionMatch) {
      const figureNumber = tableCaptionMatch[1];
      const title = tableCaptionMatch[2]?.trim() || null;
      // Look for table content in next few lines
      i++;
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^Table\s+\d+/i.test(lines[i].trim()) && !/^Figure\s+\d+/i.test(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
        if (tableLines.length > 30) break;
      }
      if (tableLines.length > 0) {
        const table = tableLines.some((l) => l.includes("|"))
          ? parsePipeTable(tableLines)
          : parseAlignedTable(tableLines);
        if (table) {
          table.title = title;
          tables.push(table);
        }
      }
      continue;
    }

    i++;
  }

  return tables;
}

/**
 * Parse a pipe-delimited table.
 */
function parsePipeTable(lines: string[]): ExtractedTable | null {
  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] => {
    return line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell !== "" || true); // keep empty cells
  };

  // Check if second line is a separator (---|---|---)
  const isSeparator = (line: string) => /^[\s|-]+$/.test(line) && line.includes("-");

  let headers: string[];
  let dataStart = 1;

  if (isSeparator(lines[1])) {
    headers = parseRow(lines[0]);
    dataStart = 2;
  } else {
    headers = parseRow(lines[0]);
    dataStart = 1;
  }

  const rows: string[][] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    if (row.length === headers.length || row.length > 0) {
      rows.push(row);
    }
  }

  if (headers.length === 0 || rows.length === 0) return null;

  return { title: null, headers, rows, caption: null };
}

/**
 * Parse an aligned-column table (columns separated by multiple spaces).
 */
function parseAlignedTable(lines: string[]): ExtractedTable | null {
  if (lines.length < 2) return null;

  // Detect column positions from the first line
  const firstLine = lines[0];
  const colPositions: number[] = [];
  let inSpace = false;
  let colStart = 0;

  for (let j = 0; j < firstLine.length; j++) {
    if (firstLine[j] === " ") {
      if (!inSpace) {
        inSpace = true;
        if (j - colStart > 0) colPositions.push(colStart);
      }
    } else {
      if (inSpace) {
        inSpace = false;
        colStart = j;
      }
    }
  }
  colPositions.push(colStart);

  if (colPositions.length < 2) return null;

  // Extract cells based on column positions
  const extractRow = (line: string): string[] => {
    const cells: string[] = [];
    for (let k = 0; k < colPositions.length; k++) {
      const start = colPositions[k];
      const end = k + 1 < colPositions.length ? colPositions[k + 1] : line.length;
      cells.push(line.slice(start, end).trim());
    }
    return cells;
  };

  const headers = extractRow(lines[0]);
  const rows = lines.slice(1).map(extractRow).filter((r) => r.some((c) => c.length > 0));

  if (headers.length < 2 || rows.length === 0) return null;

  return { title: null, headers, rows, caption: null };
}

/**
 * Extract figure/image descriptions from text.
 * Detects "Figure N." captions and image references.
 */
export function extractFigures(text: string): FigureDescription[] {
  if (!text) return [];

  const figures: FigureDescription[] = [];
  const seen = new Set<string>();

  // Pattern: "Figure N. Caption" or "Fig. N. Caption"
  const figPattern = /(?:Figure|Fig\.?)\s+(\d+)[.:]\s*([^\n]+(?:\n(?!(?:Figure|Fig\.?|Table)\s+\d)[^\n]+)*)/gi;

  let match: RegExpExecArray | null;
  const regex = new RegExp(figPattern.source, "gi");
  while ((match = regex.exec(text)) !== null) {
    const figureNumber = match[1];
    const caption = match[2].trim();
    const key = `fig_${figureNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Determine figure type from caption
    let type: FigureDescription["type"] = "unknown";
    const lowerCaption = caption.toLowerCase();
    if (/chart|graph|plot|bar|pie|line\s+graph/.test(lowerCaption)) type = "chart";
    else if (/diagram|schematic|flowchart|flow\s+chart|architecture/.test(lowerCaption)) type = "diagram";
    else if (/equation|formula|expression/.test(lowerCaption)) type = "equation";
    else if (/table/.test(lowerCaption)) type = "table";
    else if (/image|photo|picture|photograph|micrograph/.test(lowerCaption)) type = "image";

    // Find where this figure is referenced
    const referencedIn: string[] = [];
    const refPattern = new RegExp(`(?:Figure|Fig\\.?)\\s+${figureNumber}\\b`, "gi");
    let refMatch: RegExpExecArray | null;
    const refRegex = new RegExp(refPattern.source, "gi");
    while ((refMatch = refRegex.exec(text)) !== null) {
      if (refMatch.index !== match.index) {
        const context = text.slice(Math.max(0, refMatch.index - 50), refMatch.index + 80).trim();
        referencedIn.push(context);
      }
    }

    figures.push({
      caption,
      figureNumber,
      type,
      referencedIn: referencedIn.slice(0, 3),
      description: generateFigureDescription(caption, type),
    });
  }

  // Also detect image alt text or [Image: ...] patterns
  const imgPattern = /\[(?:Image|Figure|Diagram|Chart|Graph|Table):\s*([^\]]+)\]/gi;
  const imgRegex = new RegExp(imgPattern.source, "gi");
  while ((match = imgRegex.exec(text)) !== null) {
    const caption = match[1].trim();
    if (seen.has(caption)) continue;
    seen.add(caption);
    figures.push({
      caption,
      figureNumber: null,
      type: "unknown",
      referencedIn: [],
      description: caption,
    });
  }

  return figures;
}

/**
 * Generate a description for a figure based on its caption and type.
 */
function generateFigureDescription(caption: string, type: FigureDescription["type"]): string {
  const typeDescriptions: Record<string, string> = {
    chart: "This figure contains a chart or graph showing data relationships.",
    diagram: "This figure is a diagram illustrating structural or process relationships.",
    equation: "This figure displays a mathematical equation or formula.",
    table: "This figure presents data in tabular format.",
    image: "This figure is an image or photograph.",
    graph: "This figure is a graph visualizing data points or trends.",
    unknown: "This figure is referenced in the document.",
  };

  return `${typeDescriptions[type] ?? typeDescriptions.unknown} Caption: "${caption}"`;
}
