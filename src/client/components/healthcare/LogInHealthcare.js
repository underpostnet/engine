import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { ElementsHealthcare } from './ElementsHealthcare.js';

const LogInHealthcare = async function () {
  LogIn.Event['LogInHealthcare'] = async (options) => {
    const { token, user } = options;

    ElementsHealthcare.Data.user.main.model.user = user;

    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;
  };
  const { user } = await Auth.sessionIn();
  ElementsHealthcare.Data.user.main.model.user = user;
};

export { LogInHealthcare };
