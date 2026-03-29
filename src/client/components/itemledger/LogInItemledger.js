import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreItemledger } from './AppStoreItemledger.js';

const LogInItemledger = async function () {
  LogIn.Event['LogInItemledger'] = async (options) => {
    const { token, user } = options;

    AppStoreItemledger.Data.user.main.model.user = user;
  };
  const { user } = await Auth.sessionIn();
  AppStoreItemledger.Data.user.main.model.user = user;
};

export { LogInItemledger };
