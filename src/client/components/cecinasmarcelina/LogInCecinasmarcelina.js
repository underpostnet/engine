import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { AppStoreCecinasmarcelina } from './AppStoreCecinasmarcelina.js';

const LogInCecinasmarcelina = async function () {
  LogIn.Event['LogInCecinasmarcelina'] = async (options) => {
    const { token, user } = options;
    AppStoreCecinasmarcelina.Data.user.main.model.user = user;
  };
  const { user } = await Auth.sessionIn();
  AppStoreCecinasmarcelina.Data.user.main.model.user = user;
};

export { LogInCecinasmarcelina };
