import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreUnderpost } from './AppStoreUnderpost.js';
import { PanelForm } from '../core/PanelForm.js';
import { RouterReady } from '../core/Router.js';
import { s } from '../core/VanillaJs.js';
import { commonUserGuard } from '../core/CommonJs.js';

const LogInUnderpost = async function () {
  LogIn.Event['LogInUnderpost'] = async (options) => {
    const { token, user } = options;

    AppStoreUnderpost.Data.user.main.model.user = user;

    await RouterReady;
    await PanelForm.Data['underpost-panel'].updatePanel();
    if (s(`.main-btn-cloud`) && commonUserGuard(user.role)) s(`.main-btn-cloud`).classList.remove('hide');
  };
  const { user } = await Auth.sessionIn();
  AppStoreUnderpost.Data.user.main.model.user = user;
};

export { LogInUnderpost };
