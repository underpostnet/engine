import { SignUp } from '../core/SignUp.js';

const SignUpItemledger = function () {
  SignUp.Event['SignUpItemledger'] = async (options) => {
    const { user } = options;
  };
};

export { SignUpItemledger };
