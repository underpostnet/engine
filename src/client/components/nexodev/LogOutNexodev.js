import { Auth } from '../core/Auth.js';
import { CalendarCore } from '../core/CalendarCore.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { LogOut } from '../core/LogOut.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { PanelForm } from '../core/PanelForm.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';
import { ElementsNexodev } from './ElementsNexodev.js';

const LogOutNexodev = async function () {
  LogOut.Event['LogOutNexodev'] = async () => {
    localStorage.removeItem('jwt');
    s(`.main-btn-log-out`).style.display = 'none';
    s(`.main-btn-account`).style.display = 'none';
    s(`.main-btn-log-in`).style.display = null;
    s(`.main-btn-sign-up`).style.display = null;
    if (s(`.modal-log-out`)) s(`.btn-close-modal-log-out`).click();
    if (s(`.modal-account`)) s(`.btn-close-modal-account`).click();

    ElementsNexodev.Data.user.main.model.user = { _id: '' };
    Auth.deleteToken();

    NotificationManager.Push({
      html: Translate.Render(`success-logout`),
      status: 'success',
    });
    if (PanelForm.Data['nexodev-blog']) PanelForm.Data['nexodev-blog'].updatePanel();
    if (CalendarCore.Data['modal-calendar']) CalendarCore.Data['modal-calendar'].updatePanel();
    if (FileExplorer.Api['modal-cloud']) FileExplorer.Api['modal-cloud'].updateData({ display: true });
  };
};

export { LogOutNexodev };
