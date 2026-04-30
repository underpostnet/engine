import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const BannerAppTemplate = html`<strong class="inl" style="font-family: system-ui">PWA</strong>`;

class RouterCecinasmarcelina {
  static routes() {
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
      '/chat': { title: 'docs', render: () => s(`.main-btn-chat`).click() },
      '/blog': { title: 'docs', render: () => s(`.main-btn-blog`).click() },
      '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click() },
      '/u': { title: 'public-profile', render: () => s(`.main-btn-public-profile`).click() },
      '/404': { title: '404 Not Found', render: () => s(`.main-btn-404`).click() },
      '/500': { title: '500 Server Error', render: () => s(`.main-btn-500`).click() },
    };
  }

  static instance() {
    return { Routes: RouterCecinasmarcelina.routes };
  }
}

export { RouterCecinasmarcelina, BannerAppTemplate };
