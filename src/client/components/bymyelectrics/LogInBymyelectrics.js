import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreBymyelectrics } from './AppStoreBymyelectrics.js';

class LogInBymyelectrics {
  static async instance() {
  LogIn.onLogin(async (options) => {
    const { token, user } = options;
    AppStoreBymyelectrics.Data.user.main.model.user = user;
  }, { key: 'LogInBymyelectrics' });
  const { user } = await Auth.sessionIn();
  AppStoreBymyelectrics.Data.user.main.model.user = user;
  }
}

export { LogInBymyelectrics };
