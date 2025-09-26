import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { ElementsCryptokoyn } from './ElementsCryptokoyn.js';

const LogInCryptokoyn = async function () {
  LogIn.Event['LogInCryptokoyn'] = async (options) => {
    const { token, user } = options;
    ElementsCryptokoyn.Data.user.main.model.user = user;
  };
  const { user } = await Auth.sessionIn();
  ElementsCryptokoyn.Data.user.main.model.user = user;
};

export { LogInCryptokoyn };
