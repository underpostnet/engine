import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreBymyelectrics } from './AppStoreBymyelectrics.js';

const LogInBymyelectrics = async function () {
  LogIn.Event['LogInBymyelectrics'] = async (options) => {
    const { token, user } = options;
    AppStoreBymyelectrics.Data.user.main.model.user = user;
  };
  const { user } = await Auth.sessionIn();
  AppStoreBymyelectrics.Data.user.main.model.user = user;
};

export { LogInBymyelectrics };
