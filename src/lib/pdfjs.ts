// Single place that loads pdf.js and wires up its worker.
//
// Everything that renders or reads a PDF (the in-app DocumentViewer, the
// upload-time text extractor) must go through here so they all get the
// same polyfilled worker — see pdf-worker-entry.ts for why that matters.
import "./polyfills";

let cached: Promise<any> | null = null;

export function loadPdfjs(): Promise<any> {
  if (cached) return cached;
  cached = (async () => {
    const lib: any = await import("pdfjs-dist");
    try {
      // Preferred path: our own module worker, which polyfills before
      // pdf.js's worker code runs.
      lib.GlobalWorkerOptions.workerPort = new Worker(
        new URL("./pdf-worker-entry.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      // Any environment where constructing a module worker fails (very
      // old WebViews, strict CSP): fall back to pdf.js's own worker
      // bundle, and if even that can't be created pdf.js runs its parser
      // on the main thread rather than refusing to open the document.
      try {
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")) as any;
        lib.GlobalWorkerOptions.workerSrc = workerUrl.default;
      } catch {
        lib.GlobalWorkerOptions.workerSrc = "";
      }
    }
    return lib;
  })();
  return cached;
}
