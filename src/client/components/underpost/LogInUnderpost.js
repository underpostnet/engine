import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { ElementsUnderpost } from './ElementsUnderpost.js';
import { PanelForm } from '../core/PanelForm.js';

const LogInUnderpost = async function () {
  LogIn.Event['LogInUnderpost'] = async (options) => {
    const { token, user } = options;

    ElementsUnderpost.Data.user.main.model.user = user;

    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;
    PanelForm.Data['underpost-panel'].sessionIn = true;
    await PanelForm.Data['underpost-panel'].updatePanel();
    delete PanelForm.Data['underpost-panel'].sessionIn;
  };
  const { user } = await Auth.sessionIn();
  ElementsUnderpost.Data.user.main.model.user = user;
};

export { LogInUnderpost };
