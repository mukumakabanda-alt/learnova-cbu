import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import {
  listOfflineMaterials, removeOfflineMaterial, clearAllOffline, offlineStorageStats,
  useOnlineStatus, type OfflineBundle,
} from "@/lib/offline";
import { Download, Trash2, WifiOff, Wifi, FileText, ArrowRight, HardDrive, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/offline")({
  head: () => ({ meta: [{ title: "Offline library — Learnova" }] }),
  component: OfflineLibrary,
});

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb < 1000) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// The "Offline Library" screen the offline feature never had. This is
// the redesigned version: real storage numbers (the app now caches the
// actual file, not just its text — see src/lib/offline.ts), sorted by
// what you opened most recently rather than just when it was saved, and
// clear Downloaded/Saved states instead of one flat list.
function OfflineLibrary() {
  const isOnline = useOnlineStatus();
  const [bundles, setBundles] = useState<OfflineBundle[] | null>(null);
  const [stats, setStats] = useState<{ count: number; bytes: number; filesCount: number } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  function refresh() {
    listOfflineMaterials()
      .then((list) =>
        setBundles(
          [...list].sort((a, b) => {
            const aTime = a.lastOpenedAt ?? a.savedAt;
            const bTime = b.lastOpenedAt ?? b.savedAt;
            return aTime < bTime ? 1 : -1;
          }),
        ),
      )
      .catch(() => setBundles([]));
    offlineStorageStats().then(setStats);
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

  function handleClearAll() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }
    clearAllOffline().then(() => {
      setConfirmingClear(false);
      refresh();
      toast.success("Offline library cleared.");
    });
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <SiteHeader />

      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Your library</div>
            <h1 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">Offline</h1>
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
          Anything downloaded here opens with zero signal — the real document, not just its summary. Stored on this device only.
        </p>

        {stats !== null && stats.count > 0 && (
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-surface-muted px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-copper">
                <HardDrive className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {stats.count} material{stats.count === 1 ? "" : "s"} · {formatBytes(stats.bytes)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {stats.filesCount} fully downloaded{stats.count > stats.filesCount ? ` · ${stats.count - stats.filesCount} text-only` : ""}
                </div>
              </div>
            </div>
            <button
              onClick={handleClearAll}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                confirmingClear ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              }`}
            >
              {confirmingClear ? "Tap to confirm" : "Clear all"}
            </button>
          </div>
        )}

        <div className="mt-6">
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
              <p className="mt-3 text-sm font-semibold text-foreground">Nothing downloaded yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                Open any material from the Study catalogue and tap Download — it'll show up here, ready with zero signal.
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
              {bundles.map(({ material, flashcards, quiz, savedAt, lastOpenedAt, fileBlob }) => (
                <Link
                  key={material.id}
                  to="/study/$id"
                  params={{ id: material.id }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-colors hover:border-primary/30"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-copper">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-sm font-semibold text-foreground">{material.title}</div>
                      {fileBlob ? (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-teal/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal">
                          <Check className="h-2.5 w-2.5" /> Downloaded
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                          Text only
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {material.courses?.code ?? "General"} · {material.type} · {flashcards.length} cards · {quiz.length} quiz Qs
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground/70">
                      {lastOpenedAt ? `Opened ${relativeTime(lastOpenedAt)}` : `Saved ${relativeTime(savedAt)}`}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleRemove(material.id);
                    }}
                    disabled={removingId === material.id}
                    aria-label="Remove from offline library"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Link>
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
