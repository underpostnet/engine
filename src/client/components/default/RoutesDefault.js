import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`<strong class="inl" style="font-family: system-ui">PWA</strong>`;

// Router
const RoutesDefault = () => {
  return {
    '/': {
      title: 'Home',
      render: () => Modal.onHomeRouterEvent(),
    },
    '/home': { title: 'home', render: () => Modal.onHomeRouterEvent() },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click() },
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
    '/docs': { title: 'docs', render: () => s(`.main-btn-docs`).click() },
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click() },
    '/default-management': {
      title: 'default-management',
      render: () => s(`.main-btn-default-management`).click(),
    },
    '/404': { title: '404 Not Found', render: () => s(`.main-btn-404`).click() },
    '/500': { title: '500 Server Error', render: () => s(`.main-btn-500`).click() },
  };
};

window.Routes = RoutesDefault;

const RouterDefault = () => {
  return { Routes: RoutesDefault, NameApp };
};

export { RoutesDefault, RouterDefault, NameApp };
