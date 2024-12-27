import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { ElementsDogmadual } from './ElementsDogmadual.js';

const LogInDogmadual = async function () {
  LogIn.Event['LogInDogmadual'] = async (options) => {
    const { token, user } = options;

    ElementsDogmadual.Data.user.main.model.user = user;

    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;

    if (s(`.modal-log-in`)) s(`.btn-close-modal-log-in`).click();
    if (s(`.modal-sign-up`)) s(`.btn-close-modal-sign-up`).click();
  };
  const { user } = await Auth.sessionIn();
  ElementsDogmadual.Data.user.main.model.user = user;
};

export { LogInDogmadual };
