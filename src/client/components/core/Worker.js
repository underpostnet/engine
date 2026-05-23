/**
 * Progressive Web App (PWA) worker integration: service worker lifecycle,
 * cache management, and the bootstrap path that wires the app's router,
 * shell, translation, sockets, and session components together.
 *
 * The public surface is a single `PwaWorker` class with one shared instance,
 * re-exported as `Worker` for backward compatibility.
 *
 * @module src/client/components/core/Worker.js
 * @namespace PwaWorker
 */

import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';
import { LoadingAnimation } from './LoadingAnimation.js';
import { loggerFactory } from './Logger.js';
import { LoadRouter, registerRoutes, getProxyPath } from './Router.js';
import { Translate, TranslateCore } from './Translate.js';
import { s } from './VanillaJs.js';
import { Css } from './Css.js';
import { Responsive } from './Responsive.js';
import { SocketIo } from './SocketIo.js';
import { Keyboard } from './Keyboard.js';

const logger = loggerFactory(import.meta);

const SW_URL = () => `${getProxyPath()}sw.js`;

/**
 * @memberof PwaWorker
 */
class PwaWorker {
  /** App title sourced from <title>. @type {string} */
  title = '';

  /** Router instance reference, set during bootstrap. @type {object | null} */
  RouterInstance = null;

  constructor() {
    this.title = `${s('title').textContent}`;
    if (!window.renderPayload?.dev) {
      console.log = () => null;
      console.error = () => null;
      console.info = () => null;
      console.warn = () => null;
    }
  }

  /** @returns {boolean} True when running on localhost or with renderPayload.dev. */
  devMode() {
    return Boolean(
      window.renderPayload?.dev || location.origin.match('localhost') || location.origin.match('127.0.0.1'),
    );
  }

  /**
   * Awaits a component's `instance()` method, a plain function, or an array of either.
   * Used by `instance()` to keep the bootstrap declarative.
   * @private
   */
  async #initComponent(component, options) {
    if (!component) return;
    if (Array.isArray(component)) {
      for (const item of component) await this.#initComponent(item, options);
      return;
    }
    if (typeof component.instance === 'function') return void (await component.instance(options));
    if (typeof component === 'function') await component(options);
  }

  /**
   * Bootstraps the app with a declarative options object. Shared core inits
   * (Css, TranslateCore, Responsive, SocketIo, Keyboard) run in the correct
   * order so per-app entrypoints only declare what's app-specific.
   *
   * @param {object} options
   * @param {function|object}             options.router       Router class (with static `instance()`) or factory.
   * @param {function(): Promise<string>} [options.template]   Async function returning the landing HTML body.
   * @param {Array}                       [options.themes]     CSS theme list passed to `Css.loadThemes()`.
   * @param {object|Array}                [options.translate]  App-level translation class(es).
   * @param {object}                      [options.render]     AppShell class with `instance({ htmlMainBody })`.
   * @param {string}                      [options.socketPath] Socket.IO path override.
   * @param {object}                      [options.appStore]   AppStore whose `.Data` supplies socket channels.
   * @param {object}                      [options.session]    `{ socket, login, signout|logout, signup, account }`.
   * @returns {Promise<void>}
   */
  async instance({ router, template, themes, translate, render, socketPath, appStore, session }) {
    window.ononline = () => logger.warn('ononline');
    window.onoffline = () => logger.warn('onoffline');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        logger.info('The controller of current browsing context has changed.');
      });
      navigator.serviceWorker.ready.then((worker) => {
        logger.info('Service Worker Ready', worker);
        navigator.serviceWorker.addEventListener('message', (event) => {
          logger.info('Received event message', event.data);
          if (event.data?.status === 'loader') LoadingAnimation.RenderCurrentSrcLoad(event);
        });
      });
    }

    this.RouterInstance = typeof router?.instance === 'function' ? router.instance() : router();
    if (this.RouterInstance?.Routes) registerRoutes(this.RouterInstance.Routes);

    // Defer SW registration out of the render critical path. Firefox in
    // particular pays a non-trivial IPC cost for SW registration; running it
    // after `load` keeps first paint unblocked across all engines.
    this.#registerDeferred();

    // Shared core inits — keep order: theme → translation → responsive → shell.
    if (themes) await Css.loadThemes(themes);
    await this.#initComponent(TranslateCore);
    await this.#initComponent(translate);
    await this.#initComponent(Responsive);

    if (render && typeof render.instance === 'function') {
      const htmlMainBody = typeof template === 'function' ? template : undefined;
      await this.#initComponent(render, htmlMainBody ? { htmlMainBody } : undefined);
    }

    const channels = appStore?.Data ?? session?.socket?.Data;
    await this.#initComponent(SocketIo, { channels, path: socketPath });

    if (session) {
      await this.#initComponent(session.socket);
      await this.#initComponent(session.login);
      await this.#initComponent(session.logout || session.signout);
      await this.#initComponent(session.signup);
      await this.#initComponent(session.account);
    }

    await this.#initComponent(Keyboard);
    await LoadRouter(this.RouterInstance);
    LoadingAnimation.removeSplashScreen();
    window.serviceWorkerReady = true;
  }

  /**
   * Schedules SW registration to run after page `load` (or immediately if
   * the page is already loaded). Idempotent: existing registrations are
   * left alone; missing ones are registered.
   * @private
   */
  #registerDeferred() {
    if (!('serviceWorker' in navigator)) {
      logger.warn('Service Worker disabled in browser');
      return;
    }
    const run = async () => {
      const registration = await this.getRegistration();
      if (!registration) await this.register();
    };
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  }

  /** Returns the current service worker registration, if any. */
  getRegistration() {
    return 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration() : Promise.resolve(undefined);
  }

  /** Registers `sw.js` with the browser. Resolves with the registration (or `null` on failure). */
  async register() {
    if (!('serviceWorker' in navigator)) {
      logger.warn('Service Worker disabled in browser');
      return null;
    }
    try {
      const registration = await navigator.serviceWorker.register(SW_URL());
      logger.warn('Service Worker registered', registration);
      return registration;
    } catch (error) {
      logger.error('Error registering service worker:', error);
      return null;
    }
  }

  /**
   * Reloads the page, asking the active SW to skip waiting first so the
   * new version takes effect on the next load.
   * @param {number} [delay=3000] Milliseconds before reload.
   */
  async reload(delay = 3000) {
    navigator.serviceWorker?.controller?.postMessage({ status: 'skipWaiting' });
    return new Promise((resolve) => setTimeout(() => resolve(location.reload()), delay));
  }

  /** Deletes every cache visible to the SW. Returns the number of caches removed. */
  async clearAllCaches() {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    return names.length;
  }

  /**
   * Deletes Workbox/background-sync IndexedDB databases that may pin stale state
   * across reloads. Safe no-op in browsers without `indexedDB.databases`.
   */
  async clearWorkboxIndexedDb() {
    if (!('indexedDB' in window) || typeof indexedDB.databases !== 'function') return 0;
    const databases = await indexedDB.databases();
    const targets = databases
      .map((db) => db.name)
      .filter(
        (name) =>
          typeof name === 'string' &&
          (name.toLowerCase().includes('workbox') ||
            name.toLowerCase().includes('background-sync') ||
            name.includes('api-mutation-queue')),
      );

    await Promise.all(
      targets.map(
        (name) =>
          new Promise((resolve) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
            req.onblocked = () => resolve(false);
          }),
      ),
    );
    return targets.length;
  }

  /**
   * Asks the active SW to drop its caches and confirm. Resolves `false`
   * after 1500 ms if the SW does not reply.
   */
  async requestWorkboxReset() {
    if (!navigator.serviceWorker?.controller) return false;
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeoutId = setTimeout(() => resolve(false), 1500);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeoutId);
        resolve(event.data?.status === 'workbox-reset-done');
      };
      navigator.serviceWorker.controller.postMessage({ status: 'workbox-reset' }, [channel.port2]);
    });
  }

  /**
   * Targeted cache invalidation: removes app-shell entries for components,
   * services, and index bundles, then forces the SW registration to update.
   * Cheaper than a full reset; used as the default "Update" action.
   */
  async update() {
    const registration = await this.getRegistration();
    if (!registration) return;
    const names = await caches.keys();
    for (const name of names) {
      if (name.match('components/') || name.match('services/') || name.match('.index.js')) {
        await caches.delete(name);
      }
    }
    await registration.update();
  }

  /** Unregisters all SWs and drops every cache. */
  async unregister() {
    if (!('serviceWorker' in navigator)) {
      logger.warn('Service Worker disabled in browser');
      return;
    }
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await this.clearAllCaches();
      for (const registration of registrations) {
        logger.info('Removing service worker registration', registration);
        registration.unregister();
      }
    } catch (error) {
      logger.error('Error during service worker unregistration:', error);
    }
  }

  /** Full reset: workbox runtime + SW + client storage. Use when caches are visibly stale. */
  async resetAndRestart() {
    localStorage.clear();
    sessionStorage.clear();
    await this.requestWorkboxReset();
    await this.unregister();
    await this.clearAllCaches();
    await this.clearWorkboxIndexedDb();
    await this.register();
    await this.reload(600);
  }

  /** Settings panel UI: a single "clean cache" action wired to `resetAndRestart`. */
  async RenderSetting() {
    setTimeout(() => {
      EventsUI.onClick(`.btn-clean-cache`, async (e) => {
        e.preventDefault();
        await this.resetAndRestart();
      });
    });
    return html` <div class="in">
      ${await BtnIcon.instance({
        class: 'inl section-mp btn-custom btn-clean-cache',
        label: html`<i class="fa-solid fa-broom"></i> ${Translate.instance('clean-cache')}`,
      })}
    </div>`;
  }
}

const PwaWorkerInstance = new PwaWorker();

export { PwaWorker };
// Backward-compat alias — older code imports the singleton as `Worker`.
export { PwaWorkerInstance as Worker };
