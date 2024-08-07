import { Chat } from '../core/Chat.js';
import { s4 } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { s } from '../core/VanillaJs.js';
import { ElementsNexodev } from './ElementsNexodev.js';

const logger = loggerFactory(import.meta);

const SocketIoNexodev = {
  Init: function () {
    return new Promise((resolve) => {
      for (const type of Object.keys(ElementsNexodev.Data)) {
        SocketIo.Event[type][s4()] = async (args) => {
          args = JSON.parse(args[0]);
          switch (type) {
            case 'chat':
              {
                const idModal = 'modal-chat';
                if (s(`.${idModal}-chat-box`)) Chat.appendChatBox({ idModal, ...args });
              }
              break;

            default:
              break;
          }
        };
      }
      SocketIo.Event.connect[s4()] = async (reason) => {
        // ElementsNexodev.Init({ type, id, element });
      };
      SocketIo.Event.disconnect[s4()] = async (reason) => {
        // ElementsNexodev.removeAll();
      };
      return resolve();
    });
  },
};

export { SocketIoNexodev };
