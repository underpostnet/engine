import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { ElementsCyberiaAdmin } from './ElementsCyberiaAdmin.js';

const LogInCyberiaAdmin = async function () {
  LogIn.Event['LogInCyberiaAdmin'] = async (options) => {
    const { token, user } = options;

    ElementsCyberiaAdmin.Data.user.main.model.user = user;

    if (['admin', 'moderator'].includes(user.role)) {
      s(`.main-btn-colors`).classList.remove('hide');
      s(`.main-btn-chat`).classList.remove('hide');
      s(`.main-btn-tile`).classList.remove('hide');
      s(`.main-btn-cyberia-tile-management`).classList.remove('hide');
    }

    if (user.role === 'admin') {
      s(`.main-btn-biome`).classList.remove('hide');
      s(`.main-btn-3d`).classList.remove('hide');
      s(`.main-btn-world`).classList.remove('hide');
      s(`.main-btn-item`).classList.remove('hide');
      s(`.main-btn-blockchain`).classList.remove('hide');
      s(`.main-btn-cloud`).classList.remove('hide');
      s(`.main-btn-server`).classList.remove('hide');
      s(`.main-btn-cyberia-instance-engine`).classList.remove('hide');
    }
  };
  const { user } = await Auth.sessionIn();
  ElementsCyberiaAdmin.Data.user.main.model.user = user;
};

export { LogInCyberiaAdmin };
