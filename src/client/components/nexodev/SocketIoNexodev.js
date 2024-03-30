import { s4 } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { Elements } from './Elements.js';

const logger = loggerFactory(import.meta);

const SocketIoNexodev = {
  Init: function () {
    return new Promise((resolve) => {
      for (const type of Object.keys(Elements.Data)) {
        // SocketIo.Event[type][s4()] = async (args) => {
        //   args = JSON.parse(args[0]);
        // };
      }
      SocketIo.Event.connect[s4()] = async (reason) => {
        // Elements.Init({ type, id, element });
      };
      SocketIo.Event.disconnect[s4()] = async (reason) => {
        // Elements.removeAll();
      };
      return resolve();
    });
  },
};

export { SocketIoNexodev };
