import { LogOut } from '../core/LogOut.js';
import { AppStoreUnderpost } from './AppStoreUnderpost.js';
import { PanelForm } from '../core/PanelForm.js';
import { s } from '../core/VanillaJs.js';

class LogOutUnderpost {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreUnderpost.Data.user.main.model.user = result.user;

    PanelForm.Data['underpost-panel'].updatePanel();
    if (s(`.main-btn-cloud`)) s(`.main-btn-cloud`).classList.add('hide');
  }, { key: 'LogOutUnderpost' });
  }
}

export { LogOutUnderpost };
