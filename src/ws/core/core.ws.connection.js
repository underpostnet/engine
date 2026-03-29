/**
 * Core WebSocket connection handler — wires sockets to all channels.
 * @module ws/core/core.ws.connection
 */

import { loggerFactory } from '../../server/logger.js';
import { CoreWsChatChannel } from './channels/core.ws.chat.js';
import { CoreWsMailerChannel } from './channels/core.ws.mailer.js';
import { CoreWsStreamChannel } from './channels/core.ws.stream.js';

const logger = loggerFactory(import.meta);

/**
 * @class CoreWsConnectionHandler
 * @classdesc Subscribes a new socket to all core channels (chat, mailer, stream)
 * and delegates disconnect events to each channel.
 */
class CoreWsConnectionHandler {
  /**
   * Handles a new WebSocket connection.
   * @param {import('socket.io').Socket} socket
   * @param {string} wsManagementId
   */
  static handle(socket, wsManagementId) {
    logger.info(`New connection established. Socket ID: ${socket.id}`);

    CoreWsChatChannel.connection(socket, wsManagementId);
    CoreWsMailerChannel.connection(socket, wsManagementId);
    CoreWsStreamChannel.connection(socket, wsManagementId);

    socket.on('disconnect', (reason) => {
      logger.info(`Connection disconnected. Socket ID: ${socket.id}, reason: ${reason}`);

      CoreWsChatChannel.disconnect(socket, reason, wsManagementId);
      CoreWsMailerChannel.disconnect(socket, reason, wsManagementId);
      CoreWsStreamChannel.disconnect(socket, reason, wsManagementId);
    });
  }
}

export { CoreWsConnectionHandler };
