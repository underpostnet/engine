import { SignUp } from '../core/SignUp.js';

class SignUpDogmadual {
  static instance() {
  SignUp.onSignup(async (options) => {
    const { user } = options;
  }, { key: 'SignUpDogmadual' });
  }
}

export { SignUpDogmadual };
