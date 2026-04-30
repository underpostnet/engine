import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreCecinasmarcelina } from './AppStoreCecinasmarcelina.js';

class LogInCecinasmarcelina {
  static async instance() {
  LogIn.onLogin(async (options) => {
    const { token, user } = options;
    AppStoreCecinasmarcelina.Data.user.main.model.user = user;
  }, { key: 'LogInCecinasmarcelina' });
  const { user } = await Auth.sessionIn();
  AppStoreCecinasmarcelina.Data.user.main.model.user = user;
  }
}

export { LogInCecinasmarcelina };
