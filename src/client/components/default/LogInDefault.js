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
  };
  const { user } = await Auth.sessionIn();
  ElementsDefault.Data.user.main.model.user = user;
};

export { LogInDefault };
