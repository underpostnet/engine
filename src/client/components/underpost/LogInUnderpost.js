import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { ElementsUnderpost } from './ElementsUnderpost.js';
import { PanelForm } from '../core/PanelForm.js';
import { RouterReady } from '../core/Router.js';
import { s } from '../core/VanillaJs.js';

const LogInUnderpost = async function () {
  LogIn.Event['LogInUnderpost'] = async (options) => {
    const { token, user } = options;

    ElementsUnderpost.Data.user.main.model.user = user;

    await RouterReady;
    await PanelForm.Data['underpost-panel'].updatePanel();
    if (s(`.main-btn-cloud`)) s(`.main-btn-cloud`).classList.remove('hide');
  };
  const { user } = await Auth.sessionIn();
  ElementsUnderpost.Data.user.main.model.user = user;
};

export { LogInUnderpost };
