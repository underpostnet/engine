import { CyberiaUserService } from '../../services/cyberia-user/cyberia-user.service.js';
import { newInstance } from '../core/CommonJs.js';
import { SignUp } from '../core/SignUp.js';
import { Elements } from './Elements.js';

const SignUpCyberia = function () {
  const type = 'user';
  const id = 'main';

  SignUp.Event['SignUpCyberia'] = async (options) => {
    const { user } = options;
    const body = newInstance(Elements.Data.user.main);
    body.model.user._id = user._id;
    await CyberiaUserService.post({ body });
  };
};

export { SignUpCyberia };
