/**
 * Default WebSocket connection handler — wires sockets to the main channel.
 * @module ws/default/default.ws.connection
 */

import { loggerFactory } from '../../server/logger.js';
import { DefaultWsMainChannel } from './channels/default.ws.main.js';

const logger = loggerFactory(import.meta);

/**
 * @class DefaultWsConnectionHandler
 * @classdesc Subscribes a new socket to the default main channel
 * and delegates disconnect events.
 */
class DefaultWsConnectionHandler {
  /**
   * Handles a new WebSocket connection.
   * @param {import('socket.io').Socket} socket
   * @param {string} wsManagementId
   */
  static handle(socket, wsManagementId) {
    logger.info(`DefaultWsConnection ${socket.id}`);

    DefaultWsMainChannel.connection(socket, wsManagementId);

    socket.on('disconnect', (reason) => {
      logger.info(`DefaultWsConnection ${socket.id} due to reason: ${reason}`);

      DefaultWsMainChannel.disconnect(socket, reason, wsManagementId);
    });
  }
}

export { DefaultWsConnectionHandler };
