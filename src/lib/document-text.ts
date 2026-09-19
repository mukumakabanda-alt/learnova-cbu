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
// string, quality: "none" and confidence: 0 — the caller decides what to
// do with that (still upload the raw file, just skip auto-generated
// study tools). The only thing that can go wrong here is a genuinely
// unreadable/corrupted file, and even that resolves rather than rejects.

import "@/lib/polyfills"; // must load before pdf.js — see that file for why
import { loadPdfjs } from "@/lib/pdfjs";
import {
  buildAcademicDocumentModel,
  serializeDocumentForStudy,
  type AcademicDocumentModel,
} from "@/lib/document-model";

export type ExtractedDocument = {
  text: string;
  pages: number | null;
  /** Rough signal for the caller — did we get real, usable text? */
  quality: "good" | "partial" | "none";
  /**
   * 0-1 confidence signal for how trustworthy this extraction is. Lets the
   * upload flow (and the study page, later) tell the student "this came
   * from a scan — some details might be off" instead of presenting a
   * shaky OCR read with the same quiet confidence as a clean text layer.
   */
  confidence: number;
  /** Short, human-readable reason when confidence is meaningfully reduced. */
  confidenceNote?: string;
  /** For zip bundles / partial OCR runs: notes about what was covered. */
  sources?: string[];
  /** Page/slide/section-aware representation used by generation. */
  model: AcademicDocumentModel;
};

export type OcrProgress = {
  stage: string;
  progress: number;
};

export type ExtractDocumentOptions = {
  onProgress?: (p: OcrProgress) => void;
  /** Prefer the Puter visual layer for difficult pages/images before local Tesseract. */
  preferVisualAI?: boolean;
};

const MAX_ZIP_ENTRIES = 40;
const MAX_ZIP_DEPTH = 2;

// Local Tesseract is now a fallback rather than the primary difficult-document
// reader: Puter/Mistral OCR handles scanned pages first when the uploader opts
// into visual enhancement. Keep a generous bounded fallback for offline/failed
// visual-AI paths without letting a huge scan lock a phone indefinitely.
const MAX_OCR_UNITS = 60;

/** Keep very large files accessible without forcing a low-signal full study pack. */
export const STUDY_TOOL_PAGE_LIMIT = 100;

// Tesseract.js fetches its OCR core (WASM) + English language data — a
// combined ~15-20MB — from a third-party CDN at runtime; this project
// doesn't self-host those assets. On a slow or flaky connection (very
// plausible for scanned/photographed notes on mobile data), that fetch
// had no bound at all: it could simply hang forever, leaving the upload
// UI stuck on "Loading OCR engine…" with no error and no way out. That's
// indistinguishable from "the AI system just does nothing." These two
// timeouts turn an unbounded hang into a bounded one that resolves to
// quality: "none" (raw file still uploads, just without auto-generated
// study tools) via the existing catch-all in extractDocumentText below.
const OCR_INIT_TIMEOUT_MS = 45_000;
const OCR_PAGE_TIMEOUT_MS = 30_000;

// A PDF page's own native text layer is treated as "good enough, skip
// OCR for this page" once it clears this many characters. Deliberately
// small — a real content page nearly always has far more — but big
// enough that a page number or a one-word running header doesn't count
// as "this page has real text."
const PAGE_TEXT_MIN_CHARS = 25;

const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "bmp",
  "gif",
  "tiff",
  "tif",
  "heic",
  "heif",
];

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

function cleanWhitespace(s: string): string {
  return s
    .replace(/\u0000/g, "")
    .replace(
      /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
      " ",
    )
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function qualityOf(
  text: string,
): ExtractedDocument["quality"] {
  const len = text.trim().length;

  if (len >= 200) {
    return "good";
  }

  if (len >= 20) {
    return "partial";
  }

  return "none";
}

// Tesseract can return without throwing while still having produced
// mostly noise — heavy skew, poor lighting, or handwriting it simply
// can't read. Treating that output as a genuine read just because it's
// non-empty makes downstream quality signals dangerously optimistic.
function looksLikeUsableOcrText(
  text: string,
): boolean {
  const trimmed = text.trim();

  if (trimmed.length < 12) {
    return false;
  }

  const alnum =
    (
      trimmed.match(
        /[\p{L}\p{N}]/gu,
      ) ?? []
    ).length;

  const math =
    (
      trimmed.match(
        /[=∑√λπμσ∞≤≥→↔∂^_()[\]{}+\-*/<>]/gu,
      ) ?? []
    ).length;

  const ordinaryRatio =
    alnum / trimmed.length;

  const academicRatio =
    (alnum + math) /
    trimmed.length;

  return (
    ordinaryRatio >= 0.55 ||
    academicRatio >= 0.52
  );
}

function finalizeExtraction(
  input: Omit<
    ExtractedDocument,
    "model"
  > & {
    format: string;
    units?: Array<{
      label: string;
      text: string;
      extraction?:
        | "native"
        | "ocr"
        | "mixed"
        | "structured"
        | "unknown";
      confidence?: number;
    }>;
  },
): ExtractedDocument {
  const units = (
    input.units ?? [
      {
        label: "Document",
        text: input.text,
        extraction:
          "unknown" as const,
        confidence:
          input.confidence,
      },
    ]
  ).slice(
    0,
    STUDY_TOOL_PAGE_LIMIT,
  );

  const model =
    buildAcademicDocumentModel({
      format: input.format,
      units,
    });

  return {
    ...input,
    text:
      serializeDocumentForStudy(
        model,
      ),
    confidence: Math.min(
      input.confidence,
      model.extractionConfidence,
    ),
    model,
  };
}

// ── Confidence scoring ──────────────────────────────────────────────────
//
// Every extraction gets a 0-1 score plus, when meaningfully reduced, a
// short human reason. This is persisted with the material so the UI can
// distinguish a clean text-layer document from a partial scan.
function computeConfidence(opts: {
  quality: ExtractedDocument["quality"];
  totalPages: number | null;
  ocrPages: number;
  uncoveredPages: number;
}): {
  confidence: number;
  note: string | null;
} {
  let confidence =
    opts.quality === "good"
      ? 0.92
      : opts.quality === "partial"
        ? 0.55
        : 0.15;

  const total =
    opts.totalPages ?? 1;

  if (opts.ocrPages > 0) {
    const ocrFraction =
      Math.min(
        1,
        opts.ocrPages / total,
      );

    confidence -=
      0.2 * ocrFraction;
  }

  if (
    opts.uncoveredPages > 0
  ) {
    const missedFraction =
      Math.min(
        1,
        opts.uncoveredPages /
          total,
      );

    confidence -=
      0.4 * missedFraction;
  }

  confidence = Math.max(
    0.02,
    Math.min(
      0.98,
      confidence,
    ),
  );

  let note:
    | string
    | null = null;

  if (
    opts.uncoveredPages > 0
  ) {
    note = `${
      opts.uncoveredPages
    } of ${total} page${
      total === 1 ? "" : "s"
    } couldn't be read and may be missing from this document's study tools.`;
  } else if (
    opts.ocrPages > 0 &&
    confidence < 0.6
  ) {
    note =
      "This looks like a scan or photo — some words may have been misread.";
  } else if (
    opts.quality === "partial"
  ) {
    note =
      "Only a small amount of readable text was found in this document.";
  } else if (
    opts.quality === "none"
  ) {
    note =
      "We couldn't find readable text in this document.";
  }

  return {
    confidence:
      Math.round(
        confidence * 100,
      ) / 100,
    note,
  };
}

// Shorthand for formats that are never OCR'd (docx/pptx/txt/zip-aggregate)
// — confidence purely from how much usable text came out.
function simpleConfidence(
  quality: ExtractedDocument["quality"],
): {
  confidence: number;
  note: string | null;
} {
  return computeConfidence({
    quality,
    totalPages: null,
    ocrPages: 0,
    uncoveredPages: 0,
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>(
    (
      resolve,
      reject,
    ) => {
      const timer =
        setTimeout(
          () =>
            reject(
              new Error(
                `${label} timed out after ${Math.round(
                  ms / 1000,
                )}s`,
              ),
            ),
          ms,
        );

      promise.then(
        (value) => {
          clearTimeout(
            timer,
          );
          resolve(value);
        },
        (err) => {
          clearTimeout(
            timer,
          );
          reject(err);
        },
      );
    },
  );
}

function scrapePrintableStrings(
  buffer: ArrayBuffer,
  minRun = 4,
): string {
  const bytes =
    new Uint8Array(buffer);

  const runs: string[] = [];
  let current = "";

  const flush = () => {
    if (
      current.length >=
      minRun
    ) {
      runs.push(current);
    }

    current = "";
  };

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    const b = bytes[i];

    const printable =
      b >= 32 && b <= 126;

    if (printable) {
      current +=
        String.fromCharCode(
          b,
        );

      if (
        bytes[i + 1] === 0
      ) {
        i++;
      }
    } else {
      flush();
    }
  }

  flush();

  return cleanWhitespace(
    runs.join(" "),
  );
}

type OcrCtx = {
  onProgress?: (
    p: OcrProgress,
  ) => void;
  budget: {
    remaining: number;
  };
  worker: Promise<any> | null;
  label: string;
  preferVisualAI: boolean;
};

function normalizeExtractOptions(
  onProgressOrOptions?:
    | ((
        p: OcrProgress,
      ) => void)
    | ExtractDocumentOptions,
): ExtractDocumentOptions {
  if (
    typeof onProgressOrOptions ===
    "function"
  ) {
    return {
      onProgress:
        onProgressOrOptions,
    };
  }

  return (
    onProgressOrOptions ?? {}
  );
}

function newOcrCtx(
  options: ExtractDocumentOptions = {},
): OcrCtx {
  return {
    onProgress:
      options.onProgress,
    budget: {
      remaining:
        MAX_OCR_UNITS,
    },
    worker: null,
    label: "",
    preferVisualAI:
      options.preferVisualAI ??
      false,
  };
}

function humanizeOcrStatus(
  ctx: OcrCtx,
  status:
    | string
    | undefined,
): string {
  switch (status) {
    case "loading tesseract core":
      return "Loading OCR engine…";

    case "loading language traineddata":
      return "Loading OCR language data…";

    case "initializing tesseract":
    case "initializing api":
      return "Starting OCR…";

    default:
      return ctx.label
        ? `Reading ${ctx.label}…`
        : "Reading with OCR…";
  }
}

// The OCR worker is shared across uploads so a student uploading several
// scans in a row does not pay the engine initialization cost repeatedly.
const OCR_IDLE_SHUTDOWN_MS =
  3 * 60_000;

let sharedOcrWorker:
  | Promise<any>
  | null = null;

let ocrIdleTimer:
  | ReturnType<typeof setTimeout>
  | null = null;

let activeOcrCtx:
  | OcrCtx
  | null = null;

function scheduleOcrIdleShutdown() {
  if (
    ocrIdleTimer
  ) {
    clearTimeout(
      ocrIdleTimer,
    );
  }

  ocrIdleTimer =
    setTimeout(
      () => {
        const worker =
          sharedOcrWorker;

        sharedOcrWorker =
          null;

        activeOcrCtx =
          null;

        ocrIdleTimer =
          null;

        worker
          ?.then(
            (w) =>
              w.terminate(),
          )
          .catch(() => {
            // best-effort cleanup
          });
      },
      OCR_IDLE_SHUTDOWN_MS,
    );
}

async function getOcrWorker(
  ctx: OcrCtx,
) {
  if (
    ocrIdleTimer
  ) {
    clearTimeout(
      ocrIdleTimer,
    );

    ocrIdleTimer =
      null;
  }

  activeOcrCtx =
    ctx;

  if (
    !sharedOcrWorker
  ) {
    const workerPromise =
      withTimeout(
        (async () => {
          const mod: any =
            await import(
              "tesseract.js"
            );

          const createWorker =
            mod.createWorker ??
            mod.default
              ?.createWorker;

          if (
            typeof createWorker !==
            "function"
          ) {
            throw new Error(
              "Tesseract.js did not expose createWorker.",
            );
          }

          return createWorker(
            "eng",
            1,
            {
              logger: (
                m: any,
              ) => {
                const liveCtx =
                  activeOcrCtx;

                if (
                  liveCtx?.onProgress
                ) {
                  liveCtx.onProgress(
                    {
                      stage:
                        humanizeOcrStatus(
                          liveCtx,
                          m?.status,
                        ),
                      progress:
                        typeof m?.progress ===
                        "number"
                          ? m.progress
                          : 0,
                    },
                  );
                }
              },
            },
          );
        })(),
        OCR_INIT_TIMEOUT_MS,
        "Loading the OCR engine",
      );

    // If initialization fails, do NOT keep the rejected promise around.
    // Otherwise every later upload would inherit the original failure.
    sharedOcrWorker =
      workerPromise.catch(
        (error) => {
          sharedOcrWorker =
            null;
          throw error;
        },
      );
  }

  ctx.worker =
    sharedOcrWorker;

  return sharedOcrWorker;
}

async function terminateOcrWorker(
  ctx: OcrCtx,
) {
  if (
    ctx.worker !==
      sharedOcrWorker ||
    !sharedOcrWorker
  ) {
    return;
  }

  scheduleOcrIdleShutdown();
}

function ocrTargetLongEdgeForFileSize(
  fileBytes: number,
): number {
  const mb =
    fileBytes /
    (1024 * 1024);

  if (mb > 20) {
    return 1500;
  }

  if (mb > 10) {
    return 1700;
  }

  return 2000;
}

async function renderPdfPageToCanvas(
  pdf: any,
  pageNumber: number,
  targetLongEdge = 2000,
): Promise<HTMLCanvasElement> {
  const page =
    await pdf.getPage(
      pageNumber,
    );

  const base =
    page.getViewport({
      scale: 1,
    });

  const scale =
    Math.min(
      2.5,
      Math.max(
        1,
        targetLongEdge /
          Math.max(
            base.width,
            base.height,
          ),
      ),
    );

  const viewport =
    page.getViewport({
      scale,
    });

  const canvas =
    document.createElement(
      "canvas",
    );

  canvas.width =
    Math.ceil(
      viewport.width,
    );

  canvas.height =
    Math.ceil(
      viewport.height,
    );

  const context =
    canvas.getContext(
      "2d",
    );

  if (!context) {
    throw new Error(
      "Canvas 2D context unavailable",
    );
  }

  await page.render({
    canvasContext:
      context,
    viewport,
  }).promise;

  return canvas;
}

function rotateCanvas(
  source: HTMLCanvasElement,
  degrees: 90 | 180 | 270,
): HTMLCanvasElement {
  const rotated =
    document.createElement(
      "canvas",
    );

  const quarterTurn =
    degrees === 90 ||
    degrees === 270;

  rotated.width =
    quarterTurn
      ? source.height
      : source.width;

  rotated.height =
    quarterTurn
      ? source.width
      : source.height;

  const context =
    rotated.getContext(
      "2d",
    );

  if (!context) {
    return source;
  }

  context.translate(
    rotated.width / 2,
    rotated.height / 2,
  );

  context.rotate(
    (degrees * Math.PI) /
      180,
  );

  context.drawImage(
    source,
    -source.width / 2,
    -source.height / 2,
  );

  return rotated;
}

function ocrTextScore(
  text: string,
  confidence = 0,
): number {
  const words =
    text.match(
      /[A-Za-z][A-Za-z'-]{2,}/g,
    ) ?? [];

  const readableWords =
    words.filter((word) =>
      /[aeiou]/i.test(
        word,
      ),
    ).length;

  return (
    text.length +
    readableWords * 8 +
    confidence * 2
  );
}

async function recognizeWithOrientation(
  worker: any,
  canvas: HTMLCanvasElement,
): Promise<{
  text: string;
  confidence: number;
}> {
  const first =
    (await worker.recognize(
      canvas,
    )) as {
      data?: {
        text?: string;
        confidence?: number;
      };
    };

  const firstText =
    cleanWhitespace(
      first.data?.text ??
        "",
    );

  const firstConfidence =
    typeof first.data
      ?.confidence ===
    "number"
      ? first.data.confidence
      : 0;

  if (
    firstText.length >=
      100 &&
    firstConfidence >=
      45
  ) {
    return {
      text: firstText,
      confidence:
        firstConfidence,
    };
  }

  const candidates: Array<{
    text: string;
    confidence: number;
  }> = [
    {
      text: firstText,
      confidence:
        firstConfidence,
    },
  ];

  for (
    const degrees of [
      90,
      270,
    ] as const
  ) {
    const result =
      (await worker.recognize(
        rotateCanvas(
          canvas,
          degrees,
        ),
      )) as {
        data?: {
          text?: string;
          confidence?: number;
        };
      };

    const text =
      cleanWhitespace(
        result.data?.text ??
          "",
      );

    const confidence =
      typeof result.data
        ?.confidence ===
      "number"
        ? result.data.confidence
        : 0;

    candidates.push({
      text,
      confidence,
    });
  }

  return candidates.sort(
    (a, b) =>
      ocrTextScore(
        b.text,
        b.confidence,
      ) -
      ocrTextScore(
        a.text,
        a.confidence,
      ),
  )[0];
}

async function prepareImageForOcr(
  source: File | Blob,
): Promise<
  HTMLCanvasElement | File | Blob
> {
  if (
    typeof createImageBitmap !==
    "function"
  ) {
    return source;
  }

  const bitmap =
    await createImageBitmap(
      source,
      {
        imageOrientation:
          "from-image",
      },
    );

  const longEdge =
    Math.max(
      bitmap.width,
      bitmap.height,
    );

  const target =
    longEdge < 1400
      ? 1800
      : longEdge > 2400
        ? 2200
        : longEdge;

  const scale =
    target /
    Math.max(
      1,
      longEdge,
    );

  const canvas =
    document.createElement(
      "canvas",
    );

  canvas.width =
    Math.max(
      1,
      Math.round(
        bitmap.width *
          scale,
      ),
    );

  canvas.height =
    Math.max(
      1,
      Math.round(
        bitmap.height *
          scale,
      ),
    );

  const context =
    canvas.getContext(
      "2d",
      {
        willReadFrequently:
          true,
      },
    );

  if (!context) {
    bitmap.close();
    return source;
  }

  context.drawImage(
    bitmap,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  bitmap.close();

  // Mild grayscale + contrast enhancement. This improves many photographed
  // notes without over-processing equations or diagrams.
  const pixels =
    context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );

  for (
    let i = 0;
    i <
    pixels.data.length;
    i += 4
  ) {
    const gray =
      pixels.data[i] *
        0.299 +
      pixels.data[i + 1] *
        0.587 +
      pixels.data[i + 2] *
        0.114;

    const contrasted =
      Math.max(
        0,
        Math.min(
          255,
          (gray - 128) *
              1.25 +
            128,
        ),
      );

    pixels.data[i] =
      contrasted;

    pixels.data[i + 1] =
      contrasted;

    pixels.data[i + 2] =
      contrasted;
  }

  context.putImageData(
    pixels,
    0,
    0,
  );

  return canvas;
}

async function ensureCanvasForOcr(
  source:
    | HTMLCanvasElement
    | File
    | Blob,
): Promise<HTMLCanvasElement> {
  if (
    source instanceof
    HTMLCanvasElement
  ) {
    return source;
  }

  if (
    typeof createImageBitmap !==
    "function"
  ) {
    throw new Error(
      "This browser cannot prepare an image for OCR.",
    );
  }

  const bitmap =
    await createImageBitmap(
      source,
    );

  const canvas =
    document.createElement(
      "canvas",
    );

  canvas.width =
    bitmap.width;

  canvas.height =
    bitmap.height;

  const context =
    canvas.getContext(
      "2d",
    );

  if (!context) {
    bitmap.close();

    throw new Error(
      "Canvas 2D context unavailable",
    );
  }

  context.drawImage(
    bitmap,
    0,
    0,
  );

  bitmap.close();

  return canvas;
}

async function loadMammoth() {
  const mod: any =
    await import(
      "mammoth"
    );

  return (
    mod.default ??
    mod
  );
}

async function loadJSZip() {
  const mod: any =
    await import(
      "jszip"
    );

  return (
    mod.default ??
    mod
  );
}

// Reads every page's native text layer, then runs OCR only on pages that
// actually need it. This deliberately works page-by-page so mixed PDFs
// are handled correctly.
async function extractPdf(
  file: File | Blob,
  ctx: OcrCtx,
): Promise<ExtractedDocument> {
  const pdfjsLib: any =
    await loadPdfjs();

  const buffer =
    await file.arrayBuffer();

  const pdf =
    await (
      pdfjsLib as any
    ).getDocument({
      data: new Uint8Array(
        buffer,
      ),
    }).promise;

  const totalPages:
    number =
    pdf.numPages;

  const ocrTargetLongEdge =
    ocrTargetLongEdgeForFileSize(
      file.size ?? 0,
    );

  const nativePages:
    string[] =
    new Array(
      totalPages,
    ).fill("");

  const needsOcr:
    boolean[] =
    new Array(
      totalPages,
    ).fill(false);

  for (
    let i = 1;
    i <= totalPages;
    i++
  ) {
    try {
      const page =
        await pdf.getPage(
          i,
        );

      const content =
        await page.getTextContent();

      const pageText =
        cleanWhitespace(
          content.items
            .map(
              (it: any) =>
                "str" in it
                  ? it.str
                  : "",
            )
            .join(" "),
        );

      nativePages[
        i - 1
      ] = pageText;

      needsOcr[
        i - 1
      ] =
        pageText.length <
        PAGE_TEXT_MIN_CHARS;
    } catch (error) {
      needsOcr[
        i - 1
      ] = true;

      console.warn(
        `Skipping unreadable native text layer on PDF page ${i}`,
        error,
      );
    }
  }

  const pagesNeedingOcr =
    needsOcr.reduce(
      (
        count,
        value,
      ) =>
        count +
        (value ? 1 : 0),
      0,
    );

  if (
    pagesNeedingOcr === 0
  ) {
    const text =
      cleanWhitespace(
        nativePages.join(
          "\n\n",
        ),
      );

    const quality =
      qualityOf(text);

    const {
      confidence,
      note,
    } =
      computeConfidence({
        quality,
        totalPages,
        ocrPages: 0,
        uncoveredPages: 0,
      });

    return finalizeExtraction(
      {
        text,
        pages:
          totalPages,
        quality,
        confidence,
        confidenceNote:
          note ??
          undefined,
        format: "pdf",
        units:
          nativePages.map(
            (
              pageText,
              index,
            ) => ({
              label: `Page ${
                index + 1
              }`,
              text:
                pageText,
              extraction:
                "native",
              confidence:
                0.96,
            }),
          ),
      },
    );
  }

  // Visual AI gets first opportunity to recover difficult pages.
  // document-vision.ts subsequently merges its results into the model.
  if (
    ctx.preferVisualAI
  ) {
    const text =
      cleanWhitespace(
        nativePages.join(
          "\n\n",
        ),
      );

    const quality =
      qualityOf(text);

    const {
      confidence,
      note,
    } =
      computeConfidence({
        quality,
        totalPages,
        ocrPages: 0,
        uncoveredPages:
          pagesNeedingOcr,
      });

    return finalizeExtraction(
      {
        text,
        pages:
          totalPages,
        quality,
        confidence,
        confidenceNote:
          note ??
          undefined,
        sources: [
          `Visual AI deferred local OCR for ${pagesNeedingOcr} difficult page(s)`,
        ],
        format: "pdf",
        units:
          nativePages.map(
            (
              pageText,
              index,
            ) => ({
              label: `Page ${
                index + 1
              }`,
              text:
                pageText,
              extraction:
                needsOcr[
                  index
                ]
                  ? "unknown"
                  : "native",
              confidence:
                pageText.length >=
                PAGE_TEXT_MIN_CHARS
                  ? 0.96
                  : 0.12,
            }),
          ),
      },
    );
  }

  if (
    ctx.budget
      .remaining <= 0
  ) {
    const text =
      cleanWhitespace(
        nativePages.join(
          "\n\n",
        ),
      );

    const quality =
      qualityOf(text);

    const {
      confidence,
      note,
    } =
      computeConfidence({
        quality,
        totalPages,
        ocrPages: 0,
        uncoveredPages:
          pagesNeedingOcr,
      });

    return finalizeExtraction(
      {
        text,
        pages:
          totalPages,
        quality,
        confidence,
        confidenceNote:
          note ??
          undefined,
        sources: [
          `OCR budget already used up — ${pagesNeedingOcr} page(s) may be missing text`,
        ],
        format: "pdf",
        units:
          nativePages.map(
            (
              pageText,
              index,
            ) => ({
              label: `Page ${
                index + 1
              }`,
              text:
                pageText,
              extraction:
                "native",
              confidence:
                pageText.length >=
                PAGE_TEXT_MIN_CHARS
                  ? 0.9
                  : 0.05,
            }),
          ),
      },
    );
  }

  const worker =
    await getOcrWorker(ctx);

  const ocrCandidateIndexes =
    needsOcr
      .map(
        (
          value,
          index,
        ) =>
          value
            ? index
            : -1,
      )
      .filter(
        (
          index,
        ) =>
          index !==
          -1,
      );

  const ocrableCount =
    Math.min(
      ocrCandidateIndexes.length,
      ctx.budget.remaining,
    );

  let ocredCount = 0;
  let failedCount = 0;

  for (
    let n = 0;
    n <
    ocrableCount;
    n++
  ) {
    const pageIndex =
      ocrCandidateIndexes[
        n
      ];

    const pageNumber =
      pageIndex + 1;

    ctx.label =
      `page ${pageNumber}`;

    ctx.onProgress?.({
      stage: `Reading page ${
        n + 1
      } of ${ocrableCount}…`,
      progress:
        n /
        ocrableCount,
    });

    try {
      const canvas =
        await renderPdfPageToCanvas(
          pdf,
          pageNumber,
          ocrTargetLongEdge,
        );

      const best =
        await withTimeout(
          recognizeWithOrientation(
            worker,
            canvas,
          ),
          OCR_PAGE_TIMEOUT_MS *
            3,
          `Reading page ${pageNumber}`,
        );

      const ocrText =
        best.text;

      if (
        looksLikeUsableOcrText(
          ocrText,
        )
      ) {
        nativePages[
          pageIndex
        ] =
          ocrText.length >
          nativePages[
            pageIndex
          ].length
            ? ocrText
            : nativePages[
                pageIndex
              ];

        ocredCount++;
      } else if (
        !nativePages[
          pageIndex
        ].trim()
      ) {
        failedCount++;
      }
    } catch {
      failedCount++;
    }

    ctx.budget.remaining--;
  }

  const uncoveredPages =
    pagesNeedingOcr -
    ocrableCount +
    failedCount;

  const text =
    cleanWhitespace(
      nativePages.join(
        "\n\n",
      ),
    );

  const quality =
    qualityOf(text);

  const {
    confidence,
    note,
  } =
    computeConfidence({
      quality,
      totalPages,
      ocrPages:
        ocredCount,
      uncoveredPages,
    });

  const sources: string[] =
    [];

  if (
    ocredCount > 0
  ) {
    sources.push(
      `OCR read ${ocredCount} of ${totalPages} page${
        totalPages ===
        1
          ? ""
          : "s"
      }`,
    );
  }

  if (
    uncoveredPages > 0
  ) {
    sources.push(
      `${uncoveredPages} page${
        uncoveredPages ===
        1
          ? ""
          : "s"
      } couldn't be read`,
    );
  }

  return finalizeExtraction(
    {
      text,
      pages:
        totalPages,
      quality,
      confidence,
      confidenceNote:
        note ??
        undefined,
      sources:
        sources.length
          ? sources
          : undefined,
      format: "pdf",
      units:
        nativePages.map(
          (
            pageText,
            index,
          ) => ({
            label: `Page ${
              index + 1
            }`,
            text:
              pageText,
            extraction:
              needsOcr[
                index
              ]
                ? "ocr"
                : "native",
            confidence:
              pageText.length >=
              PAGE_TEXT_MIN_CHARS
                ? needsOcr[
                    index
                  ]
                  ? 0.72
                  : 0.96
                : 0.05,
          }),
        ),
    },
  );
}

async function extractImage(
  file: File | Blob,
  ctx: OcrCtx,
): Promise<ExtractedDocument> {
  if (
    ctx.preferVisualAI
  ) {
    const {
      confidence,
      note,
    } =
      computeConfidence({
        quality:
          "none",
        totalPages: 1,
        ocrPages: 0,
        uncoveredPages: 1,
      });

    return finalizeExtraction(
      {
        text: "",
        pages: null,
        quality:
          "none",
        confidence,
        confidenceNote:
          note ??
          undefined,
        sources: [
          "Visual AI deferred image OCR",
        ],
        format:
          "image",
        units: [
          {
            label: "Image",
            text: "",
            extraction:
              "unknown",
            confidence:
              0.12,
          },
        ],
      },
    );
  }

  if (
    ctx.budget
      .remaining <= 0
  ) {
    const {
      confidence,
      note,
    } =
      computeConfidence({
        quality:
          "none",
        totalPages: 1,
        ocrPages: 0,
        uncoveredPages: 1,
      });

    return finalizeExtraction(
      {
        text: "",
        pages: null,
        quality:
          "none",
        confidence,
        confidenceNote:
          note ??
          undefined,
        format:
          "image",
      },
    );
  }

  ctx.label =
    "the image";

  ctx.onProgress?.({
    stage:
      "Reading the image…",
    progress: 0,
  });

  const worker =
    await getOcrWorker(ctx);

  try {
    const prepared =
      await prepareImageForOcr(
        file,
      );

    const best =
      await withTimeout(
        recognizeWithOrientation(
          worker,
          await ensureCanvasForOcr(
            prepared,
          ),
        ),
        OCR_PAGE_TIMEOUT_MS *
          3,
        "Reading the image",
      );

    ctx.budget.remaining--;

    const text =
      best.text;

    const quality =
      qualityOf(text);

    const base =
      computeConfidence({
        quality,
        totalPages: 1,
        ocrPages: 1,
        uncoveredPages: 0,
      });

    const confidence =
      Math.min(
        base.confidence,
        best.confidence
          ? best.confidence /
              100
          : base.confidence,
      );

    return finalizeExtraction(
      {
        text,
        pages: null,
        quality,
        confidence,
        confidenceNote:
          base.note ??
          undefined,
        format:
          "image",
        units: [
          {
            label: "Image",
            text,
            extraction:
              "ocr",
            confidence,
          },
        ],
      },
    );
  } catch {
    ctx.budget.remaining--;

    const {
      confidence,
      note,
    } =
      computeConfidence({
        quality:
          "none",
        totalPages: 1,
        ocrPages: 0,
        uncoveredPages: 1,
      });

    return finalizeExtraction(
      {
        text: "",
        pages: null,
        quality:
          "none",
        confidence,
        confidenceNote:
          note ??
          undefined,
        format:
          "image",
      },
    );
  }
}

async function extractDocxBuffer(
  buffer: ArrayBuffer,
): Promise<string> {
  const mammoth =
    await loadMammoth();

  const {
    value,
  } =
    await mammoth.convertToHtml({
      arrayBuffer:
        buffer,
    });

  const doc =
    new DOMParser().parseFromString(
      value ?? "",
      "text/html",
    );

  const lines =
    Array.from(
      doc.body.querySelectorAll(
        "h1,h2,h3,h4,h5,h6,p,li,tr,img",
      ),
    )
      .map(
        (node) => {
          const text =
            cleanWhitespace(
              node.textContent ??
                "",
            );

          if (!text) {
            return "";
          }

          if (
            /^H[1-6]$/.test(
              node.tagName,
            )
          ) {
            return `# ${text}`;
          }

          if (
            node.tagName ===
            "LI"
          ) {
            return `- ${text}`;
          }

          if (
            node.tagName ===
            "TR"
          ) {
            return `| ${Array.from(
              node.children,
            )
              .map(
                (
                  cell,
                ) =>
                  cleanWhitespace(
                    cell.textContent ??
                      "",
                  ),
              )
              .join(
                " | ",
              )} |`;
          }

          if (
            node.tagName ===
            "IMG"
          ) {
            const alt =
              cleanWhitespace(
                node.getAttribute(
                  "alt",
                ) ??
                  node.getAttribute(
                    "title",
                  ) ??
                  "",
              );

            return alt
              ? `[Embedded image description: ${alt}]`
              : "[Embedded image]";
          }

          return text;
        },
      )
      .filter(Boolean);

  return lines.join(
    "\n",
  );
}

async function extractPptxBuffer(
  buffer: ArrayBuffer,
  ctx?: OcrCtx,
): Promise<string> {
  const JSZip =
    await loadJSZip();

  const zip =
    await JSZip.loadAsync(
      buffer,
    );

  const slidePaths =
    Object.keys(
      zip.files,
    )
      .filter(
        (path) =>
          /^ppt\/slides\/slide\d+\.xml$/.test(
            path,
          ),
      )
      .sort(
        (a, b) =>
          Number(
            a.match(
              /(\d+)/,
            )?.[1] ?? 0,
          ) -
          Number(
            b.match(
              /(\d+)/,
            )?.[1] ?? 0,
          ),
      );

  const parser =
    new DOMParser();

  const parts: string[] =
    [];

  for (
    let slideIndex = 0;
    slideIndex <
    slidePaths.length;
    slideIndex++
  ) {
    const path =
      slidePaths[
        slideIndex
      ];

    let xml: string;

    try {
      xml =
        await zip.files[
          path
        ].async(
          "string",
        );
    } catch (error) {
      console.warn(
        `Skipping unreadable PowerPoint slide XML: ${path}`,
        error,
      );

      parts.push(
        `=== Slide ${
          slideIndex + 1
        } ===\n(Text on this slide could not be read.)`,
      );

      continue;
    }

    const doc =
      parser.parseFromString(
        xml,
        "application/xml",
      );

    const paragraphs =
      Array.from(
        doc.getElementsByTagName(
          "a:p",
        ),
      )
        .map(
          (
            paragraph,
          ) =>
            Array.from(
              paragraph.getElementsByTagName(
                "a:t",
              ),
            )
              .map(
                (
                  node,
                ) =>
                  node.textContent ??
                  "",
              )
              .join("")
              .trim(),
        )
        .filter(Boolean);

    if (
      paragraphs.length ===
      0
    ) {
      paragraphs.push(
        ...[
          ...xml.matchAll(
            /<a:t[^>]*>([\s\S]*?)<\/a:t>/g,
          ),
        ]
          .map(
            (match) =>
              match[1]
                .replace(
                  /<[^>]+>/g,
                  "",
                )
                .trim(),
          )
          .filter(Boolean),
      );
    }

    const notesPath =
      `ppt/notesSlides/notesSlide${
        slideIndex + 1
      }.xml`;

    const notes =
      zip.files[
        notesPath
      ]
        ? Array.from(
            parser
              .parseFromString(
                await zip.files[
                  notesPath
                ].async(
                  "string",
                ),
                "application/xml",
              )
              .getElementsByTagName(
                "a:t",
              ),
          )
            .map(
              (
                node,
              ) =>
                node.textContent ??
                "",
            )
            .join(" ")
            .trim()
        : "";

    const mediaText:
      string[] =
      [];

    // Important: when visual AI is enabled, embedded media is NOT gated
    // behind the amount of slide text. document-vision.ts handles the actual
    // visual path. This local extraction remains useful when visual AI is
    // disabled or unavailable.
    if (
      ctx &&
      !ctx.preferVisualAI
    ) {
      const relPath =
        `ppt/slides/_rels/slide${
          slideIndex + 1
        }.xml.rels`;

      if (
        zip.files[
          relPath
        ]
      ) {
        try {
          const relDoc =
            parser.parseFromString(
              await zip.files[
                relPath
              ].async(
                "string",
              ),
              "application/xml",
            );

          for (
            const rel of Array.from(
              relDoc.getElementsByTagName(
                "Relationship",
              ),
            )
          ) {
            const target =
              rel.getAttribute(
                "Target",
              ) ?? "";

            if (
              !target.includes(
                "media/",
              )
            ) {
              continue;
            }

            const mediaPath =
              target.startsWith(
                "/",
              )
                ? target.slice(1)
                : `ppt/${target.replace(
                    /^\.\.\//,
                    "",
                  )}`;

            const media =
              zip.files[
                mediaPath
              ];

            if (
              !media ||
              ctx.budget
                .remaining <=
                0
            ) {
              continue;
            }

            try {
              const extracted =
                await extractImage(
                  new Blob([
                    await media.async(
                      "arraybuffer",
                    ),
                  ]),
                  ctx,
                );

              if (
                extracted.text
              ) {
                mediaText.push(
                  extracted.text,
                );
              }
            } catch (
              error
            ) {
              console.warn(
                `Skipping unreadable PowerPoint media during extraction: ${mediaPath}`,
                error,
              );
            }
          }
        } catch (
          error
        ) {
          console.warn(
            `Skipping unreadable PowerPoint relationships: ${relPath}`,
            error,
          );
        }
      }
    }

    const slideLines = [
      `=== Slide ${
        slideIndex + 1
      } ===`,
      ...paragraphs.map(
        (
          text,
          index,
        ) =>
          `${
            index === 0
              ? "Title"
              : "Bullet"
          }: ${text}`,
      ),
    ];

    if (notes) {
      slideLines.push(
        `Speaker notes: ${notes}`,
      );
    }

    if (
      mediaText.length
    ) {
      slideLines.push(
        `Visual text: ${mediaText.join(
          " ",
        )}`,
      );
    }

    parts.push(
      slideLines.join(
        "\n",
      ),
    );
  }

  return parts.join(
    "\n\n",
  );
}

async function extractZip(
  file: File | Blob,
  ctx: OcrCtx,
  depth = 0,
): Promise<ExtractedDocument> {
  const JSZip =
    await loadJSZip();

  const buffer =
    await file.arrayBuffer();

  const zip =
    await JSZip.loadAsync(
      buffer,
    );

  const entries =
    Object.values(
      zip.files as Record<
        string,
        any
      >,
    )
      .filter(
        (entry: any) =>
          !entry.dir,
      )
      .slice(
        0,
        MAX_ZIP_ENTRIES,
      );

  const parts: string[] =
    [];

  const sources: string[] =
    [];

  for (
    const entry of entries as any[]
  ) {
    const name: string =
      entry.name;

    const extension =
      extOf(name);

    if (
      extension ===
        "zip" &&
      depth >=
        MAX_ZIP_DEPTH
    ) {
      continue;
    }

    try {
      let innerText =
        "";

      if (
        extension ===
        "pdf"
      ) {
        const ab =
          await entry.async(
            "arraybuffer",
          );

        innerText =
          (
            await extractPdf(
              new Blob([
                ab,
              ]),
              ctx,
            )
          ).text;
      } else if (
        extension ===
        "docx"
      ) {
        innerText =
          await extractDocxBuffer(
            await entry.async(
              "arraybuffer",
            ),
          );
      } else if (
        extension ===
        "pptx"
      ) {
        innerText =
          await extractPptxBuffer(
            await entry.async(
              "arraybuffer",
            ),
            ctx,
          );
      } else if (
        [
          "txt",
          "md",
          "markdown",
          "csv",
          "json",
        ].includes(
          extension,
        )
      ) {
        innerText =
          cleanWhitespace(
            await entry.async(
              "string",
            ),
          );
      } else if (
        [
          "doc",
          "ppt",
          "xls",
        ].includes(
          extension,
        )
      ) {
        innerText =
          scrapePrintableStrings(
            await entry.async(
              "arraybuffer",
            ),
          );
      } else if (
        IMAGE_EXTENSIONS.includes(
          extension,
        )
      ) {
        const ab =
          await entry.async(
            "arraybuffer",
          );

        innerText =
          (
            await extractImage(
              new Blob([
                ab,
              ]),
              ctx,
            )
          ).text;
      } else if (
        extension ===
        "zip"
      ) {
        const ab =
          await entry.async(
            "arraybuffer",
          );

        innerText =
          (
            await extractZip(
              new Blob([
                ab,
              ]),
              ctx,
              depth + 1,
            )
          ).text;
      } else {
        continue;
      }

      if (
        innerText.trim()
      ) {
        parts.push(
          `=== ${name} ===\n${innerText}`,
        );

        sources.push(
          name,
        );
      }
    } catch {
      // One corrupt entry should not destroy the entire ZIP bundle.
      continue;
    }
  }

  const text =
    cleanWhitespace(
      parts.join(
        "\n\n",
      ),
    );

  const quality =
    qualityOf(text);

  const {
    confidence,
    note,
  } =
    simpleConfidence(
      quality,
    );

  return finalizeExtraction(
    {
      text,
      pages: null,
      quality,
      confidence,
      confidenceNote:
        note ??
        undefined,
      sources,
      format: "zip",
    },
  );
}

async function extractDocumentTextInner(
  file: File,
  ctx: OcrCtx,
): Promise<ExtractedDocument> {
  const extension =
    extOf(file.name);

  const mime =
    file.type || "";

  if (
    extension === "pdf" ||
    mime ===
      "application/pdf"
  ) {
    return await extractPdf(
      file,
      ctx,
    );
  }

  if (
    IMAGE_EXTENSIONS.includes(
      extension,
    ) ||
    mime.startsWith(
      "image/",
    )
  ) {
    return await extractImage(
      file,
      ctx,
    );
  }

  if (
    extension ===
      "docx" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const text =
      await extractDocxBuffer(
        await file.arrayBuffer(),
      );

    const quality =
      qualityOf(text);

    const {
      confidence,
      note,
    } =
      simpleConfidence(
        quality,
      );

    return finalizeExtraction(
      {
        text,
        pages: null,
        quality,
        confidence,
        confidenceNote:
          note ??
          undefined,
        format:
          "docx",
      },
    );
  }

  if (
    extension ===
      "pptx" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    const text =
      await extractPptxBuffer(
        await file.arrayBuffer(),
        ctx,
      );

    const quality =
      qualityOf(text);

    const {
      confidence,
      note,
    } =
      simpleConfidence(
        quality,
      );

    const units =
      text
        .split(
          /(?==== Slide \d+ ===)/,
        )
        .filter(Boolean)
        .map(
          (
            slide,
            index,
          ) => ({
            label: `Slide ${
              index + 1
            }`,
            text:
              slide.replace(
                /^=== Slide \d+ ===\s*/,
                "",
              ),
            extraction:
              "structured" as const,
            confidence,
          }),
        );

    return finalizeExtraction(
      {
        text,
        pages:
          units.length,
        quality,
        confidence,
        confidenceNote:
          note ??
          undefined,
        format:
          "pptx",
        units,
      },
    );
  }

  if (
    extension ===
      "zip" ||
    mime ===
      "application/zip" ||
    mime ===
      "application/x-zip-compressed"
  ) {
    return await extractZip(
      file,
      ctx,
    );
  }

  if (
    [
      "txt",
      "md",
      "markdown",
      "csv",
      "json",
      "rtf",
    ].includes(
      extension,
    ) ||
    mime.startsWith(
      "text/",
    )
  ) {
    const text =
      cleanWhitespace(
        await file.text(),
      );

    const quality =
      qualityOf(text);

    const {
      confidence,
      note,
    } =
      simpleConfidence(
        quality,
      );

    return finalizeExtraction(
      {
        text,
        pages: null,
        quality,
        confidence,
        confidenceNote:
          note ??
          undefined,
        format:
          extension ||
          "text",
      },
    );
  }

  if (
    [
      "doc",
      "ppt",
      "xls",
    ].includes(
      extension,
    )
  ) {
    const text =
      scrapePrintableStrings(
        await file.arrayBuffer(),
      );

    const quality =
      qualityOf(text);

    const {
      confidence,
      note,
    } =
      simpleConfidence(
        quality,
      );

    return finalizeExtraction(
      {
        text,
        pages: null,
        quality,
        confidence,
        confidenceNote:
          note ??
          undefined,
        format:
          extension,
      },
    );
  }

  const asText =
    cleanWhitespace(
      await file
        .text()
        .catch(
          () => "",
        ),
    );

  const asTextQuality =
    qualityOf(
      asText,
    );

  if (
    asTextQuality !==
    "none"
  ) {
    const {
      confidence,
      note,
    } =
      simpleConfidence(
        asTextQuality,
      );

    return finalizeExtraction(
      {
        text:
          asText,
        pages: null,
        quality:
          asTextQuality,
        confidence,
        confidenceNote:
          note ??
          undefined,
        format:
          extension ||
          "unknown",
      },
    );
  }

  const scraped =
    scrapePrintableStrings(
      await file.arrayBuffer(),
    );

  const scrapedQuality =
    qualityOf(
      scraped,
    );

  const {
    confidence,
    note,
  } =
    simpleConfidence(
      scrapedQuality,
    );

  return finalizeExtraction(
    {
      text:
        scraped,
      pages: null,
      quality:
        scrapedQuality,
      confidence,
      confidenceNote:
        note ??
        undefined,
      format:
        extension ||
        "unknown",
    },
  );
}

/**
 * Extract whatever readable text we can from any uploaded file.
 *
 * Supports:
 * - PDF, including per-page OCR fallback
 * - photographs / images
 * - DOCX
 * - best-effort DOC
 * - PPTX, including slide text and notes
 * - best-effort PPT
 * - TXT / Markdown / CSV / JSON / RTF
 * - ZIP bundles recursively
 *
 * When preferVisualAI is true, difficult pages are deliberately left
 * available for the visual-analysis layer rather than wasting the local
 * OCR budget on them.
 *
 * This function always resolves.
 */
export async function extractDocumentText(
  file: File,
  onProgressOrOptions?:
    | ((
        p: OcrProgress,
      ) => void)
    | ExtractDocumentOptions,
): Promise<ExtractedDocument> {
  const ctx =
    newOcrCtx(
      normalizeExtractOptions(
        onProgressOrOptions,
      ),
    );

  try {
    return await extractDocumentTextInner(
      file,
      ctx,
    );
  } catch (err) {
    console.error(
      "Text extraction failed for",
      file.name,
      err,
    );

    return finalizeExtraction(
      {
        text: "",
        pages: null,
        quality:
          "none",
        confidence: 0,
        confidenceNote:
          "We couldn't read this file.",
        format:
          extOf(
            file.name,
          ) ||
          "unknown",
      },
    );
  } finally {
    await terminateOcrWorker(
      ctx,
    );
  }
}

/**
 * Extract several related files through one OCR worker and one shared budget.
 *
 * Visual analysis happens separately in document-vision.ts.
 */
export async function extractDocumentBatch(
  files: File[],
  onProgressOrOptions?:
    | ((
        fileIndex: number,
        p: OcrProgress,
      ) => void)
    | (Omit<
        ExtractDocumentOptions,
        "onProgress"
      > & {
        onProgress?: (
          fileIndex: number,
          p: OcrProgress,
        ) => void;
      }),
): Promise<
  ExtractedDocument[]
> {
  const options =
    typeof onProgressOrOptions ===
    "function"
      ? {
          onProgress:
            onProgressOrOptions,
        }
      : (
          onProgressOrOptions ??
          {}
        );

  const ctx =
    newOcrCtx({
      preferVisualAI:
        options.preferVisualAI,
    });

  try {
    const results:
      ExtractedDocument[] =
      [];

    for (
      let index = 0;
      index <
      files.length;
      index++
    ) {
      ctx.onProgress =
        (
          progress,
        ) =>
          options.onProgress?.(
            index,
            progress,
          );

      results.push(
        await extractDocumentTextInner(
          files[index],
          ctx,
        ),
      );
    }

    return results;
  } finally {
    await terminateOcrWorker(
      ctx,
    );
  }
}

/** Short, human label for the progress UI — "PDF", "Word doc", etc. */
export function fileKindLabel(
  file: File,
): string {
  const ext =
    extOf(file.name);

  if (
    IMAGE_EXTENSIONS.includes(
      ext,
    )
  ) {
    return "Photo";
  }

  const map: Record<
    string,
    string
  > = {
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
    markdown:
      "Markdown file",
    csv: "CSV file",
    json: "JSON file",
  };

  return (
    map[ext] ??
    "Document"
  );
}

const MATERIAL_TYPE_VALUES =
  [
    "Notes",
    "Past Paper",
    "Slides",
    "Summary",
    "Assignment",
    "Outline",
  ] as const;

export type GuessableMaterialType =
  (typeof MATERIAL_TYPE_VALUES)[number];

const TYPE_KEYWORDS: {
  type: GuessableMaterialType;
  patterns: RegExp[];
}[] = [
  {
    type:
      "Past Paper",
    patterns: [
      /past[\s_-]?paper/i,
      /\bexam(ination)?\b/i,
      /\btest\b/i,
      /\bquiz\b/i,
      /\bmid[\s_-]?semester\b/i,
      /\bfinal[\s_-]?(exam|paper)?\b/i,
      /\bmemo(randum)?\b/i,
      /\b(19|20)\d{2}\b.*\b(exam|paper|test)\b/i,
    ],
  },
  {
    type: "Slides",
    patterns: [
      /\bslides?\b/i,
      /\blecture[\s_-]?\d*\b/i,
      /\bppt\b/i,
      /\bpresentation\b/i,
      /\bdeck\b/i,
    ],
  },
  {
    type:
      "Assignment",
    patterns: [
      /\bassignment\b/i,
      /\btutorial\b/i,
      /\bhomework\b/i,
      /\bproblem[\s_-]?set\b/i,
      /\bcoursework\b/i,
      /\blab[\s_-]?report\b/i,
    ],
  },
  {
    type: "Outline",
    patterns: [
      /\boutline\b/i,
      /\bsyllabus\b/i,
      /\bcourse[\s_-]?guide\b/i,
      /\bstudy[\s_-]?guide\b/i,
    ],
  },
  {
    type: "Summary",
    patterns: [
      /\bsummary\b/i,
      /\brevision\b/i,
      /\bcheat[\s_-]?sheet\b/i,
      /\bcondensed\b/i,
      /\bkey[\s_-]?points\b/i,
    ],
  },
];

/**
 * Best-effort first guess at a material's category, from its filename and
 * (optionally) a short slice of its extracted text — never throws, never
 * returns anything outside the six real categories, and defaults to
 * "Notes" when nothing matches.
 */
export function guessMaterialType(
  filename: string,
  textSample?: string,
): GuessableMaterialType {
  const extensionHint =
    extOf(filename);

  if (
    [
      "ppt",
      "pptx",
    ].includes(
      extensionHint,
    )
  ) {
    return "Slides";
  }

  const haystacks = [
    filename,
    textSample
      ? textSample.slice(
          0,
          1500,
        )
      : "",
  ];

  for (
    const {
      type,
      patterns,
    } of TYPE_KEYWORDS
  ) {
    if (
      haystacks.some(
        (haystack) =>
          haystack &&
          patterns.some(
            (pattern) =>
              pattern.test(
                haystack,
              ),
          ),
      )
    ) {
      return type;
    }
  }

  return "Notes";
  }
