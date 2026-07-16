// Full-screen in-website document viewer.
//
// Renders a preview right inside the site — PDFs and images natively,
// Office files through Google's document viewer — with Save and
// Download right next to it. Online, it always prefers a fresh copy;
// offline, or if the network request itself fails, it falls back to
// whatever's cached in the Offline Library (see src/lib/offline.ts) —
// so a downloaded document genuinely opens with zero signal, not just
// its summary.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Download, Bookmark, BookmarkCheck, Loader2, FileWarning, FileQuestion, Check, CloudOff } from "lucide-react";
import { toast } from "sonner";
import { getViewUrl, forceDownload, previewKind, previewKindFromMime, sniffContentType, sniffFileSignature, type PreviewKind } from "@/lib/document-files";
import { useIncrementDownload, useSavedMaterials, useToggleSaved, type MaterialWithCourse } from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import { saveMaterialOfflineFromDownload, getOfflineFileUrl, touchLastOpened, useOfflineStatus } from "@/lib/offline";

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
  /** When provided, Download also caches this material for the Offline Library — see saveMaterialOfflineFromDownload. Optional so DocumentViewer still works for pure previewing without it. */
  material?: MaterialWithCourse | null;
}) {
  const { user } = useAuth();
  const incrementDownload = useIncrementDownload();
  const { data: saved } = useSavedMaterials();
  const toggleSaved = useToggleSaved();
  const isSaved = (saved ?? []).some((s) => s.material_id === materialId);
  const { downloaded } = useOfflineStatus(materialId);

  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sniffedKind, setSniffedKind] = useState<PreviewKind | null>(null);
  const [usingOfflineCopy, setUsingOfflineCopy] = useState(false);

  useEffect(() => {
    if (!open || !filePath) return;
    let active = true;
    setUrl(null);
    setLoadError(false);
    setSniffedKind(null);
    setUsingOfflineCopy(false);

    async function useOfflineCopy(): Promise<boolean> {
      const cached = await getOfflineFileUrl(materialId);
      if (!active || !cached) return false;
      setUrl(cached.url);
      setSniffedKind(previewKindFromMime(cached.mime));
      setUsingOfflineCopy(true);
      touchLastOpened(materialId);
      return true;
    }

    async function load() {
      // Genuinely offline: don't wait on a network request that's going
      // to fail anyway — go straight to whatever's cached.
      if (!navigator.onLine) {
        const usedCache = await useOfflineCopy();
        if (!usedCache && active) setLoadError(true);
        return;
      }
      // Online: always prefer a fresh copy, but fall back to the cached
      // one instead of a hard error if the request itself fails — a real
      // scenario on unreliable mobile data, not just a "no signal" one.
      try {
        const signed = await getViewUrl(filePath);
        if (!active) return;
        setUrl(signed);
        touchLastOpened(materialId);
        if (previewKind(filePath) === "none") {
          const mime = await sniffContentType(signed);
          let detected = previewKindFromMime(mime);
          if (detected === "none") {
            // Content-Type sniffing also came up empty (Storage has this
            // one recorded as a generic type, e.g. application/octet-
            // stream, because the browser couldn't detect a MIME type at
            // upload time either) — read the file's own first bytes
            // directly, which works regardless of what any browser ever
            // reported about it.
            detected = await sniffFileSignature(signed);
          }
          if (active) setSniffedKind(detected);
        }
      } catch {
        const usedCache = await useOfflineCopy();
        if (!usedCache && active) setLoadError(true);
      }
    }

    load();
    return () => {
      active = false;
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

  const extKind = filePath ? previewKind(filePath) : "none";
  const stillSniffing = extKind === "none" && !!url && sniffedKind === null;
  const kind: PreviewKind = extKind !== "none" ? extKind : (sniffedKind ?? "none");

  async function handleDownload() {
    if (!filePath) return;
    setDownloading(true);
    try {
      const blob = await forceDownload(filePath, title);
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
        {/* Toolbar: title, save, download, close — always visible, never scrolls away */}
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

        {/* Preview body */}
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
          ) : !url || stillSniffing ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : kind === "pdf" ? (
            <iframe title={title} src={url} className="h-full w-full border-0" />
          ) : kind === "image" ? (
            <div className="flex min-h-full items-center justify-center p-4">
              <img src={url} alt={title} className="max-h-full max-w-full rounded-lg object-contain" />
            </div>
          ) : kind === "office" ? (
            usingOfflineCopy ? (
              <ViewerMessage icon={FileQuestion} text="Office documents need an internet connection to preview, even from your offline copy — download it to open it on your device instead." />
            ) : (
              <>
                <iframe
                  title={title}
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
                  className="h-full w-full border-0"
                />
                <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/90 px-4 py-2 text-center text-[11px] text-muted-foreground">
                  This preview needs an internet connection to load. If it doesn't appear, download the file instead.
                </p>
              </>
            )
          ) : kind === "text" ? (
            <iframe title={title} src={url} className="h-full w-full border-0 bg-white" />
          ) : (
            <ViewerMessage icon={FileQuestion} text="No inline preview for this file type — download it to open it on your device." />
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function ViewerMessage({ icon: Icon, text }: { icon: typeof FileWarning; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper">
        <Icon className="h-6 w-6" />
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
    </div>
  );
                                                }
