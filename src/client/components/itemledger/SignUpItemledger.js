import { SignUp } from '../core/SignUp.js';

class SignUpItemledger {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
  }, { key: 'SignUpItemledger' });
  }
}

export { SignUpItemledger };
