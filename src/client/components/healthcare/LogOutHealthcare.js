import { LogOut } from '../core/LogOut.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';
import { ElementsHealthcare } from './ElementsHealthcare.js';

const LogOutHealthcare = async function () {
  LogOut.Event['LogOutHealthcare'] = async (result = { user: { _id: '' } }) => {
    ElementsHealthcare.Data.user.main.model.user = result.user;

    s(`.main-btn-log-out`).style.display = 'none';
    s(`.main-btn-account`).style.display = 'none';
    s(`.main-btn-log-in`).style.display = null;
    s(`.main-btn-sign-up`).style.display = null;
    if (s(`.real-state-panel-form-body`) && !s(`.real-state-panel-form-body`).classList.contains('hide'))
      s(`.btn-real-state-panel-close`).click();
    if (s(`.modal-log-out`)) s(`.btn-close-modal-log-out`).click();
    if (s(`.modal-account`)) s(`.btn-close-modal-account`).click();

    s(`.main-btn-healthcare-appointment-management`).classList.add('hide');

    NotificationManager.Push({
      html: Translate.Render(`success-logout`),
      status: 'success',
    });
  };
};

export { LogOutHealthcare };
