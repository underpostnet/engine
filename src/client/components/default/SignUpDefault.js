import { SignUp } from '../core/SignUp.js';

class SignUpDefault {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
  }, { key: 'SignUpDefault' });
  }
}

export { SignUpDefault };
