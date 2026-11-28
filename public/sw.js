/* Offline shell for the static tech site.
 *
 * Network-first for navigations so articles stay fresh, stale-while-revalidate
 * for assets. Only same-origin GETs inside this deployment scope are touched;
 * WordPress REST comment calls and external images are left alone.
 */
const VERSION = 'gwill-tech-pwa-v15';
const SCOPE = self.registration.scope;
const BASE = new URL(SCOPE);
const ROOT = BASE.href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      await cache.addAll([ROOT, new URL('manifest.webmanifest', ROOT).href].filter(Boolean)).catch(() => {});
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE.pathname)) return;

  // WordPress REST calls, admin surfaces and previews stay live-only. Static
  // uploads are normal images on this port, so they are cacheable.
  if (
    url.pathname.includes('/wp-json/') ||
    url.pathname.includes('/wp-admin/') ||
    url.pathname.includes('/wp-login') ||
    url.search.includes('preview=') ||
    url.search.includes('nocache=')
  ) return;

  // Navigations: network first, then the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(ROOT)) || new Response('Offline', { status: 503 }))
    );
    return;
  }

  // CSS / JS / fonts / images / search index: serve cached bytes immediately,
  // refresh them in the background for the next visit.
  if (/\.(?:css|js|mjs|woff2?|png|jpe?g|webp|svg|ico|webmanifest|json)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
