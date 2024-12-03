import { SignUp } from '../core/SignUp.js';

const SignUpHealthcare = function () {
  SignUp.Event['SignUpHealthcare'] = async (options) => {
    const { user } = options;
  };
};

export { SignUpHealthcare };
