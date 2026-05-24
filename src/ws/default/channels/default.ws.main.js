/**
 * Default "main" WebSocket channel — minimal no-op channel.
 * @module ws/default/channels/default.ws.main
 */

import { IoChannel } from '../../IoInterface.js';

/**
 * @class DefaultWsMainChannel
 * @classdesc Provides a no-op main channel for the default WebSocket server.
 */
class DefaultWsMainChannel {
  /** @type {Object.<string, Object>} Per-instance state keyed by hostKeyContext. */
  static #state = {};

  /** @type {IoChannel} */
  static #io = new IoChannel({ channel: 'main' });

  /** @returns {Object.<string, import('socket.io').Socket>} Connected sockets map. */
  static get client() {
    return this.#io.client;
  }

  /** @returns {string} Channel name. */
  static get channel() {
    return this.#io.channel;
  }

  /**
   * Initializes state for a server instance.
   * @param {string} hostKeyContext
   */
  static init(hostKeyContext) {
    this.#state[hostKeyContext] = {};
  }

  /**
   * Registers a socket connection.
   * @param {import('socket.io').Socket} socket
   * @param {string} hostKeyContext
   */
  static connection(socket, hostKeyContext) {
    return this.#io.connection(socket, hostKeyContext);
  }

  /**
   * Handles socket disconnection.
   * @param {import('socket.io').Socket} socket
   * @param {string} reason
   * @param {string} hostKeyContext
   */
  static disconnect(socket, reason, hostKeyContext) {
    return this.#io.disconnect(socket, reason, hostKeyContext);
  }
}

export { DefaultWsMainChannel };
