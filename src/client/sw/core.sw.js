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
 * Returns the cached fallback page. Tries the dedicated fallback cache first,
 * then the Workbox precache. The `kind` argument selects which page to prefer;
 * the other is used as a secondary fallback before giving up.
 * @param {'offline'|'maintenance'} kind
 */
const getFallback = async (kind) => {
  const primary = kind === 'maintenance' ? MAINTENANCE_URL : OFFLINE_URL;
  const secondary = kind === 'maintenance' ? OFFLINE_URL : MAINTENANCE_URL;
  const cache = await caches.open(FALLBACK_CACHE);
  return (
    (await cache.match(primary)) ||
    (await matchPrecache(primary)) ||
    (await cache.match(secondary)) ||
    (await matchPrecache(secondary)) ||
    Response.error()
  );
};

// True offline = device reports no network. Anything else (server 5xx, DNS, TLS)
// is treated as a transient outage and shows the maintenance page.
const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

// ─── Core setup ───────────────────────────────────────────────────────────────
setCacheNameDetails({ prefix: CACHE_PREFIX });
clientsClaim();

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(FALLBACK_CACHE).then((cache) =>
      // Try together; on partial failure, add each individually so a single
      // broken page does not prevent the other from being cached.
      cache.addAll([OFFLINE_URL, MAINTENANCE_URL]).catch(() =>
        Promise.all([
          cache.add(OFFLINE_URL).catch(() => { }),
          cache.add(MAINTENANCE_URL).catch(() => { }),
        ]),
      ),
    ),
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

// ─── Navigation: NetworkFirst with offline/maintenance fallback ──────────────
const navigationStrategy = new NetworkFirst({
  cacheName: `${CACHE_PREFIX}-pages`,
  networkTimeoutSeconds: 4,
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 12 * 60 * 60 }),
  ],
});

registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ event }) => {
    try {
      const preload = await event.preloadResponse;
      if (preload) return preload.status >= 500 ? getFallback('maintenance') : preload;

      const response = await navigationStrategy.handle({ event, request: event.request });
      return response && response.status >= 500 ? getFallback('maintenance') : response;
    } catch (_) {
      // Request threw before producing a response: network down, DNS, TLS, etc.
      // If the device still has connectivity, the origin is the problem → maintenance.
      return getFallback(isOnline() ? 'maintenance' : 'offline');
    }
  },
);

// ─── Global catch handler (non-navigation failures) ──────────────────────────
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') return getFallback(isOnline() ? 'maintenance' : 'offline');
  return new Response(JSON.stringify({ status: 'error', message: 'request failed' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
});
