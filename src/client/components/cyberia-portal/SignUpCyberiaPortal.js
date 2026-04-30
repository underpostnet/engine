// import { createCyberiaUser } from '../../services/cyberia-user/cyberia-user.service.js';
import { SignUp } from '../core/SignUp.js';

class SignUpCyberiaPortal {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
    // await createCyberiaUser({ user });
  }, { key: 'SignUpCyberiaPortal' });
  }
}

export { SignUpCyberiaPortal };
