import { loggerFactory } from '../core/Logger.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`underpost.net`;

// Router
const RoutesUnderpost = () => {
  return {
    '/': {
      title: 'Home',
      render: () => s(`.main-btn-home`).click(),
      upperCase: false,
    },
    '/contracultura-cyberpunk': {
      title: 'contracultura-cyberpunk',
      render: () => s(`.main-btn-contracultura-cyberpunk`).click(),
      translateTitle: false,
    },
    '/lab-gallery': { title: 'lab-gallery', render: () => s(`.main-btn-lab-gallery`).click(), translateTitle: false },
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
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click(), translateTitle: true },
  };
};

window.Routes = RoutesUnderpost;

const RouterUnderpost = () => {
  return { Routes: RoutesUnderpost, NameApp };
};

export { RoutesUnderpost, RouterUnderpost, NameApp };
