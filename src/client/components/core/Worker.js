/**
 * Utility class for managing Progressive Web App (PWA) worker functionalities,
 * including service worker registration, caching, and notification management.
 * This class is designed to be used as a singleton instance (exported as 'Worker').
 * @module src/client/components/core/Worker.js
 * @namespace PwaWorker
 */

import { BtnIcon } from './BtnIcon.js';
import { s4 } from './CommonJs.js';
import { EventsUI } from './EventsUI.js';
import { LoadingAnimation } from './LoadingAnimation.js';
import { loggerFactory } from './Logger.js';
import { LoadRouter } from './Router.js';
import { Translate } from './Translate.js';
import { s } from './VanillaJs.js';
import { getProxyPath } from './Router.js';
const logger = loggerFactory(import.meta);

/**
 * Manages the PWA lifecycle, service workers, and related client-side events.
 * @memberof PwaWorker
 */
class PwaWorker {
  /**
   * The application title, usually from the <title> tag content.
   * @type {string}
   */
  title = '';

  /**
   * Tracks if notification permission has been granted and is active.
   * @type {boolean}
   */
  notificationActive = false;

  /**
   * A function reference to the service worker's update method (registration.update()),
   * dynamically set upon successful registration status check.
   * @type {function(): Promise<void>}
   */
  updateServiceWorker = async () => {};

  /**
   * Router instance reference, initialized during the `instance` call.
   * @type {object | null}
   */
  RouterInstance = null;

  /**
   * Creates an instance of PwaWorker and initializes the application title.
   * @memberof PwaWorker
   */
  constructor() {
    this.title = `${s('title').textContent}`;
  }

  /**
   * Checks if the application is running in development mode (localhost or 127.0.0.1).
   * @memberof PwaWorker
   * @returns {boolean} True if in development mode.
   */
  devMode() {
    return location.origin.match('localhost') || location.origin.match('127.0.0.1');
  }

  /**
   * Initializes the PWA worker, registers global/worker event listeners,
   * checks service worker status, and renders the initial content.
   * This is the main entry point for the worker setup.
   * @memberof PwaWorker
   * @param {object} options - Configuration options.
   * @param {function(): object} options.router - Function to get the router instance.
   * @param {function(): Promise<void>} options.render - Function to render the application's UI.
   * @returns {Promise<void>}
   */
  async instance({ router, render }) {
    window.ononline = async () => {
      logger.warn('ononline');
    };
    window.onoffline = async () => {
      logger.warn('onoffline');
    };
    setTimeout(() => {
      if ('onLine' in navigator && navigator.onLine) window.ononline();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        logger.info('The controller of current browsing context has changed.');
      });
      navigator.serviceWorker.ready.then((worker) => {
        logger.info('Service Worker Ready', worker);

        // event message listener
        navigator.serviceWorker.addEventListener('message', (event) => {
          logger.info('Received event message', event.data);
          const { status } = event.data;

          switch (status) {
            case 'loader':
              {
                LoadingAnimation.RenderCurrentSrcLoad(event);
              }
              break;

            default:
              break;
          }
        });

        // if (navigator.serviceWorker.controller)
        //   navigator.serviceWorker.controller.postMessage({
        //     title: 'Hello from Client event message',
        //   });

        // broadcast message
        // const channel = new BroadcastChannel('sw-messages');
        // channel.addEventListener('message', (event) => {
        //   logger.info('Received broadcast message', event.data);
        // });
        // channel.postMessage({ title: 'Hello from Client broadcast message' });
        // channel.close();
      });
    }

    this.RouterInstance = router();
    const isInstall = await this.status();
    if (!isInstall) await this.install();
    await render();
    LoadRouter(this.RouterInstance);
    LoadingAnimation.removeSplashScreen();
    if (this.devMode()) {
      // const delayLiveReload = 1250;
      // window.addEventListener('visibilitychange', () => {
      //   if (document.visibilityState === 'visible') {
      //     this.reload(delayLiveReload);
      //   }
      // });
      // window.addEventListener('focus', () => {
      //   this.reload(delayLiveReload);
      // });
    }
    window.serviceWorkerReady = true;
  }

  /**
   * Gets the current service worker registration.
   * @memberof PwaWorker
   * @returns {Promise<ServiceWorkerRegistration | undefined>} The service worker registration object, or undefined.
   */
  async getRegistration() {
    return navigator.serviceWorker.getRegistration();
  }

  /**
   * Forces the current service worker to skip waiting and reloads the page
   * to apply the new service worker immediately.
   * @memberof PwaWorker
   * @param {number} [timeOut=3000] - Delay in milliseconds before reloading the page.
   * @returns {Promise<void>} A promise that resolves after the page is reloaded.
   */
  async reload(timeOut = 3000) {
    return new Promise((resolve) => {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          status: 'skipWaiting',
        });
      }
      setTimeout(() => resolve(location.reload()), timeOut);
    });
  }

  /**
   * Updates the application by clearing specific caches and running the service worker update logic.
   * Cache names matching 'components/', 'services/', or '.index.js' are deleted.
   * @memberof PwaWorker
   * @returns {Promise<void>}
   */
  async update() {
    const isInstall = await this.status();
    if (isInstall) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        if (cacheName.match('components/') || cacheName.match('services/') || cacheName.match('.index.js')) {
          await caches.delete(cacheName);
        }
      }
      await this.updateServiceWorker();
    }
  }

  /**
   * Checks the current status of all service worker registrations and sets the
   * `updateServiceWorker` function reference if an active worker is found.
   * @memberof PwaWorker
   * @returns {Promise<boolean>} True if at least one service worker is registered.
   */
  status() {
    let status = false;
    return new Promise((resolve) => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            for (const registration of registrations) {
              if (registration.installing) logger.info('installing', registration);
              else if (registration.waiting) logger.info('waiting', registration);
              else if (registration.active) {
                logger.info('active', registration);
                // Dynamically set the update function
                this.updateServiceWorker = async () => await registration.update();
              }
            }
            if (registrations.length > 0) status = true;
            resolve(status);
          })
          .catch((...args) => {
            logger.error('Error getting service worker registrations:', ...args);
            resolve(false);
          });
      } else {
        logger.warn('Service Worker Disabled in browser');
        resolve(false);
      }
    });
  }

  /**
   * Registers the service worker (`sw.js`) with the browser.
   * @memberof PwaWorker
   * @returns {Promise<Array<any>>} A promise that resolves with the registration arguments.
   */
  install() {
    return new Promise((resolve) => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register(`${getProxyPath()}sw.js`, {
            type: 'module',
          })
          .then((...args) => {
            logger.warn('Service Worker Registered', args);
            resolve(args);
          })
          .catch((...args) => {
            logger.error('Error registering service worker:', ...args);
            resolve(args);
          });
      } else {
        logger.warn('Service Worker Disabled in browser');
        resolve([]);
      }
    });
  }

  /**
   * Unregisters all service workers and deletes all application caches.
   * @memberof PwaWorker
   * @returns {Promise<Array<any>>} A promise that resolves after uninstallation.
   */
  uninstall() {
    return new Promise(async (resolve) => {
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          const cacheNames = await caches.keys();
          for (const cacheName of cacheNames) await caches.delete(cacheName);
          for (const registration of registrations) {
            logger.info('Removing service worker registration', registration);
            registration.unregister();
          }
          resolve([]);
        } catch (error) {
          logger.error('Error during service worker uninstallation:', error);
          resolve([error]);
        }
      } else {
        logger.warn('Service Worker Disabled in browser');
        resolve([]);
      }
    });
  }

  /**
   * Requests permission from the user to display notifications.
   * Sets the internal `notificationActive` state.
   * @memberof PwaWorker
   * @returns {Promise<boolean>} True if permission is granted, false otherwise.
   */
  notificationRequestPermission() {
    return new Promise((resolve) =>
      Notification.requestPermission().then((result) => {
        if (result === 'granted') {
          this.notificationActive = true;
          resolve(true);
        } else {
          this.notificationActive = false;
          resolve(false);
        }
      }),
    );
  }

  /**
   * Shows a sample notification if permission is granted.
   * @memberof PwaWorker
   * @returns {void}
   */
  notificationShow() {
    Notification.requestPermission().then((result) => {
      if (result === 'granted') {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification('Vibration Sample', {
            body: 'Buzz! Buzz!',
            icon: '../images/touch/chrome-touch-icon.png',
            vibrate: [200, 100, 200, 100, 200, 100, 200],
            tag: 'vibration-sample',
            requireInteraction: true,
          });
        });
      }
    });
  }

  /**
   * Renders the UI for PWA settings, including buttons for cleaning cache and worker management.
   * It also attaches the click handler for the 'clean-cache' button.
   * @memberof PwaWorker
   * @returns {Promise<string>} The HTML string for the settings section.
   */
  async RenderSetting() {
    setTimeout(() => {
      // Event listener for the clean cache button
      EventsUI.onClick(`.btn-clean-cache`, async (e) => {
        e.preventDefault();
        // Clear local storage, uninstall the worker, and reload
        localStorage.clear();
        await this.uninstall();
        await this.reload();
      });
    });
    return html` <div class="in">
      ${await BtnIcon.Render({
        class: 'inl section-mp btn-custom btn-install-service-controller hide',
        label: html`<i class="fas fa-download"></i> ${Translate.Render('Install control service')}`,
      })}
      ${await BtnIcon.Render({
        class: 'inl section-mp btn-custom btn-uninstall-service-controller hide',
        label: html`<i class="far fa-trash-alt"></i> ${Translate.Render('Uninstall control service')}`,
      })}
      ${await BtnIcon.Render({
        class: 'inl section-mp btn-custom btn-clean-cache',
        label: html`<i class="fa-solid fa-broom"></i> ${Translate.Render('clean-cache')}`,
      })}
      ${await BtnIcon.Render({
        class: 'inl section-mp btn-custom btn-reload hide',
        label: html`<i class="fas fa-sync-alt"></i> ${Translate.Render('Reload')}`,
      })}
    </div>`;
  }
}

// Create the singleton instance
const PwaWorkerInstance = new PwaWorker();

// Export the new class name for modern usage
export { PwaWorker };

// Export the instance with the old name (`Worker`) for backward compatibility,
// ensuring existing code consuming the module continues to work.
export { PwaWorkerInstance as Worker };
