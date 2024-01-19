import { s4 } from '../core/CommonJs.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { s } from '../core/VanillaJs.js';
import { BaseElement } from './CommonCyberia.js';
import { Elements } from './Elements.js';
import { Matrix } from './Matrix.js';
import { Pixi } from './Pixi.js';
import { WorldManagement } from './World.js';

const logger = loggerFactory(import.meta);

const baseElement = BaseElement();

const SocketIoCyberia = {
  Init: async function () {
    for (const type of Object.keys(Elements.Data))
      SocketIo.Event[type][s4()] = async (args) => {
        args = JSON.parse(args[0]);

        switch (type) {
          case 'user':
            if (args.id === SocketIo.socket.id) args.id = 'main';

            break;

          default:
            break;
        }

        logger.info('ws on event', args);
        const { id, element, status } = args;

        switch (status) {
          case 'update-position':
            Elements.Data[type][id].x = element.x;
            Elements.Data[type][id].y = element.y;
            Pixi.updatePosition({ type, id });
            break;

          case 'update-skin-position':
            Elements.Data[type][id].components.skin = element.components.skin;
            break;
          case 'disconnect':
            delete Elements.Data[type][id];
            Pixi.removeElement({ type, id });
            break;
          case 'connection':
            Elements.Data[type][id] = {
              ...baseElement[type].main,
              ...Elements.Data[type][id],
              ...element,
            };
            switch (type) {
              case 'user':
                if (id === 'main') {
                  await WorldManagement.Load({ type, id });
                  Matrix.InitCamera({ type, id });
                  setTimeout(() => {
                    s('.ssr-background').style.opacity = 0;
                    setTimeout(async () => {
                      s('.ssr-background').style.display = 'none';
                      s(`.main-user-content`).style.display = 'block';
                      LoadingAnimation.bar.stop('init-loading');
                    }, 300);
                  });
                }

                await Elements.Init({ type, id });

                break;

              default:
                break;
            }
            break;
          default:
            break;
        }
      };
    SocketIo.Event.disconnect[s4()] = async (reason) => {
      s('.ssr-background').style.display = 'block';
      setTimeout((s('.ssr-background').style.opacity = '1'));
      s(`.main-user-content`).style.display = 'none';
      LoadingAnimation.bar.play('init-loading');

      for (const type of Object.keys(Elements.Data)) {
        for (const id of Object.keys(Elements.Data[type])) {
          Pixi.removeElement({ type, id });
          if (Elements.Interval[type] && Elements.Interval[type][id]) {
            for (const interval of Object.keys(Elements.Interval[type][id]))
              clearInterval(Elements.Interval[type][id][interval]);
          }
        }
        Elements.Interval = {};
        Elements.Data[type] = {};
      }
    };
  },
};

export { SocketIoCyberia };
