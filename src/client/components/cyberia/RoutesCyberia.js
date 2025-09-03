import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const BannerAppTemplate = html`C Y B E R I A`;

// Router
const RoutesCyberia = () => {
  return {
    '/': {
      title: 'MMORPG',
      render: () => Modal.onHomeRouterEvent(),
      upperCase: true,
    },
    '/bag': { title: 'bag', render: () => s(`.main-btn-bag`).click() },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click() },
    '/log-in': { title: 'log-in', render: () => s(`.main-btn-log-in`).click() },
    '/sign-up': { title: 'sign-up', render: () => s(`.main-btn-sign-up`).click() },
    '/wallet': { title: 'wallet', render: () => s(`.main-btn-wallet`).click() },
    '/character': { title: 'character', render: () => s(`.main-btn-character`).click() },
    '/map': { title: 'map', render: () => s(`.main-btn-map`).click() },
    '/wiki': { title: 'wiki', render: () => s(`.main-btn-wiki`).click() },
    '/log-out': {
      title: 'log-out',
      render: () => s(`.main-btn-log-out`).click(),
    },
    '/account': {
      title: 'account',
      render: () => s(`.main-btn-account`).click(),
    },
    '/chat': { title: 'Chat', render: () => s(`.main-btn-chat`).click() },
    '/server': { title: 'server', render: () => s(`.main-btn-server`).click() },
    '/quest': { title: 'quest', render: () => s(`.main-btn-quest`).click() },
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click() },
  };
};

window.Routes = RoutesCyberia;

const RouterCyberia = () => {
  return { Routes: RoutesCyberia, BannerAppTemplate };
};

export { RoutesCyberia, RouterCyberia, BannerAppTemplate };
