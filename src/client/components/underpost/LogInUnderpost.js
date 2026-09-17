import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreUnderpost } from './AppStoreUnderpost.js';
import { PanelForm } from '../core/PanelForm.js';
import { RouterReady } from '../core/Router.js';
import { s } from '../core/VanillaJs.js';
import { commonAdminGuard, commonUserGuard } from '../core/CommonJs.js';

class LogInUnderpost {
  static async instance() {
  LogIn.onLogin(async (options) => {
    const { token, user } = options;

    AppStoreUnderpost.Data.user.main.model.user = user;

    await RouterReady;
    await PanelForm.Data['underpost-panel'].updatePanel();
    if (s(`.main-btn-cloud`) && commonUserGuard(user.role)) s(`.main-btn-cloud`).classList.remove('hide');
    // User management is an admin's menu entry only; any other session keeps it hidden.
    if (s(`.main-btn-user-management`))
      s(`.main-btn-user-management`).classList[commonAdminGuard(user.role) ? 'remove' : 'add']('hide');
  }, { key: 'LogInUnderpost' });
  const { user } = await Auth.sessionIn();
  AppStoreUnderpost.Data.user.main.model.user = user;
  }
}

export { LogInUnderpost };
