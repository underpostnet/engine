import { io } from 'socket.io/client-dist/socket.io.esm.min.js';
import { loggerFactory } from './Logger.js';
import { getWsBasePath, getWsBaseUrl } from '../../services/core/core.service.js';

const logger = loggerFactory(import.meta);

const SocketIo = {
  Event: {
    connect: {},
    connect_error: {},
    disconnect: {},
  },
  /** @type {import('socket.io').Socket} */
  socket: null,
  Emit: function (channel = '', payload = {}) {
    try {
      this.socket.emit(channel, JSON.stringify(payload));
    } catch (error) {
      logger.error(error);
    }
  },
  Init: async function (options) {
    if (this.socket) this.socket.disconnect();
    this.host = options.host ?? getWsBaseUrl({ wsBasePath: '' });
    logger.info(`ws host:`, this.host);
    const path = typeof options.path === 'string' ? options.path : getWsBasePath();
    const connectOptions = {
      path: path === '/' ? undefined : path,
      // auth: {
      //   token: '',
      // },
      // query: {
      //   'my-key': 'my-value',
      // },
      // forceNew: true,
      // reconnectionAttempts: 'Infinity',
      // timeout: 10000,
      // withCredentials: true,
      // autoConnect: 5000,
      transports: ['websocket', 'polling', 'flashsocket'],
    };
    // logger.error(`connect options:`, JSON.stringify(connectOptions, null, 4));
    this.socket = io(this.host, connectOptions);

    this.socket.on('connect', () => {
      logger.info(`event: connect | session id: ${this.socket.id}`);
      Object.keys(this.Event.connect).map((keyEvent) => this.Event.connect[keyEvent]());
    });

    this.socket.on('connect_error', (err) => {
      logger.info(`event: connect_error | reason: ${err.message}`);
      Object.keys(this.Event.connect_error).map((keyEvent) => this.Event.connect_error[keyEvent](err));
    });

    this.socket.on('disconnect', (reason) => {
      logger.info(`event: disconnect | reason: ${reason}`);
      Object.keys(this.Event.disconnect).map((keyEvent) => this.Event.disconnect[keyEvent](reason));
    });

    if (options && 'channels' in options) this.setChannels(options.channels);
  },
  setChannels: function (channels) {
    Object.keys(channels).map((type) => {
      logger.info(`load chanel`, type);
      this.Event[type] = {};
      this.socket.on(type, (...args) => {
        // logger.info(`event: ${type} | ${JSON.stringify(args, null, 4)}`);
        Object.keys(this.Event[type]).map((keyEvent) => this.Event[type][keyEvent](args));
      });
    });
  },
};

export { SocketIo };
