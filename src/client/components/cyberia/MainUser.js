import { Keyboard } from '../core/Keyboard.js';
import { BiomeEngine } from './Biome.js';
import { Elements } from './Elements.js';
import { Matrix } from './Matrix.js';
import { Pixi } from './Pixi.js';
import { WorldManagement } from './World.js';
import { getDirection, newInstance, objectEquals } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { Account } from '../core/Account.js';
import { append } from '../core/VanillaJs.js';
import { JoyStick } from '../core/JoyStick.js';
import { CyberiaParams, updateMovementDirection } from './CommonCyberia.js';

const logger = loggerFactory(import.meta);

const MainUser = {
  Render: async function () {
    append('body', html` <div class="abs center main-user-content"></div> `);
  },
  Update: async function (options = { oldElement: {} }) {
    const type = 'user';
    const id = 'main';
    const { oldElement } = options;

    await WorldManagement.Load({ type, id });
    Matrix.InitCamera({ type, id });

    const idEvent = `${type}.${id}`;

    Keyboard.Event[idEvent] = {
      ArrowLeft: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet) return;
        const x = Elements.Data[type][id].x - Elements.Data[type][id].vel;
        const y = Elements.Data[type][id].y;
        if (BiomeEngine.isCollision({ type, id, x, y })) return;
        Elements.Data[type][id].x = x;
        Pixi.updatePosition({ type, id });
      },
      ArrowRight: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet) return;
        const x = Elements.Data[type][id].x + Elements.Data[type][id].vel;
        const y = Elements.Data[type][id].y;
        if (BiomeEngine.isCollision({ type, id, x, y })) return;
        Elements.Data[type][id].x = x;
        Pixi.updatePosition({ type, id });
      },
      ArrowUp: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet) return;
        const x = Elements.Data[type][id].x;
        const y = Elements.Data[type][id].y - Elements.Data[type][id].vel;
        if (BiomeEngine.isCollision({ type, id, x, y })) return;
        Elements.Data[type][id].y = y;
        Pixi.updatePosition({ type, id });
      },
      ArrowDown: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet) return;
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
    if (Elements.Interval[type][id]['main-skin-sprite-controller'])
      clearInterval(Elements.Interval[type][id]['main-skin-sprite-controller']);
    Elements.Interval[type][id]['main-skin-sprite-controller'] = setInterval(() => {
      if (lastX !== Elements.Data[type][id].x || lastY !== Elements.Data[type][id].y) {
        const direction = getDirection({
          x1: lastX,
          y1: lastY,
          x2: Elements.Data[type][id].x,
          y2: Elements.Data[type][id].y,
        });
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
            SocketIo.Emit(type, {
              status: 'update-skin-position',
              element: { components: { skin: Elements.Data[type][id].components.skin } },
            });
          }
        }, 500);

        if (lastDirection !== direction) {
          lastDirection = newInstance(direction);
          logger.info('New direction', direction);
        } else if (Elements.Data[type][id].components.skin.find((skin) => skin.position[0] === '1')) return;

        Elements.Data[type][id] = updateMovementDirection({ direction, element: Elements.Data[type][id] });

        Pixi.triggerUpdateSkinPosition({ type, id });
        SocketIo.Emit(type, {
          status: 'update-skin-position',
          element: { components: { skin: Elements.Data[type][id].components.skin } },
        });
      }
    }, CyberiaParams.CYBERIA_EVENT_CALLBACK_TIME);

    if (Object.values(oldElement).length > 0) {
      await WorldManagement.Load();

      if (!objectEquals(oldElement.model.world, Elements.Data[type][id].model.world))
        WorldManagement.EmitNewWorldFace({ type, id });

      if (oldElement.x !== Elements.Data[type][id].x || oldElement.y !== Elements.Data[type][id].y)
        SocketIo.Emit(type, {
          status: 'update-position',
          element: { x: Elements.Data[type][id].x, y: Elements.Data[type][id].y },
        });
      SocketIo.Emit(type, {
        status: 'update-skin-position',
        element: { components: { skin: Elements.Data[type][id].components.skin } },
      });
    }

    Account.UpdateEvent[idEvent] = (options) => {
      const { user } = options;
      Elements.Data.user.main.model.user = user;
    };
  },
};

export { MainUser };
