import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`underpost.net`;

// Router
const RoutesUnderpost = () => {
  return {
    '/': {
      title: 'Home',
      render: () => Modal.onHomeRouterEvent(),
    },
    '/contracultura-cyberpunk': {
      title: 'contracultura-cyberpunk',
      render: () => s(`.main-btn-contracultura-cyberpunk`).click(),
    },
    '/lab-gallery': { title: 'lab-gallery', render: () => s(`.main-btn-lab-gallery`).click() },
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
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click() },
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click() },
  };
};

window.Routes = RoutesUnderpost;

const RouterUnderpost = () => {
  return { Routes: RoutesUnderpost, NameApp };
};

export { RoutesUnderpost, RouterUnderpost, NameApp };
