import { loggerFactory } from '../../../server/logger.js';

const channel = 'chat';
const meta = { url: `ws-core-${channel}` };
const logger = loggerFactory(meta);

const CoreWsChatController = {
  channel,
  controller: function (socket, client, args) {},
  connection: function (socket, client) {},
  disconnect: function (socket, client, reason) {},
};

const CoreWsChatChannel = IoCreateChannel(CoreWsChatController);

export { CoreWsChatChannel, CoreWsChatController };
