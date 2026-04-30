import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreDefault } from './AppStoreDefault.js';

class LogInDefault {
  static async instance() {
  LogIn.onLogin(async (options) => {
    const { token, user } = options;
    AppStoreDefault.Data.user.main.model.user = user;
  }, { key: 'LogInDefault' });
  const { user } = await Auth.sessionIn();
  AppStoreDefault.Data.user.main.model.user = user;
  }
}

export { LogInDefault };
