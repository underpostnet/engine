import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';

const logger = loggerFactory(import.meta);

const BannerAppTemplate = html`Healthcare - ERP CRM Nexodev`;

// Router
const RoutesHealthcare = () => {
  return {
    '/': {
      title: 'Healthcare - ERP CRM Nexodev',
      render: () => Modal.onHomeRouterEvent(),
    },
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
    '/recover': { title: 'recover', render: () => s(`.main-btn-recover`).click() },
    '/nutrition-tips': {
      title: 'nutrition-tips',
      render: () => s(`.main-btn-nutrition-tips`).click(),
    },
    '/record-mood': {
      title: 'record-mood',
      render: () => s(`.main-btn-record-mood`).click(),
    },

    '/healthcare-appointment-management': {
      title: 'healthcare-appointment-management',
      render: () => s(`.main-btn-healthcare-appointment-management`).click(),
    },
    '/calendar': { title: 'calendar', render: () => s(`.main-btn-calendar`).click() },
    '/healthcare-appointment': {
      title: 'healthcare-appointment',
      render: () => s(`.main-btn-healthcare-appointment`).click(),
    },
  };
};

window.Routes = RoutesHealthcare;

const RouterHealthcare = () => {
  return { Routes: RoutesHealthcare };
};

export { RoutesHealthcare, RouterHealthcare, BannerAppTemplate };
