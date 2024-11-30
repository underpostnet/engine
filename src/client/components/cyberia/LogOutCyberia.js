import { Auth } from '../core/Auth.js';
import { newInstance } from '../core/CommonJs.js';
import { LogOut } from '../core/LogOut.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, s } from '../core/VanillaJs.js';
import { Webhook } from '../core/Webhook.js';
import { BaseElement } from './CommonCyberia.js';
import { WebhookCyberia } from './WebhookCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { MainUserCyberia } from './MainUserCyberia.js';
import { SocketIoCyberia } from './SocketIoCyberia.js';
import { ServerCyberiaPortal } from '../cyberia-portal/ServerCyberiaPortal.js';

const LogOutCyberia = function () {
  LogOut.Event['LogOutCyberia'] = async () => {
    const type = 'user';
    const id = 'main';

    localStorage.removeItem('jwt');
    s(`.main-btn-log-out`).style.display = 'none';
    s(`.main-btn-account`).style.display = 'none';
    s(`.main-btn-log-in`).style.display = null;
    s(`.main-btn-sign-up`).style.display = null;
    if (s(`.modal-log-out`)) s(`.btn-close-modal-log-out`).click();
    if (s(`.modal-account`)) s(`.btn-close-modal-account`).click();
    s(`.main-btn-server`).classList.add('hide');
    s(`.main-btn-admin`).classList.add('hide');

    WebhookCyberia.unregister();
    ElementsCyberia.Data.user.main = {};
    Auth.deleteToken();

    // const oldElement = newInstance(ElementsCyberia.Data[type][id]);
    // ElementsCyberia.Data[type][id] = BaseElement()[type][id];
    // await MainUserCyberia.Update({ oldElement });
    await ServerCyberiaPortal.internalChangeServer();

    NotificationManager.Push({
      html: Translate.Render(`success-logout`),
      status: 'success',
    });
  };
};

export { LogOutCyberia };
