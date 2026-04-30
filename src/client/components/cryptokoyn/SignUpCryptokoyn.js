import { SignUp } from '../core/SignUp.js';

class SignUpCryptokoyn {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
  }, { key: 'SignUpCryptokoyn' });
  }
}

export { SignUpCryptokoyn };
