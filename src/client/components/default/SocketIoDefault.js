import { Account } from '../core/Account.js';
import { Chat } from '../core/Chat.js';
import { s4 } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { s } from '../core/VanillaJs.js';
import { ElementsDefault } from './ElementsDefault.js';

const logger = loggerFactory(import.meta);

const SocketIoDefault = {
  Init: function () {
    return new Promise((resolve) => {
      for (const type of Object.keys(ElementsDefault.Data)) {
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
          const { status } = args;

          switch (status) {
            case 'email-confirmed': {
              const newUser = { ...ElementsDefault.Data.user.main.model.user, emailConfirmed: true };
              Account.renderVerifyEmailStatus(newUser);
              Account.triggerUpdateEvent({ user: newUser });
              break;
            }

            default:
              break;
          }
        };
      }
      SocketIo.Event.connect[s4()] = async (reason) => {
        // ElementsDefault.Init({ type, id, element });
      };
      SocketIo.Event.disconnect[s4()] = async (reason) => {
        // ElementsDefault.removeAll();
      };
      return resolve();
    });
  },
};

export { SocketIoDefault };
