import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CoreWsMailerManagement } from '../management/core.ws.mailer.js';

const channel = 'mailer';
const logger = loggerFactory(import.meta);

const CoreWsMailerController = {
  channel,
  controller: function (socket, client, payload, wsManagementId) {
    switch (payload.status) {
      case 'register-user':
        CoreWsMailerManagement.element[wsManagementId][socket.id] = {
          model: {
            user: payload.user,
          },
        };
        break;
      case 'unregister-user':
        delete CoreWsMailerManagement.element[wsManagementId][socket.id];
        break;

      default:
        break;
    }
  },
  connection: function (socket, client, wsManagementId) {},
  disconnect: function (socket, client, reason, wsManagementId) {
    delete CoreWsMailerManagement.element[wsManagementId][socket.id];
  },
};

const CoreWsMailerChannel = IoCreateChannel(CoreWsMailerController);

export { CoreWsMailerChannel, CoreWsMailerController };
