import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';

const logger = loggerFactory(import.meta);

const BannerAppTemplate = html`C Y B E R I A`;

// Router
const RoutesCyberiaAdmin = () => {
  return {
    '/': {
      title: 'MMORPG',
      render: () => Modal.onHomeRouterEvent(),
      upperCase: true,
    },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click() },
    '/server': { title: 'server', render: () => s(`.main-btn-server`).click() },
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
    '/chat': { title: 'Chat', render: () => s(`.main-btn-chat`).click() },
    '/colors': { title: 'pallet-colors', render: () => s(`.main-btn-colors`).click() },
    '/biome': { title: 'Biome Engine', render: () => s(`.main-btn-biome`).click() },
    '/tile': { title: 'Tile Engine', render: () => s(`.main-btn-tile`).click() },
    '/3d': { title: '3D Engine', render: () => s(`.main-btn-3d`).click() },
    '/world': { title: 'World Engine', render: () => s(`.main-btn-world`).click() },
    '/item': { title: 'Item Engine', render: () => s(`.main-btn-item`).click() },
    '/cyberia-tile-management': {
      title: 'Cyberia Tile Management',
      render: () => s(`.main-btn-cyberia-tile-management`).click(),
    },
    '/blockchain': { title: 'BlockChain Engine', render: () => s(`.main-btn-blockchain`).click() },
    '/cloud': { title: 'Cloud', render: () => s(`.main-btn-cloud`).click() },
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click() },
    '/cyberia-instance-engine': {
      title: 'cyberia-instance-engine',
      render: () => s(`.main-btn-cyberia-instance-engine`).click(),
    },
  };
};

window.Routes = RoutesCyberiaAdmin;

const RouterCyberiaAdmin = () => {
  return { Routes: RoutesCyberiaAdmin };
};

export { RoutesCyberiaAdmin, RouterCyberiaAdmin, BannerAppTemplate };
