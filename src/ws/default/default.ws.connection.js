import { loggerFactory } from '../../server/logger.js';
import { DefaultWsDefaultChannel } from './channels/default.ws.default.js';

const logger = loggerFactory(import.meta);

const DefaultWsConnection = function (socket, wsManagementId) {
  // const headers = socket.handshake.headers;
  // const ip = socket.handshake.address;
  // const { query, auth } = socket.handshake;

  logger.info(`DefaultWsConnection ${socket.id}`);

  DefaultWsDefaultChannel.connection(socket, wsManagementId);

  socket.on('disconnect', (reason) => {
    logger.info(`DefaultWsConnection ${socket.id} due to reason: ${reason}`);

    DefaultWsDefaultChannel.disconnect(socket, reason, wsManagementId);
  });
};

export { DefaultWsConnection };
