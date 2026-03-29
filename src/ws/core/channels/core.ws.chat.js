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
  /** @type {Object.<string, Object>} Per-instance state keyed by wsManagementId. */
  static #state = {};

  /** @type {IoChannel} */
  static #io = new IoChannel({
    channel: 'chat',
    controller(socket, client, payload, wsManagementId) {
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
   * @param {string} wsManagementId - Unique server context ID.
   */
  static init(wsManagementId) {
    this.#state[wsManagementId] = {};
  }

  /**
   * Registers a socket connection.
   * @param {import('socket.io').Socket} socket
   * @param {string} wsManagementId
   */
  static connection(socket, wsManagementId) {
    return this.#io.connection(socket, wsManagementId);
  }

  /**
   * Handles socket disconnection.
   * @param {import('socket.io').Socket} socket
   * @param {string} reason
   * @param {string} wsManagementId
   */
  static disconnect(socket, reason, wsManagementId) {
    return this.#io.disconnect(socket, reason, wsManagementId);
  }
}

export { CoreWsChatChannel };
