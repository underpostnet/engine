import { SignUp } from '../core/SignUp.js';

class SignUpObjectlayer {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
  }, { key: 'SignUpObjectlayer' });
  }
}

export { SignUpObjectlayer };
