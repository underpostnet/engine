import { newInstance } from '../core/CommonJs.js';
import { LogOut } from '../core/LogOut.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';
import { BaseElement } from './CommonCyberia.js';
import { Elements } from './Elements.js';
import { MainUser } from './MainUser.js';

const LogOutCyberia = function () {
  LogOut.Event['LogOutCyberia'] = async () => {
    const type = 'user';
    const id = 'main';

    localStorage.removeItem('jwt');
    s(`.main-btn-log-out`).style.display = 'none';
    s(`.main-btn-log-in`).style.display = null;
    s(`.main-btn-sign-up`).style.display = null;
    if (s(`.modal-log-out`)) s(`.btn-close-modal-log-out`).click();

    const oldElement = newInstance(Elements.Data[type][id]);
    Elements.Data[type][id] = BaseElement()[type][id];
    await MainUser.Update({ oldElement });

    NotificationManager.Push({
      html: Translate.Render(`success-logout`),
      status: 'success',
    });
  };
};

export { LogOutCyberia };
