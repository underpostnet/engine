import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`CYBERIA`;

// Router
const RoutesCyberia = () => {
  return {
    '/': {
      title: 'MMORPG',
      render: () => Modal.onHomeRouterEvent(),
      upperCase: true,
    },
    '/bag': { title: 'bag', render: () => s(`.main-btn-bag`).click(), translateTitle: true },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click(), translateTitle: true },
    '/log-in': { title: 'log-in', render: () => s(`.main-btn-log-in`).click(), translateTitle: true },
    '/sign-up': { title: 'sign-up', render: () => s(`.main-btn-sign-up`).click(), translateTitle: true },
    '/wallet': { title: 'wallet', render: () => s(`.main-btn-wallet`).click(), translateTitle: false },
    '/character': { title: 'character', render: () => s(`.main-btn-character`).click(), translateTitle: true },
    '/map': { title: 'map', render: () => s(`.main-btn-map`).click(), translateTitle: true },
    '/wiki': { title: 'wiki', render: () => s(`.main-btn-wiki`).click(), translateTitle: true },
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
    '/chat': { title: 'Chat', render: () => s(`.main-btn-chat`).click() },
    '/server': { title: 'server', render: () => s(`.main-btn-server`).click() },
    '/quest': { title: 'quest', render: () => s(`.main-btn-quest`).click() },
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click(), translateTitle: true },
  };
};

window.Routes = RoutesCyberia;

const RouterCyberia = () => {
  return { Routes: RoutesCyberia, NameApp };
};

export { RoutesCyberia, RouterCyberia, NameApp };
