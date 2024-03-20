import { SignUp } from '../core/SignUp.js';

const SignUpUnderpost = function () {
  SignUp.Event['SignUpUnderpost'] = async (options) => {
    const { user } = options;
  };
};

export { SignUpUnderpost };
