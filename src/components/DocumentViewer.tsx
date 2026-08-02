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
  getViewUrl, forceDownload, downloadBlob, originalFileName,
} from "@/lib/document-files";
import { BlobRenderer, RenderError } from "@/components/doc-render";
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
  const { blob, mime, fromOffline, error } = useDocumentBlob(materialId, filePath, open);

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
      let file: Blob;
      if (blob) {
        downloadBlob(blob, fileName);
        file = blob;
      } else {
        file = await forceDownload(filePath, title);
      }
      incrementDownload.mutate(materialId);
      setDownloaded(true);
      if (material) {
        await saveMaterialOfflineFromDownload(material, { blob: file, mime: file.type });
        toast.success("Downloaded — also saved for offline viewing.");
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
          ) : !blob ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <BlobRenderer blob={blob} fileName={fileName} mime={mime} />
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
}: {
  materialId: string;
  filePath: string | null;
  title: string;
}) {
  const { blob, mime, fromOffline, error } = useDocumentBlob(materialId, filePath, true);

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
        ) : !blob ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <BlobRenderer blob={blob} fileName={fileName} mime={mime} />
        )}
      </div>
    </div>
  );
}
