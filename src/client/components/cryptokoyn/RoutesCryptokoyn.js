import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';

const logger = loggerFactory(import.meta);

const BannerAppTemplate = html`Cryptokoyn`;

// Router
const RoutesCryptokoyn = () => {
  return {
    '/': {
      title: 'Home',
      render: () => Modal.onHomeRouterEvent(),
    },
    '/log-in': { title: 'log-in', render: () => s(`.main-btn-log-in`).click() },
    '/sign-up': { title: 'sign-up', render: () => s(`.main-btn-sign-up`).click() },
    '/log-out': {
      title: 'log-out',
      render: () => s(`.main-btn-log-out`).click(),
    },
    '/account': {
      title: 'account',
      render: () => s(`.main-btn-account`).click(),
    },
    '/wallet': { title: 'wallet', render: () => s(`.main-btn-wallet`).click() },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click() },
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click() },
  };
};

window.Routes = RoutesCryptokoyn;

const RouterCryptokoyn = () => {
  return { Routes: RoutesCryptokoyn };
};

export { RoutesCryptokoyn, RouterCryptokoyn, BannerAppTemplate };
