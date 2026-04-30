import { Auth } from '../core/Auth.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { AppStoreHealthcare } from './AppStoreHealthcare.js';

class LogInHealthcare {
  static async instance() {
  LogIn.onLogin(async (options) => {
    const { token, user } = options;

    AppStoreHealthcare.Data.user.main.model.user = user;
    const { role } = user;

    if (Auth.getToken() && commonModeratorGuard(role)) {
      s(`.main-btn-healthcare-appointment-management`).classList.remove('hide');
    } else s(`.main-btn-healthcare-appointment-management`).classList.add('hide');
  }, { key: 'LogInHealthcare' });
  const { user } = await Auth.sessionIn();
  AppStoreHealthcare.Data.user.main.model.user = user;
  }
}

export { LogInHealthcare };
