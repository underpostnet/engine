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
        CoreWsMailerManagement.setUser(wsManagementId, socket.id, payload.user);
        break;
      case 'unregister-user':
        CoreWsMailerManagement.removeSocket(wsManagementId, socket.id);
        break;

      default:
        break;
    }
  },
  connection: function (socket, client, wsManagementId) {},
  disconnect: function (socket, client, reason, wsManagementId) {
    CoreWsMailerManagement.removeSocket(wsManagementId, socket.id);
  },
};

const CoreWsMailerChannel = IoCreateChannel(CoreWsMailerController);

export { CoreWsMailerChannel, CoreWsMailerController };
