// Full-screen in-app document viewer for Learnova.
//
// Renders files INSIDE the app:
// - PDF  → pdf.js canvas pages (hardened for pdfjs-dist v6)
// - Image → <img>
// - Text  → <pre>
// - DOCX → mammoth → HTML (true in-app Word preview)
// - PPTX → JSZip slide XML text extraction
// - XLSX → basic sheet text extraction
// - Video/Audio → native HTML5 players
//
// Does NOT use Google Docs gview with private Supabase signed URLs
// (that path is the main reason Office previews looked broken).

import "@/lib/polyfills";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Download, Bookmark, BookmarkCheck, Loader2, FileWarning, FileQuestion, Check, CloudOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  getViewUrl, forceDownload, downloadBlob, originalFileName,
  previewKind, previewKindFromMime, refinePreviewKind, sniffContentType, sniffFileSignature,
  type PreviewKind,
} from "@/lib/document-files";
import {
  useIncrementDownload, useSavedMaterials, useToggleSaved, type MaterialWithCourse,
} from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import {
  getOfflineMaterial, saveMaterialOfflineFromDownload, touchLastOpened, useOfflineStatus,
} from "@/lib/offline";

const MAX_PREVIEW_PAGES = 60;

/* ───────────────────────── PDF ───────────────────────── */

function PdfCanvasViewer({ blob }: { blob: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [truncated, setTruncated] = useState<{ shown: number; total: number } | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;

    async function render() {
      try {
        if (blob.size < 100) {
          throw new Error(
            `The stored file is only ${blob.size} bytes — the upload itself likely never completed.`,
          );
        }

        const [pdfjsLib, workerUrlMod] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);

        const lib: any = pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc = (workerUrlMod as any).default;

        const buffer = await blob.arrayBuffer();
        if (cancelled) return;

        pdfDoc = await lib.getDocument({
          data: new Uint8Array(buffer),
          useSystemFonts: true,
          disableAutoFetch: false,
          disableStream: false,
        }).promise;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        const pagesToRender = Math.min(pdfDoc.numPages, MAX_PREVIEW_PAGES);
        if (pagesToRender < pdfDoc.numPages) {
          setTruncated({ shown: pagesToRender, total: pdfDoc.numPages });
        }

        const containerWidth = Math.max(container.clientWidth || 360, 280);

        for (let i = 1; i <= pagesToRender; i++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(i);
          const unscaled = page.getViewport({ scale: 1 });
          const scale = Math.min(1.8, containerWidth / unscaled.width);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          const outputScale = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className =
            "mx-auto mb-3 block max-w-full rounded-lg border border-border shadow-soft bg-white";

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

          // pdf.js v4+/v6 expects canvas in render params
          const renderTask = page.render({
            canvasContext: ctx,
            viewport,
            canvas,
          });
          await renderTask.promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }

        if (!cancelled) setStatus("ready");
      } catch (e) {
        console.error("PDF render failed:", e);
        if (!cancelled) {
          setErrorDetail(e instanceof Error ? e.message : String(e));
          setStatus("error");
        }
      }
    }

    render();
    return () => {
      cancelled = true;
      try {
        pdfDoc?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [blob]);

  if (status === "error") {
    return (
      <ViewerMessage
        icon={FileWarning}
        text="Couldn't render this PDF — try downloading it instead."
        detail={errorDetail}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      {status === "loading" && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      <div ref={containerRef} />
      {truncated && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Showing the first {truncated.shown} of {truncated.total} pages — download to see the rest.
        </p>
      )}
    </div>
  );
}

/* ───────────────────────── DOCX ───────────────────────── */

function DocxViewer({ blob }: { blob: Blob }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mammoth = await import("mammoth");
        const arrayBuffer = await blob.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!active) return;
        setHtml(result.value || "<p>(Empty document)</p>");
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [blob]);

  if (error) {
    return (
      <ViewerMessage icon={FileWarning} text="Couldn't preview this Word document." detail={error} />
    );
  }
  if (!html) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div
        className="prose prose-sm dark:prose-invert max-w-none rounded-2xl border border-border bg-card p-5 text-foreground"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/* ───────────────────────── PPTX ───────────────────────── */

function PptxViewer({ blob }: { blob: Blob }) {
  const [slides, setSlides] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        const slideFiles = Object.keys(zip.files)
          .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
          .sort((a, b) => {
            const na = parseInt(a.match(/slide(\d+)/i)?.[1] ?? "0", 10);
            const nb = parseInt(b.match(/slide(\d+)/i)?.[1] ?? "0", 10);
            return na - nb;
          });

        const extracted: string[] = [];
        for (const name of slideFiles.slice(0, 40)) {
          const xml = await zip.files[name].async("text");
          const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
            .map((m) => decodeXml(m[1]).trim())
            .filter(Boolean);
          extracted.push(texts.join("\n") || "(Empty slide)");
        }

        if (!active) return;
        if (!extracted.length) throw new Error("No readable slides found in this PowerPoint file.");
        setSlides(extracted);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [blob]);

  if (error) {
    return <ViewerMessage icon={FileWarning} text="Couldn't preview this PowerPoint." detail={error} />;
  }
  if (!slides) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      {slides.map((text, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-copper">
            Slide {i + 1}
          </div>
          <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {text}
          </pre>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── XLSX ───────────────────────── */

function XlsxViewer({ blob }: { blob: Blob }) {
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());

        let shared: string[] = [];
        const ss = zip.file("xl/sharedStrings.xml");
        if (ss) {
          const xml = await ss.async("text");
          shared = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => {
            const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1]));
            return texts.join("");
          });
        }

        const sheetFiles = Object.keys(zip.files)
          .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
          .sort();

        const out: { name: string; rows: string[][] }[] = [];
        for (let s = 0; s < Math.min(sheetFiles.length, 5); s++) {
          const xml = await zip.files[sheetFiles[s]].async("text");
          const rowMatches = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 80);
          const rows: string[][] = [];
          for (const rm of rowMatches) {
            const cells = [...rm[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^/]*)\/>/g)];
            const row: string[] = [];
            for (const c of cells) {
              const attrs = c[1] || c[3] || "";
              const body = c[2] || "";
              const isShared = /\bt="s"/.test(attrs);
              const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
              if (v == null) {
                row.push("");
                continue;
              }
              if (isShared) {
                const idx = parseInt(v, 10);
                row.push(shared[idx] ?? v);
              } else {
                row.push(decodeXml(v));
              }
            }
            if (row.some((x) => x.trim())) rows.push(row);
          }
          out.push({ name: `Sheet ${s + 1}`, rows });
        }

        if (!active) return;
        if (!out.length) throw new Error("No readable sheets found.");
        setSheets(out);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [blob]);

  if (error) {
    return (
      <ViewerMessage icon={FileWarning} text="Couldn't preview this spreadsheet." detail={error} />
    );
  }
  if (!sheets) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      {sheets.map((sheet) => (
        <div key={sheet.name}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-copper">
            {sheet.name}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-full text-left text-xs">
              <tbody>
                {sheet.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-border/60">
                    {row.map((cell, ci) => (
                      <td key={ci} className="whitespace-pre-wrap px-3 py-2 text-foreground">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/* ───────────────────────── MAIN VIEWER ───────────────────────── */

export function DocumentViewer({
  open,
  onClose,
  materialId,
  filePath,
  title,
  material = null,
}: {
  open: boolean;
  onClose: () => void;
  materialId: string;
  filePath: string | null;
  title: string;
  material?: MaterialWithCourse | null;
}) {
  const { user } = useAuth();
  const incrementDownload = useIncrementDownload();
  const { data: saved } = useSavedMaterials();
  const toggleSaved = useToggleSaved();
  const isSaved = (saved ?? []).some((s) => s.material_id === materialId);
  const { downloaded } = useOfflineStatus(materialId);

  const [kind, setKind] = useState<PreviewKind | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [usingOfflineCopy, setUsingOfflineCopy] = useState(false);

  useEffect(() => {
    if (!open || !filePath) return;
    let active = true;
    let localObjectUrl: string | null = null;

    setKind(null);
    setPreviewBlob(null);
    setObjectUrl(null);
    setTextContent(null);
    setLoadError(false);
    setErrorDetail(null);
    setUsingOfflineCopy(false);

    async function renderFromBlob(resolvedKind: PreviewKind, blob: Blob) {
      setPreviewBlob(blob);
      if (resolvedKind === "image" || resolvedKind === "video" || resolvedKind === "audio") {
        localObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(localObjectUrl);
      } else if (resolvedKind === "text") {
        setTextContent(await blob.text());
      }
    }

    async function useOfflineCopy(): Promise<boolean> {
      const bundle = await getOfflineMaterial(materialId);
      if (!active || !bundle?.fileBlob) return false;
      const detected = refinePreviewKind(
        previewKindFromMime(bundle.fileMime || bundle.fileBlob.type || null),
        filePath,
        bundle.fileMime || bundle.fileBlob.type || null,
      );
      const finalKind = detected === "none" ? previewKind(filePath!) : detected;
      setKind(finalKind);
      await renderFromBlob(finalKind, bundle.fileBlob);
      setUsingOfflineCopy(true);
      touchLastOpened(materialId);
      return true;
    }

    async function resolveKind(signedUrl: string, blobHint: Blob | null): Promise<PreviewKind> {
      const extKind = previewKind(filePath!);
      if (extKind !== "none" && extKind !== "office") return extKind;

      const mime = blobHint?.type || (await sniffContentType(signedUrl));
      const fromMime = previewKindFromMime(mime);
      if (fromMime !== "none" && fromMime !== "office") return fromMime;

      const magic = await sniffFileSignature(signedUrl);
      return refinePreviewKind(magic, filePath, mime);
    }

    async function load() {
      if (!navigator.onLine) {
        const usedCache = await useOfflineCopy();
        if (!usedCache && active) {
          setLoadError(true);
          setErrorDetail("Offline and no cached file available.");
        }
        return;
      }

      try {
        const signed = await getViewUrl(filePath!);
        if (!active) return;
        touchLastOpened(materialId);

        const response = await fetch(signed);
        if (!response.ok) throw new Error(`Couldn't fetch file (status ${response.status}).`);
        const blob = await response.blob();
        if (!active) return;

        const resolvedKind = await resolveKind(signed, blob);
        if (!active) return;
        setKind(resolvedKind);
        await renderFromBlob(resolvedKind, blob);
      } catch (e) {
        const usedCache = await useOfflineCopy();
        if (!usedCache && active) {
          setLoadError(true);
          setErrorDetail(e instanceof Error ? e.message : String(e));
        }
      }
    }

    load();
    return () => {
      active = false;
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filePath, materialId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const ready =
    kind === "pdf"
      ? !!previewBlob
      : kind === "image" || kind === "video" || kind === "audio"
        ? !!objectUrl
        : kind === "text"
          ? textContent !== null
          : kind === "docx" || kind === "pptx" || kind === "xlsx"
            ? !!previewBlob
            : kind === "office" || kind === "none"
              ? true
              : false;

  async function handleDownload() {
    if (!filePath) return;
    setDownloading(true);
    try {
      let blob: Blob;
      if (previewBlob) {
        downloadBlob(previewBlob, originalFileName(filePath, title));
        blob = previewBlob;
      } else {
        blob = await forceDownload(filePath, title);
      }
      incrementDownload.mutate(materialId);
      if (material) {
        await saveMaterialOfflineFromDownload(material, { blob, mime: blob.type });
        toast.success("Downloaded — also in your Library for offline viewing.");
      }
    } catch {
      toast.error("Couldn't download that file right now — try again in a moment.");
    } finally {
      setDownloading(false);
    }
  }

  function handleToggleSave() {
    if (!user) {
      toast.error("Sign in to save this.");
      return;
    }
    toggleSaved.mutate({ materialId, save: !isSaved });
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="document-viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] flex flex-col bg-background"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2.5 sm:px-4">
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-foreground transition-colors hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</div>
          <button
            onClick={handleToggleSave}
            disabled={toggleSaved.isPending}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-colors disabled:opacity-50 ${
              isSaved
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-foreground hover:bg-muted"
            }`}
            aria-label={isSaved ? "Remove from saved" : "Save"}
          >
            {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || !filePath}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-transform hover:scale-[1.02] active:scale-100 disabled:cursor-default disabled:opacity-50 ${
              downloaded ? "bg-teal/10 text-teal" : "bg-primary text-primary-foreground"
            }`}
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : downloaded ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {downloaded ? "Downloaded" : "Download"}
          </button>
        </div>

        {usingOfflineCopy && (
          <div className="flex items-center gap-1.5 bg-copper/10 px-4 py-1.5 text-[11px] font-medium text-copper">
            <CloudOff className="h-3 w-3" /> Showing your offline copy
          </div>
        )}

        <div className="relative flex-1 overflow-auto bg-surface-muted">
          {!filePath ? (
            <ViewerMessage icon={FileWarning} text="No file is attached to this material." />
          ) : loadError ? (
            <ViewerMessage
              icon={FileWarning}
              text={
                navigator.onLine
                  ? "Couldn't open a preview right now — check your connection, or try downloading it instead."
                  : "You're offline and this document hasn't been downloaded yet — connect once and tap Download."
              }
              detail={errorDetail}
            />
          ) : kind === null || !ready ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : kind === "pdf" ? (
            <PdfCanvasViewer blob={previewBlob!} />
          ) : kind === "image" ? (
            <div className="flex min-h-full items-center justify-center p-4">
              <img
                src={objectUrl!}
                alt={title}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            </div>
          ) : kind === "text" ? (
            <pre className="mx-auto max-w-3xl whitespace-pre-wrap break-words p-6 font-mono text-xs leading-relaxed text-foreground">
              {textContent}
            </pre>
          ) : kind === "docx" ? (
            <DocxViewer blob={previewBlob!} />
          ) : kind === "pptx" ? (
            <PptxViewer blob={previewBlob!} />
          ) : kind === "xlsx" ? (
            <XlsxViewer blob={previewBlob!} />
          ) : kind === "video" ? (
            <div className="flex min-h-full items-center justify-center p-4">
              <video
                src={objectUrl!}
                controls
                playsInline
                className="max-h-[80vh] w-full max-w-3xl rounded-xl bg-black"
              />
            </div>
          ) : kind === "audio" ? (
            <div className="flex min-h-full items-center justify-center p-8">
              <audio src={objectUrl!} controls className="w-full max-w-xl" />
            </div>
          ) : (
            <ViewerMessage
              icon={FileQuestion}
              text="No rich inline preview for this older file format (.doc/.ppt/.xls). Download it to open on your device — DOCX/PPTX/XLSX/PDF/images/videos preview in-app."
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function ViewerMessage({
  icon: Icon,
  text,
  detail,
}: {
  icon: typeof FileWarning;
  text: string;
  detail?: string | null;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper">
        <Icon className="h-6 w-6" />
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
