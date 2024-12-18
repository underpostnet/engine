const PRE_CACHED_RESOURCES = [];
const CACHE_NAME = 'app-cache';
const PROXY_PATH = '/';
self.addEventListener('install', (event) => {
  // Activate right away
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      // Open the app's cache.
      const cache = await caches.open(CACHE_NAME);
      // Cache all static resources.
      try {
        await cache.addAll(PRE_CACHED_RESOURCES);
      } catch (error) {
        console.error(error);
      }
      // for (const cacheKey of PRE_CACHED_RESOURCES) {
      //   try {
      //     await cache.add(cacheKey);
      //   } catch (error) {
      //     console.error(error, cacheKey);
      //   }
      // }
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
        console.error('Fetch failed; returning offline page instead.', event.request.url, error);
        // Fallback to the offline page.
        const path = PRE_CACHED_RESOURCES.find((path) => event.request.url.match(path.replaceAll('/index.html', '')));

        try {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;
          const cache = await caches.open(CACHE_NAME);
          const preCachedResponse = await cache.match(path);
          if (!preCachedResponse) throw new Error(error.message);
          return preCachedResponse;
        } catch (error) {
          console.error('Error opening cache for pre cached page', event.request.url, error);
          try {
            if (event.request.method.toUpperCase() === 'GET') {
              const cache = await caches.open(CACHE_NAME);
              const preCachedResponse = await cache.match(`${PROXY_PATH === '/' ? '' : PROXY_PATH}/offline/index.html`);
              if (!preCachedResponse) throw new Error(error.message);
              return preCachedResponse;
            }
            const response = new Response(JSON.stringify({ status: 'error', message: 'offline test response' }));
            // response.status = 200;
            response.headers.set('Content-Type', 'application/json');
            return response;
          } catch (error) {
            console.error('Error opening cache for offline page', event.request.url, error);
            const response = new Response(JSON.stringify({ status: 'error', message: error.message }));
            // response.status = 200;
            response.headers.set('Content-Type', 'application/json');
            return response;
          }
        }
      }
    })(),
  );
});
