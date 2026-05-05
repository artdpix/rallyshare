// RallyShare Service Worker — minimal shell cache, network-first.
// Bumps CACHE_VERSION to invalidate.
const CACHE_VERSION = 'rs-v1';
const SHELL = ['/', '/submit'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Don't intercept Next internals (HMR, JS bundles, RSC payloads).
  if (url.pathname.startsWith('/_next/')) return;
  // Don't intercept admin or API endpoints (auth, mutations, dynamic data).
  if (url.pathname.startsWith('/admin')) return;
  if (url.pathname.startsWith('/api/')) return;
  // Don't intercept cross-origin (the API on :4000).
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // cache successful navigations of the shell
        if (res.ok && SHELL.includes(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached ?? caches.match('/'))),
  );
});
