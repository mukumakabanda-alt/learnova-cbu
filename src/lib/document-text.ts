// Universal document text extraction for the Study upload flow.
//
// Every heavy parser (pdf.js, mammoth, jszip, tesseract.js) is loaded with
// a *dynamic* import so the Study page's initial bundle never pays for
// any of them — they only load the moment someone actually drops a file
// in. This also keeps them out of the server bundle: they're only ever
// invoked from inside a browser event handler, so on the server they're
// simply never called (TanStack Start SSR never touches this file's
// exports at render time — DocumentUpload just wires them to onChange/
// onDrop).
//
// Contract: extractDocumentText() NEVER throws for "wrong format" or
// "couldn't fully parse this." Worst case it resolves with an empty
// string and quality: "none" — the caller decides what to do with that
// (still upload the raw file, just skip auto-generated study tools). The
// only thing that can go wrong here is a genuinely unreadable/corrupted
// file, and even that resolves rather than rejects.

export type ExtractedDocument = {
  text: string;
  pages: number | null;
  /** Rough signal for the caller — did we get real, usable text? */
  quality: "good" | "partial" | "none";
  /** For zip bundles / partial OCR runs: notes about what was covered. */
  sources?: string[];
};

export type OcrProgress = { stage: string; progress: number };

const MAX_ZIP_ENTRIES = 40;
const MAX_ZIP_DEPTH = 2;
// Total OCR "units" (pages or standalone images) allowed per upload. Keeps
// a 300-page scanned textbook, or a zip of 200 lecture photos, from
// hanging someone's phone for twenty minutes — a partial result from the
// first ~20 covers most real study documents (a paper, a chapter, a set
// of scanned notes) and is far better than nothing.
const MAX_OCR_UNITS = 20;

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "tif", "heic", "heif"];

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

function cleanWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function qualityOf(text: string): ExtractedDocument["quality"] {
  const len = text.trim().length;
  if (len >= 200) return "good";
  if (len >= 20) return "partial";
  return "none";
}

// Last-resort fallback for formats we can't truly parse — legacy binary
// .doc/.ppt/.xls, or anything unrecognized. This is NOT real parsing, it's
// a byte-level scrape for runs of printable characters (ASCII and naive
// UTF-16LE, since old Office binary formats store a lot of their text as
// long contiguous UTF-16LE runs). It recovers a surprising amount in
// practice, and — critically — it means we never have to say "we can't
// read this," just sometimes "here's a rougher summary than usual."
function scrapePrintableStrings(buffer: ArrayBuffer, minRun = 4): string {
  const bytes = new Uint8Array(buffer);
  const runs: string[] = [];
  let current = "";
  const flush = () => {
    if (current.length >= minRun) runs.push(current);
    current = "";
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const printable = b >= 32 && b <= 126;
    if (printable) {
      current += String.fromCharCode(b);
      if (bytes[i + 1] === 0) i++; // skip the null byte of a UTF-16LE pair
    } else {
      flush();
    }
  }
  flush();
  return cleanWhitespace(runs.join(" "));
}

// ── OCR context ──────────────────────────────────────────────────────
// Shared across one whole extractDocumentText() call so a scanned
// multi-page PDF, or a zip full of photos, only pays the ~2-5MB OCR
// engine + language download ONCE, via a single reused worker, instead
// of once per page/image.

type OcrCtx = {
  onProgress?: (p: OcrProgress) => void;
  budget: { remaining: number };
  worker: Promise<any> | null;
  label: string;
};

function newOcrCtx(onProgress?: (p: OcrProgress) => void): OcrCtx {
  return { onProgress, budget: { remaining: MAX_OCR_UNITS }, worker: null, label: "" };
}

function humanizeOcrStatus(ctx: OcrCtx, status: string | undefined): string {
  switch (status) {
    case "loading tesseract core":
      return "Loading OCR engine…";
    case "loading language traineddata":
      return "Loading OCR language data…";
    case "initializing tesseract":
    case "initializing api":
      return "Starting OCR…";
    default:
      return ctx.label ? `Reading ${ctx.label}…` : "Reading with OCR…";
  }
}

async function getOcrWorker(ctx: OcrCtx) {
  if (!ctx.worker) {
    ctx.worker = (async () => {
      const mod: any = await import("tesseract.js");
      const createWorker = mod.createWorker ?? mod.default?.createWorker;
      return createWorker("eng", 1, {
        logger: (m: any) => {
          if (ctx.onProgress) {
            ctx.onProgress({ stage: humanizeOcrStatus(ctx, m?.status), progress: typeof m?.progress === "number" ? m.progress : 0 });
          }
        },
      });
    })();
  }
  return ctx.worker;
}

async function terminateOcrWorker(ctx: OcrCtx) {
  if (!ctx.worker) return;
  try {
    const worker = await ctx.worker;
    await worker.terminate();
  } catch {
    // best-effort cleanup only
  }
}

// Renders a PDF page to a canvas at a resolution good for OCR without
// ballooning memory on an oversized page (e.g. an A0 poster PDF).
async function renderPdfPageToCanvas(pdf: any, pageNumber: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const targetLongEdge = 2000;
  const scale = Math.min(2.5, Math.max(1, targetLongEdge / Math.max(base.width, base.height)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function loadMammoth() {
  const mod: any = await import("mammoth");
  return mod.default ?? mod;
}

async function loadJSZip() {
  const mod: any = await import("jszip");
  return mod.default ?? mod;
}

async function extractPdf(file: File | Blob, ctx: OcrCtx): Promise<ExtractedDocument> {
  const [pdfjsLib, workerUrlMod] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = (workerUrlMod as any).default;
  const buffer = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buffer }).promise;

  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ") + "\n\n";
  }
  text = cleanWhitespace(text);
  if (qualityOf(text) !== "none") return { text, pages: pdf.numPages, quality: qualityOf(text) };

  // No embedded text layer at all — almost certainly a scanned PDF (every
  // page is really just a photo). Fall back to OCR, page by page, sharing
  // one Tesseract worker for the whole document.
  if (ctx.budget.remaining <= 0) return { text: "", pages: pdf.numPages, quality: "none" };

  const worker = await getOcrWorker(ctx);
  const pageCount = Math.min(pdf.numPages, ctx.budget.remaining);
  let ocrText = "";
  for (let i = 1; i <= pageCount; i++) {
    ctx.label = `page ${i} of ${pageCount}`;
    ctx.onProgress?.({ stage: `Reading ${ctx.label}…`, progress: (i - 1) / pageCount });
    const canvas = await renderPdfPageToCanvas(pdf, i);
    const { data } = await worker.recognize(canvas);
    ocrText += (data?.text ?? "") + "\n\n";
    ctx.budget.remaining--;
  }
  ocrText = cleanWhitespace(ocrText);
  return {
    text: ocrText,
    pages: pdf.numPages,
    quality: qualityOf(ocrText),
    sources: pageCount < pdf.numPages ? [`OCR covered ${pageCount} of ${pdf.numPages} pages`] : undefined,
  };
}

async function extractImage(file: File | Blob, ctx: OcrCtx): Promise<ExtractedDocument> {
  if (ctx.budget.remaining <= 0) return { text: "", pages: null, quality: "none" };
  ctx.label = "the image";
  ctx.onProgress?.({ stage: "Reading the image…", progress: 0 });
  const worker = await getOcrWorker(ctx);
  const { data } = await worker.recognize(file);
  ctx.budget.remaining--;
  const text = cleanWhitespace(data?.text ?? "");
  return { text, pages: null, quality: qualityOf(text) };
}

async function extractDocxBuffer(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await loadMammoth();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
  return cleanWhitespace(value ?? "");
}

async function extractPptxBuffer(buffer: ArrayBuffer): Promise<string> {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/(\d+)/)?.[1] ?? 0) - Number(b.match(/(\d+)/)?.[1] ?? 0));
  const notesPaths = Object.keys(zip.files).filter((p) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p));

  const parser = new DOMParser();
  const parts: string[] = [];
  for (const path of [...slidePaths, ...notesPaths]) {
    const xml = await zip.files[path].async("string");
    const doc = parser.parseFromString(xml, "application/xml");
    const nodes = Array.from(doc.getElementsByTagName("a:t"));
    const slideText = nodes.map((n) => n.textContent ?? "").join(" ").trim();
    if (slideText) parts.push(slideText);
  }
  return cleanWhitespace(parts.join("\n\n"));
}

async function extractZip(file: File | Blob, ctx: OcrCtx, depth = 0): Promise<ExtractedDocument> {
  const JSZip = await loadJSZip();
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files as Record<string, any>)
    .filter((f: any) => !f.dir)
    .slice(0, MAX_ZIP_ENTRIES);

  const parts: string[] = [];
  const sources: string[] = [];

  for (const entry of entries as any[]) {
    const name: string = entry.name;
    const extension = extOf(name);
    if (extension === "zip" && depth >= MAX_ZIP_DEPTH) continue;

    try {
      let innerText = "";
      if (extension === "pdf") {
        const ab = await entry.async("arraybuffer");
        innerText = (await extractPdf(new Blob([ab]), ctx)).text;
      } else if (extension === "docx") {
        innerText = await extractDocxBuffer(await entry.async("arraybuffer"));
      } else if (extension === "pptx") {
        innerText = await extractPptxBuffer(await entry.async("arraybuffer"));
      } else if (["txt", "md", "markdown", "csv", "json"].includes(extension)) {
        innerText = cleanWhitespace(await entry.async("string"));
      } else if (["doc", "ppt", "xls"].includes(extension)) {
        innerText = scrapePrintableStrings(await entry.async("arraybuffer"));
      } else if (IMAGE_EXTENSIONS.includes(extension)) {
        const ab = await entry.async("arraybuffer");
        innerText = (await extractImage(new Blob([ab]), ctx)).text;
      } else if (extension === "zip") {
        const ab = await entry.async("arraybuffer");
        innerText = (await extractZip(new Blob([ab]), ctx, depth + 1)).text;
      } else {
        continue; // other binaries — skip quietly, not an error
      }
      if (innerText.trim()) {
        parts.push(`=== ${name} ===\n${innerText}`);
        sources.push(name);
      }
    } catch {
      continue; // one bad entry shouldn't sink the whole zip
    }
  }

  const text = cleanWhitespace(parts.join("\n\n"));
  return { text, pages: null, quality: qualityOf(text), sources };
}

async function extractDocumentTextInner(file: File, ctx: OcrCtx): Promise<ExtractedDocument> {
  const extension = extOf(file.name);
  const mime = file.type || "";

  if (extension === "pdf" || mime === "application/pdf") {
    return await extractPdf(file, ctx);
  }
  if (IMAGE_EXTENSIONS.includes(extension) || mime.startsWith("image/")) {
    return await extractImage(file, ctx);
  }
  if (extension === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const text = await extractDocxBuffer(await file.arrayBuffer());
    return { text, pages: null, quality: qualityOf(text) };
  }
  if (extension === "pptx" || mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    const text = await extractPptxBuffer(await file.arrayBuffer());
    return { text, pages: null, quality: qualityOf(text) };
  }
  if (extension === "zip" || mime === "application/zip" || mime === "application/x-zip-compressed") {
    return await extractZip(file, ctx);
  }
  if (["txt", "md", "markdown", "csv", "json", "rtf"].includes(extension) || mime.startsWith("text/")) {
    const text = cleanWhitespace(await file.text());
    return { text, pages: null, quality: qualityOf(text) };
  }
  if (["doc", "ppt", "xls"].includes(extension)) {
    const text = scrapePrintableStrings(await file.arrayBuffer());
    return { text, pages: null, quality: qualityOf(text) };
  }

  // Unrecognized extension: try as plain text first (covers a lot of
  // code/config files), fall back to the byte scrape if that's noise.
  const asText = cleanWhitespace(await file.text().catch(() => ""));
  if (qualityOf(asText) !== "none") return { text: asText, pages: null, quality: qualityOf(asText) };
  const scraped = scrapePrintableStrings(await file.arrayBuffer());
  return { text: scraped, pages: null, quality: qualityOf(scraped) };
}

/**
 * Extract whatever readable text we can from any uploaded file.
 * Always resolves. Supports: PDF (including OCR fallback for scanned
 * pages with no embedded text layer), photos (OCR), Word (.docx,
 * best-effort .doc), PowerPoint (.pptx, best-effort .ppt), plain text /
 * Markdown / CSV / JSON, and .zip bundles (recursively — including PDFs
 * and photos inside the zip). Anything else is tried as text first, then
 * as a raw byte scrape.
 *
 * Pass onProgress to get human-readable status updates during slower
 * paths (OCR in particular can take real time — several seconds per page).
 */
export async function extractDocumentText(file: File, onProgress?: (p: OcrProgress) => void): Promise<ExtractedDocument> {
  const ctx = newOcrCtx(onProgress);
  try {
    return await extractDocumentTextInner(file, ctx);
  } catch (err) {
    console.error("Text extraction failed for", file.name, err);
    return { text: "", pages: null, quality: "none" };
  } finally {
    await terminateOcrWorker(ctx);
  }
}

/** Short, human label for the progress UI — "PDF", "Word doc", etc. */
export function fileKindLabel(file: File): string {
  const ext = extOf(file.name);
  if (IMAGE_EXTENSIONS.includes(ext)) return "Photo";
  const map: Record<string, string> = {
    pdf: "PDF",
    docx: "Word document",
    doc: "Word document",
    pptx: "PowerPoint deck",
    ppt: "PowerPoint deck",
    xls: "Spreadsheet",
    xlsx: "Spreadsheet",
    zip: "Zip bundle",
    txt: "Text file",
    md: "Markdown file",
    markdown: "Markdown file",
    csv: "CSV file",
    json: "JSON file",
  };
  return map[ext] ?? "Document";
}

const MATERIAL_TYPE_VALUES = ["Notes", "Past Paper", "Slides", "Summary", "Assignment", "Outline"] as const;
export type GuessableMaterialType = (typeof MATERIAL_TYPE_VALUES)[number];

// Keyword → type, checked in order (first match wins). Applied to both the
// filename and (once available) the first slice of extracted text, so a
// file named "notes.pdf" whose first page reads "FINAL EXAMINATION —
// MAY 2023" still gets correctly caught as a past paper. Deliberately
// simple and explainable rather than a model call: the whole point is an
// instant, free, on-device first guess the person can immediately see and
// override with one tap — not a perfect classifier.
const TYPE_KEYWORDS: { type: GuessableMaterialType; patterns: RegExp[] }[] = [
  {
    type: "Past Paper",
    patterns: [
      /past[\s_-]?paper/i, /\bexam(ination)?\b/i, /\btest\b/i, /\bquiz\b/i,
      /\bmid[\s_-]?semester\b/i, /\bfinal[\s_-]?(exam|paper)?\b/i, /\bmemo(randum)?\b/i,
      /\b(19|20)\d{2}\b.*\b(exam|paper|test)\b/i,
    ],
  },
  {
    type: "Slides",
    patterns: [/\bslides?\b/i, /\blecture[\s_-]?\d*\b/i, /\bppt\b/i, /\bpresentation\b/i, /\bdeck\b/i],
  },
  {
    type: "Assignment",
    patterns: [/\bassignment\b/i, /\btutorial\b/i, /\bhomework\b/i, /\bproblem[\s_-]?set\b/i, /\bcoursework\b/i, /\blab[\s_-]?report\b/i],
  },
  {
    type: "Outline",
    patterns: [/\boutline\b/i, /\bsyllabus\b/i, /\bcourse[\s_-]?guide\b/i, /\bstudy[\s_-]?guide\b/i],
  },
  {
    type: "Summary",
    patterns: [/\bsummary\b/i, /\brevision\b/i, /\bcheat[\s_-]?sheet\b/i, /\bcondensed\b/i, /\bkey[\s_-]?points\b/i],
  },
];

/**
 * Best-effort first guess at a material's category, from its filename and
 * (optionally) a short slice of its extracted text — never throws, never
 * returns anything outside the six real categories, and defaults to
 * "Notes" when nothing matches (the safest, most common default; this is
 * a starting point the uploader can change with one tap, not a final answer).
 */
export function guessMaterialType(filename: string, textSample?: string): GuessableMaterialType {
  const extensionHint = extOf(filename);
  if (["ppt", "pptx"].includes(extensionHint)) return "Slides";

  // Filename first — the strongest, cheapest signal, and available
  // instantly (before OCR/extraction even starts).
  const haystacks = [filename, textSample ? textSample.slice(0, 1500) : ""];
  for (const { type, patterns } of TYPE_KEYWORDS) {
    if (haystacks.some((h) => h && patterns.some((p) => p.test(h)))) return type;
  }
  return "Notes";
}
