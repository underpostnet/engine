import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreItemledger } from './AppStoreItemledger.js';

class LogInItemledger {
  static async instance() {
  LogIn.onLogin(async (options) => {
    const { token, user } = options;

    AppStoreItemledger.Data.user.main.model.user = user;
  }, { key: 'LogInItemledger' });
  const { user } = await Auth.sessionIn();
  AppStoreItemledger.Data.user.main.model.user = user;
  }
}

export { LogInItemledger };
