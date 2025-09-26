import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { ElementsItemledger } from './ElementsItemledger.js';

const LogInItemledger = async function () {
  LogIn.Event['LogInItemledger'] = async (options) => {
    const { token, user } = options;

    ElementsItemledger.Data.user.main.model.user = user;
  };
  const { user } = await Auth.sessionIn();
  ElementsItemledger.Data.user.main.model.user = user;
};

export { LogInItemledger };
