import { UserService } from '../../services/user/user.service.js';
import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { ElementsDefault } from './ElementsDefault.js';

const LogInDefault = async function () {
  LogIn.Event['LogInDefault'] = async (options) => {
    const { token, user } = options;

    if (token) {
      localStorage.setItem('jwt', token);
      Auth.setToken(token);
    }
    ElementsDefault.Data.user.main.model.user = user;

    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;

    if (s(`.modal-log-in`)) s(`.btn-close-modal-log-in`).click();
    if (s(`.modal-sign-up`)) s(`.btn-close-modal-sign-up`).click();
  };
  const token = localStorage.getItem('jwt');
  if (token) {
    Auth.setToken(token);
    const result = await UserService.get({ id: 'auth' });
    if (result.status === 'success' && result.data) {
      const user = result.data;
      await LogIn.Trigger({
        token,
        user,
      });
    } else localStorage.removeItem('jwt');
  } else {
    // Anon
  }
};

export { LogInDefault };
