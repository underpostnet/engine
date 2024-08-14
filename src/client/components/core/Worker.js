import { BtnIcon } from './BtnIcon.js';
import { s4 } from './CommonJs.js';
import { EventsUI } from './EventsUI.js';
import { loggerFactory } from './Logger.js';
import { LoadRouter } from './Router.js';
import { Translate } from './Translate.js';
import { getProxyPath, htmls, s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const Worker = {
  instance: async function ({ router, render }) {
    logger.warn('Init');
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      logger.info('The controller of current browsing context has changed.');
    });
    navigator.serviceWorker.ready.then((worker) => {
      logger.info('Ready', worker);
      // event message
      navigator.serviceWorker.addEventListener('message', (event) => {
        logger.info('Received event message', event.data);
        const { status } = event.data;

        switch (status) {
          case 'loader':
            {
              if (s(`.ssr-loading-info`)) {
                let nameSrcLoad = event.data.path;
                if (nameSrcLoad) {
                  if (nameSrcLoad.match('assets'))
                    nameSrcLoad =
                      location.hostname +
                      location.pathname +
                      (location.pathname[location.pathname.length - 1] !== '/' ? '/' : '') +
                      'assets';
                  else if (!nameSrcLoad.match('api')) nameSrcLoad = undefined;
                  if (nameSrcLoad)
                    htmls(
                      `.ssr-loading-info`,
                      html`<span style="color: white">Download </span> <br />
                        <br />
                        ...${nameSrcLoad.slice(-30)}`,
                    );
                }
              }
            }
            break;

          default:
            break;
        }
      });

      if (navigator.serviceWorker.controller)
        navigator.serviceWorker.controller.postMessage({
          title: 'Hello from Client event message',
        });
      // broadcast message
      const channel = new BroadcastChannel('sw-messages');
      channel.addEventListener('message', (event) => {
        logger.info('Received broadcast message', event.data);
      });
      channel.postMessage({ title: 'Hello from Client broadcast message' });
      // channel.close();
    });
    const isInstall = await this.status();
    if (!isInstall) await this.install();
    else await this.update();
    // else if (location.hostname === 'localhost') await this.update();
    this.RouterInstance = router();
    await render();
    LoadRouter(this.RouterInstance);
    window.serviceWorkerReady = true;
  },
  // Get the current service worker registration.
  getRegistration: async function () {
    return await navigator.serviceWorker.getRegistration();
  },
  reload: async function (timeOut = 3000) {
    return await new Promise((resolve) => {
      if (navigator.serviceWorker && navigator.serviceWorker.controller)
        navigator.serviceWorker.controller.postMessage({
          status: 'skipWaiting',
        });
      setTimeout(() => resolve((location.href = `${location.origin}${location.pathname}?r=${s4()}`)), timeOut);
    });
  },
  update: async function () {
    const isInstall = await this.status();
    if (isInstall) {
      // const routes = Object.keys(window.Routes ? window.Routes() : { '/': {} }).map(
      //   (path) => getProxyPath() + path.slice(1),
      // );
      const routes = [];
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        if (cacheName.match('components/') || cacheName.match('.index.js') || routes.includes(cacheName)) {
          await caches.delete(cacheName);
        }
      }
      this.updateServiceWorker();
    }
  },
  updateServiceWorker: function () {},
  status: function () {
    let status = false;
    return new Promise((resolve, reject) => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            for (const registration of registrations) {
              if (registration.installing) logger.info('installing', registration);
              else if (registration.waiting) logger.info('waiting', registration);
              else if (registration.active) {
                logger.info('active', registration);
                this.updateServiceWorker = () => registration.update();
              }
            }
            if (registrations.length > 0) status = true;
          })
          .catch((...args) => {
            logger.error(...args);
            return resolve(false);
          })
          .finally((...args) => {
            logger.info('Finally status', args);
            return resolve(status);
          });
      } else {
        logger.warn('Disabled');
        return resolve(false);
      }
    });
  },
  install: function () {
    return new Promise((resolve, reject) => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register(`/sw.js`, {
            // scope: getProxyPath(),
            // scope: '/',
            type: 'module',
          })
          .then((...args) => {
            logger.warn('Already Registered', args);
          })
          .catch((...args) => {
            logger.error(...args);
            return resolve(args);
          })
          .finally((...args) => {
            logger.info('Finally install', args);
            return resolve(args);
          });
      } else {
        logger.warn('Disabled');
        return resolve();
      }
    });
  },
  uninstall: function () {
    return new Promise(async (resolve, reject) => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then(async (registrations) => {
            const cacheNames = await caches.keys();
            for (const cacheName of cacheNames) await caches.delete(cacheName);
            for (const registration of registrations) {
              logger.info('remove', registration);
              registration.unregister();
            }
          })
          .catch((...args) => {
            logger.error(...args);
            return resolve(args);
          })
          .finally((...args) => {
            logger.info('Finally uninstall', args);
            return resolve(args);
          });
      } else {
        logger.warn('Disabled');
        return resolve();
      }
    });
  },
  notificationActive: false,
  notificationRequestPermission: function () {
    return new Promise((resolve, reject) =>
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
  },
  notificationShow: function () {
    Notification.requestPermission().then((result) => {
      if (result === 'granted') {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification('Vibration Sample', {
            body: 'Buzz! Buzz!',
            icon: '../images/touch/chrome-touch-icon.png',
            vibrate: [200, 100, 200, 100, 200, 100, 200],
            tag: 'vibration-sample',
            requireInteraction: true, //  boolean to manually close the notification
          });
        });
      }
    });
  },
  // TODO: GPS management
  RenderSetting: async function () {
    setTimeout(() => {
      EventsUI.onClick(`.btn-clean-cache`, async (e) => {
        e.preventDefault();
        await this.update();
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
    return;
    s(`.btn-uninstall-service-controller`).classList.add('hide');
    EventsUI.onClick(`.btn-install-service-controller`, async (e) => {
      e.preventDefault();
      const result = await this.install();
      s(`.btn-install-service-controller`).classList.add('hide');
      s(`.btn-uninstall-service-controller`).classList.remove('hide');
    });
    EventsUI.onClick(`.btn-uninstall-service-controller`, async (e) => {
      e.preventDefault();
      const result = await this.uninstall();
      s(`.btn-uninstall-service-controller`).classList.add('hide');
      s(`.btn-install-service-controller`).classList.remove('hide');
    });
    EventsUI.onClick(`.btn-reload`, async (e) => {
      e.preventDefault();
      location.reload();
    });
    const workerStatus = await this.status();
    if (workerStatus) {
      s(`.btn-install-service-controller`).classList.add('hide');
      s(`.btn-uninstall-service-controller`).classList.remove('hide');
    } else {
      s(`.btn-uninstall-service-controller`).classList.add('hide');
      s(`.btn-install-service-controller`).classList.remove('hide');
    }
  },
};

export { Worker };
