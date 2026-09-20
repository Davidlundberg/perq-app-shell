/* Perq — service worker (PWA shell, closet-app-shell pattern).
 *
 * All shell paths are RELATIVE so precache resolves against the actual scope
 * (GitHub Pages serves under /perq-app-shell/, not /).
 *
 * Strategy:
 *   - App shell + static assets (relative, same-origin): cache-first, precached.
 *   - Navigations: cache-first to 'index.html' — the shell renders offline.
 *   - Google Fonts + pinned CDN scripts (unpkg / cdn.jsdelivr.net):
 *     stale-while-revalidate runtime cache. The <script> tags carry
 *     crossorigin="anonymous", so these are CORS (non-opaque) responses and
 *     SRI integrity checks stay valid when served from cache.
 *   - *.supabase.co (auth + data plane): NEVER intercepted, never cached.
 *
 * Bump VERSION on any shell change — activate deletes all older perq-* caches.
 * tools/publish_shell.py asserts its --version matches this constant.
 */
const VERSION = '1.2.0';
const SHELL_CACHE = `perq-shell-${VERSION}`;
const RUNTIME_CACHE = `perq-runtime-${VERSION}`;

const SHELL = [
  'index.html',
  'manifest.webmanifest',
  'static/icon-180.png',
  'static/icon-192.png',
  'static/icon-512.png',
  'static/icon-512-maskable.png',
];

// Third-party hosts safe to cache with stale-while-revalidate.
const RUNTIME_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // {cache:'reload'} bypasses the HTTP cache so a version bump always
      // precaches the freshly deployed shell, never a heuristically-cached copy.
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('perq-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // auth / sync writes pass straight through

  const url = new URL(req.url);

  // Supabase auth + data plane: untouched. User data must never sit in a cache.
  if (url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co')) return;

  // Fonts + pinned CDN scripts: stale-while-revalidate.
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const refresh = fetch(req)
          .then((resp) => {
            if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
            return resp;
          })
          .catch(() => cached);
        return cached || refresh;
      })
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  // Navigations: serve the shell cache-first.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match('index.html');
        if (cached) return cached;
        return fetch(req);
      })
    );
    return;
  }

  // App shell + static assets within our scope: cache-first with network fill.
  const scopePath = new URL(self.registration.scope).pathname;
  if (sameOrigin && url.pathname.startsWith(scopePath)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const resp = await fetch(req);
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      })
    );
  }
});
