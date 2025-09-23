import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';

const logger = loggerFactory(import.meta);

const BannerAppTemplate = html`nexodev.org`;

// Router
const RoutesNexodev = () => {
  return {
    '/': {
      title: 'Home',
      render: () => Modal.onHomeRouterEvent(),
    },
    '/blog': { title: 'blog', render: () => s(`.main-btn-blog`).click() },
    '/dashboard': { title: 'dashboard', render: () => s(`.main-btn-dashboard`).click() },
    '/content': { title: 'content', render: () => s(`.main-btn-content`).click() },
    '/cloud': { title: 'cloud', render: () => s(`.main-btn-cloud`).click() },
    '/stream': { title: 'stream', render: () => s(`.main-btn-stream`).click() },
    '/calendar': { title: 'calendar', render: () => s(`.main-btn-calendar`).click() },
    '/docs': { title: 'docs', render: () => s(`.main-btn-docs`).click() },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click() },
    '/chat': { title: 'chat', render: () => s(`.main-btn-chat`).click() },
    '/log-in': { title: 'log-in', render: () => s(`.main-btn-log-in`).click() },
    '/sign-up': { title: 'sign-up', render: () => s(`.main-btn-sign-up`).click() },
    '/wallet': { title: 'wallet', render: () => s(`.main-btn-wallet`).click() },
    '/log-out': {
      title: 'log-out',
      render: () => s(`.main-btn-log-out`).click(),
    },
    '/account': {
      title: 'account',
      render: () => s(`.main-btn-account`).click(),
    },
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click() },
    '/default-management': {
      title: 'default-management',
      render: () => s(`.main-btn-default-management`).click(),
    },
    '/user-management': {
      title: 'user-management',
      render: () => s(`.main-btn-user-management`).click(),
    },
    '/instance-management': {
      title: 'instance-management',
      render: () => s(`.main-btn-instance-management`).click(),
    },
    '/cron-management': {
      title: 'cron-management',
      render: () => s(`.main-btn-cron-management`).click(),
    },
  };
};

window.Routes = RoutesNexodev;

const RouterNexodev = () => {
  return { Routes: RoutesNexodev };
};

export { RoutesNexodev, RouterNexodev, BannerAppTemplate };
