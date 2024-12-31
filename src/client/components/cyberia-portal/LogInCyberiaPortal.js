import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { ElementsCyberiaPortal } from './ElementsCyberiaPortal.js';

const LogInCyberiaPortal = async function () {
  LogIn.Event['LogInCyberiaPortal'] = async (options) => {
    const { token, user } = options;

    ElementsCyberiaPortal.Data.user.main.model.user = user;

    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;

    if (user.role === 'admin' || user.role === 'moderator') s(`.main-btn-admin`).classList.remove('hide');
  };
  const { user } = await Auth.sessionIn();
  ElementsCyberiaPortal.Data.user.main.model.user = user;
};

export { LogInCyberiaPortal };
