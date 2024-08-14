import { createCyberiaUser } from '../../services/cyberia-user/cyberia-user.service.js';
import { SignUp } from '../core/SignUp.js';

const SignUpCyberiaAdmin = function () {
  SignUp.Event['SignUpCyberiaAdmin'] = async (options) => {
    const { user } = options;
    await createCyberiaUser({ user });
  };
};

export { SignUpCyberiaAdmin };
