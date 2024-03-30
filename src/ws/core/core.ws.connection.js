import { loggerFactory } from '../../server/logger.js';
import { CoreWsChatChannel } from './channels/core.ws.chat.js';
import { CoreWsMailerChannel } from './channels/core.ws.mailer.js';
import { CoreWsStreamChannel } from './channels/core.ws.stream.js';

const logger = loggerFactory(import.meta);

const CoreWsConnection = function (socket, wsManagementId) {
  // const headers = socket.handshake.headers;
  // const ip = socket.handshake.address;
  // const { query, auth } = socket.handshake;

  logger.info(`CoreWsConnection ${socket.id}`);

  CoreWsChatChannel.connection(socket, wsManagementId);
  CoreWsMailerChannel.connection(socket, wsManagementId);
  CoreWsStreamChannel.connection(socket, wsManagementId);

  socket.on('disconnect', (reason) => {
    logger.info(`CoreWsConnection ${socket.id} due to reason: ${reason}`);

    CoreWsChatChannel.disconnect(socket, reason, wsManagementId);
    CoreWsMailerChannel.disconnect(socket, reason, wsManagementId);
    CoreWsStreamChannel.disconnect(socket, reason, wsManagementId);
  });
};

export { CoreWsConnection };
