import { SignUp } from '../core/SignUp.js';

class SignUpCecinasmarcelina {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
  }, { key: 'SignUpCecinasmarcelina' });
  }
}

export { SignUpCecinasmarcelina };
