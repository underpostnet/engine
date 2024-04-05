import { loggerFactory } from '../core/Logger.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`BMS`;

// Router
const RoutesBms = () => {
  return {
    '/': {
      title: 'Home',
      render: () => s(`.main-btn-home`).click(),
      upperCase: false,
    },
    '/blog': { title: 'blog', render: () => s(`.main-btn-blog`).click(), translateTitle: true },
    '/dashboard': { title: 'dashboard', render: () => s(`.main-btn-dashboard`).click(), translateTitle: true },
    '/content': { title: 'content', render: () => s(`.main-btn-content`).click(), translateTitle: true },
    '/cloud': { title: 'cloud', render: () => s(`.main-btn-cloud`).click(), translateTitle: true },
    '/stream': { title: 'stream', render: () => s(`.main-btn-stream`).click(), translateTitle: false },
    '/calendar': { title: 'calendar', render: () => s(`.main-btn-calendar`).click(), translateTitle: true },
    '/docs': { title: 'docs', render: () => s(`.main-btn-docs`).click(), translateTitle: true },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click(), translateTitle: true },
    '/chat': { title: 'chat', render: () => s(`.main-btn-chat`).click(), translateTitle: true },
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

window.Routes = RoutesBms;

const RouterBms = () => {
  return { Routes: RoutesBms, proxyPath: getProxyPath(), NameApp };
};

export { RoutesBms, RouterBms, NameApp };
