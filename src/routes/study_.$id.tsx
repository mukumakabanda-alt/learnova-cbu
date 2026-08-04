import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileWarning, WifiOff } from "lucide-react";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { StudyPanel } from "@/components/StudyPanel";
import { useMaterial } from "@/lib/queries";
import { getOfflineMaterial, useOnlineStatus, type OfflineBundle } from "@/lib/offline";

export const Route = createFileRoute("/study/$id")({
  component: StudyDocument,
});

// Same wording as the Study hub's statusLabel() (src/routes/study.tsx) —
// kept as its own small copy here rather than importing from a route
// file, so this page's header badge always matches what a student saw
// on the card they tapped to get here.
function statusLabel(status: string) {
  switch (status) {
    case "processing":
      return "Generating…";
    case "catalog_only":
      return "Saved · no study tools yet";
    case "failed":
      return "Needs attention";
    default:
      return "Ready";
  }
}
const STATUS_COLOR: Record<string, string> = {
  ready: "bg-teal/10 text-teal",
  processing: "bg-copper/10 text-copper",
  catalog_only: "bg-surface-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};

function StudyDocument() {
  const { id } = Route.useParams();
  const isOnline = useOnlineStatus();
  const { data: material, isLoading, isError } = useMaterial(id);

  const [offline, setOffline] = useState<OfflineBundle | null>(null);
  const [checkedOffline, setCheckedOffline] = useState(false);

  // Check IndexedDB the moment we know we're offline, rather than waiting
  // for the network query to fail first. This matters because React Query
  // (by default) doesn't actually attempt a fetch while the browser is
  // offline — it just sits "paused" with isLoading stuck true and isError
  // never firing. The old check here (`!isLoading && ... (isError ||
  // !isOnline)`) required isLoading to turn false first, which meant it
  // would wait forever and the offline fallback would never show up —
  // exactly what "offline mode doesn't work" looks like. isOnline comes
  // from the browser's online/offline events, so it's known immediately,
  // independent of that stuck network query.
  const shouldCheckOffline = !material && (isError || !isOnline);

  useEffect(() => {
    if (!shouldCheckOffline) {
      setOffline(null);
      setCheckedOffline(false);
      return;
    }
    let active = true;
    getOfflineMaterial(id).then((bundle) => {
      if (active) {
        setOffline(bundle);
        setCheckedOffline(true);
      }
    });
    return () => {
      active = false;
    };
  }, [id, shouldCheckOffline]);

  const effectiveMaterial = material ?? offline?.material ?? null;
  const isOfflineCopy = !material && !!offline;
  // While we need to check offline storage, resolve as soon as that check
  // finishes — don't keep waiting on `isLoading`, since it can legitimately
  // stay true indefinitely for a paused, offline network query.
  const stillResolving = shouldCheckOffline ? !checkedOffline : isLoading;

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/study" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to study
        </Link>

        {stillResolving ? (
          <div className="mt-6 h-40 animate-pulse rounded-2xl border border-border bg-surface-muted" />
        ) : !effectiveMaterial ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-10 text-center">
            <FileWarning className="h-6 w-6 text-destructive" />
            <div className="text-sm font-semibold text-foreground">
              {!isOnline ? "You're offline, and this document wasn't saved for offline viewing." : "We couldn't load this material."}
            </div>
            <p className="max-w-xs text-xs text-muted-foreground">
              {!isOnline
                ? "Reconnect, or open something you've already tapped \"Save for offline\" on."
                : "It may have been removed, or the link might be wrong."}
            </p>
            <Link to="/study" className="mt-1 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Back to study</Link>
          </div>
        ) : (
          <>
            <h1 className="mt-4 font-display text-3xl leading-tight text-foreground sm:text-4xl">{effectiveMaterial.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {effectiveMaterial.courses && (
                <span className="text-sm text-muted-foreground">{effectiveMaterial.courses.code} · {effectiveMaterial.courses.title}</span>
              )}
              <span className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                {effectiveMaterial.type}
              </span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[effectiveMaterial.status] ?? ""}`}>
                {statusLabel(effectiveMaterial.status)}
              </span>
            </div>
            {isOfflineCopy && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <WifiOff className="h-3.5 w-3.5" /> Viewing the offline copy saved on {new Date(offline!.savedAt).toLocaleDateString()}
              </p>
            )}
            <div className="mt-6">
              <StudyPanel
                material={effectiveMaterial}
                offlineBundle={isOfflineCopy ? { flashcards: offline!.flashcards, quiz: offline!.quiz } : null}
              />
            </div>
          </>
        )}
      </div>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
  }
