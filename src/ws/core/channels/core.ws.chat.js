import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';

const channel = 'chat';
const meta = { url: `ws-core-${channel}` };
const logger = loggerFactory(meta);

const CoreWsChatController = {
  channel,
  meta,
  controller: function (socket, client, args, wsManagementId) {
    for (const socketId of Object.keys(client)) {
      if (socketId !== socket.id) {
        client[socketId].emit(channel, JSON.stringify({ id: socket.id, ...args }));
      }
    }
  },
  connection: function (socket, client, wsManagementId) {},
  disconnect: function (socket, client, reason, wsManagementId) {},
};

const CoreWsChatChannel = IoCreateChannel(CoreWsChatController);

export { CoreWsChatChannel, CoreWsChatController };
