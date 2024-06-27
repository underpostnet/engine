import { Chat } from '../core/Chat.js';
import { s4 } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { s } from '../core/VanillaJs.js';
import { ElementsCyberiaPortal } from './ElementsCyberiaPortal.js';

const logger = loggerFactory(import.meta);

const SocketIoCyberiaPortal = {
  Init: function () {
    return new Promise((resolve) => {
      for (const type of Object.keys(ElementsCyberiaPortal.Data)) {
        SocketIo.Event[type][s4()] = async (args) => {
          args = JSON.parse(args[0]);
          switch (type) {
            case 'chat':
              if (s(`.chat-box`)) Chat.appendChatBox(args);
              break;

            default:
              break;
          }
        };
      }
      SocketIo.Event.connect[s4()] = async (reason) => {
        // ElementsCyberiaPortal.Init({ type, id, element });
      };
      SocketIo.Event.disconnect[s4()] = async (reason) => {
        // ElementsCyberiaPortal.removeAll();
      };
      return resolve();
    });
  },
};

export { SocketIoCyberiaPortal };
