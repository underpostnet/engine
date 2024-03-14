import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CoreWsEmit } from '../core.ws.emit.js';

const channel = 'chat';
const logger = loggerFactory(import.meta);

const CoreWsChatController = {
  channel,
  controller: function (socket, client, args, wsManagementId) {
    for (const socketId of Object.keys(client)) {
      if (socketId !== socket.id) {
        CoreWsEmit(channel, client[socketId], { id: socket.id, ...args });
      }
    }
  },
  connection: function (socket, client, wsManagementId) {},
  disconnect: function (socket, client, reason, wsManagementId) {},
};

const CoreWsChatChannel = IoCreateChannel(CoreWsChatController);

export { CoreWsChatChannel, CoreWsChatController };
