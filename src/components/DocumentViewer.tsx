// Full-screen in-website document viewer.
//
// Tapping a document used to either do nothing (a popup silently blocked
// on mobile) or hand you off to the browser's own file handling, which
// doesn't know how to show a Word/PowerPoint file at all. This renders a
// preview right inside the site — PDFs and images natively, Office files
// through Google's document viewer — with Save and Download sitting right
// next to it, so someone can flip through a document before committing to
// downloading it.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Download, Bookmark, BookmarkCheck, Loader2, FileWarning, FileQuestion } from "lucide-react";
import { toast } from "sonner";
import { getViewUrl, forceDownload, previewKind, previewKindFromMime, sniffContentType, type PreviewKind } from "@/lib/document-files";
import { useIncrementDownload, useSavedMaterials, useToggleSaved, type MaterialWithCourse } from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import { saveMaterialOfflineFromDownload } from "@/lib/offline";

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
  /** When provided, a successful download also caches this material for the Offline Library — see saveMaterialOfflineFromDownload. Optional so DocumentViewer still works for pure previewing without it. */
  material?: MaterialWithCourse | null;
}) {
  const { user } = useAuth();
  const incrementDownload = useIncrementDownload();
  const { data: saved } = useSavedMaterials();
  const toggleSaved = useToggleSaved();
  const isSaved = (saved ?? []).some((s) => s.material_id === materialId);

  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sniffedKind, setSniffedKind] = useState<PreviewKind | null>(null);

  // Fetches a fresh signed URL every time the viewer opens (rather than
  // reusing whatever the last one was), so a document reopened later in
  // the same session never hits an expired link. Note: this does NOT
  // bump download_count — opening a preview is a view, not a download.
  //
  // If the filename has no recognizable extension (previewKind() below
  // returns "none" — common for files saved via WhatsApp on Android,
  // which often strips it), this also asks Storage what Content-Type it
  // actually recorded for the file and uses that instead, so an
  // already-uploaded photo or PDF with no extension in its stored path
  // still opens instead of always falling back to "download to open it."
  useEffect(() => {
    if (!open || !filePath) return;
    let active = true;
    setUrl(null);
    setLoadError(false);
    setSniffedKind(null);
    getViewUrl(filePath)
      .then(async (signed) => {
        if (!active) return;
        setUrl(signed);
        if (previewKind(filePath) === "none") {
          const mime = await sniffContentType(signed);
          if (active) setSniffedKind(previewKindFromMime(mime));
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
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
      await forceDownload(filePath, title);
      incrementDownload.mutate(materialId);
      // Downloading and "Save for offline" used to be two completely
      // separate actions with no relationship — someone could download a
      // file and it would never show up in their Offline Library. If you
      // bothered to download something, you almost certainly want it
      // available offline too — this makes Download also do that,
      // silently, in the background.
      if (material) saveMaterialOfflineFromDownload(material);
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
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-100 disabled:cursor-default disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download
          </button>
        </div>

        {/* Preview body */}
        <div className="relative flex-1 overflow-auto bg-surface-muted">
          {!filePath ? (
            <ViewerMessage icon={FileWarning} text="No file is attached to this material." />
          ) : loadError ? (
            <ViewerMessage icon={FileWarning} text="Couldn't open a preview right now — check your connection, or try downloading it instead." />
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
