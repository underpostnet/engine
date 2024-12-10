const PRE_CACHED_RESOURCES = [];
const CACHE_NAME = 'app-cache';
self.addEventListener('install', (event) => {
  // Activate right away
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      // Open the app's cache.
      const cache = await caches.open(CACHE_NAME);
      // Cache all static resources.
      await cache.addAll(PRE_CACHED_RESOURCES);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Enable navigation preload if it's supported.
      // See https://developers.google.com/web/updates/2017/02/navigation-preload
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
    })(),
  );
  // Tell the active service worker to take control of the page immediately.
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Cache-First Strategy
  event.respondWith(
    (async () => {
      // First, try to use the navigation preload response if it's supported.
      try {
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) return preloadResponse;
        return await fetch(event.request);
      } catch (error) {
        console.error('Fetch failed; returning offline page instead.', error);
        // Fallback to the offline page.

        try {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;

          const path = PRE_CACHED_RESOURCES.find((path) => event.request.url.match(path));
          const cache = await caches.open(CACHE_NAME);
          const preCachedResponse = await cache.match(path);
          return preCachedResponse;
        } catch (error) {
          console.error('Error opening cache for offline page', path);
          const response = new Response(JSON.stringify({ status: 'error', message: error.message }));
          // response.status = 200;
          response.headers.set('Content-Type', 'application/json');
          return response;
        }
      }
    })(),
  );
});
