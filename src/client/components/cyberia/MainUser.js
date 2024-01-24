import { Keyboard } from '../core/Keyboard.js';
import { BiomeEngine } from './Biome.js';
import { Elements } from './Elements.js';
import { Matrix } from './Matrix.js';
import { Pixi } from './Pixi.js';
import { WorldManagement } from './World.js';
import { getDirection, newInstance } from '../core/CommonJs.js';
import { Event } from './Event.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { LogIn } from '../core/LogIn.js';
import { UserService } from '../../services/user/user.service.js';

const logger = loggerFactory(import.meta);

const MainUser = {
  Render: async function () {
    setTimeout(() => {
      const dataSkin = Elements.Data.user.main.components.skin.find((skin) => skin.enabled);
      // displayId
      // position

      // s(`.main-user-content`).style.width = `${50}px`;
      // s(`.main-user-content`).style.height = `${50}px`;
    });
    return html` <div class="abs center main-user-content"></div> `;
  },
  Init: async function () {
    const type = 'user';
    const id = 'main';

    await WorldManagement.Load({ type, id });
    Matrix.InitCamera({ type, id });

    const idEvent = `${type}.${id}`;

    Keyboard.Event[idEvent] = {
      ArrowLeft: () => {
        const x = Elements.Data[type][id].x - Elements.Data[type][id].vel;
        const y = Elements.Data[type][id].y;
        if (BiomeEngine.isCollision({ type, id, x, y })) return;
        Elements.Data[type][id].x = x;
        Pixi.updatePosition({ type, id });
      },
      ArrowRight: () => {
        const x = Elements.Data[type][id].x + Elements.Data[type][id].vel;
        const y = Elements.Data[type][id].y;
        if (BiomeEngine.isCollision({ type, id, x, y })) return;
        Elements.Data[type][id].x = x;
        Pixi.updatePosition({ type, id });
      },
      ArrowUp: () => {
        const x = Elements.Data[type][id].x;
        const y = Elements.Data[type][id].y - Elements.Data[type][id].vel;
        if (BiomeEngine.isCollision({ type, id, x, y })) return;
        Elements.Data[type][id].y = y;
        Pixi.updatePosition({ type, id });
      },
      ArrowDown: () => {
        const x = Elements.Data[type][id].x;
        const y = Elements.Data[type][id].y + Elements.Data[type][id].vel;
        if (BiomeEngine.isCollision({ type, id, x, y })) return;
        Elements.Data[type][id].y = y;
        Pixi.updatePosition({ type, id });
      },
      q: () => {
        logger.info('On Keyboard', 'q');
      },
      Q: () => {
        logger.info('On Keyboard', 'Q');
      },
    };

    let lastX = newInstance(Elements.Data[type][id].x);
    let lastY = newInstance(Elements.Data[type][id].y);
    let lastDirection;
    Elements.Interval[type][id]['main-skin-sprite-controller'] = setInterval(() => {
      if (lastX !== Elements.Data[type][id].x || lastY !== Elements.Data[type][id].y) {
        const direction = getDirection(lastX, lastY, Elements.Data[type][id].x, Elements.Data[type][id].y);
        lastX = newInstance(Elements.Data[type][id].x);
        lastY = newInstance(Elements.Data[type][id].y);
        const stopX = newInstance(lastX);
        const stopY = newInstance(lastY);
        setTimeout(() => {
          if (stopX === Elements.Data[type][id].x && stopY === Elements.Data[type][id].y) {
            switch (lastDirection) {
              case 'n':
                if (Elements.Data[type][id].components.skin)
                  Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                    component.position = '02';
                    return component;
                  });
                break;
              case 's':
                if (Elements.Data[type][id].components.skin)
                  Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                    component.position = '08';
                    return component;
                  });
                break;
              case 'e':
                if (Elements.Data[type][id].components.skin)
                  Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                    component.position = '06';
                    return component;
                  });
                break;
              case 'se':
                if (Elements.Data[type][id].components.skin)
                  Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                    component.position = '06';
                    return component;
                  });
                break;
              case 'ne':
                if (Elements.Data[type][id].components.skin)
                  Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                    component.position = '06';
                    return component;
                  });
                break;
              case 'w':
                if (Elements.Data[type][id].components.skin)
                  Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                    component.position = '04';
                    return component;
                  });
                break;
              case 'sw':
                if (Elements.Data[type][id].components.skin)
                  Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                    component.position = '04';
                    return component;
                  });
                break;
              case 'nw':
                if (Elements.Data[type][id].components.skin)
                  Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                    component.position = '04';
                    return component;
                  });
                break;
              default:
                if (Elements.Data[type][id].components.skin)
                  Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                    component.position = '08';
                    return component;
                  });
                break;
            }
            SocketIo.socket.emit(
              type,
              JSON.stringify({
                status: 'update-skin-position',
                element: { components: { skin: Elements.Data[type][id].components.skin } },
              }),
            );
          }
        }, 500);

        if (lastDirection !== direction) {
          lastDirection = newInstance(direction);
          logger.info('New direction', direction);
        } else if (Elements.Data[type][id].components.skin.find((skin) => skin.position[0] === '1')) return;

        switch (direction) {
          case 'n':
            if (Elements.Data[type][id].components.skin)
              Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                component.position = '12';
                return component;
              });
            break;
          case 's':
            if (Elements.Data[type][id].components.skin)
              Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                component.position = '18';
                return component;
              });
            break;
          case 'e':
            if (Elements.Data[type][id].components.skin)
              Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                component.position = '16';
                return component;
              });
            break;
          case 'se':
            if (Elements.Data[type][id].components.skin)
              Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                component.position = '16';
                return component;
              });
            break;
          case 'ne':
            if (Elements.Data[type][id].components.skin)
              Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                component.position = '16';
                return component;
              });
            break;
          case 'w':
            if (Elements.Data[type][id].components.skin)
              Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                component.position = '14';
                return component;
              });
            break;
          case 'sw':
            if (Elements.Data[type][id].components.skin)
              Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                component.position = '14';
                return component;
              });
            break;
          case 'nw':
            if (Elements.Data[type][id].components.skin)
              Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                component.position = '14';
                return component;
              });
            break;
          default:
            if (Elements.Data[type][id].components.skin)
              Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((component) => {
                component.position = '18';
                return component;
              });
            break;
        }
        Pixi.triggerUpdateSkinPosition({ type, id });
        SocketIo.socket.emit(
          type,
          JSON.stringify({
            status: 'update-skin-position',
            element: { components: { skin: Elements.Data[type][id].components.skin } },
          }),
        );
      }
    }, Event.Data.globalTimeInterval);

    LogIn.Events[idEvent] = (logInData) => {
      Elements.Data.user.main.model.user = logInData.user;
      Elements.Data.user.main.token = logInData.token;
    };

    const token = localStorage.getItem('jwt');
    if (token) {
      Elements.Data.user.main.token = token;
      const result = await UserService.get('auth', token);
      if (result.status === 'success' && result.data[0]) LogIn.Events[idEvent]({ token, user: result.data[0] });
      else localStorage.removeItem('jwt');
    }
  },
};

export { MainUser };
