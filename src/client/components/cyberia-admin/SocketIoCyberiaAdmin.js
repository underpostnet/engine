import { Chat } from '../core/Chat.js';
import { s4 } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { s } from '../core/VanillaJs.js';
import { ElementsCyberiaAdmin } from './ElementsCyberiaAdmin.js';

const logger = loggerFactory(import.meta);

const SocketIoCyberiaAdmin = {
  Init: function () {
    return new Promise((resolve) => {
      for (const type of Object.keys(ElementsCyberiaAdmin.Data)) {
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
        // ElementsCyberiaAdmin.Init({ type, id, element });
      };
      SocketIo.Event.disconnect[s4()] = async (reason) => {
        // ElementsCyberiaAdmin.removeAll();
      };
      return resolve();
    });
  },
};

export { SocketIoCyberiaAdmin };
