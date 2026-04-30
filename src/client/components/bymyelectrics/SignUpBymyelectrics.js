import { SignUp } from '../core/SignUp.js';

class SignUpBymyelectrics {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
  }, { key: 'SignUpBymyelectrics' });
  }
}

export { SignUpBymyelectrics };
