import { SignUp } from '../core/SignUp.js';

const SignUpCyberiaAdmin = function () {
  SignUp.Event['SignUpCyberiaAdmin'] = async (options) => {
    const { user } = options;
  };
};

export { SignUpCyberiaAdmin };
