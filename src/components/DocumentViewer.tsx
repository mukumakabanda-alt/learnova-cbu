// Full-screen in-app document viewer for Learnova.
//
// This file is only the *shell*: fetch the bytes (from storage when
// online, from the offline cache otherwise), then hand the Blob to
// Learnova's own rendering engine in @/components/doc-render, which
// paints PDFs, Word, PowerPoint, Excel, legacy Office, ZIP archives,
// markdown, images, video and audio entirely in-app. No Google gview,
// no Office Online, nothing external — so a saved document opens the
// same way with the network switched off.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Download, Bookmark, BookmarkCheck, Loader2, FileWarning, Check, CloudOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  getViewUrl, forceDownload, forceDownloadBundleAsZip, downloadBlob, originalFileName,
} from "@/lib/document-files";
import { BlobRenderer, BundleRenderer, RenderError } from "@/components/doc-render";
import {
  useIncrementDownload, useSavedMaterials, useToggleSaved, type MaterialWithCourse,
} from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import {
  getOfflineMaterial, saveMaterialOfflineFromDownload, touchLastOpened,
} from "@/lib/offline";

/* ───────────────────────── shared loading hook ───────────────────────── */

type LoadState = {
  blob: Blob | null;
  mime: string | null;
  fromOffline: boolean;
  error: string | null;
};

function useDocumentBlob(materialId: string, filePath: string | null, enabled: boolean): LoadState {
  const [state, setState] = useState<LoadState>({
    blob: null,
    mime: null,
    fromOffline: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !filePath) return;
    let active = true;
    setState({ blob: null, mime: null, fromOffline: false, error: null });

    async function fromCache(): Promise<boolean> {
      const bundle = await getOfflineMaterial(materialId);
      if (!active || !bundle?.fileBlob) return false;
      setState({
        blob: bundle.fileBlob,
        mime: bundle.fileMime || bundle.fileBlob.type || null,
        fromOffline: true,
        error: null,
      });
      touchLastOpened(materialId);
      return true;
    }

    (async () => {
      // Offline-first when the browser says we're offline, network otherwise
      // with a cache fallback on any failure.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const used = await fromCache();
        if (!used && active) {
          setState({
            blob: null,
            mime: null,
            fromOffline: false,
            error: "You're offline and this document hasn't been saved to your device yet.",
          });
        }
        return;
      }

      try {
        const signed = await getViewUrl(filePath!);
        const response = await fetch(signed);
        if (!response.ok) throw new Error(`Couldn't fetch the file (status ${response.status}).`);
        const blob = await response.blob();
        if (!active) return;
        touchLastOpened(materialId);
        setState({
          blob,
          mime: blob.type || response.headers.get("content-type"),
          fromOffline: false,
          error: null,
        });
      } catch (e) {
        const used = await fromCache();
        if (!used && active) {
          setState({
            blob: null,
            mime: null,
            fromOffline: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [materialId, filePath, enabled]);

  return state;
}

type BundleLoadState = {
  pages: Blob[];
  fromOffline: boolean;
  error: string | null;
};

/**
 * Same online → offline-fallback strategy as useDocumentBlob above, for a
 * bundled multi-image material's full set of pages (cover + extras)
 * instead of one file. Cache is only ever treated as usable when EVERY
 * page came down for it — a bundle showing 2 of 3 pages with nothing
 * telling the student a page is missing is worse than clearly needing
 * the network.
 */
function useDocumentBundleBlobs(
  materialId: string,
  filePath: string | null,
  extraFilePaths: string[],
  enabled: boolean,
): BundleLoadState {
  const [state, setState] = useState<BundleLoadState>({ pages: [], fromOffline: false, error: null });
  const pathsKey = [filePath, ...extraFilePaths].join("\u0001");

  useEffect(() => {
    if (!enabled || !filePath) return;
    let active = true;
    setState({ pages: [], fromOffline: false, error: null });

    const allPaths = [filePath, ...extraFilePaths];

    async function fromCache(): Promise<boolean> {
      const bundle = await getOfflineMaterial(materialId);
      if (!active || !bundle?.fileBlob) return false;
      const pages = [bundle.fileBlob, ...(bundle.extraFileBlobs ?? [])];
      if (pages.length < allPaths.length) return false;
      setState({ pages, fromOffline: true, error: null });
      touchLastOpened(materialId);
      return true;
    }

    (async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const used = await fromCache();
        if (!used && active) {
          setState({ pages: [], fromOffline: false, error: "You're offline and this document hasn't been saved to your device yet." });
        }
        return;
      }

      try {
        const blobs = await Promise.all(
          allPaths.map(async (p) => {
            const signed = await getViewUrl(p);
            const response = await fetch(signed);
            if (!response.ok) throw new Error(`Couldn't fetch a page (status ${response.status}).`);
            return response.blob();
          }),
        );
        if (!active) return;
        touchLastOpened(materialId);
        setState({ pages: blobs, fromOffline: false, error: null });
      } catch (e) {
        const used = await fromCache();
        if (!used && active) {
          setState({ pages: [], fromOffline: false, error: e instanceof Error ? e.message : String(e) });
        }
      }
    })();

    return () => {
      active = false;
    };
    // extraFilePaths is folded into pathsKey below so the effect doesn't
    // re-run every render over a new-but-equal array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId, pathsKey, enabled]);

  return state;
}

/* ───────────────────────── modal viewer ───────────────────────── */

export function DocumentViewer({
  open,
  onClose,
  materialId,
  filePath,
  title,
  material,
}: {
  open: boolean;
  onClose: () => void;
  materialId: string;
  filePath: string | null;
  title: string;
  material?: MaterialWithCourse | null;
}) {
  const { user } = useAuth();
  const { data: saved } = useSavedMaterials();
  const toggleSaved = useToggleSaved();
  const incrementDownload = useIncrementDownload();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const isSaved = !!saved?.some((s) => s.material_id === materialId);
  const extraFilePaths = material?.extra_file_paths ?? [];
  const isBundle = extraFilePaths.length > 0;
  const single = useDocumentBlob(materialId, filePath, open && !isBundle);
  const bundle = useDocumentBundleBlobs(materialId, filePath, extraFilePaths, open && isBundle);
  const fromOffline = isBundle ? bundle.fromOffline : single.fromOffline;
  const error = isBundle ? bundle.error : single.error;
  const ready = isBundle ? bundle.pages.length > 0 : !!single.blob;

  useEffect(() => {
    if (!open) return;
    setDownloaded(false);
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

  const fileName = filePath ? originalFileName(filePath, title) : title;

  async function handleDownload() {
    if (!filePath) return;
    setDownloading(true);
    try {
      if (isBundle) {
        await forceDownloadBundleAsZip([filePath, ...extraFilePaths], title);
        incrementDownload.mutate(materialId);
        setDownloaded(true);
        if (material) {
          // A bundle fetches and caches page-by-page inside this call
          // itself (it already knows to walk extra_file_paths) — there's
          // no single pre-fetched blob to hand it the way there is below.
          await saveMaterialOfflineFromDownload(material);
          toast.success("Downloaded — also saved for offline viewing.");
        }
      } else {
        let file: Blob;
        if (single.blob) {
          downloadBlob(single.blob, fileName);
          file = single.blob;
        } else {
          file = await forceDownload(filePath, title);
        }
        incrementDownload.mutate(materialId);
        setDownloaded(true);
        if (material) {
          await saveMaterialOfflineFromDownload(material, { blob: file, mime: file.type });
          toast.success("Downloaded — also saved for offline viewing.");
        }
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

        {fromOffline && (
          <div className="flex items-center gap-1.5 bg-copper/10 px-4 py-1.5 text-[11px] font-medium text-copper">
            <CloudOff className="h-3 w-3" /> Showing your offline copy
          </div>
        )}

        <div className="relative flex-1 overflow-auto bg-surface-muted">
          {!filePath ? (
            <RenderError text="No file is attached to this material." />
          ) : error ? (
            <RenderError text="Couldn't open this document right now." detail={error} />
          ) : !ready ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : isBundle ? (
            <BundleRenderer pages={bundle.pages} />
          ) : (
            <BlobRenderer blob={single.blob!} fileName={fileName} mime={single.mime} />
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

/* ───────────────────────── inline preview (study page) ───────────────────────── */

export function InlineDocumentPreview({
  materialId,
  filePath,
  title,
  extraFilePaths = [],
}: {
  materialId: string;
  filePath: string | null;
  title: string;
  extraFilePaths?: string[];
}) {
  const isBundle = extraFilePaths.length > 0;
  const single = useDocumentBlob(materialId, filePath, !isBundle);
  const bundle = useDocumentBundleBlobs(materialId, filePath, extraFilePaths, isBundle);
  const fromOffline = isBundle ? bundle.fromOffline : single.fromOffline;
  const error = isBundle ? bundle.error : single.error;
  const ready = isBundle ? bundle.pages.length > 0 : !!single.blob;

  if (!filePath) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-border bg-surface-muted">
        <p className="text-sm text-muted-foreground">No file attached to this material yet.</p>
      </div>
    );
  }

  const fileName = originalFileName(filePath, title);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-muted">
      {fromOffline && (
        <div className="flex items-center gap-1.5 bg-copper/10 px-4 py-1.5 text-[11px] font-medium text-copper">
          <CloudOff className="h-3 w-3" /> Showing your offline copy
        </div>
      )}
      <div className="max-h-[70vh] overflow-auto">
        {error ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <FileWarning className="h-6 w-6 text-copper" />
            <p className="max-w-xs text-sm text-muted-foreground">{error}</p>
          </div>
        ) : !ready ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isBundle ? (
          <BundleRenderer pages={bundle.pages} />
        ) : (
          <BlobRenderer blob={single.blob!} fileName={fileName} mime={single.mime} />
        )}
      </div>
    </div>
  );
      }
