import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const BannerAppTemplate = html`Object Layer`;

class RouterObjectlayer {
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
      '/object-layer-engine-viewer': {
        title: 'object-layer-engine-viewer',
        render: () => s(`.main-btn-object-layer-engine-viewer`).click(),
      },
      '/docs': { title: 'docs', render: () => s(`.main-btn-docs`).click() },
      '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click() },
    };
  }

  static instance() {
    return { Routes: RouterObjectlayer.routes };
  }
}

export { RouterObjectlayer, BannerAppTemplate };
