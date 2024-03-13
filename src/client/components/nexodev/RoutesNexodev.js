import { loggerFactory } from '../core/Logger.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`nexodev.org`;

// Router
const RoutesNexodev = () => {
  return {
    '/': {
      title: 'Home',
      render: () => s(`.main-btn-home`).click(),
      upperCase: true,
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
  };
};

window.Routes = RoutesNexodev;

const RouterNexodev = () => {
  return { Routes: RoutesNexodev, proxyPath: getProxyPath(), NameApp };
};

export { RoutesNexodev, RouterNexodev, NameApp };
