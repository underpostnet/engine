/**
 * Chat WebSocket channel — broadcasts messages to all connected sockets except the sender.
 * @module ws/core/channels/core.ws.chat
 */

import { IoChannel } from '../../IoInterface.js';
import { CoreWsEmitter } from '../core.ws.emit.js';

/**
 * @class CoreWsChatChannel
 * @classdesc Manages the chat WebSocket channel with per-instance state.
 * Broadcasts incoming messages to all other connected sockets.
 */
class CoreWsChatChannel {
  /** @type {Object.<string, Object>} Per-instance state keyed by hostKeyContext. */
  static #state = {};

  /** @type {IoChannel} */
  static #io = new IoChannel({
    channel: 'chat',
    controller(socket, client, payload, hostKeyContext) {
      for (const socketId of Object.keys(client)) {
        if (socketId !== socket.id) {
          CoreWsEmitter.emit('chat', client[socketId], { id: socket.id, ...payload });
        }
      }
    },
  });

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
   * @param {string} hostKeyContext - Unique server context ID.
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

export { CoreWsChatChannel };
