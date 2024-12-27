import { LogOut } from '../core/LogOut.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';
import { ElementsCyberiaAdmin } from './ElementsCyberiaAdmin.js';

const LogOutCyberiaAdmin = async function () {
  LogOut.Event['LogOutCyberiaAdmin'] = async (result = { user: { _id: '' } }) => {
    ElementsCyberiaAdmin.Data.user.main.model.user = result.user;
    s(`.main-btn-log-out`).style.display = 'none';
    s(`.main-btn-account`).style.display = 'none';
    s(`.main-btn-log-in`).style.display = null;
    s(`.main-btn-sign-up`).style.display = null;
    if (s(`.modal-log-out`)) s(`.btn-close-modal-log-out`).click();
    if (s(`.modal-account`)) s(`.btn-close-modal-account`).click();
    s(`.main-btn-colors`).classList.add('hide');
    s(`.main-btn-chat`).classList.add('hide');
    s(`.main-btn-biome`).classList.add('hide');
    s(`.main-btn-tile`).classList.add('hide');
    s(`.main-btn-3d`).classList.add('hide');
    s(`.main-btn-world`).classList.add('hide');
    s(`.main-btn-item`).classList.add('hide');
    s(`.main-btn-cyberia-tile-management`).classList.add('hide');
    s(`.main-btn-blockchain`).classList.add('hide');
    s(`.main-btn-cloud`).classList.add('hide');
    s(`.main-btn-server`).classList.add('hide');
    s(`.main-btn-cyberia-instance-engine`).classList.add('hide');

    NotificationManager.Push({
      html: Translate.Render(`success-logout`),
      status: 'success',
    });
  };
};

export { LogOutCyberiaAdmin };
