import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreObjectlayer } from './AppStoreObjectlayer.js';

class LogInObjectlayer {
  static async instance() {
  LogIn.onLogin(async (options) => {
    const { token, user } = options;

    AppStoreObjectlayer.Data.user.main.model.user = user;
  }, { key: 'LogInObjectlayer' });
  const { user } = await Auth.sessionIn();
  AppStoreObjectlayer.Data.user.main.model.user = user;
  }
}

export { LogInObjectlayer };
