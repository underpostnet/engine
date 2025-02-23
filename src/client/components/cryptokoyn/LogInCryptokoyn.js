import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { ElementsCryptokoyn } from './ElementsCryptokoyn.js';

const LogInCryptokoyn = async function () {
  LogIn.Event['LogInCryptokoyn'] = async (options) => {
    const { token, user } = options;

    ElementsCryptokoyn.Data.user.main.model.user = user;

    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;
  };
  const { user } = await Auth.sessionIn();
  ElementsCryptokoyn.Data.user.main.model.user = user;
};

export { LogInCryptokoyn };
