import { loggerFactory } from '../core/Logger.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`Cryptokoyn`;

// Router
const RoutesCryptokoyn = () => {
  return {
    '/': {
      title: 'Home',
      render: () => s(`.main-btn-home`).click(),
      upperCase: false,
    },
    '/log-in': { title: 'log-in', render: () => s(`.main-btn-log-in`).click(), translateTitle: true },
    '/sign-up': { title: 'sign-up', render: () => s(`.main-btn-sign-up`).click(), translateTitle: true },
    '/log-out': {
      title: 'log-out',
      render: () => s(`.main-btn-log-out`).click(),
      hideDisplay: true,
      translateTitle: true,
    },
    '/account': {
      title: 'account',
      render: () => s(`.main-btn-account`).click(),
      hideDisplay: true,
      translateTitle: true,
    },
    '/wallet': { title: 'wallet', render: () => s(`.main-btn-wallet`).click(), translateTitle: true },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click(), translateTitle: true },
  };
};

window.Routes = RoutesCryptokoyn;

const RouterCryptokoyn = () => {
  return { Routes: RoutesCryptokoyn, NameApp };
};

export { RoutesCryptokoyn, RouterCryptokoyn, NameApp };
