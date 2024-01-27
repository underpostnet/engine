import { newInstance, objectEquals } from '../core/CommonJs.js';
import { LogOut } from '../core/LogOut.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { SocketIo } from '../core/SocketIo.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';
import { BaseElement } from './CommonCyberia.js';
import { Elements } from './Elements.js';
import { MainUser } from './MainUser.js';
import { WorldManagement } from './World.js';

const LogOutCyberia = function () {
  LogOut.Event['LogOutCyberia'] = async () => {
    const type = 'user';
    const id = 'main';

    localStorage.removeItem('jwt');
    const oldElement = newInstance(Elements.Data[type][id]);

    Elements.Data[type][id] = BaseElement()[type][id];
    s(`.main-btn-log-out`).style.display = 'none';
    s(`.main-btn-log-in`).style.display = null;
    s(`.main-btn-sign-up`).style.display = null;
    if (s(`.modal-log-out`)) s(`.btn-close-modal-log-out`).click();

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
    NotificationManager.Push({
      html: Translate.Render(`success-logout`),
      status: 'success',
    });
  };
};

export { LogOutCyberia };
