const CacheControl = function ({ ttiLoadTimeLimit }) {
  window.cleanCache = async () => {
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
    localStorage.clear();
    location.reload();
  };

  window.cacheControlCallBack = async () => {
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
      window.cleanCache();
    } else {
      // old navigator
    }
  };
  setTimeout(() => {
    document.querySelector('.clean-cache-container').onclick = window.cleanCache;
  });
  setTimeout(window.cacheControlCallBack, ttiLoadTimeLimit); // 70s limit);
};

SrrComponent = ({ ttiLoadTimeLimit }) => {
  const borderChar = (px, color, selectors) => {
    if (selectors) {
      return selectors
        .map(
          (selector) => html`
            <style>
              ${selector} {
                text-shadow: ${px}px -${px}px ${px}px ${color}, -${px}px ${px}px ${px}px ${color},
                  -${px}px -${px}px ${px}px ${color}, ${px}px ${px}px ${px}px ${color};
              }
            </style>
          `,
        )
        .join('');
    }
    return html`
      text-shadow: ${px}px -${px}px ${px}px ${color}, -${px}px ${px}px ${px}px ${color}, -${px}px -${px}px ${px}px
      ${color}, ${px}px ${px}px ${px}px ${color};
    `;
  };
  return html`
    <style>
      .clean-cache-container {
        position: fixed !important;
        bottom: 5px !important;
        right: 20px !important;
        cursor: pointer !important;
        font-family: Arial, sans-serif !important;
        z-index: 11 !important;
        color: white !important;
        font-size: 12px !important;
      }
    </style>
    ${borderChar(1, 'black', ['.clean-cache-container'])}
    <script>
      const CacheControl = ${CacheControl};
      CacheControl({ ttiLoadTimeLimit: ${ttiLoadTimeLimit ? ttiLoadTimeLimit : 1000 * 70 * 1} });
    </script>
    <div class="clean-cache-container">v2.7.0</div>
  `;
};
