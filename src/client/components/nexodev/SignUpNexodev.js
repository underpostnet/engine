import { SignUp } from '../core/SignUp.js';

class SignUpNexodev {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
  }, { key: 'SignUpNexodev' });
  }
}

export { SignUpNexodev };
