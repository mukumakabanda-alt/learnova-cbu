/// <reference lib="webworker" />
// pdf.js worker entry, with our TypedArray polyfills loaded FIRST.
// pdf.js parses inside a Web Worker, which inherits nothing the page
// patched onto built-ins — so the polyfills have to be imported here,
// in the worker's own context, before the pdf.js worker code runs.
import "./polyfills";
import "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
