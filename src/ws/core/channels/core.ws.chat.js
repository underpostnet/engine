import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CoreWsEmit } from '../core.ws.emit.js';

const channel = 'chat';
const logger = loggerFactory(import.meta);

const CoreWsChatController = {
  channel,
  controller: function (socket, client, payload, wsManagementId) {
    for (const socketId of Object.keys(client)) {
      if (socketId !== socket.id) {
        CoreWsEmit(channel, client[socketId], { id: socket.id, ...payload });
      }
    }
  },
  connection: function (socket, client, wsManagementId) {},
  disconnect: function (socket, client, reason, wsManagementId) {},
};

const CoreWsChatChannel = IoCreateChannel(CoreWsChatController);

export { CoreWsChatChannel, CoreWsChatController };
