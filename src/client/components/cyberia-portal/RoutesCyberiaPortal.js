import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`CYBERIA`;

// Router
const RoutesCyberiaPortal = () => {
  return {
    '/': {
      title: 'MMORPG',
      render: () => Modal.onHomeRouterEvent(),
      upperCase: true,
    },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click(), translateTitle: true },
    '/server': { title: 'server', render: () => s(`.main-btn-server`).click(), translateTitle: true },
    '/log-in': { title: 'log-in', render: () => s(`.main-btn-log-in`).click(), translateTitle: true },
    '/sign-up': { title: 'sign-up', render: () => s(`.main-btn-sign-up`).click(), translateTitle: true },
    '/chat': { title: 'chat', render: () => s(`.main-btn-chat`).click(), translateTitle: true },
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

window.Routes = RoutesCyberiaPortal;

const RouterCyberiaPortal = () => {
  return { Routes: RoutesCyberiaPortal, NameApp };
};

export { RoutesCyberiaPortal, RouterCyberiaPortal, NameApp };
