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

function StudyDocument() {
  const { id } = Route.useParams();
  const isOnline = useOnlineStatus();
  const { data: material, isLoading, isError } = useMaterial(id);

  const [offline, setOffline] = useState<OfflineBundle | null>(null);
  const [checkedOffline, setCheckedOffline] = useState(false);

  // Only bother checking IndexedDB once the network attempt has actually
  // failed (or we already know we're offline) — most visits never need this.
  const shouldCheckOffline = !isLoading && !material && (isError || !isOnline);

  useEffect(() => {
    if (!shouldCheckOffline) return;
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
  const stillResolving = isLoading || (shouldCheckOffline && !checkedOffline);

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
            {effectiveMaterial.courses && <p className="mt-1 text-sm text-muted-foreground">{effectiveMaterial.courses.code} · {effectiveMaterial.courses.title}</p>}
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
