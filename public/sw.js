/* Learnova offline shell.
 *
 * The document viewer loads its engines (pdf.js, the archive reader,
 * Word/Excel renderers) as separate chunks, on demand. Offline, the
 * browser can't fetch a chunk it never downloaded — that's exactly the
 * "Failed to fetch dynamically imported module .../pdf-*.js" error a
 * saved PDF hit. This worker keeps every app asset it has ever served in
 * a cache, so those imports resolve from the device instead.
 */

const CACHE = "learnova-assets-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    /\.(js|mjs|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico|json)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!isAsset(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: false });
      if (cached) {
        // Refresh in the background so updates still land.
        event.waitUntil(
          fetch(req)
            .then((res) => (res && res.ok ? cache.put(req, res.clone()) : null))
            .catch(() => null),
        );
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const fallback = await cache.match(req, { ignoreSearch: true });
        if (fallback) return fallback;
        throw err;
      }
    })(),
  );
});
