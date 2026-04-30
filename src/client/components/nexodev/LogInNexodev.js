import { Auth } from '../core/Auth.js';
import { CalendarCore } from '../core/CalendarCore.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { LogIn } from '../core/LogIn.js';
import { PanelForm } from '../core/PanelForm.js';
import { AppStoreNexodev } from './AppStoreNexodev.js';

class LogInNexodev {
  static async instance() {
  LogIn.onLogin(async (options) => {
    const { token, user } = options;

    AppStoreNexodev.Data.user.main.model.user = user;

    if (PanelForm.Data['nexodev-blog']) PanelForm.Data['nexodev-blog'].updatePanel();
    if (CalendarCore.Data['modal-calendar']) CalendarCore.Data['modal-calendar'].updatePanel();
    if (FileExplorer.Api['modal-cloud']) FileExplorer.Api['modal-cloud'].updateData({ display: true });
  }, { key: 'LogInNexodev' });
  const { user } = await Auth.sessionIn();
  AppStoreNexodev.Data.user.main.model.user = user;
  }
}

export { LogInNexodev };
