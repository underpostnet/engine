import { loggerFactory } from '../core/Logger.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`Bymyelectrics`;

// Router
const RoutesBymyelectrics = () => {
  return {
    '/': {
      title: 'Home',
      render: () => s(`.main-btn-home`).click(),
      upperCase: false,
    },
    '/home': { title: 'home', render: () => s(`.main-btn-home`).click() },
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
    '/docs': { title: 'docs', render: () => s(`.main-btn-docs`).click(), translateTitle: true },
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click(), translateTitle: true },
    '/default-management': {
      title: 'default-management',
      render: () => s(`.main-btn-default-management`).click(),
      translateTitle: true,
    },
    '/404': { title: '404 Not Found', render: () => s(`.main-btn-404`).click() },
    '/500': { title: '500 Server Error', render: () => s(`.main-btn-500`).click() },
  };
};

window.Routes = RoutesBymyelectrics;

const RouterBymyelectrics = () => {
  return { Routes: RoutesBymyelectrics, NameApp };
};

export { RoutesBymyelectrics, RouterBymyelectrics, NameApp };