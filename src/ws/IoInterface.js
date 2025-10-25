/**
 * Module for creating and managing WebSocket channels.
 * @module src/ws/IoInterface.js
 * @namespace SocketIoInterface
 */

import { loggerFactory } from '../server/logger.js';
import { Socket } from 'socket.io';

const logger = loggerFactory(import.meta);

/**
 * Defines the structure for a WebSocket channel's behavior functions.
 * @typedef {Object} ChannelInterface
 * @property {string} channel - The name of the channel.
 * @property {function(Socket, Object.<string, Socket>, string): Promise<void>} [connection] - Handler on client connection.
 * @property {function(Socket, Object.<string, Socket>, any, string, any[]): Promise<void>} [controller] - Handler for incoming channel messages.
 * @property {function(Socket, Object.<string, Socket>, string, string): Promise<void>} [disconnect] - Handler on client disconnection.
 * @property {boolean} [stream=false] - Whether the channel should treat the message as a raw stream (no JSON parsing).
 * @memberof SocketIoInterface
 */

/**
 * Manages the logic, client map, and event listeners for a specific WebSocket channel,
 * ensuring robust message handling and lifecycle management.
 * @class IoChannel
 * @memberof SocketIoInterface
 */
class IoChannel {
  /**
   * @private
   * @type {ChannelInterface}
   */
  #IoInterface;

  /**
   * Map of connected sockets for this channel, keyed by socket ID.
   * @type {Object.<string, Socket>}
   */
  client = {};

  /**
   * Creates an instance of IoChannel.
   * @param {ChannelInterface} IoInterface - The interface object defining the channel's behavior.
   */
  constructor(IoInterface) {
    this.#IoInterface = {
      channel: '',
      connection: async (socket = {}, client = {}, wsManagementId = '') => {},
      controller: async (socket = {}, client = {}, payload = {}, wsManagementId = '', args = []) => {},
      disconnect: async (socket = {}, client = {}, reason = '', wsManagementId = '') => {},
      stream: false,
      ...IoInterface,
    };
    logger.debug(`Channel instance created for: ${this.channel}`);
  }

  /**
   * Gets the name of the channel.
   * @returns {string} The channel name.
   */
  get channel() {
    return this.#IoInterface.channel;
  }

  /**
   * Handles a new socket connection for this channel.
   * Sets up the listener for the channel message.
   *
   * @param {Socket} socket - The Socket.IO socket object.
   * @param {string} wsManagementId - Unique identifier for the WebSocket management context.
   * @returns {Promise<void>}
   */
  async connection(socket, wsManagementId) {
    try {
      this.client[socket.id] = socket;
      // Use bind/arrow function to maintain 'this' context for the controller
      socket.on(this.channel, (...args) => this.controller(socket, args, wsManagementId));
      await this.#IoInterface.connection(socket, this.client, wsManagementId);
      logger.debug(`Socket ${socket.id} connected to channel ${this.channel}`);
    } catch (error) {
      logger.error(error, { channel: this.channel, wsManagementId, stack: error.stack });
    }
  }

  /**
   * Handles incoming messages on the channel.
   *
   * @private
   * @param {Socket} socket - The Socket.IO socket object.
   * @param {any[]} args - The raw arguments received from the socket event.
   * @param {string} wsManagementId - Unique identifier for the WebSocket management context.
   * @returns {Promise<void>}
   */
  async controller(socket, args, wsManagementId) {
    try {
      if (!args || args.length === 0) {
        logger.warn(`No arguments received for channel: ${this.channel}`, { socketId: socket.id });
        return;
      }
      // Determine if JSON parsing is needed based on the stream flag
      const payload = this.#IoInterface.stream ? args[0] : JSON.parse(args[0]);

      await this.#IoInterface.controller(socket, this.client, payload, wsManagementId, args);
    } catch (error) {
      logger.error(error, { channel: this.channel, wsManagementId, socketId: socket.id, args, stack: error.stack });
    }
  }

  /**
   * Handles a socket disconnection for this channel.
   *
   * @param {Socket} socket - The Socket.IO socket object.
   * @param {string} reason - The reason for disconnection (e.g., 'client namespace disconnect').
   * @param {string} wsManagementId - Unique identifier for the WebSocket management context.
   * @returns {Promise<void>}
   */
  async disconnect(socket, reason, wsManagementId) {
    try {
      await this.#IoInterface.disconnect(socket, this.client, reason, wsManagementId);
      delete this.client[socket.id];
      logger.debug(`Socket ${socket.id} disconnected from channel ${this.channel}. Reason: ${reason}`);
    } catch (error) {
      logger.error(error, { channel: this.channel, wsManagementId, reason, socketId: socket.id, stack: error.stack });
    }
  }
}

/**
 * Backward compatibility function to create a new channel instance.
 * @memberof SocketIoInterface
 * @function IoCreateChannel
 * @param {ChannelInterface} IoInterface - The interface object defining the channel's behavior.
 * @returns {IoChannel} An instance of the IoChannel class.
 */
const IoCreateChannel = (IoInterface) => new IoChannel(IoInterface);

export { IoChannel, IoCreateChannel };
