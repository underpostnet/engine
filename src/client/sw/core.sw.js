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

// ─── Ultimate inline HTML fallbacks ──────────────────────────────────────────
// When neither the FALLBACK_CACHE nor precache has the offline/maintenance page
// (e.g. first install while server is down), these inline responses ensure the
// user never sees a browser error page.
const INLINE_FALLBACKS = {
  offline: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Offline</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5;color:#333;padding:1rem;text-align:center}h1{font-size:2rem;margin-bottom:.5rem}p{font-size:1rem;color:#666;max-width:24rem}</style></head><body><h1>🌐 You are offline</h1><p>Please check your internet connection and try again.</p></body></html>`,
  maintenance: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Maintenance</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5;color:#333;padding:1rem;text-align:center}h1{font-size:2rem;margin-bottom:.5rem}p{font-size:1rem;color:#666;max-width:24rem}</style></head><body><h1>🔧 Under Maintenance</h1><p>We'll be back shortly. Please try again later.</p></body></html>`,
};

/**
 * Returns a Response for the cached fallback page. Tries the dedicated fallback
 * cache first, then the Workbox precache, then the inline HTML strings above.
 * Never returns Response.error() — always produces a usable page.
 * @param {'offline'|'maintenance'} kind
 * @returns {Promise<Response>}
 */
const getFallback = async (kind) => {
  const primary = kind === 'maintenance' ? MAINTENANCE_URL : OFFLINE_URL;
  const secondary = kind === 'maintenance' ? OFFLINE_URL : MAINTENANCE_URL;
  const cache = await caches.open(FALLBACK_CACHE);

  // Try dedicated fallback cache first
  const cached =
    (await cache.match(primary)) ||
    (await matchPrecache(primary)) ||
    (await cache.match(secondary)) ||
    (await matchPrecache(secondary));

  if (cached) return cached;

  // Ultimate inline fallback — never expose the user to a browser error page
  const html = INLINE_FALLBACKS[kind] || INLINE_FALLBACKS.offline;
  return new Response(html, {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

// ─── Core setup ───────────────────────────────────────────────────────────────
setCacheNameDetails({ prefix: CACHE_PREFIX });
clientsClaim();

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(FALLBACK_CACHE);
      // Try to cache each fallback page individually. If the network is
      // unavailable during install (server down, first-time setup), fetch
      // will throw — the inline HTML fallback covers this case.
      for (const url of [OFFLINE_URL, MAINTENANCE_URL]) {
        try {
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        } catch (_) {
          // Network unavailable during install — inline fallbacks handle this.
        }
      }
    })(),
  );
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
        return preload;
      }
      // preload returned a 5xx or was empty — fall through to direct fetch
    } catch (_) {
      // preload threw — fall through to direct fetch
    }

    // ── 3. Try direct fetch to the server ─────────────────────────────────
    // We use fetch() directly (not NetworkFirst) because NetworkFirst would
    // return a stale cached real page on network failure, which defeats the
    // purpose of having offline/maintenance fallback pages.
    try {
      const response = await fetch(event.request);

      if (response.status >= 500) {
        // Server returned a server error — show maintenance page
        return getFallback('maintenance');
      }

      if (response.ok) {
        // Cache the successful response for preload to serve next time
        const cache = await caches.open(`${CACHE_PREFIX}-pages`);
        cache.put(event.request, response.clone()).catch(() => { });
        return response;
      }

      // Non-okay, non-5xx (e.g. 404) — return as-is
      return response;
    } catch (_) {
      // fetch() threw: DNS failure, connection refused, timeout, TLS error, etc.
      // navigator.onLine may be true (server is down but network is up) or false.
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