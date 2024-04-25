import { SignUp } from '../core/SignUp.js';

const SignUpDefault = function () {
  SignUp.Event['SignUpDefault'] = async (options) => {
    const { user } = options;
  };
};

export { SignUpDefault };
