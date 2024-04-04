import { CyberiaUserService } from '../../services/cyberia-user/cyberia-user.service.js';
import { UserService } from '../../services/user/user.service.js';
import { Auth } from '../core/Auth.js';
import { newInstance } from '../core/CommonJs.js';
import { LogIn } from '../core/LogIn.js';
import { SocketIo } from '../core/SocketIo.js';
import { s } from '../core/VanillaJs.js';
import { Webhook } from '../core/Webhook.js';
import { BaseElement } from './CommonCyberia.js';
import { CyberiaWebhook } from './CyberiaWebhook.js';
import { Elements } from './Elements.js';
import { InteractionPanel } from './InteractionPanel.js';
import { MainUser } from './MainUser.js';

const LogInCyberia = async function () {
  const type = 'user';
  const id = 'main';

  LogIn.Event['LogInCyberia'] = async (options) => {
    const { token, user } = options;

    localStorage.setItem('jwt', token);
    Auth.setToken(token);

    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;

    if (s(`.modal-log-in`)) s(`.btn-close-modal-log-in`).click();
    if (s(`.modal-sign-up`)) s(`.btn-close-modal-sign-up`).click();
    const oldElement = newInstance(Elements.Data[type][id]);
    // Elements.Data[type][id] = BaseElement()[type][id];
    Webhook.register({ user });
    const resultUserCyberia = await CyberiaUserService.get({ id: 'auth' });
    if (resultUserCyberia.status === 'success') {
      Elements.Init({ type, id, element: resultUserCyberia.data });
      CyberiaWebhook.register({ user: resultUserCyberia.data });
    }
    Elements.Data[type][id].model.user = user;

    await MainUser.Update({ oldElement });
  };
  const token = localStorage.getItem('jwt');
  if (token) {
    Auth.setToken(token);
    const result = await UserService.get({ id: 'auth' });
    if (result.status === 'success' && result.data[0]) {
      const [user] = result.data;
      await LogIn.Trigger({
        token,
        user,
      });
    } else localStorage.removeItem('jwt');
  } else {
    // Anon
    await MainUser.Update();
    SocketIo.Emit('user', {
      status: 'propagate',
    });
  }
  InteractionPanel.PanelRender.element({ type: 'user', id: 'main' });
};

export { LogInCyberia };
