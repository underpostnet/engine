import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { ElementsDogmadual } from './ElementsDogmadual.js';

const LogInDogmadual = async function () {
  LogIn.Event['LogInDogmadual'] = async (options) => {
    const { token, user } = options;

    ElementsDogmadual.Data.user.main.model.user = user;
  };
  const { user } = await Auth.sessionIn();
  ElementsDogmadual.Data.user.main.model.user = user;
};

export { LogInDogmadual };
