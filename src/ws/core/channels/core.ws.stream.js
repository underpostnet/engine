/**
 * Stream WebSocket channel — manages per-socket room membership and user tracking.
 * @module ws/core/channels/core.ws.stream
 */

import { IoChannel } from '../../IoInterface.js';

/**
 * @class CoreWsStreamChannel
 * @classdesc Manages the stream WebSocket channel. Each socket can join a room
 * and broadcast connection/disconnection events to other room members.
 */
class CoreWsStreamChannel {
  /** @type {Object.<string, Object.<string, Array>>} Per-socket room/user args keyed by `[wsManagementId][socketId]`. */
  static #state = {};

  /** @type {IoChannel} */
  static #io = new IoChannel({
    channel: 'stream',
    stream: true,
    controller(socket, client, payload, wsManagementId, args) {
      const [roomId, userId] = args;
      CoreWsStreamChannel.#state[wsManagementId][socket.id] = args;

      socket.join(roomId);
      socket.broadcast.emit('stream-user-connected', userId);
    },
    connection(socket, client, wsManagementId) {
      CoreWsStreamChannel.#state[wsManagementId][socket.id] = [];
    },
    disconnect(socket, client, reason, wsManagementId) {
      const [roomId, userId] = CoreWsStreamChannel.#state[wsManagementId][socket.id];
      socket.broadcast.emit('stream-user-disconnected', userId);
      delete CoreWsStreamChannel.#state[wsManagementId][socket.id];
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
   * @param {string} wsManagementId - Unique server context ID (`${host}${path}`).
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

export { CoreWsStreamChannel };
