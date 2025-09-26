import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { ElementsDefault } from './ElementsDefault.js';

const LogInDefault = async function () {
  LogIn.Event['LogInDefault'] = async (options) => {
    const { token, user } = options;
    ElementsDefault.Data.user.main.model.user = user;
  };
  const { user } = await Auth.sessionIn();
  ElementsDefault.Data.user.main.model.user = user;
};

export { LogInDefault };
