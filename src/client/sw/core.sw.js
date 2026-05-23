// Workbox modules are bundled inline by esbuild — no CDN, no importScripts.
import { setCacheNameDetails, clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// ─── Runtime config injected by client-build.js ───────────────────────────────
// OFFLINE_URL and MAINTENANCE_URL are absolute (proxy-prefixed) index.html paths
// resolved at build time from the SSR config's `fallbacks` map.
const payload = self.renderPayload || {};
const CACHE_PREFIX = payload.CACHE_PREFIX || 'engine-core';
const PRE_CACHED_RESOURCES = Array.isArray(payload.PRE_CACHED_RESOURCES) ? payload.PRE_CACHED_RESOURCES : [];
const OFFLINE_URL = payload.OFFLINE_URL || '/offline/index.html';
const MAINTENANCE_URL = payload.MAINTENANCE_URL || '/maintenance/index.html';

// Dedicated cache for fallback pages so they're available even if precacheAndRoute
// fails (e.g. a precache manifest entry returns non-200 during install).
const FALLBACK_CACHE = `${CACHE_PREFIX}-fallbacks`;

/**
 * Ultimate inline HTML fallback used ONLY when the network is unavailable and
 * the custom SSR pages (NoNetworkConnection / Maintenance views from config)
 * have not yet been cached. Once cached on first successful visit, the custom
 * pages take over.
 * @param {'offline'|'maintenance'} kind
 * @returns {Response}
 */
const inlineFallback = (kind) => {
  const title = kind === 'offline' ? 'Offline' : 'Maintenance';
  const icon = kind === 'offline' ? '🌐' : '🔧';
  const msg =
    kind === 'offline'
      ? 'You are offline. Please check your internet connection and try again.'
      : 'The server is under maintenance. We\'ll be back shortly.';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5;color:#333;padding:1rem;text-align:center}h1{font-size:2rem;margin-bottom:.5rem}p{font-size:1rem;color:#666;max-width:24rem}</style></head><body><h1>${icon} ${title}</h1><p>${msg}</p></body></html>`;
  return new Response(html, {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

/**
 * Returns a Response for the cached fallback page.
 * Tries (in order):
 *   1. Dedicated FALLBACK_CACHE (primary & secondary URL)
 *   2. Workbox precache (primary & secondary URL)
 *   3. If online, fetches the custom SSR page from the server (caches it for next time)
 *   4. Ultimate inline HTML string (never a browser error page)
 *
 * @param {'offline'|'maintenance'} kind
 * @returns {Promise<Response>}
 */
const getFallback = async (kind) => {
  const primary = kind === 'maintenance' ? MAINTENANCE_URL : OFFLINE_URL;
  const secondary = kind === 'maintenance' ? OFFLINE_URL : MAINTENANCE_URL;
  const cache = await caches.open(FALLBACK_CACHE);

  // ── 1. Try cache (own + precache) ──────────────────────────────────────
  const cached =
    (await cache.match(primary)) ||
    (await matchPrecache(primary)) ||
    (await cache.match(secondary)) ||
    (await matchPrecache(secondary));
  if (cached) return cached;

  // ── 2. If we appear online, try to fetch the custom SSR page from server ─
  // This handles the case where the install-time caching didn't happen yet
  // (e.g. first install while server was up, but fallback pages weren't cached).
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      const fetchResp = await fetch(primary, { credentials: 'same-origin' });
      if (fetchResp.ok) {
        cache.put(primary, fetchResp.clone()).catch(() => { });
        return fetchResp;
      }
    } catch (_) { }
    try {
      const fetchResp = await fetch(secondary, { credentials: 'same-origin' });
      if (fetchResp.ok) {
        cache.put(secondary, fetchResp.clone()).catch(() => { });
        return fetchResp;
      }
    } catch (_) { }
  }

  // ── 3. Ultimate inline fallback ────────────────────────────────────────
  return inlineFallback(kind);
};

/**
 * Background-caches the offline and maintenance SSR pages for future use.
 * Called after each successful navigation so the custom views are available
 * the next time the network is unreachable.
 */
const cacheFallbackPages = async () => {
  const cache = await caches.open(FALLBACK_CACHE);
  for (const url of [OFFLINE_URL, MAINTENANCE_URL]) {
    try {
      if (!(await cache.match(url))) {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (response.ok) {
          await cache.put(url, response);
        }
      }
    } catch (_) {
      // Network unavailable now — will try again on next navigation.
    }
  }
};

// ─── Core setup ───────────────────────────────────────────────────────────────
setCacheNameDetails({ prefix: CACHE_PREFIX });
clientsClaim();

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Note: install-time caching of fallback pages is unreliable in some browsers.
  // We rely on the post-navigation eager caching in the navigation handler.
  // The inline HTML fallback ensures the user never sees a browser error page
  // before the custom SSR pages are cached.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  const { status } = event.data || {};
  if (status === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (status === 'workbox-reset') {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
        event.ports?.[0]?.postMessage({ status: 'workbox-reset-done', deleted: names.length });
      })(),
    );
  }
});

// ─── Precaching ───────────────────────────────────────────────────────────────
precacheAndRoute(PRE_CACHED_RESOURCES.map((url) => ({ url, revision: null })));
cleanupOutdatedCaches();

// ─── Static assets: StaleWhileRevalidate ─────────────────────────────────────
registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    ['style', 'script', 'font', 'image'].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: `${CACHE_PREFIX}-assets`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 350, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// ─── API GET: NetworkFirst with short timeout ─────────────────────────────────
registerRoute(
  ({ request, url }) => request.method === 'GET' && url.pathname.includes('/api/'),
  new NetworkFirst({
    cacheName: `${CACHE_PREFIX}-api-get`,
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 5 * 60 }),
    ],
  }),
);

// ─── API mutations: NetworkOnly + background sync replay ─────────────────────
registerRoute(
  ({ request, url }) => request.method !== 'GET' && url.pathname.includes('/api/'),
  new NetworkOnly({
    plugins: [new BackgroundSyncPlugin('api-mutation-queue', { maxRetentionTime: 24 * 60 })],
  }),
);

// ─── Navigation with offline/maintenance dispatcher ─────────────────────────
//
// CRITICAL: We use direct fetch() instead of NetworkFirst for navigation so
// that when the server is unreachable:
//   - NetworkFirst would silently return a STALE cached real page (status 200)
//     making it look like the app still works when it doesn't
//   - fetch() throws on network failure → catch → fallback page
//   - fetch() returns 5xx → maintenance fallback
//
// After each successful fetch, we eagerly cache the custom offline/maintenance
// SSR pages so they're available when the network goes down.
//
// The dispatcher logic:
//   1. If navigator.onLine === false → offline fallback immediately
//   2. Try navigation preload — if it succeeds (< 500) use it, else fall through
//   3. Try direct fetch() — if it succeeds (< 500) cache and return it
//   4. If fetch returned 5xx → maintenance fallback
//   5. If fetch threw (network down) → fallback based on connectivity
// ─────────────────────────────────────────────────────────────────────────────

registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ event }) => {
    // ── 1. Check browser offline state ────────────────────────────────────
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return getFallback('offline');
    }

    // ── 2. Try navigation preload ────────────────────────────────────────
    try {
      const preload = await event.preloadResponse;
      if (preload && preload.status < 500) {
        // Fire-and-forget: eagerly cache fallback pages in the background
        // after a successful navigation so they're available when offline.
        cacheFallbackPages().catch(() => { });
        return preload;
      }
    } catch (_) {
      // Preload threw — fall through to direct fetch
    }

    // ── 3. Try direct fetch to the server ─────────────────────────────────
    try {
      const response = await fetch(event.request);

      if (response.status >= 500) {
        return getFallback('maintenance');
      }

      if (response.ok) {
        // Cache the successful response for future navigations
        const cache = await caches.open(`${CACHE_PREFIX}-pages`);
        cache.put(event.request, response.clone()).catch(() => { });

        // Eagerly cache fallback pages in the background
        cacheFallbackPages().catch(() => { });

        return response;
      }

      return response;
    } catch (_) {
      const reallyOffline =
        typeof navigator !== 'undefined' && navigator.onLine === false;
      return getFallback(reallyOffline ? 'offline' : 'maintenance');
    }
  },
);

// ─── Global catch handler (non-navigation failures) ──────────────────────────
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    const reallyOffline =
      typeof navigator !== 'undefined' && navigator.onLine === false;
    return getFallback(reallyOffline ? 'offline' : 'maintenance');
  }
  return new Response(JSON.stringify({ status: 'error', message: 'request failed' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
});