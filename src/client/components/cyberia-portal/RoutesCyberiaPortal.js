import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`CYBERIA`;

// Router
const RoutesCyberiaPortal = () => {
  return {
    '/': {
      title: 'MMORPG',
      render: () => Modal.onHomeRouterEvent(),
      upperCase: true,
    },
    '/settings': { title: 'settings', render: () => s(`.main-btn-settings`).click(),  },
    '/server': { title: 'server', render: () => s(`.main-btn-server`).click(),  },
    '/log-in': { title: 'log-in', render: () => s(`.main-btn-log-in`).click(),  },
    '/sign-up': { title: 'sign-up', render: () => s(`.main-btn-sign-up`).click(),  },
    '/chat': { title: 'chat', render: () => s(`.main-btn-chat`).click(),  },
    '/log-out': {
      title: 'log-out',
      render: () => s(`.main-btn-log-out`).click(),
    
      ,
    },
    '/account': {
      title: 'account',
      render: () => s(`.main-btn-account`).click(),
    
      ,
    },
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click(),  },
    '/object-layer-engine': {
      title: 'object-layer-engine',
      render: () => s(`.main-btn-object-layer-engine`).click(),
      ,
    },
  };
};

window.Routes = RoutesCyberiaPortal;

const RouterCyberiaPortal = () => {
  return { Routes: RoutesCyberiaPortal, NameApp };
};

export { RoutesCyberiaPortal, RouterCyberiaPortal, NameApp };
