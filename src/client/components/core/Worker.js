import { EventsUI } from './EventsUI.js';
import { loggerFactory } from './Logger.js';
import { getProxyPath, s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const Worker = {
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
              else if (registration.active) logger.info('active', registration);
            }
            if (registrations.length > 0) status = true;
          })
          .catch((...args) => {
            logger.error(...args);
            return reject(false);
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
            return reject(args);
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
    return new Promise((resolve, reject) => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            for (const registration of registrations) {
              logger.info('remove', registration);
              registration.unregister();
            }

            caches.keys().then((names) => {
              for (const name of names) {
                logger.info('remove', name);
                caches.delete(name);
              }
            });
          })
          .catch((...args) => {
            logger.error(...args);
            return reject(args);
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
  loadSettingUI: async function () {
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
