/**
 * Module for handling new WebSocket connections and setting up channel listeners.
 * @module ws/core.ws.connection
 * @namespace CoreWsConnection
 */

import { loggerFactory } from '../../server/logger.js';
import { CoreWsChatChannel } from './channels/core.ws.chat.js';
import { CoreWsMailerChannel } from './channels/core.ws.mailer.js';
import { CoreWsStreamChannel } from './channels/core.ws.stream.js';
import { Socket } from 'socket.io'; // Added for JSDoc type hinting

const logger = loggerFactory(import.meta);

/**
 * @class CoreWsConnectionManager
 * @alias CoreWsConnectionManager
 * @memberof CoreWsConnection
 * @classdesc Manages the lifecycle of a new WebSocket connection, setting up listeners for
 * all registered channels (Chat, Mailer, Stream) and handling disconnection by delegating to channel handlers.
 */
class CoreWsConnectionManager {
  /**
   * Handles a new WebSocket connection by subscribing it to all active channels
   * and setting up the disconnect listener.
   *
   * @static
   * @param {Socket} socket - The Socket.IO socket object representing the client connection.
   * @param {string} wsManagementId - Unique identifier for the WebSocket management context.
   * @returns {void}
   */
  static handleConnection(socket, wsManagementId) {
    logger.info(`New connection established. Socket ID: ${socket.id}`);

    // Subscribe socket to all channel connection handlers (assuming these channels are IoChannel instances)
    CoreWsChatChannel.connection(socket, wsManagementId);
    CoreWsMailerChannel.connection(socket, wsManagementId);
    CoreWsStreamChannel.connection(socket, wsManagementId);

    // Set up the disconnect listener
    socket.on('disconnect', (reason) => {
      logger.info(`Connection disconnected. Socket ID: ${socket.id} due to reason: ${reason}`);

      // Notify all channels of the disconnection
      CoreWsChatChannel.disconnect(socket, reason, wsManagementId);
      CoreWsMailerChannel.disconnect(socket, reason, wsManagementId);
      CoreWsStreamChannel.disconnect(socket, reason, wsManagementId);
    });
  }
}

/**
 * Backward compatibility export for the connection handler function.
 * @memberof CoreWsConnection
 * @function CoreWsConnection
 * @param {Socket} socket - The Socket.IO socket object.
 * @param {string} wsManagementId - Unique identifier for the WebSocket management context.
 * @returns {void}
 */
const CoreWsConnection = CoreWsConnectionManager.handleConnection;

export { CoreWsConnectionManager, CoreWsConnection };
