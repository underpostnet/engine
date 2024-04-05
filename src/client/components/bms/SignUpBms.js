import { SignUp } from '../core/SignUp.js';

const SignUpBms = function () {
  SignUp.Event['SignUpBms'] = async (options) => {
    const { user } = options;
  };
};

export { SignUpBms };
