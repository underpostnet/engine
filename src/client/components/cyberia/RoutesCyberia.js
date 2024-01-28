import { loggerFactory } from '../core/Logger.js';
import { s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`CYBERIA`;

// Router
const RoutesCyberia = () => {
  return {
    '/': {
      title: 'MMORPG',
      render: () => s(`.main-btn-home`).click(),
      upperCase: true,
    },
    '/bag': { title: 'bag', render: () => s(`.main-btn-bag`).click(), translateTitle: true },
    '/colors': { title: 'pallet-colors', render: () => s(`.main-btn-colors`).click(), translateTitle: true },
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
    '/chat': { title: 'Chat', render: () => s(`.main-btn-chat`).click() },
    '/biome': { title: 'Biome Engine', render: () => s(`.main-btn-biome`).click() },
    '/tile': { title: 'Tile Engine', render: () => s(`.main-btn-tile`).click() },
    '/3d': { title: '3D Engine', render: () => s(`.main-btn-3d`).click() },
    '/world': { title: 'World Engine', render: () => s(`.main-btn-world`).click() },
  };
};

export { RoutesCyberia, NameApp };
