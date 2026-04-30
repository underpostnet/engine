import { CalendarCore } from '../core/CalendarCore.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { LogOut } from '../core/LogOut.js';
import { PanelForm } from '../core/PanelForm.js';
import { AppStoreNexodev } from './AppStoreNexodev.js';

class LogOutNexodev {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreNexodev.Data.user.main.model.user = result.user;
    if (PanelForm.Data['nexodev-blog']) PanelForm.Data['nexodev-blog'].updatePanel();
    if (CalendarCore.Data['modal-calendar']) CalendarCore.Data['modal-calendar'].updatePanel();
    if (FileExplorer.Api['modal-cloud']) FileExplorer.Api['modal-cloud'].updateData({ display: true });
  }, { key: 'LogOutNexodev' });
  }
}

export { LogOutNexodev };
