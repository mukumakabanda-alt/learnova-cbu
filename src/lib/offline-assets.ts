// Makes the in-app document viewer survive going offline.
//
// Two halves:
//  1. register the service worker (public/sw.js) that caches every app
//     asset it serves, so lazily-imported viewer chunks still resolve
//     with no signal;
//  2. warm those chunks up while the device still has a connection, so
//     they're actually in that cache before the student needs them.
//
// Without the warm-up, a student who never opened a PDF online would
// still hit "Failed to fetch dynamically imported module" on their
// saved copy.

let warmed = false;

export function registerOfflineViewerSupport() {
  if (typeof window === "undefined") return;

  if ("serviceWorker" in navigator && window.location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline caching is a bonus, never a blocker */
    });
  }

  const warm = () => {
    if (warmed || !navigator.onLine) return;
    warmed = true;
    // Fire and forget — each import pulls its chunk (and, for pdf.js,
    // its worker) into the cache.
    import("@/lib/pdfjs")
      .then((m) => m.loadPdfjs())
      .catch(() => (warmed = false));
    import("@/lib/zip-reader").catch(() => {});
    import("jszip").catch(() => {});
    import("mammoth").catch(() => {});
  };

  const schedule = () => {
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void) => void);
    if (ric) ric(warm);
    else window.setTimeout(warm, 3000);
  };

  schedule();
  window.addEventListener("online", schedule);
}
