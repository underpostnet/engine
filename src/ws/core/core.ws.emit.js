/**
 * Module for standardized WebSocket message emission (sending).
 * @module ws/core.ws.emit
 * @namespace CoreWsEmitter
 */

import { loggerFactory } from '../../server/logger.js';
import { Socket } from 'socket.io';

const logger = loggerFactory(import.meta);

/**
 * @class CoreWsEmitter
 * @alias CoreWsEmitter
 * @memberof CoreWsEmitter
 * @classdesc Provides a static utility method for safely emitting messages over a WebSocket connection.
 */
class CoreWsEmitter {
  /**
   * Emits a payload to a specific client over a given channel.
   * The payload is automatically JSON stringified.
   *
   * @static
   * @param {string} [channel=''] - The name of the channel/event to emit on.
   * @param {Socket | Object} [client={}] - The Socket.IO client/socket object. Must have an `emit` method.
   * @param {Object} [payload={}] - The data object to send.
   * @returns {void}
   */
  static emit(channel = '', client = {}, payload = {}) {
    try {
      if (client && typeof client.emit === 'function') {
        client.emit(channel, JSON.stringify(payload));
      } else {
        logger.error('Invalid client: Cannot emit message.', { channel, client, payload });
      }
    } catch (error) {
      logger.error(error, { channel, client, payload, stack: error.stack });
    }
  }
}

/**
 * Backward compatibility export for the `emit` function.
 * @memberof CoreWsEmitter
 * @function CoreWsEmit
 * @param {string} [channel=''] - The name of the channel/event to emit on.
 * @param {Socket | Object} [client={}] - The Socket.IO client/socket object.
 * @param {Object} [payload={}] - The data object to send.
 * @returns {void}
 */
const CoreWsEmit = CoreWsEmitter.emit;

export { CoreWsEmitter, CoreWsEmit };
