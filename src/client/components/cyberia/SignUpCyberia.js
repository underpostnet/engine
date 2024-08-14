import { createCyberiaUser } from '../../services/cyberia-user/cyberia-user.service.js';
import { SignUp } from '../core/SignUp.js';

const SignUpCyberia = function () {
  const type = 'user';
  const id = 'main';

  SignUp.Event['SignUpCyberia'] = async (options) => {
    const { user } = options;
    await createCyberiaUser({ user });
  };
};

export { SignUpCyberia };
