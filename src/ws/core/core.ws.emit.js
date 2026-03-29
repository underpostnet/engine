/**
 * Standardized WebSocket message emission.
 * @module ws/core/core.ws.emit
 */

import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

/**
 * @class CoreWsEmitter
 * @classdesc Provides a static utility for safely emitting JSON-serialized messages over Socket.IO.
 */
class CoreWsEmitter {
  /**
   * Emits a JSON-stringified payload to a client on a given channel.
   *
   * @static
   * @param {string} channel - The channel/event name to emit on.
   * @param {import('socket.io').Socket} client - The Socket.IO socket to emit to.
   * @param {Object} payload - The data object to send.
   * @returns {void}
   */
  static emit(channel = '', client = {}, payload = {}) {
    try {
      if (client && typeof client.emit === 'function') {
        client.emit(channel, JSON.stringify(payload));
      } else {
        logger.error('Invalid client: Cannot emit message.', { channel, payload });
      }
    } catch (error) {
      logger.error(error, { channel, payload, stack: error.stack });
    }
  }
}

export { CoreWsEmitter };
