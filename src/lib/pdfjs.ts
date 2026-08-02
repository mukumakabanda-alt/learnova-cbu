// Single place that loads pdf.js and wires up its worker.
//
// Uses the LEGACY build on purpose: it feature-detects newer JS APIs
// (Uint8Array.prototype.toHex and friends) instead of assuming them, so
// the "a.toHex is not a function" crash simply can't happen on older
// Android WebViews or embedded preview browsers. Polyfills are still
// loaded, in both the page and the worker, as belt-and-braces.
import "./polyfills";

let cached: Promise<any> | null = null;

export function loadPdfjs(): Promise<any> {
  if (cached) return cached;
  cached = (async () => {
    const lib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    try {
      lib.GlobalWorkerOptions.workerPort = new Worker(
        new URL("./pdf-worker-entry.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      try {
        const workerUrl = (await import(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
        )) as any;
        lib.GlobalWorkerOptions.workerSrc = workerUrl.default;
      } catch {
        // Last resort: parse on the main thread rather than refuse to
        // open the document.
        lib.GlobalWorkerOptions.workerSrc = "";
      }
    }
    return lib;
  })();
  return cached;
}
