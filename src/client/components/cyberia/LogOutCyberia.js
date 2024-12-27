import { LogOut } from '../core/LogOut.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';
import { WebhookCyberia } from './WebhookCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { ServerCyberiaPortal } from '../cyberia-portal/ServerCyberiaPortal.js';

const LogOutCyberia = function () {
  LogOut.Event['LogOutCyberia'] = async (result = { user: { _id: '' } }) => {
    ElementsCyberia.Data.user.main.model.user = result.user;
    const type = 'user';
    const id = 'main';

    s(`.main-btn-log-out`).style.display = 'none';
    s(`.main-btn-account`).style.display = 'none';
    s(`.main-btn-log-in`).style.display = null;
    s(`.main-btn-sign-up`).style.display = null;
    if (s(`.modal-log-out`)) s(`.btn-close-modal-log-out`).click();
    if (s(`.modal-account`)) s(`.btn-close-modal-account`).click();
    s(`.main-btn-server`).classList.add('hide');
    s(`.main-btn-admin`).classList.add('hide');

    WebhookCyberia.unregister();
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
