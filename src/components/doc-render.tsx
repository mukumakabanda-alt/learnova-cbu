// Learnova's own document rendering engine.
//
// Every format is rendered here, in-app, from a Blob — no Google gview,
// no Office Online, no external service, and nothing that needs the
// network once the file bytes are in hand (so it works identically for
// an offline-saved copy). Each renderer paints onto a "paper" page so a
// Word file looks like the Word file, a slide deck looks like slides,
// and a spreadsheet looks like a grid.

import { useEffect, useMemo, useState } from "react";
import { Loader2, FileWarning, FileArchive, ChevronRight, ArrowLeft, File as FileIcon } from "lucide-react";
import { loadPdfjs } from "@/lib/pdfjs";
import { openZip } from "@/lib/zip-reader";

/* ── shared bits ── */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}

export function RenderError({ text, detail }: { text: string; detail?: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper">
        <FileWarning className="h-6 w-6" />
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
      {detail && (
        <p className="max-w-xs rounded-lg bg-surface px-3 py-2 font-mono text-[11px] text-muted-foreground/70">
          {detail}
        </p>
      )}
    </div>
  );
}

/** A sheet of paper. Documents render dark-on-white, like the real file. */
export function Paper({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`doc-paper mx-auto my-4 w-full max-w-3xl ${className}`}>{children}</div>;
}

export function decodeXml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

async function loadZip(blob: Blob) {
  return openZip(blob);
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({
    data: null,
    error: null,
  });
  useEffect(() => {
    let active = true;
    setState({ data: null, error: null });
    fn()
      .then((data) => active && setState({ data, error: null }))
      .catch((e) => active && setState({ data: null, error: e instanceof Error ? e.message : String(e) }))
      ;
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/* ── PDF ── */

const MAX_PDF_PAGES = 200;

export function PdfRenderer({ blob }: { blob: Blob }) {
  const [pages, setPages] = useState<HTMLCanvasElement[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [detail, setDetail] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let doc: any = null;
    setPages([]);
    setStatus("loading");
    setDetail(null);

    (async () => {
      try {
        if (blob.size < 100) throw new Error(`The stored file is only ${blob.size} bytes.`);
        const lib: any = await loadPdfjs();
        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        doc = await lib.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
        if (cancelled) return;
        setTotal(doc.numPages);

        const width = Math.min(typeof window !== "undefined" ? window.innerWidth - 32 : 720, 900);
        const canvases: HTMLCanvasElement[] = [];
        const count = Math.min(doc.numPages, MAX_PDF_PAGES);
        let failed = 0;

        for (let i = 1; i <= count; i++) {
          if (cancelled) return;
          try {
            const page = await doc.getPage(i);
            const base = page.getViewport({ scale: 1 });
            const scale = Math.max(0.5, width / base.width);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);
            canvas.style.width = "100%";
            canvas.style.height = "auto";
            const ctx = canvas.getContext("2d", { alpha: false });
            if (!ctx) continue;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            await page.render({ canvasContext: ctx, viewport }).promise;
            page.cleanup?.();
            canvases.push(canvas);
            if (!cancelled && (i === 1 || i % 3 === 0 || i === count)) setPages([...canvases]);
          } catch (err) {
            failed++;
            console.error(`PDF page ${i} failed`, err);
          }
        }
        if (cancelled) return;
        if (!canvases.length) throw new Error(failed ? "No page in this PDF could be drawn." : "This PDF has no pages.");
        setPages(canvases);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setDetail(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      try {
        doc?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [blob]);

  if (status === "error") return <RenderError text="Couldn't render this PDF." detail={detail} />;

  return (
    <div className="px-3 pb-6">
      {pages.map((canvas, i) => (
        <PdfPage key={i} canvas={canvas} index={i} />
      ))}
      {status === "loading" && <Spinner label={total ? `Rendering page ${pages.length + 1} of ${total}…` : "Opening document…"} />}
      {status === "ready" && total > pages.length && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Showing {pages.length} of {total} pages.
        </p>
      )}
    </div>
  );
}

function PdfPage({ canvas, index }: { canvas: HTMLCanvasElement; index: number }) {
  return (
    <div className="relative mx-auto mb-4 w-full max-w-3xl">
      <div
        className="doc-paper overflow-hidden !p-0"
        ref={(node) => {
          if (node && canvas.parentElement !== node) {
            node.innerHTML = "";
            node.appendChild(canvas);
          }
        }}
      />
      <span className="mt-1 block text-center text-[11px] text-muted-foreground">Page {index + 1}</span>
    </div>
  );
}

/* ── DOCX ── */

export function DocxRenderer({ blob }: { blob: Blob }) {
  const { data, error } = useAsync(async () => {
    const mammoth: any = await import("mammoth");
    const arrayBuffer = await blob.arrayBuffer();
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        styleMap: [
          "p[style-name='Title'] => h1.doc-title:fresh",
          "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Quote'] => blockquote:fresh",
          "r[style-name='Strong'] => strong",
        ],
        includeDefaultStyleMap: true,
        convertImage: mammoth.images.imgElement((image: any) =>
          image.readAsBase64String().then((b64: string) => ({ src: `data:${image.contentType};base64,${b64}` })),
        ),
      },
    );
    // Untrusted upload: never render converted HTML without sanitizing it.
    const clean = sanitizeDocHtml((result.value as string) || "");
    return clean || "<p><em>(This document has no visible content.)</em></p>";
  }, [blob]);

  if (error) return <RenderError text="Couldn't open this Word document." detail={error} />;
  if (!data) return <Spinner label="Laying out the document…" />;

  return (
    <Paper>
      <div className="doc-prose" dangerouslySetInnerHTML={{ __html: data }} />
    </Paper>
  );
}

/* ── PPTX ── */

type Slide = { texts: { text: string; big: boolean }[]; images: string[] };

export function PptxRenderer({ blob }: { blob: Blob }) {
  const { data, error } = useAsync(async () => {
    const zip = await loadZip(blob);
    const names = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
      .sort(
        (a, b) =>
          parseInt(a.match(/slide(\d+)/i)![1], 10) - parseInt(b.match(/slide(\d+)/i)![1], 10),
      );
    if (!names.length) throw new Error("No slides found inside this file.");

    // Cache media as data URLs so slides render offline too.
    const mediaCache = new Map<string, string>();
    async function media(target: string): Promise<string | null> {
      const path = `ppt/media/${target.split("/").pop()}`;
      if (mediaCache.has(path)) return mediaCache.get(path)!;
      const file = zip.file(path);
      if (!file) return null;
      const b64 = await file.async("base64");
      const ext = (path.split(".").pop() || "png").toLowerCase();
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : "image/png";
      const url = `data:${mime};base64,${b64}`;
      mediaCache.set(path, url);
      return url;
    }

    const slides: Slide[] = [];
    for (const name of names.slice(0, 120)) {
      const xml = await zip.files[name].async("text");

      const texts: { text: string; big: boolean }[] = [];
      for (const shape of xml.split("</p:sp>")) {
        for (const para of shape.split("</a:p>")) {
          const runs = [...para.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]));
          const text = runs.join("").trim();
          if (!text) continue;
          const sizeMatch = para.match(/sz="(\d+)"/);
          const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
          const isTitle = /<p:ph[^>]*type="(ctrTitle|title)"/.test(shape);
          texts.push({ text, big: isTitle || size >= 2800 });
        }
      }

      const images: string[] = [];
      const relPath = name.replace(/slides\/(slide\d+)\.xml/i, "slides/_rels/$1.xml.rels");
      const relFile = zip.file(relPath);
      if (relFile) {
        const relXml = await relFile.async("text");
        const embedIds = [...xml.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1]);
        for (const id of embedIds) {
          const target = relXml.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))?.[1];
          if (!target || !/\.(png|jpe?g|gif|svg|bmp|webp)$/i.test(target)) continue;
          const url = await media(target);
          if (url) images.push(url);
        }
      }

      slides.push({ texts, images });
    }
    return slides;
  }, [blob]);

  if (error) return <RenderError text="Couldn't open this presentation." detail={error} />;
  if (!data) return <Spinner label="Building the slides…" />;

  return (
    <div className="space-y-4 p-3 pb-8">
      {data.map((slide, i) => (
        <div key={i} className="mx-auto w-full max-w-3xl">
          <div className="doc-paper doc-slide">
            {slide.texts.map((t, j) =>
              t.big ? (
                <h2 key={j} className="doc-slide-title">
                  {t.text}
                </h2>
              ) : (
                <p key={j} className="doc-slide-body">
                  {t.text}
                </p>
              ),
            )}
            {slide.images.map((src, j) => (
              <img key={`img-${j}`} src={src} alt="" className="mx-auto mt-3 max-h-64 rounded" />
            ))}
            {!slide.texts.length && !slide.images.length && (
              <p className="doc-slide-body opacity-50">(Blank slide)</p>
            )}
          </div>
          <span className="mt-1 block text-center text-[11px] text-muted-foreground">
            Slide {i + 1} of {data.length}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── XLSX ── */

type Sheet = { name: string; rows: string[][] };

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function XlsxRenderer({ blob }: { blob: Blob }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const { data, error } = useAsync(async () => {
    const zip = await loadZip(blob);

    let shared: string[] = [];
    const ss = zip.file("xl/sharedStrings.xml");
    if (ss) {
      const xml = await ss.async("text");
      shared = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join(""),
      );
    }

    let names: string[] = [];
    const wb = zip.file("xl/workbook.xml");
    if (wb) {
      const xml = await wb.async("text");
      names = [...xml.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map((m) => decodeXml(m[1]));
    }

    const files = Object.keys(zip.files)
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
      .sort((a, b) => parseInt(a.match(/sheet(\d+)/i)![1], 10) - parseInt(b.match(/sheet(\d+)/i)![1], 10));
    if (!files.length) throw new Error("No sheets found inside this workbook.");

    const sheets: Sheet[] = [];
    for (let s = 0; s < files.length; s++) {
      const xml = await zip.files[files[s]].async("text");
      const rows: string[][] = [];
      for (const rm of [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 400)) {
        const row: string[] = [];
        for (const c of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const attrs = c[1] || "";
          const body = c[2] || "";
          const idx = colIndex(attrs.match(/r="([A-Z]+\d+)"/i)?.[1] ?? "A1");
          let value = "";
          if (/\bt="s"/.test(attrs)) {
            const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
            value = v != null ? (shared[parseInt(v, 10)] ?? "") : "";
          } else if (/\bt="inlineStr"/.test(attrs)) {
            value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join("");
          } else {
            value = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
          }
          while (row.length < idx) row.push("");
          row[idx] = value;
        }
        rows.push(row);
      }
      sheets.push({ name: names[s] || `Sheet ${s + 1}`, rows });
    }
    return sheets;
  }, [blob]);

  if (error) return <RenderError text="Couldn't open this spreadsheet." detail={error} />;
  if (!data) return <Spinner label="Reading the workbook…" />;

  const sheet = data[Math.min(activeSheet, data.length - 1)];
  const width = sheet.rows.reduce((m, r) => Math.max(m, r.length), 0);

  return (
    <div className="p-3 pb-8">
      {data.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {data.map((s, i) => (
            <button
              key={s.name + i}
              onClick={() => setActiveSheet(i)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                i === activeSheet ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:bg-muted"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="doc-paper overflow-auto !p-0">
        <table className="doc-sheet">
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c}>{row[c] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Markdown / plain text ── */

function markdownToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const out: string[] = [];
  let inList = false;
  let inCode = false;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^```/.test(line)) {
      if (inCode) out.push("</pre>");
      else out.push("<pre>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(esc(raw));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (heading) out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    else if (!line.trim()) out.push("");
    else if (/^\s*>\s?/.test(line)) out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`);
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) out.push("<hr/>");
    else out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  if (inCode) out.push("</pre>");
  return out.join("\n");
}

export function TextRenderer({ text, fileName }: { text: string; fileName: string }) {
  const isMarkdown = /\.(md|markdown)$/i.test(fileName);
  const isCsv = /\.csv$/i.test(fileName);
  const html = useMemo(() => (isMarkdown ? markdownToHtml(text) : ""), [isMarkdown, text]);

  if (isCsv) {
    const rows = text
      .split(/\r?\n/)
      .filter((l) => l.length)
      .slice(0, 500)
      .map((line) => line.split(",").map((c) => c.replace(/^"|"$/g, "")));
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    return (
      <div className="p-3 pb-8">
        <div className="doc-paper overflow-auto !p-0">
          <table className="doc-sheet">
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {Array.from({ length: width }, (_, c) => (
                    <td key={c}>{row[c] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (isMarkdown) {
    return (
      <Paper>
        <div className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />
      </Paper>
    );
  }

  return (
    <Paper>
      <pre className="doc-plain">{text}</pre>
    </Paper>
  );
}

/* ── legacy .doc / .ppt / .xls ── */

/** Pulls readable runs of text out of a legacy binary Office file. */
function extractLegacyText(bytes: Uint8Array): string {
  const pieces: string[] = [];

  // UTF-16LE runs (Word 97+ stores most body text this way)
  let buf = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if ((code >= 32 && code < 127) || code === 10 || code === 13 || code === 9) {
      buf += String.fromCharCode(code === 13 ? 10 : code);
    } else {
      if (buf.trim().length >= 6) pieces.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim().length >= 6) pieces.push(buf.trim());

  // ASCII runs (older/mixed records, and most .ppt text)
  buf = "";
  for (let i = 0; i < bytes.length; i++) {
    const code = bytes[i];
    if ((code >= 32 && code < 127) || code === 10 || code === 13 || code === 9) {
      buf += String.fromCharCode(code === 13 ? 10 : code);
    } else {
      if (buf.trim().length >= 12) pieces.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim().length >= 12) pieces.push(buf.trim());

  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const piece of pieces) {
    const text = piece.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/[ \t]{2,}/g, " ").trim();
    if (text.length < 6) continue;
    if (/^[A-Za-z0-9+/=]{40,}$/.test(text)) continue; // embedded blobs
    if (/(Microsoft|Word\.Document|PowerPoint|Excel|Root Entry|ObjectPool|Arial|Times New Roman|Calibri|Cambria)/i.test(text) && text.length < 60) continue;
    const key = text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
  }
  return cleaned.join("\n\n");
}

export function LegacyOfficeRenderer({ blob, fileName }: { blob: Blob; fileName: string }) {
  const { data, error } = useAsync(async () => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = extractLegacyText(bytes);
    if (!text.trim()) throw new Error("No readable text could be recovered from this legacy file.");
    return text;
  }, [blob]);

  if (error) return <RenderError text="Couldn't read this older Office file." detail={error} />;
  if (!data) return <Spinner label="Recovering the text…" />;

  return (
    <Paper>
      <p className="doc-note">
        Legacy format ({fileName.split(".").pop()?.toUpperCase()}) — showing the recovered text content.
        Download for the original layout.
      </p>
      <div className="doc-prose">
        {data.split("\n\n").map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    </Paper>
  );
}

/* ── ZIP ── */

type ZipEntry = { name: string; size: number; dir: boolean };

export function ZipRenderer({ blob, fileName }: { blob: Blob; fileName: string }) {
  const [openEntry, setOpenEntry] = useState<{ name: string; blob: Blob } | null>(null);
  const { data, error } = useAsync(async () => {
    const zip = await loadZip(blob);
    const entries: ZipEntry[] = [];
    for (const [path, file] of Object.entries(zip.files)) {
      if (path.startsWith("__MACOSX/")) continue;
      const dir = (file as any).dir ?? path.endsWith("/");
      if (dir) continue;
      entries.push({ name: path, size: (file as any)._data?.uncompressedSize ?? 0, dir: false });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return { zip, entries };
  }, [blob]);

  if (error) return <RenderError text="Couldn't open this archive." detail={error} />;
  if (!data) return <Spinner label="Reading the archive…" />;

  if (openEntry) {
    return (
      <div>
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
          <button
            onClick={() => setOpenEntry(null)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to archive
          </button>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{openEntry.name}</span>
        </div>
        <BlobRenderer blob={openEntry.blob} fileName={openEntry.name} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-8">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <FileArchive className="h-4 w-4 text-copper" /> {fileName} · {data.entries.filter((e) => !e.dir).length} files
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {data.entries
          .filter((e) => !e.dir)
          .map((entry) => (
            <li key={entry.name}>
              <button
                onClick={async () => {
                  const file = data.zip.file(entry.name);
                  if (!file) return;
                  const bytes = await (file as any).async("uint8array");
                  const inner = new Blob([bytes]);
                  setOpenEntry({ name: entry.name, blob: inner });
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
              >
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{entry.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

/* ── the universal entry point ── */

export type RenderKind =
  | "pdf"
  | "image"
  | "text"
  | "docx"
  | "pptx"
  | "xlsx"
  | "video"
  | "audio"
  | "zip"
  | "legacy-office"
  | "unknown";

export function kindForFile(fileName: string, mime?: string | null): RenderKind {
  const ext = (fileName.split("?")[0].split(".").pop() || "").toLowerCase();
  const type = (mime || "").split(";")[0].trim().toLowerCase();

  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "heic", "heif", "ico"].includes(ext) || type.startsWith("image/"))
    return "image";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (["doc", "ppt", "xls", "rtf"].includes(ext)) return "legacy-office";
  if (["zip", "epub", "jar", "apk"].includes(ext) || type === "application/zip") return "zip";
  if (["mp4", "webm", "mov", "m4v", "ogv"].includes(ext) || type.startsWith("video/")) return "video";
  if (["mp3", "wav", "m4a", "aac", "flac", "oga"].includes(ext) || type.startsWith("audio/")) return "audio";
  if (
    ["txt", "md", "markdown", "csv", "json", "log", "xml", "html", "htm", "yml", "yaml", "ts", "tsx", "js", "py", "java", "c", "cpp", "cs", "sql", "ini", "srt"].includes(ext) ||
    type.startsWith("text/")
  )
    return "text";
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  return "unknown";
}

/** Sniffs the real type from the bytes when name/mime aren't enough. */
export async function sniffKind(blob: Blob): Promise<RenderKind> {
  const bytes = new Uint8Array(await blob.slice(0, 8192).arrayBuffer());
  const b = (n: number) => bytes[n] ?? -1;
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "pdf";
  if (b(0) === 0xff && b(1) === 0xd8) return "image";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image";
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return "image";
  if (b(0) === 0x42 && b(1) === 0x4d) return "image";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46) return "image";
  if (b(4) === 0x66 && b(5) === 0x74 && b(6) === 0x79 && b(7) === 0x70) return "video";
  if (b(0) === 0x49 && b(1) === 0x44 && b(2) === 0x33) return "audio";
  // OLE2 compound file → legacy Office
  if (b(0) === 0xd0 && b(1) === 0xcf && b(2) === 0x11 && b(3) === 0xe0) return "legacy-office";
  if (b(0) === 0x50 && b(1) === 0x4b) {
    // OOXML packages name their parts inside the archive. Entry order
    // varies by producer (Word often writes [Content_Types].xml first),
    // so scan a decent chunk, not just the first record.
    const head = new TextDecoder("latin1").decode(bytes);
    if (head.includes("word/document.xml") || head.includes("word/")) return "docx";
    if (head.includes("ppt/slides/") || head.includes("ppt/")) return "pptx";
    if (head.includes("xl/workbook.xml") || head.includes("xl/")) return "xlsx";
    return "zip";
  }

  // Mostly-printable? treat as text.
  let printable = 0;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 160) printable++;
  }
  if (bytes.length && printable / bytes.length > 0.9) return "text";
  return "unknown";
}

/**
 * Renders ANY blob. Detection is name → mime → magic bytes, and a
 * mismatch between the file name and the actual bytes always defers to
 * the bytes, so a mislabelled upload still opens correctly.
 */
export function BlobRenderer({
  blob,
  fileName,
  mime,
}: {
  blob: Blob;
  fileName: string;
  mime?: string | null;
}) {
  const [kind, setKind] = useState<RenderKind | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setKind(null);
    setObjectUrl(null);
    setText(null);

    (async () => {
      let resolved = kindForFile(fileName, mime || blob.type);
      const sniffed = await sniffKind(blob);
      if (!active) return;
      // Bytes win, except when sniffing was inconclusive, or when the
      // name is more specific than a generic zip/text signature.
      // Bytes normally win (a mislabelled upload still opens correctly),
      // except when sniffing was inconclusive or only generic — a bare
      // "zip"/"text" signature must not override a specific file name.
      const OOXML: RenderKind[] = ["docx", "pptx", "xlsx"];
      if (sniffed !== "unknown" && sniffed !== resolved) {
        const genericOverSpecific =
          resolved !== "unknown" &&
          (sniffed === "text" || (sniffed === "zip" && OOXML.includes(resolved)));
        if (!genericOverSpecific) resolved = sniffed;
      }



      if (resolved === "image" || resolved === "video" || resolved === "audio") {
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      } else if (resolved === "text") {
        setText(await blob.text());
      }
      if (!active) return;
      setKind(resolved);
    })();

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blob, fileName, mime]);

  if (!kind) return <Spinner label="Opening…" />;

  switch (kind) {
    case "pdf":
      return <PdfRenderer blob={blob} />;
    case "docx":
      return <DocxRenderer blob={blob} />;
    case "pptx":
      return <PptxRenderer blob={blob} />;
    case "xlsx":
      return <XlsxRenderer blob={blob} />;
    case "legacy-office":
      return <LegacyOfficeRenderer blob={blob} fileName={fileName} />;
    case "zip":
      return <ZipRenderer blob={blob} fileName={fileName} />;
    case "text":
      return text === null ? <Spinner /> : <TextRenderer text={text} fileName={fileName} />;
    case "image":
      return (
        <div className="flex min-h-[240px] items-center justify-center p-4">
          {objectUrl && (
            <img src={objectUrl} alt={fileName} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-soft" />
          )}
        </div>
      );
    case "video":
      return (
        <div className="flex min-h-[240px] items-center justify-center p-4">
          {objectUrl && <video src={objectUrl} controls playsInline className="max-h-[75vh] w-full max-w-3xl rounded-xl bg-black" />}
        </div>
      );
    case "audio":
      return (
        <div className="flex min-h-[160px] items-center justify-center p-8">
          {objectUrl && <audio src={objectUrl} controls className="w-full max-w-xl" />}
        </div>
      );
    default:
      return <UnknownRenderer blob={blob} fileName={fileName} />;
  }
}

/** Last resort: show whatever readable text the bytes contain, plus a hex peek. */
function UnknownRenderer({ blob, fileName }: { blob: Blob; fileName: string }) {
  const { data } = useAsync(async () => {
    const bytes = new Uint8Array(await blob.slice(0, 400_000).arrayBuffer());
    return extractLegacyText(bytes);
  }, [blob]);

  return (
    <Paper>
      <p className="doc-note">
        {fileName.split(".").pop()?.toUpperCase() || "This"} file has no standard layout — showing the
        readable content found inside it. Download it for the original.
      </p>
      {data === null ? (
        <Spinner />
      ) : data.trim() ? (
        <pre className="doc-plain">{data}</pre>
      ) : (
        <p className="doc-plain opacity-60">No readable text inside this file.</p>
      )}
    </Paper>
  );
}
