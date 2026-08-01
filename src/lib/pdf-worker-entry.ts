/// <reference lib="webworker" />
// pdf.js worker entry, with our TypedArray polyfills loaded FIRST.
//
// Why this file exists: "a.toHex is not a function" was never a bug in
// this app's code, and it was never really a "bad PDF" either. pdf.js
// does its actual parsing inside a Web Worker — a completely separate
// JavaScript context from the page. Importing "@/lib/polyfills" on the
// main thread (as DocumentViewer and document-text.ts both do) has zero
// effect in there: workers don't inherit anything the page patched onto
// built-ins. So on any browser missing the newer Uint8Array hex/base64
// methods (some Android WebViews, embedded preview browsers), the page
// was fine but the worker still blew up the moment a PDF contained a
// hex-encoded string — which is extremely common, it's part of the PDF
// format itself.
//
// Loading the polyfills here, in the worker's own context, before the
// pdf.js worker code runs, is what actually fixes it.
import "./polyfills";
import "pdfjs-dist/build/pdf.worker.min.mjs";
