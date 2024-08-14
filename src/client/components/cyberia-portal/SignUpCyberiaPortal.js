import { createCyberiaUser } from '../../services/cyberia-user/cyberia-user.service.js';
import { SignUp } from '../core/SignUp.js';

const SignUpCyberiaPortal = function () {
  SignUp.Event['SignUpCyberiaPortal'] = async (options) => {
    const { user } = options;
    await createCyberiaUser({ user });
  };
};

export { SignUpCyberiaPortal };
