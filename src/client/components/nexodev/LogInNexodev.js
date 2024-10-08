import { UserService } from '../../services/user/user.service.js';
import { Auth } from '../core/Auth.js';
import { CalendarCore } from '../core/CalendarCore.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { LogIn } from '../core/LogIn.js';
import { PanelForm } from '../core/PanelForm.js';
import { s } from '../core/VanillaJs.js';
import { ElementsNexodev } from './ElementsNexodev.js';

const LogInNexodev = async function () {
  LogIn.Event['LogInNexodev'] = async (options) => {
    const { token, user } = options;

    if (token) {
      localStorage.setItem('jwt', token);
      Auth.setToken(token);
    }
    ElementsNexodev.Data.user.main.model.user = user;

    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;

    if (s(`.modal-log-in`)) s(`.btn-close-modal-log-in`).click();
    if (s(`.modal-sign-up`)) s(`.btn-close-modal-sign-up`).click();
    if (PanelForm.Data['nexodev-blog']) PanelForm.Data['nexodev-blog'].updatePanel();
    if (CalendarCore.Data['modal-calendar']) CalendarCore.Data['modal-calendar'].updatePanel();
    if (FileExplorer.Api['modal-cloud']) FileExplorer.Api['modal-cloud'].updateData({ display: true });
  };
  const token = localStorage.getItem('jwt');
  if (token) {
    Auth.setToken(token);
    const result = await UserService.get({ id: 'auth' });
    if (result.status === 'success' && result.data) {
      const user = result.data;
      await LogIn.Trigger({
        token,
        user,
      });
    } else localStorage.removeItem('jwt');
  } else {
    // Anon
  }
};

export { LogInNexodev };
