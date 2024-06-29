const CacheControl = function () {
  setTimeout(async () => {
    let disable = false;
    let status = false;
    await new Promise((resolve, reject) => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            for (const registration of registrations) {
              if (registration.installing) console.log('[sw-cache-control] installing', registration);
              else if (registration.waiting) console.log('[sw-cache-control] waiting', registration);
              else if (registration.active) {
                console.log('[sw-cache-control] active', registration);
              }
            }
            if (registrations.length > 0) status = true;
          })
          .catch((...args) => {
            console.error(...args);
            return resolve(false);
          })
          .finally((...args) => {
            console.log('[sw-cache-control] finally status', args);
            return resolve(status);
          });
      } else {
        console.warn('[sw-cache-control] disabled');
        disable = true;
        return resolve(false);
      }
    });
    if (!disable && !window.serviceWorkerReady) {
      await new Promise(async (resolve, reject) => {
        navigator.serviceWorker
          .getRegistrations()
          .then(async (registrations) => {
            const cacheNames = await caches.keys();
            for (const cacheName of cacheNames) await caches.delete(cacheName);
            for (const registration of registrations) {
              console.log('[sw-cache-control] remove', registration);
              registration.unregister();
            }
          })
          .catch((...args) => {
            console.error(...args);
            return resolve(args);
          })
          .finally((...args) => {
            console.log('[sw-cache-control] finally uninstall', args);
            return resolve(args);
          });
      });
      //   document.querySelector('html').innerHTML = '';
      //   window.open(window.location.origin, '_blank');
      location.reload();
    } else {
      // old navigator
    }
  }, 1000 * 60 * 5); // 5 minutes limit
};

SrrComponent = () =>
  html`
    <script>
      const CacheControl = ${CacheControl};
      CacheControl();
    </script>
  `;
