import { UserService } from '../../services/user/user.service.js';
import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { Webhook } from '../core/Webhook.js';
import { ElementsCyberiaAdmin } from './ElementsCyberiaAdmin.js';

const LogInCyberiaAdmin = async function () {
  LogIn.Event['LogInCyberiaAdmin'] = async (options) => {
    const { token, user } = options;

    if (token) {
      localStorage.setItem('jwt', token);
      Auth.setToken(token);
    }
    ElementsCyberiaAdmin.Data.user.main.model.user = user;

    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;
    if (s(`.modal-log-in`)) s(`.btn-close-modal-log-in`).click();
    if (s(`.modal-sign-up`)) s(`.btn-close-modal-sign-up`).click();
    if (user.role === 'admin') {
      s(`.main-btn-colors`).classList.remove('hide');
      s(`.main-btn-chat`).classList.remove('hide');
      s(`.main-btn-biome`).classList.remove('hide');
      s(`.main-btn-tile`).classList.remove('hide');
      s(`.main-btn-3d`).classList.remove('hide');
      s(`.main-btn-world`).classList.remove('hide');
      s(`.main-btn-item`).classList.remove('hide');
      s(`.main-btn-blockchain`).classList.remove('hide');
      s(`.main-btn-cloud`).classList.remove('hide');
      s(`.main-btn-server`).classList.remove('hide');
    }
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

export { LogInCyberiaAdmin };
