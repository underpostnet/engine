import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { ElementsBymyelectrics } from './ElementsBymyelectrics.js';

const LogInBymyelectrics = async function () {
  LogIn.Event['LogInBymyelectrics'] = async (options) => {
    const { token, user } = options;
    ElementsBymyelectrics.Data.user.main.model.user = user;
  };
  const { user } = await Auth.sessionIn();
  ElementsBymyelectrics.Data.user.main.model.user = user;
};

export { LogInBymyelectrics };
