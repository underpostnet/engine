import { loggerFactory } from '../core/Logger.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`BMS`;

// Router
const RoutesBms = () => {
  return {
    '/': {
      title: 'BMS | Streamline Your Brokerage Operations with Our Powerful Management System',
      render: () => s(`.main-btn-home`).click(),
      upperCase: false,
    },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click(), translateTitle: true },
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
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click(), translateTitle: true },
  };
};

window.Routes = RoutesBms;

const RouterBms = () => {
  return { Routes: RoutesBms, NameApp };
};

export { RoutesBms, RouterBms, NameApp };
