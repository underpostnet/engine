/**
 * Mailer WebSocket channel — manages user↔socket bidirectional mapping
 * for targeted real-time pushes (e.g. email confirmation notifications).
 * @module ws/core/channels/core.ws.mailer
 */

import { IoChannel } from '../../IoInterface.js';

/**
 * @class CoreWsMailerChannel
 * @classdesc Manages the mailer WebSocket channel with O(1) user↔socket lookup.
 * Handles register/unregister messages and cleanup on disconnect.
 */
class CoreWsMailerChannel {
  /** @type {Object.<string, Object.<string, { model: { user: Object } }>>} Socket data keyed by `[wsManagementId][socketId]`. */
  static #data = {};

  /** @type {Object.<string, Object.<string, string>>} Reverse index: `[wsManagementId][userId]` → socketId. */
  static #userIndex = {};

  /** @type {IoChannel} */
  static #io = new IoChannel({
    channel: 'mailer',
    controller(socket, client, payload, wsManagementId) {
      switch (payload.status) {
        case 'register-user':
          CoreWsMailerChannel.setUser(wsManagementId, socket.id, payload.user);
          break;
        case 'unregister-user':
          CoreWsMailerChannel.removeSocket(wsManagementId, socket.id);
          break;
        default:
          break;
      }
    },
    disconnect(socket, client, reason, wsManagementId) {
      CoreWsMailerChannel.removeSocket(wsManagementId, socket.id);
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
    this.#data[wsManagementId] = {};
    this.#userIndex[wsManagementId] = {};
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

  /**
   * Registers a user↔socket mapping.
   * @param {string} wsManagementId
   * @param {string} socketId
   * @param {Object} user - User data with `_id` property.
   */
  static setUser(wsManagementId, socketId, user) {
    this.#data[wsManagementId][socketId] = { model: { user } };
    if (user?._id) {
      this.#userIndex[wsManagementId][user._id.toString()] = socketId;
    }
  }

  /**
   * Removes a socket entry and its reverse user index.
   * @param {string} wsManagementId
   * @param {string} socketId
   */
  static removeSocket(wsManagementId, socketId) {
    const entry = this.#data[wsManagementId]?.[socketId];
    if (entry?.model?.user?._id) {
      delete this.#userIndex[wsManagementId][entry.model.user._id.toString()];
    }
    delete this.#data[wsManagementId]?.[socketId];
  }

  /**
   * Finds the socket ID for a user (O(1) reverse index lookup).
   * @param {string} wsManagementId
   * @param {string} userId - The user `_id`.
   * @returns {string|undefined} Socket ID, or `undefined` if not connected.
   */
  static getUserWsId(wsManagementId, userId) {
    return this.#userIndex[wsManagementId]?.[userId];
  }
}

export { CoreWsMailerChannel };
