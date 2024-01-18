import { loggerFactory } from '../../server/logger.js';
import { CyberiaWsUserChannel } from './channels/cyberia.ws.user.js';

const meta = { url: `ws-cyberia-connection` };
const logger = loggerFactory(meta);

const CyberiaWsConnection = function (socket) {
  // const headers = socket.handshake.headers;
  // const ip = socket.handshake.address;
  logger.info(`CyberiaWsConnection ${socket.id}`);

  CyberiaWsUserChannel.connection(socket);

  socket.on('disconnect', (reason) => {
    logger.info(`CyberiaWsConnection ${socket.id} due to reason: ${reason}`);
    CyberiaWsUserChannel.disconnect(socket, reason);
  });
};

export { CyberiaWsConnection };
