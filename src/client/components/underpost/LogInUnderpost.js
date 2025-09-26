import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { ElementsUnderpost } from './ElementsUnderpost.js';
import { PanelForm } from '../core/PanelForm.js';

const LogInUnderpost = async function () {
  LogIn.Event['LogInUnderpost'] = async (options) => {
    const { token, user } = options;

    ElementsUnderpost.Data.user.main.model.user = user;

    await PanelForm.Data['underpost-panel'].updatePanel();
  };
  const { user } = await Auth.sessionIn();
  ElementsUnderpost.Data.user.main.model.user = user;
};

export { LogInUnderpost };
