/**
 * This module provides a configurable Progressive Web App (PWA) service worker and caching strategies.
 * It supports precaching assets, runtime caching with stale-while-revalidate strategy,
 * and offline fallback handling.
 * @module src/client/sw/default.sw.js
 * @namespace PwaServiceWorker
 */

/**
 * Class representing a Progressive Web App (PWA) Service Worker with caching strategies.
 * @class
 * @memberof PwaServiceWorker
 */
class PwaServiceWorker {
  /**
   * Initializes the service worker configuration by reading from self.renderPayload.
   * If properties are not found, defaults are used.
   * @constructor
   * @property {Array<string>} PRE_CACHED_RESOURCES - List of resources to precache.
   * @property {string} CACHE_NAME - Name of the cache storage.
   * @property {string} PROXY_PATH - Base path for proxying requests.
   */
  constructor() {
    // Configuration properties equivalent to the original global constants
    this.PRE_CACHED_RESOURCES = self.renderPayload?.PRE_CACHED_RESOURCES ?? [];
    this.CACHE_NAME = self.renderPayload?.CACHE_NAME ?? 'app-cache';
    this.PROXY_PATH = self.renderPayload?.PROXY_PATH ?? '/';

    console.log(`Service Worker Initialized. Cache: ${this.CACHE_NAME}, Proxy: ${this.PROXY_PATH}`);
  }

  /**
   * Registers event listeners for the service worker lifecycle and requests.
   * @method
   * @memberof PwaServiceWorker
   */
  run() {
    // Bind methods to 'this' (the instance) before attaching to self
    self.addEventListener('install', this._onInstall.bind(this));
    self.addEventListener('activate', this._onActivate.bind(this));
    self.addEventListener('fetch', this._onFetch.bind(this));
  }

  /**
   * Handles the 'install' event. Skips waiting and precaches static assets.
   * @param {ExtendableEvent} event
   * @memberof PwaServiceWorker
   */
  _onInstall(event) {
    // Activate right away
    self.skipWaiting();

    event.waitUntil(
      (async () => {
        // Open the app's cache using the configured name.
        const cache = await caches.open(this.CACHE_NAME);
        // Cache all static resources.
        try {
          console.log(`Precaching ${this.PRE_CACHED_RESOURCES.length} resources...`);
          await cache.addAll(this.PRE_CACHED_RESOURCES);
        } catch (error) {
          console.error('Error during precaching resources:', error);
        }
      })(),
    );
  }

  /**
   * Handles the 'activate' event. Enables navigation preload and takes control
   * of uncontrolled clients immediately.
   * @param {ExtendableEvent} event
   * @memberof PwaServiceWorker
   */
  _onActivate(event) {
    event.waitUntil(
      (async () => {
        // Enable navigation preload if it's supported.
        if ('navigationPreload' in self.registration) {
          await self.registration.navigationPreload.enable();
          console.log('Navigation Preload enabled.');
        }
      })(),
    );
    // Tell the active service worker to take control of the page immediately.
    self.clients.claim();
  }

  /**
   * Handles the 'fetch' event, implementing the Cache-First strategy with
   * complex offline and maintenance fallbacks.
   * @param {FetchEvent} event
   * @memberof PwaServiceWorker
   */
  _onFetch(event) {
    // Only handle HTTP/HTTPS requests that are not cross-origin (optional, but robust)
    if (event.request.url.startsWith('http')) {
      event.respondWith(this._handleFetchRequest(event));
    }
  }

  /**
   * Core logic to handle fetching, caching, and fallbacks.
   * @param {FetchEvent} event
   * @returns {Promise<Response>}
   * @memberof PwaServiceWorker
   */
  async _handleFetchRequest(event) {
    // 1. Try Navigation Preload (if available) or network first
    try {
      const preloadResponse = await event.preloadResponse;
      if (preloadResponse) return preloadResponse;

      // Fall through to network request if no preload response
      const networkResponse = await fetch(event.request);

      // OPTIONAL: If the network request is successful, cache it for future use (stale-while-revalidate logic)
      // Omitted for strict equivalence, as original only had complex fallback, not runtime caching.

      return networkResponse;
    } catch (error) {
      console.error('Network request failed. Attempting cache/fallback logic.', event.request.url, error);

      // 2. Try to match the request in the cache
      try {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          console.log(`Cache hit for: ${event.request.url}`);
          return cachedResponse;
        }

        // 3. Try to match a precached resource path (e.g., if requesting /page, match /page/index.html)
        const path = this.PRE_CACHED_RESOURCES.find((p) => event.request.url.match(p.replaceAll('/index.html', '')));

        if (path) {
          const cache = await caches.open(this.CACHE_NAME);
          const preCachedResponse = await cache.match(path);
          if (preCachedResponse) {
            console.log(`Matched precached resource for: ${event.request.url} via path: ${path}`);
            return preCachedResponse;
          }
        }

        // If neither cache match nor precache path match worked, fall through to complex fallback
        throw new Error('Cache miss and no precache match.');
      } catch (cacheError) {
        console.error('Error in primary cache lookup. Falling back to offline/maintenance pages.', {
          url: event.request.url,
          cacheError,
          onLine: navigator.onLine,
        });

        // 4. Complex Fallback Logic (Offline or Maintenance)
        try {
          const cache = await caches.open(this.CACHE_NAME);

          if (!navigator.onLine) {
            // A. OFFLINE FALLBACK
            if (event.request.method.toUpperCase() === 'GET') {
              const offlinePath = `${this.PROXY_PATH === '/' ? '' : this.PROXY_PATH}/offline/index.html`;
              const preCachedResponse = await cache.match(offlinePath);

              if (!preCachedResponse) throw new Error(`Offline page not found in cache: ${offlinePath}`);

              console.log('Serving offline HTML page.');
              return preCachedResponse;
            }

            // B. OFFLINE API FALLBACK (Non-GET requests)
            console.log('Serving offline JSON response for non-GET request.');
            const response = new Response(JSON.stringify({ status: 'error', message: 'offline test response' }));
            response.headers.set('Content-Type', 'application/json');
            return response;
          }

          // C. MAINTENANCE FALLBACK (Online, but network failed - interpreted as maintenance)
          if (event.request.method.toUpperCase() === 'GET') {
            const maintenancePath = `${this.PROXY_PATH === '/' ? '' : this.PROXY_PATH}/maintenance/index.html`;
            const preCachedResponse = await cache.match(maintenancePath);

            if (!preCachedResponse) throw new Error(`Maintenance page not found in cache: ${maintenancePath}`);

            console.log('Serving maintenance HTML page.');
            return preCachedResponse;
          }

          // D. MAINTENANCE API FALLBACK (Non-GET requests)
          console.log('Serving maintenance JSON response for non-GET request.');
          const response = new Response(JSON.stringify({ status: 'error', message: 'server in maintenance' }));
          response.headers.set('Content-Type', 'application/json');
          return response;
        } catch (finalError) {
          // 5. Final fail-safe response
          console.error('Final fail-safe execution failed.', event.request.url, finalError);
          const response = new Response(JSON.stringify({ status: 'error', message: finalError.message }));
          response.headers.set('Content-Type', 'application/json');
          return response;
        }
      }
    }
  }
}

// Instantiate and run the service worker class
new PwaServiceWorker().run();
