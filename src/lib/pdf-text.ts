// Client-side PDF text extraction using pdfjs-dist. Runs in the browser
// before upload, so the Edge Function never has to parse PDFs itself.
// Loads pdf.js through @/lib/pdfjs so it shares the polyfilled worker —
// without that, PDFs containing hex-encoded strings (most of them) throw
// "a.toHex is not a function" inside the worker on older WebViews.
import { loadPdfjs } from "./pdfjs";

export async function extractPdfText(file: File): Promise<{ text: string; pages: number }> {
  const pdfjsLib: any = await loadPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ") + "\n\n";
  }
  return { text: text.trim(), pages: pdf.numPages };
}
