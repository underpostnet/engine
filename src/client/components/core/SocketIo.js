/**
 * Client-side WebSocket provider using Socket.IO.
 * Manages a singleton socket connection, channel registration, and event dispatching.
 *
 * @module client/core/SocketIo
 * @namespace SocketIoProvider
 */
import { io } from 'socket.io/client-dist/socket.io.esm.min.js';
import { SocketEventType, socketEvents } from './ClientEvents.js';
import { loggerFactory } from './Logger.js';
import { getWsBasePath, getWsBaseUrl } from '../../services/core/core.service.js';

const logger = loggerFactory(import.meta);

/**
 * @class SocketIoProvider
 * @classdesc Provides static methods for managing a singleton Socket.IO client connection,
 * channel event dispatching, and message emission.
 * @memberof SocketIoProvider
 */
class SocketIoProvider {
  /**
   * Event callback registry, keyed by channel name → unique callback ID → handler function.
   * Built-in channels: `connect`, `connect_error`, `disconnect`.
   *
   * @static
   * @type {Object.<string, Object.<string, function>>}
   */
  static Event = {
    connect: {},
    connect_error: {},
    disconnect: {},
  };

  /**
   * The active Socket.IO client socket instance.
   *
   * @static
   * @type {import('socket.io-client').Socket|null}
   */
  static socket = null;

  /**
   * The current WebSocket host URL.
   *
   * @static
   * @type {string|undefined}
   */
  static host;
  static onConnect(listener, options = {}) {
    return socketEvents.on(SocketEventType.connect, listener, options);
  }
  static offConnect(key) {
    return socketEvents.off(key);
  }
  static onConnectError(listener, options = {}) {
    return socketEvents.on(SocketEventType.connectError, listener, options);
  }
  static offConnectError(key) {
    return socketEvents.off(key);
  }
  static onDisconnect(listener, options = {}) {
    return socketEvents.on(SocketEventType.disconnect, listener, options);
  }
  static offDisconnect(key) {
    return socketEvents.off(key);
  }
  static onChannel(type, listener, options = {}) {
    return socketEvents.on(SocketEventType.channel(type), listener, options);
  }
  static offChannel(key) {
    return socketEvents.off(key);
  }

  /**
   * Emits a JSON-serialized payload to the server on the specified channel.
   *
   * @static
   * @param {string} [channel=''] - The channel/event name to emit on.
   * @param {Object} [payload={}] - The data to send.
   * @returns {void}
   */
  static Emit(channel = '', payload = {}) {
    try {
      this.socket.emit(channel, JSON.stringify(payload));
    } catch (error) {
      logger.error(error);
    }
  }

  /**
   * Initializes (or re-initializes) the Socket.IO connection.
   * Disconnects any existing socket, creates a new connection, and registers
   * built-in event listeners and custom channels.
   *
   * @static
   * @async
   * @param {Object} options - Connection options.
   * @param {string} [options.host] - Override WebSocket host URL.
   * @param {Object.<string, Object>} [options.channels] - Channel definitions to register listeners for.
   * @returns {Promise<void>}
   */
  static async instance(options) {
    if (this.socket) this.socket.disconnect();
    const path = getWsBasePath();
    this.host = options.host ? options.host : getWsBaseUrl({ wsBasePath: '' });
    logger.info(`ws host:`, {
      host: this.host,
      path,
    });
    const connectOptions = {
      path: path === '/' ? undefined : path,
      withCredentials: true,
      extraHeaders: {},
      transports: ['websocket', 'polling', 'flashsocket'],
    };
    this.socket = io(this.host, connectOptions);

    this.socket.on('connect', () => {
      logger.info(`event: connect | session id: ${this.socket.id}`);
      socketEvents.emit(SocketEventType.connect, { id: this.socket.id });
      Object.keys(this.Event.connect).map((keyEvent) => this.Event.connect[keyEvent]());
    });

    this.socket.on('connect_error', (err) => {
      logger.info(`event: connect_error | reason: ${err.message}`);
      socketEvents.emit(SocketEventType.connectError, { error: err });
      Object.keys(this.Event.connect_error).map((keyEvent) => this.Event.connect_error[keyEvent](err));
    });

    this.socket.on('disconnect', (reason) => {
      logger.info(`event: disconnect | reason: ${reason}`);
      socketEvents.emit(SocketEventType.disconnect, { reason });
      Object.keys(this.Event.disconnect).map((keyEvent) => this.Event.disconnect[keyEvent](reason));
    });

    if (options && 'channels' in options) this.setChannels(options.channels);
  }

  /**
   * Registers socket listeners for each channel key, routing incoming messages
   * to all registered callbacks in `Event[channel]`.
   *
   * @static
   * @param {Object.<string, Object>} channels - Channel definitions keyed by channel name.
   * @returns {void}
   */
  static setChannels(channels) {
    Object.keys(channels).map((type) => {
      logger.info(`load chanel`, type);
      if (!this.Event[type]) this.Event[type] = {};
      this.socket.on(type, (...args) => {
        socketEvents.emit(SocketEventType.channel(type), { type, args });
        Object.keys(this.Event[type]).map((keyEvent) => this.Event[type][keyEvent](args));
      });
    });
  }
}

/** @type {SocketIoProvider} Backward compatibility alias. */
const SocketIo = SocketIoProvider;

export { SocketIoProvider, SocketIo };
