import { loggerFactory } from '../components/core/Logger.js';

// https://googlechrome.github.io/samples/service-worker/custom-offline-page/

/*
Copyright 2015, 2019 Google Inc. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

// https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
// https://web.dev/cache-api-quick-guide/
// https://developer.mozilla.org/en-US/docs/Web/API
// https://developer.mozilla.org/es/docs/Web/Progressive_web_apps/Re-engageable_Notifications_Push
// https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification
// https://github.com/GoogleChrome/samples/blob/9e4b3b77b091268d28e5438bb2fe8829091e9540/service-worker/basic/service-worker.js#L59
// https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API

/*

 4 different ways to store data on client-side without using cookies:

- Local Storage (Session and Local key/value pairs)
- Web SQL (my favorite, it's a whole SQL Database, and it's NOT obsolete)
- IndexedDB (another Database with different structure and acceptance)
- Service Workers (Persistent background processing,
even while offline, can asynchronously save files and many other things)

*/

const logger = loggerFactory(import.meta);

self.addEventListener('install', (event) => {
  // Activate right away
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      // const cache = await caches.open(CACHE_NAME);
      // Setting {cache: 'reload'} in the new request will ensure that the response
      // isn't fulfilled from the HTTP cache; i.e., it will be from the network.
      // await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      // Open the app's cache.
      // const cache = await caches.open(CACHE_NAME);
      // Cache all static resources.
      // await cache.addAll(PRE_CACHED_RESOURCES);
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

  // event message
  self.addEventListener('message', (event) => {
    logger.info('Received event message', event.data);

    switch (event.data.status) {
      case 'skipWaiting':
        return self.skipWaiting();
        break;

      default:
        break;
    }

    clients.matchAll().then((clientList) => {
      for (const client of clientList) {
        logger.info('client', client);
        client.postMessage({
          title: 'Hello from SW event message',
        });
        // client -> document.visibilityState
        //           client.visibilityState
      }
    });
  });
  // broadcast message
  const channel = new BroadcastChannel('sw-messages');
  channel.addEventListener('message', (event) => {
    logger.info('Received broadcast message', event.data);
    channel.postMessage({ title: 'Hello from SW broadcast message' });
  });
});

self.addEventListener('fetch', (event) => {
  let path;

  if (event.request.url.match(location.origin)) path = event.request.url.slice(location.origin.length);
  const preload = path && !path.match('/api');

  logger.info(`On fetch`, {
    mode: event.request.mode,
    url: event.request.url,
    referrer: event.request.referrer,
    method: event.request.method,
    path,
    preload,
  });

  (async () => {
    // Get the client.
    const client = await clients.get(event.clientId);
    if (client)
      client.postMessage({
        status: 'loader',
        path,
      });
    else logger.warn('client not found');
  })();

  // We only want to call event.respondWith() if this is a navigation request
  // for an HTML page.
  if (path !== undefined || event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // First, try to use the navigation preload response if it's supported.
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }

          if (preload) {
            const preloadCache = await caches.has(path);
            const cache = await caches.open(path);
            const cacheResponse = await cache.match(path);
            if (!preloadCache || !cacheResponse || cacheResponse.status !== 200) {
              logger.warn('install', path);
              // await cache.add(new Request(event.request.url, { cache: 'reload' }));

              // Other option:
              // The resource wasn't found in the cache, so fetch it from the network.
              const fetchResponse = await fetch(event.request.url);

              if (fetchResponse.status === 200) {
                // Put the response in cache.
                await cache.put(event.request.url, fetchResponse.clone());
                // And return the response.
                return fetchResponse;
              } else {
                await caches.delete(path);
                throw new Error(await fetchResponse.text());
              }
            }
            // logger.info('cache response', path);
            return cacheResponse;
          }

          const networkResponse = await fetch(event.request);
          logger.warn('fetch response', event.request.url);
          return networkResponse;
        } catch (error) {
          // catch is only triggered if an exception is thrown, which is likely
          // due to a network error.
          // If fetch() returns a valid HTTP response with a response code in
          // the 4xx or 5xx range, the catch() will NOT be called.
          if (path) {
            const preloadCache = await caches.has(path);
            if (preloadCache) await caches.delete(path);
          }

          logger.error('Fetch failed; returning offline page instead.', error);

          // const cache = await caches.open(CACHE_NAME);
          // const cachedResponse = await cache.match(OFFLINE_URL);
          // return cachedResponse;

          const response = new Response(JSON.stringify({ status: 'error', message: 'offline test response' }));
          // response.status = 200;
          response.headers.set('Content-Type', 'application/json');
          return response;
        }
      })(),
    );
  }

  // If our if() condition is false, then this fetch handler won't intercept the
  // request. If there are any other fetch handlers registered, they will get a
  // chance to call event.respondWith(). If no fetch handlers call
  // event.respondWith(), the request will be handled by the browser as if there
  // were no service worker involvement.
});
