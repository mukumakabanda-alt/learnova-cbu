// Full-screen in-website document viewer.
//
// PDFs are rendered page-by-page onto plain <canvas> elements using
// pdf.js (already a dependency — it's what reads text out of uploads in
// document-text.ts) instead of an <iframe src="..."> pointed at a blob:
// or signed URL. That approach depends on the browser's own built-in PDF
// viewer deciding to render the resource inline rather than treat it as
// a completed download — which turned out to be inconsistent. Drawing
// the pages ourselves removes that decision from the picture entirely:
// there is no download to trigger, nothing handed off anywhere — just
// pixels on a canvas we control. Plain text is read and shown directly
// for the same reason. Images keep using <img>, which never had this
// problem.
//
// Online, it always prefers a fresh copy; offline, or if the network
// request fails, it falls back to whatever's cached in the Offline
// Library (see src/lib/offline.ts) — using the exact same rendering path
// either way.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Download, Bookmark, BookmarkCheck, Loader2, FileWarning, FileQuestion, Check, CloudOff } from "lucide-react";
import { toast } from "sonner";
import {
  getViewUrl, forceDownload, downloadBlob, originalFileName,
  previewKind, previewKindFromMime, sniffContentType, sniffFileSignature, type PreviewKind,
} from "@/lib/document-files";
import { useIncrementDownload, useSavedMaterials, useToggleSaved, type MaterialWithCourse } from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import { getOfflineMaterial, saveMaterialOfflineFromDownload, touchLastOpened, useOfflineStatus } from "@/lib/offline";

const MAX_PREVIEW_PAGES = 40;

// Renders a PDF (given as a Blob — never a URL) page by page onto plain
// <canvas> elements via pdf.js. See the file-level comment above for why
// this exists instead of an iframe.
function PdfCanvasViewer({ blob }: { blob: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [truncated, setTruncated] = useState<{ shown: number; total: number } | null>(null);
  // The real underlying reason, surfaced instead of a generic message —
  // this is the difference between guessing what's wrong and actually
  // knowing. Distinguishes, for example, "the stored file is 0 bytes"
  // (an upload/storage problem) from a genuine PDF parsing error (a
  // malformed or unusual file) from a worker-loading failure (an
  // environment/asset-serving problem, not the file at all).
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;

    async function render() {
      try {
        if (blob.size < 100) {
          throw new Error(`The stored file is only ${blob.size} bytes — the upload itself likely never completed; this isn't a rendering problem.`);
        }

        const [pdfjsLib, workerUrlMod] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        (pdfjsLib as any).GlobalWorkerOptions.workerSrc = (workerUrlMod as any).default;

        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        pdfDoc = await (pdfjsLib as any).getDocument({ data: buffer }).promise;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        const pagesToRender = Math.min(pdfDoc.numPages, MAX_PREVIEW_PAGES);
        if (pagesToRender < pdfDoc.numPages) setTruncated({ shown: pagesToRender, total: pdfDoc.numPages });

        for (let i = 1; i <= pagesToRender; i++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1.6 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-3 block max-w-full rounded-lg border border-border shadow-soft";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
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
      pdfDoc?.destroy?.();
    };
  }, [blob]);

  if (status === "error") {
    return <ViewerMessage icon={FileWarning} text="Couldn't render this PDF — try downloading it instead." detail={errorDetail} />;
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
  /** When provided, Download also caches this material for the Offline Library — see saveMaterialOfflineFromDownload. */
  material?: MaterialWithCourse | null;
}) {
  const { user } = useAuth();
  const incrementDownload = useIncrementDownload();
  const { data: saved } = useSavedMaterials();
  const toggleSaved = useToggleSaved();
  const isSaved = (saved ?? []).some((s) => s.material_id === materialId);
  const { downloaded } = useOfflineStatus(materialId);

  const [kind, setKind] = useState<PreviewKind | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null); // for "pdf" (fed straight to pdf.js) and reused for Download
  const [imageUrl, setImageUrl] = useState<string | null>(null); // for "image" — <img> only, never an iframe
  const [textContent, setTextContent] = useState<string | null>(null); // for "text"
  const [officeUrl, setOfficeUrl] = useState<string | null>(null); // for "office" — Google's viewer needs a real fetchable URL, can't use a local blob
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [usingOfflineCopy, setUsingOfflineCopy] = useState(false);

  useEffect(() => {
    if (!open || !filePath) return;
    let active = true;
    let localImageUrl: string | null = null;
    setKind(null);
    setPreviewBlob(null);
    setImageUrl(null);
    setTextContent(null);
    setOfficeUrl(null);
    setLoadError(false);
    setUsingOfflineCopy(false);

    async function renderFromBlob(resolvedKind: PreviewKind, blob: Blob) {
      setPreviewBlob(blob);
      if (resolvedKind === "image") {
        localImageUrl = URL.createObjectURL(blob);
        setImageUrl(localImageUrl);
      } else if (resolvedKind === "text") {
        setTextContent(await blob.text());
      }
      // "pdf" needs nothing further here — PdfCanvasViewer reads previewBlob directly.
    }

    async function useOfflineCopy(): Promise<boolean> {
      const bundle = await getOfflineMaterial(materialId);
      if (!active || !bundle?.fileBlob) return false;
      const detectedKind = previewKindFromMime(bundle.fileMime || bundle.fileBlob.type || null);
      setKind(detectedKind);
      if (detectedKind === "pdf" || detectedKind === "image" || detectedKind === "text") {
        await renderFromBlob(detectedKind, bundle.fileBlob);
      }
      setUsingOfflineCopy(true);
      touchLastOpened(materialId);
      return true;
    }

    async function resolveKind(signedUrl: string): Promise<PreviewKind> {
      const extKind = previewKind(filePath!);
      if (extKind !== "none") return extKind;
      const mime = await sniffContentType(signedUrl);
      const fromMime = previewKindFromMime(mime);
      if (fromMime !== "none") return fromMime;
      return sniffFileSignature(signedUrl);
    }

    async function load() {
      if (!navigator.onLine) {
        const usedCache = await useOfflineCopy();
        if (!usedCache && active) setLoadError(true);
        return;
      }
      try {
        const signed = await getViewUrl(filePath);
        if (!active) return;
        touchLastOpened(materialId);

        const resolvedKind = await resolveKind(signed);
        if (!active) return;
        setKind(resolvedKind);

        if (resolvedKind === "office" || resolvedKind === "none") {
          setOfficeUrl(signed);
          return;
        }

        const response = await fetch(signed);
        if (!response.ok) throw new Error(`status ${response.status}`);
        const blob = await response.blob();
        if (!active) return;
        await renderFromBlob(resolvedKind, blob);
      } catch {
        const usedCache = await useOfflineCopy();
        if (!usedCache && active) setLoadError(true);
      }
    }

    load();
    return () => {
      active = false;
      if (localImageUrl) URL.revokeObjectURL(localImageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filePath, materialId]);

  // Locks page scroll behind the full-screen overlay while it's open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const ready =
    kind === "pdf" ? !!previewBlob :
    kind === "image" ? !!imageUrl :
    kind === "text" ? textContent !== null :
    kind === "office" ? !!officeUrl :
    kind === "none";

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
        toast.success("Downloaded — also in your Library, opens with zero signal from here on.");
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
              isSaved ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:bg-muted"
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
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : downloaded ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
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
                  : "You're offline and this document hasn't been downloaded yet — connect once and tap Download to make it available with zero signal."
              }
            />
          ) : kind === null || !ready ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : kind === "pdf" ? (
            <PdfCanvasViewer blob={previewBlob!} />
          ) : kind === "image" ? (
            <div className="flex min-h-full items-center justify-center p-4">
              <img src={imageUrl!} alt={title} className="max-h-full max-w-full rounded-lg object-contain" />
            </div>
          ) : kind === "text" ? (
            <pre className="mx-auto max-w-3xl whitespace-pre-wrap break-words p-6 font-mono text-xs leading-relaxed text-foreground">
              {textContent}
            </pre>
          ) : kind === "office" ? (
            usingOfflineCopy ? (
              <ViewerMessage icon={FileQuestion} text="Office documents need an internet connection to preview, even from your offline copy — download it to open it on your device instead." />
            ) : (
              <>
                <iframe
                  title={title}
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(officeUrl!)}&embedded=true`}
                  className="h-full w-full border-0"
                />
                <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/90 px-4 py-2 text-center text-[11px] text-muted-foreground">
                  This preview needs an internet connection to load. If it doesn't appear, download the file instead.
                </p>
              </>
            )
          ) : (
            <ViewerMessage icon={FileQuestion} text="No inline preview for this file type — download it to open it on your device." />
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function ViewerMessage({ icon: Icon, text, detail }: { icon: typeof FileWarning; text: string; detail?: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper">
        <Icon className="h-6 w-6" />
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
      {detail && (
        <p className="max-w-xs rounded-lg bg-surface px-3 py-2 font-mono text-[11px] text-muted-foreground/70">{detail}</p>
      )}
    </div>
  );
    }
