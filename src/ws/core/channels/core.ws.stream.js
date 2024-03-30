import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CoreWsStreamManagement } from '../management/core.ws.stream.js';

const channel = 'stream';
const logger = loggerFactory(import.meta);

const CoreWsStreamController = {
  channel,
  stream: true,
  controller: function (socket, client, payload, wsManagementId, args) {
    const [roomId, userId] = args;
    CoreWsStreamManagement.element[wsManagementId][socket.id] = args;

    socket.join(roomId); // Join the room
    socket.broadcast.emit(`${channel}-user-connected`, userId); // Tell everyone else in the room that we joined
  },
  connection: function (socket, client, wsManagementId) {
    CoreWsStreamManagement.element[wsManagementId][socket.id] = [];
  },
  disconnect: function (socket, client, reason, wsManagementId) {
    // Communicate the disconnection
    const [roomId, userId] = CoreWsStreamManagement.element[wsManagementId][socket.id];
    socket.broadcast.emit(`${channel}-user-disconnected`, userId);
    delete CoreWsStreamManagement.element[wsManagementId][socket.id];
  },
};

const CoreWsStreamChannel = IoCreateChannel(CoreWsStreamController);

export { CoreWsStreamChannel, CoreWsStreamController };
