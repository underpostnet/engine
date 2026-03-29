import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreDefault } from './AppStoreDefault.js';

const LogInDefault = async function () {
  LogIn.Event['LogInDefault'] = async (options) => {
    const { token, user } = options;
    AppStoreDefault.Data.user.main.model.user = user;
  };
  const { user } = await Auth.sessionIn();
  AppStoreDefault.Data.user.main.model.user = user;
};

export { LogInDefault };
