import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { listOfflineMaterials, removeOfflineMaterial, useOnlineStatus, type OfflineBundle } from "@/lib/offline";
import { Download, Trash2, WifiOff, Wifi, FileText, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/offline")({
  head: () => ({ meta: [{ title: "Offline library — Learnova" }] }),
  component: OfflineLibrary,
});

// The "Offline Library" screen the offline feature never had. Per-document
// save/restore (see src/lib/offline.ts) always worked, but nothing ever
// called listOfflineMaterials() anywhere — so a student who saved a
// document for offline had no way to see everything they'd saved, only
// the one document they happened to be on. This is that missing list,
// wired into the main nav (MobileTabBar) and footer so it's actually
// discoverable.
function OfflineLibrary() {
  const isOnline = useOnlineStatus();
  const [bundles, setBundles] = useState<OfflineBundle[] | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function refresh() {
    listOfflineMaterials()
      .then((list) => setBundles([...list].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))))
      .catch(() => setBundles([]));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleRemove(id: string) {
    setRemovingId(id);
    await removeOfflineMaterial(id);
    refresh();
    setRemovingId(null);
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <SiteHeader />

      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Offline library</div>
            <h1 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">Saved for offline</h1>
          </div>
          <div
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
              isOnline ? "bg-teal/10 text-teal" : "bg-copper/10 text-copper"
            }`}
          >
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? "Online" : "Offline"}
          </div>
        </div>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          Anything you save from a material's page lands here, stored on this device only — so it opens
          instantly with zero signal, on the bus or in a lecture hall.
        </p>

        <div className="mt-8">
          {bundles === null ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-surface-muted" />
              ))}
            </div>
          ) : bundles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-copper">
                <Download className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">Nothing saved yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                Open any material from the Study catalogue and tap "Save for offline" — it'll show up here.
              </p>
              <Link
                to="/study"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-95"
              >
                Browse the catalogue <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                {bundles.length} material{bundles.length === 1 ? "" : "s"} saved on this device
              </p>
              {bundles.map(({ material, flashcards, quiz, savedAt }) => (
                <div key={material.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-copper">
                    <FileText className="h-5 w-5" />
                  </div>
                  <Link to="/study/$id" params={{ id: material.id }} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{material.title}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {material.courses?.code ?? "General"} · {material.type} · {flashcards.length} cards · {quiz.length} quiz Qs
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground/70">
                      Saved {new Date(savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </div>
                  </Link>
                  <button
                    onClick={() => handleRemove(material.id)}
                    disabled={removingId === material.id}
                    aria-label="Remove from offline library"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
  }
