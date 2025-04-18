import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const NameApp = html`Healthcare - ERP CRM Nexodev`;

// Router
const RoutesHealthcare = () => {
  return {
    '/': {
      title: 'Healthcare - ERP CRM Nexodev',
      render: () => Modal.onHomeRouterEvent(),
      upperCase: false,
    },
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
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click(), translateTitle: true },
    '/nutrition-tips': {
      title: 'nutrition-tips',
      render: () => s(`.main-btn-nutrition-tips`).click(),
      translateTitle: true,
    },
    '/record-mood': {
      title: 'record-mood',
      render: () => s(`.main-btn-record-mood`).click(),
      translateTitle: true,
    },

    '/healthcare-appointment-management': {
      title: 'healthcare-appointment-management',
      render: () => s(`.main-btn-healthcare-appointment-management`).click(),
    },
    '/calendar': { title: 'calendar', render: () => s(`.main-btn-calendar`).click(), translateTitle: true },
    '/healthcare-appointment': {
      title: 'healthcare-appointment',
      render: () => s(`.main-btn-healthcare-appointment`).click(),
      translateTitle: true,
    },
  };
};

window.Routes = RoutesHealthcare;

const RouterHealthcare = () => {
  return { Routes: RoutesHealthcare, NameApp };
};

export { RoutesHealthcare, RouterHealthcare, NameApp };
