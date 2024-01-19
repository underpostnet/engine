import { s4 } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { BaseElement } from './CommonCyberia.js';
import { Elements } from './Elements.js';

const logger = loggerFactory(import.meta);

const baseElement = BaseElement();

const SocketIoCyberia = {
  Init: async function () {
    for (const type of Object.keys(Elements.Data))
      SocketIo.Event[type][s4()] = (args) => {
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
          case 'disconnect':
            delete Elements.Data[type][id];
            break;

          default:
            Elements.Data[type][id] = {
              ...baseElement[type].main,
              ...Elements.Data[type][id],
              ...element,
            };
            break;
        }
      };
  },
};

export { SocketIoCyberia };
