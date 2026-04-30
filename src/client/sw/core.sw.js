// Workbox modules are bundled inline by esbuild — no CDN, no importScripts.
import { setCacheNameDetails, clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// ─── Runtime config injected by client-build.js ───────────────────────────────
const CACHE_PREFIX = 'engine-core';
const PRE_CACHED_RESOURCES = Array.isArray(self.renderPayload?.PRE_CACHED_RESOURCES)
  ? self.renderPayload.PRE_CACHED_RESOURCES
  : [];
const PROXY_PATH = self.renderPayload?.PROXY_PATH || '/';
const proxyBase = PROXY_PATH === '/' ? '' : PROXY_PATH;
const offlineUrl = `${proxyBase}/offline/index.html`;
const maintenanceUrl = `${proxyBase}/maintenance/index.html`;

// ─── Core setup ───────────────────────────────────────────────────────────────
setCacheNameDetails({ prefix: CACHE_PREFIX });
clientsClaim();

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
    })(),
  );
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
    try {
      const preload = await event.preloadResponse;
      if (preload) return preload;

      return await new NetworkFirst({
        cacheName: `${CACHE_PREFIX}-pages`,
        networkTimeoutSeconds: 4,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 60,
            maxAgeSeconds: 12 * 60 * 60, // 12 hours
          }),
        ],
      }).handle({ event, request: event.request });
    } catch (_) {
      return (await matchPrecache(offlineUrl)) || (await matchPrecache(maintenanceUrl)) || Response.error();
    }
  },
);

// ─── Global catch handler ─────────────────────────────────────────────────────
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    return (await matchPrecache(offlineUrl)) || (await matchPrecache(maintenanceUrl)) || Response.error();
  }
  return new Response(JSON.stringify({ status: 'error', message: 'request failed' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
});
