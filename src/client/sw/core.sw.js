// Workbox modules are bundled inline by esbuild — no CDN, no importScripts.
import { setCacheNameDetails, clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// ─── Runtime config injected by client-build.js ───────────────────────────────
const CACHE_PREFIX = self.renderPayload?.CACHE_PREFIX || 'engine-core-v3';
const PRE_CACHED_RESOURCES = Array.isArray(self.renderPayload?.PRE_CACHED_RESOURCES)
  ? self.renderPayload.PRE_CACHED_RESOURCES
  : [];
const PROXY_PATH = self.renderPayload?.PROXY_PATH || '/';
const OFFLINE_PATH = self.renderPayload?.OFFLINE_PATH || '/offline';
const MAINTENANCE_PATH = self.renderPayload?.MAINTENANCE_PATH || '/maintenance';
const proxyBase = PROXY_PATH === '/' ? '' : PROXY_PATH;
const normalizeRoutePath = (candidatePath, fallbackPath) => {
  const routePath = typeof candidatePath === 'string' && candidatePath.length > 0 ? candidatePath : fallbackPath;
  const withLeadingSlash = routePath.startsWith('/') ? routePath : `/${routePath}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');
  return withoutTrailingSlash.length > 0 ? withoutTrailingSlash : '/';
};
const offlinePath = normalizeRoutePath(OFFLINE_PATH, '/offline');
const maintenancePath = normalizeRoutePath(MAINTENANCE_PATH, '/maintenance');
const toRouteIndexUrl = (routePath) => `${proxyBase}${routePath === '/' ? '' : routePath}/index.html`;
const offlineUrl = toRouteIndexUrl(offlinePath);
const maintenanceUrl = toRouteIndexUrl(maintenancePath);

// Dedicated cache for fallback pages — populated independently from precacheAndRoute
// so offline/maintenance pages are always available even if the main precache install fails.
const FALLBACK_CACHE_NAME = `${CACHE_PREFIX}-fallbacks`;

const getFallbackResponse = async (preferMaintenance) => {
  const cache = await caches.open(FALLBACK_CACHE_NAME);
  if (preferMaintenance) {
    return (
      (await cache.match(maintenanceUrl)) ||
      (await matchPrecache(maintenanceUrl)) ||
      (await cache.match(offlineUrl)) ||
      (await matchPrecache(offlineUrl)) ||
      Response.error()
    );
  }
  return (
    (await cache.match(offlineUrl)) ||
    (await matchPrecache(offlineUrl)) ||
    (await cache.match(maintenanceUrl)) ||
    (await matchPrecache(maintenanceUrl)) ||
    Response.error()
  );
};

// ─── Core setup ───────────────────────────────────────────────────────────────
setCacheNameDetails({ prefix: CACHE_PREFIX });
clientsClaim();

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Cache fallback pages in a dedicated cache so they are available even if
  // precacheAndRoute fails (e.g. some asset in the manifest returns non-200).
  event.waitUntil(
    caches.open(FALLBACK_CACHE_NAME).then((cache) =>
      // Try together first; fall back to individual adds so a single failure
      // does not prevent the other page from being cached.
      cache
        .addAll([offlineUrl, maintenanceUrl])
        .catch(() => Promise.all([cache.add(offlineUrl).catch(() => {}), cache.add(maintenanceUrl).catch(() => {})])),
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
  const payload = event.data || {};

  if (payload.status === 'skipWaiting') {
    self.skipWaiting();
    return;
  }

  if (payload.status === 'workbox-reset') {
    event.waitUntil(
      (async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ status: 'workbox-reset-done', deleted: cacheNames.length });
        }
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
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 350,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
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
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 5 * 60, // 5 minutes
      }),
    ],
  }),
);

// ─── API mutations: NetworkOnly + background sync replay ─────────────────────
registerRoute(
  ({ request, url }) => request.method !== 'GET' && url.pathname.includes('/api/'),
  new NetworkOnly({
    plugins: [
      new BackgroundSyncPlugin('api-mutation-queue', {
        maxRetentionTime: 24 * 60, // 24 hours
      }),
    ],
  }),
);

// ─── Navigation: NetworkFirst with offline fallback ───────────────────────────
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ event }) => {
    const navigationStrategy = new NetworkFirst({
      cacheName: `${CACHE_PREFIX}-pages`,
      networkTimeoutSeconds: 4,
      plugins: [
        new CacheableResponsePlugin({
          statuses: [0, 200],
        }),
        new ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 12 * 60 * 60, // 12 hours
        }),
      ],
    });

    // Distinguish server-down (online but unreachable) from no-network (offline).
    // navigator.onLine is false only when the device has no network at all.
    const isOnline = () => typeof navigator !== 'undefined' && navigator.onLine !== false;

    try {
      const preload = await event.preloadResponse;
      if (preload) {
        if (preload.status >= 500) {
          return getFallbackResponse(true);
        }
        return preload;
      }

      const networkResponse = await navigationStrategy.handle({ event, request: event.request });
      if (networkResponse && networkResponse.status >= 500) {
        return getFallbackResponse(true);
      }
      return networkResponse;
    } catch (_) {
      // If device reports it has network but the request failed, it means the
      // server is unreachable/down → show maintenance. True offline → show offline.
      return getFallbackResponse(isOnline());
    }
  },
);

// ─── Global catch handler ─────────────────────────────────────────────────────
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    return getFallbackResponse(typeof navigator !== 'undefined' && navigator.onLine !== false);
  }
  return new Response(JSON.stringify({ status: 'error', message: 'request failed' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
});
