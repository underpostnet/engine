import { Auth } from '../core/Auth.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { ElementsHealthcare } from './ElementsHealthcare.js';

const LogInHealthcare = async function () {
  LogIn.Event['LogInHealthcare'] = async (options) => {
    const { token, user } = options;

    ElementsHealthcare.Data.user.main.model.user = user;
    const { role } = user;

    if (Auth.getToken() && commonModeratorGuard(role)) {
      s(`.main-btn-healthcare-appointment-management`).classList.remove('hide');
    } else s(`.main-btn-healthcare-appointment-management`).classList.add('hide');
  };
  const { user } = await Auth.sessionIn();
  ElementsHealthcare.Data.user.main.model.user = user;
};

export { LogInHealthcare };
