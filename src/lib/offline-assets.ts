// Makes the in-app document viewer survive going offline.
//
// Two halves:
//  1. register the generated app service worker that caches viewer assets,
//     while explicitly refusing to run in development or Lovable previews;
//     with no signal;
//  2. warm those chunks up while the device still has a connection, so
//     they're actually in that cache before the student needs them.
//
// Without the warm-up, a student who never opened a PDF online would
// still hit "Failed to fetch dynamically imported module" on their
// saved copy.

let warmed = false;

function isPreviewHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

async function removeAppWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => {
        const activeUrl = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL;
        return activeUrl ? new URL(activeUrl).pathname === "/sw.js" : false;
      })
      .map((registration) => registration.unregister()),
  );
}

export function registerOfflineViewerSupport() {
  if (typeof window === "undefined") return;

  const registrationBlocked =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    isPreviewHost(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (registrationBlocked) {
    removeAppWorker().catch(() => {});
  } else if ("serviceWorker" in navigator && window.location.protocol === "https:") {
    import("virtual:pwa-register")
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch(() => {
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

  // Warm-up is useful even when registration is blocked: it validates the
  // renderer in the current browser and avoids a first-open delay.
  schedule();
  window.addEventListener("online", schedule);
}
