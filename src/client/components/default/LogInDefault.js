import { UserService } from '../../services/user/user.service.js';
import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { ElementsDefault } from './ElementsDefault.js';

const LogInDefault = async function () {
  LogIn.Event['LogInDefault'] = async (options) => {
    const { token, user } = options;
    ElementsDefault.Data.user.main.model.user = user;
    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;

    if (s(`.modal-log-in`)) s(`.btn-close-modal-log-in`).click();
    if (s(`.modal-sign-up`)) s(`.btn-close-modal-sign-up`).click();
  };
  const { user } = await Auth.sessionIn();
  ElementsDefault.Data.user.main.model.user = user;
};

export { LogInDefault };
