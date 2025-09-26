import { CyberiaUserService } from '../../services/cyberia-user/cyberia-user.service.js';
import { Auth } from '../core/Auth.js';
import { newInstance } from '../core/CommonJs.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { LogIn } from '../core/LogIn.js';
import { SocketIo } from '../core/SocketIo.js';
import { s } from '../core/VanillaJs.js';
import { WebhookCyberia } from './WebhookCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';
import { MainUserCyberia } from './MainUserCyberia.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { ServerCyberiaPortal } from '../cyberia-portal/ServerCyberiaPortal.js';
import { setPath } from '../core/Router.js';

const initAnonSession = async () => {
  LoadingAnimation.barLevel.append();
  await MainUserCyberia.Update();
  SocketIo.Emit('user', {
    status: 'propagate',
  });
};

const LogInCyberia = async function () {
  const type = 'user';
  const id = 'main';

  LogIn.Event['LogInCyberia'] = async (options) => {
    const { token, user } = options;

    const oldElement = newInstance(ElementsCyberia.Data[type][id]);
    // ElementsCyberia.Data[type][id] = BaseElement()[type][id];
    const resultUserCyberia = await CyberiaUserService.get({ id: 'auth' });
    if (resultUserCyberia.status !== 'success') {
      NotificationManager.Push({
        html: resultUserCyberia.message,
        status: resultUserCyberia.status,
      });
      return;
    }
    if (resultUserCyberia.data.redirect) {
      const redirect = `${location.protocol}//${location.hostname}${resultUserCyberia.data.redirect}`;
      // return (location.href = redirect);
      setPath(resultUserCyberia.data.redirect);
      return await ServerCyberiaPortal.internalChangeServer();
      // await SocketIo.Init({ channels: ElementsCyberia.Data });
      // return await SocketIoCyberia.Init();
    }
    if (resultUserCyberia.status === 'success') {
      ElementsCyberia.Init({ type, id, element: resultUserCyberia.data });
      WebhookCyberia.register({ user: resultUserCyberia.data });
      if (user.role === 'admin') {
        s(`.main-btn-server`).classList.remove('hide');
        s(`.main-btn-admin`).classList.remove('hide');
      }
    }
    ElementsCyberia.Data[type][id].model.user = user;

    await MainUserCyberia.Update({ oldElement });
  };
  const { user } = await Auth.sessionIn();
  ElementsCyberia.Data.user.main.model.user = user;

  if (Auth.getGuestToken()) await initAnonSession();
  await InteractionPanelCyberia.PanelRender.element({ type: 'user', id: 'main' });
};

export { LogInCyberia };
