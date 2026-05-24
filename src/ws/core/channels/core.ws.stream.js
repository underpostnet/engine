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
  /** @type {Object.<string, Object.<string, Array>>} Per-socket room/user args keyed by `[hostKeyContext][socketId]`. */
  static #state = {};

  /** @type {IoChannel} */
  static #io = new IoChannel({
    channel: 'stream',
    stream: true,
    controller(socket, client, payload, hostKeyContext, args) {
      const [roomId, userId] = args;

      // Collect existing users in the room before registering the new one
      const existingUsers = [];
      for (const entry of Object.values(CoreWsStreamChannel.#state[hostKeyContext])) {
        if (entry[0] === roomId && entry[1]) existingUsers.push(entry[1]);
      }

      CoreWsStreamChannel.#state[hostKeyContext][socket.id] = args;
      socket.join(roomId);
      socket.to(roomId).emit('stream-user-connected', userId);

      // Tell the joining user about everyone already in the room
      if (existingUsers.length > 0) socket.emit('stream-existing-users', existingUsers);
    },
    connection(socket, client, hostKeyContext) {
      CoreWsStreamChannel.#state[hostKeyContext][socket.id] = [];
    },
    disconnect(socket, client, reason, hostKeyContext) {
      const entry = CoreWsStreamChannel.#state[hostKeyContext]?.[socket.id];
      if (!entry || entry.length === 0) {
        if (CoreWsStreamChannel.#state[hostKeyContext]) delete CoreWsStreamChannel.#state[hostKeyContext][socket.id];
        return;
      }
      const [roomId, userId] = entry;
      socket.to(roomId).emit('stream-user-disconnected', userId);
      delete CoreWsStreamChannel.#state[hostKeyContext][socket.id];
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
   * @param {string} hostKeyContext - Unique server context ID (`${host}${path}`).
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

export { CoreWsStreamChannel };
