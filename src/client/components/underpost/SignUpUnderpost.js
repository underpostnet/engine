import { SignUp } from '../core/SignUp.js';

class SignUpUnderpost {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
  }, { key: 'SignUpUnderpost' });
  }
}

export { SignUpUnderpost };
