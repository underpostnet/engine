import { UserService } from '../../services/user/user.service.js';
import { newInstance, objectEquals } from '../core/CommonJs.js';
import { LogIn } from '../core/LogIn.js';
import { SocketIo } from '../core/SocketIo.js';
import { s } from '../core/VanillaJs.js';
import { BaseElement } from './CommonCyberia.js';
import { Elements } from './Elements.js';
import { MainUser } from './MainUser.js';
import { WorldManagement } from './World.js';

const LogInCyberia = async function () {
  const type = 'user';
  const id = 'main';

  LogIn.Event['LogInCyberia'] = async (options) => {
    const oldElement = newInstance(Elements.Data[type][id]);

    const { token, user } = options;

    localStorage.setItem('jwt', token);

    Elements.Data[type][id] = BaseElement()[type][id];
    Elements.Data[type][id].model.user = user;
    Elements.Data[type][id].token = token;

    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;

    if (s(`.modal-log-in`)) s(`.btn-close-modal-log-in`).click();
    if (s(`.modal-sign-up`)) s(`.btn-close-modal-sign-up`).click();

    await MainUser.Init();

    await WorldManagement.Load();

    if (!objectEquals(oldElement.model.world, Elements.Data[type][id].model.world))
      WorldManagement.EmitNewWorldFace({ type, id });

    if (oldElement.x !== Elements.Data[type][id].x || oldElement.y !== Elements.Data[type][id].y)
      SocketIo.socket.emit(
        type,
        JSON.stringify({
          status: 'update-position',
          element: { x: Elements.Data[type][id].x, y: Elements.Data[type][id].y },
        }),
      );
    SocketIo.socket.emit(
      type,
      JSON.stringify({
        status: 'update-skin-position',
        element: { components: { skin: Elements.Data[type][id].components.skin } },
      }),
    );
  };
  const token = localStorage.getItem('jwt');
  if (token) {
    const result = await UserService.get('auth', token);
    if (result.status === 'success' && result.data[0]) {
      const [user] = result.data;
      await LogIn.Trigger({
        token,
        user,
      });
    } else localStorage.removeItem('jwt');
  }
};

export { LogInCyberia };
