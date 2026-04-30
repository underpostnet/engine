import { SignUp } from '../core/SignUp.js';

class SignUpHealthcare {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
  }, { key: 'SignUpHealthcare' });
  }
}

export { SignUpHealthcare };
