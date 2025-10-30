import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { ElementsCyberiaPortal } from './ElementsCyberiaPortal.js';

const LogInCyberiaPortal = async function () {
  LogIn.Event['LogInCyberiaPortal'] = async (options) => {
    const { token, user } = options;

    ElementsCyberiaPortal.Data.user.main.model.user = user;

    // if (user.role === 'admin' || user.role === 'moderator') s(`.main-btn-admin`).classList.remove('hide');
  };
  const { user } = await Auth.sessionIn();
  ElementsCyberiaPortal.Data.user.main.model.user = user;
};

export { LogInCyberiaPortal };
