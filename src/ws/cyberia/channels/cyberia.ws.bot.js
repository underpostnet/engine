import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';

const channel = 'bot';
const meta = { url: `ws-cyberia-${channel}` };
const logger = loggerFactory(meta);

const CyberiaWsBotController = {
  channel,
  meta,
  controller: function (socket, client, args) {},
  connection: function (socket, client) {},
  disconnect: function (socket, client, reason) {},
};

const CyberiaWsBotChannel = IoCreateChannel(CyberiaWsBotController);

export { CyberiaWsBotChannel, CyberiaWsBotController };
