import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import {
  removeOfflineMaterial, clearAllOffline, useOnlineStatus, useOfflineLibrary, deviceStorageEstimate,
} from "@/lib/offline";
import { Download, Trash2, WifiOff, Wifi, FileText, ArrowRight, HardDrive, Check, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/offline")({
  head: () => ({ meta: [{ title: "Offline library — Learnova" }] }),
  component: OfflineLibrary,
});

const STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — the "clear old items" cutoff

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

// The "Offline Library" screen. Now built on the same reactive
// useOfflineLibrary hook the homepage and Browse use, instead of a
// fetch-once-on-mount snapshot — the previous version only refreshed
// when you navigated to the page fresh, so downloading something
// elsewhere and switching here wouldn't show it until a reload. That's
// exactly the "download doesn't register" trust problem to avoid, so
// this page now updates the instant anything changes, anywhere in the
// app, no reload needed.
function OfflineLibrary() {
  const isOnline = useOnlineStatus();
  const { items: bundles, loading } = useOfflineLibrary();
  const [deviceStorage, setDeviceStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [confirmingClearStale, setConfirmingClearStale] = useState(false);
  const [clearingStale, setClearingStale] = useState(false);

  // Real device numbers, re-checked whenever the library itself changes
  // (bundles is a fresh array every time something is saved/removed).
  useEffect(() => {
    deviceStorageEstimate().then(setDeviceStorage);
  }, [bundles]);

  // Derived directly from the same reactive list — no separate fetch,
  // so these numbers can never drift out of sync with what's on screen.
  const stats = {
    count: bundles.length,
    bytes: bundles.reduce((sum, b) => sum + (b.fileBlob?.size ?? 0), 0),
    filesCount: bundles.filter((b) => !!b.fileBlob).length,
  };
  const staleIds = bundles
    .filter((b) => Date.now() - new Date(b.lastOpenedAt ?? b.savedAt).getTime() > STALE_MS)
    .map((b) => b.material.id);

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      await removeOfflineMaterial(id);
    } finally {
      setRemovingId(null);
    }
  }

  function handleClearAll() {
    if (!confirmingClearAll) {
      setConfirmingClearAll(true);
      setTimeout(() => setConfirmingClearAll(false), 3000);
      return;
    }
    clearAllOffline().then(() => {
      setConfirmingClearAll(false);
      toast.success("Offline library cleared.");
    });
  }

  function handleClearStale() {
    if (!confirmingClearStale) {
      setConfirmingClearStale(true);
      setTimeout(() => setConfirmingClearStale(false), 3000);
      return;
    }
    setClearingStale(true);
    Promise.all(staleIds.map((id) => removeOfflineMaterial(id))).then(() => {
      setConfirmingClearStale(false);
      setClearingStale(false);
      toast.success(`Removed ${staleIds.length} item${staleIds.length === 1 ? "" : "s"} you hadn't opened in a while.`);
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

        {/* Honest partial-availability note — only when it's actually
            relevant right now (you're offline and some saved items
            don't have their file cached), not a permanent warning. */}
        {!isOnline && !loading && bundles.length > 0 && stats.filesCount < stats.count && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-copper/25 bg-copper/5 p-3 text-xs text-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-copper" />
            <span>
              You're offline right now. Documents are cached for {stats.filesCount} of {stats.count} saved item{stats.count === 1 ? "" : "s"} —
              the rest still work for summary, flashcards, and quiz, just not the original file until you're back online.
            </span>
          </div>
        )}

        {stats.count > 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-surface-muted px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-copper">
                  <HardDrive className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {stats.count} material{stats.count === 1 ? "" : "s"} · {formatBytes(stats.bytes)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {stats.filesCount} fully downloaded{stats.count > stats.filesCount ? ` · ${stats.count - stats.filesCount} study tools only` : ""}
                  </div>
                </div>
              </div>
              <button
                onClick={handleClearAll}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  confirmingClearAll ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                }`}
              >
                {confirmingClearAll ? "Tap to confirm" : "Clear all"}
              </button>
            </div>

            {deviceStorage && (
              <div className="mt-3 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                Device storage: {formatBytes(deviceStorage.usage)} used · {formatBytes(Math.max(0, deviceStorage.quota - deviceStorage.usage))} free
              </div>
            )}

            {staleIds.length > 0 && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <span className="text-[11px] text-muted-foreground">{staleIds.length} item{staleIds.length === 1 ? "" : "s"} not opened in 30+ days</span>
                <button
                  onClick={handleClearStale}
                  disabled={clearingStale}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                    confirmingClearStale ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  }`}
                >
                  {clearingStale ? "Clearing…" : confirmingClearStale ? "Tap to confirm" : "Clear old items"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          {loading ? (
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
                        <span
                          title="The document itself needs a connection — summary, flashcards, and quiz all still work offline."
                          className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
                        >
                          Study tools only
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {material.courses?.code ?? "General"} · {material.type}
                      {fileBlob ? ` · ${formatBytes(fileBlob.size)}` : ""}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                      {material.summary ? "Summary · " : ""}{flashcards.length} cards · {quiz.length} quiz Qs
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
