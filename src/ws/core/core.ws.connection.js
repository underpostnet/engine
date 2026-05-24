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
   * @param {string} hostKeyContext
   */
  static handle(socket, hostKeyContext) {
    logger.info(`New connection established. Socket ID: ${socket.id}`);

    CoreWsChatChannel.connection(socket, hostKeyContext);
    CoreWsMailerChannel.connection(socket, hostKeyContext);
    CoreWsStreamChannel.connection(socket, hostKeyContext);

    socket.on('disconnect', (reason) => {
      logger.info(`Connection disconnected. Socket ID: ${socket.id}, reason: ${reason}`);

      CoreWsChatChannel.disconnect(socket, reason, hostKeyContext);
      CoreWsMailerChannel.disconnect(socket, reason, hostKeyContext);
      CoreWsStreamChannel.disconnect(socket, reason, hostKeyContext);
    });
  }
}

export { CoreWsConnectionHandler };
