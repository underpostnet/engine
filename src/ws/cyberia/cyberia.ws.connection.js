import { loggerFactory } from '../../server/logger.js';
import { CoreWsChatChannel } from '../core/channels/core.ws.chat.js';
import { CyberiaWsBotChannel } from './channels/cyberia.ws.bot.js';
import { CyberiaWsUserChannel } from './channels/cyberia.ws.user.js';

const meta = { url: `ws-cyberia-connection` };
const logger = loggerFactory(meta);

const CyberiaWsConnection = function (socket) {
  // const headers = socket.handshake.headers;
  // const ip = socket.handshake.address;
  // const { query, auth } = socket.handshake;

  logger.info(`CyberiaWsConnection ${socket.id}`);

  CyberiaWsUserChannel.connection(socket);
  CyberiaWsBotChannel.connection(socket);

  CoreWsChatChannel.connection(socket);

  socket.on('disconnect', (reason) => {
    logger.info(`CyberiaWsConnection ${socket.id} due to reason: ${reason}`);

    CyberiaWsUserChannel.disconnect(socket, reason);
    CyberiaWsBotChannel.disconnect(socket, reason);

    CoreWsChatChannel.disconnect(socket, reason);
  });
};

export { CyberiaWsConnection };
