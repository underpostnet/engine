import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const BannerAppTemplate = html`underpost`;

class RouterUnderpost {
  static routes() {
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
      '/u': { title: 'public-profile', render: () => s(`.main-btn-public-profile`).click() },
      // The home panel hosts entries: show it without leaving `/entry/:stableSlug`.
      '/entry': { title: 'entry', render: () => Modal.onHomeRouterEvent({ keepPath: true }) },
      '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click() },
      '/user-management': { title: 'user-management', render: () => s(`.main-btn-user-management`).click() },
      '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click() },
      '/content': { title: 'content', render: () => s(`.main-btn-content`).click() },
      '/cloud': { title: 'cloud', render: () => s(`.main-btn-cloud`).click() },
      '/polyhedron': { title: 'polyhedron', render: () => s(`.main-btn-polyhedron`).click() },
    };
  }

  static instance() {
    return { Routes: RouterUnderpost.routes };
  }
}

export { RouterUnderpost, BannerAppTemplate };
