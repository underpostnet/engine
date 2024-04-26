import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

const IoCreateChannel = (
  IoInterface = {
    channel: '',
    connection: (socket = {}, client = {}, wsManagementId = '') => {},
    controller: (socket = {}, client = {}, args = '', wsManagementId = '') => {},
    disconnect: (socket = {}, client = {}, reason = '', wsManagementId = '') => {},
    stream: false,
  },
) => {
  return {
    channel: IoInterface.channel,
    client: {},
    connection: async function (socket, wsManagementId) {
      try {
        this.client[socket.id] = socket;
        socket.on(IoInterface.channel, (...args) => this.controller(socket, args, wsManagementId));
        await IoInterface.connection(socket, this.client, wsManagementId);
      } catch (error) {
        logger.error(error, { channel: IoInterface.channel, wsManagementId, stack: error.stack });
      }
    },
    controller: async function (socket, args, wsManagementId) {
      try {
        const payload = IoInterface.stream ? args[0] : JSON.parse(args[0]);
        await IoInterface.controller(socket, this.client, payload, wsManagementId, args);
      } catch (error) {
        logger.error(error, { channel: IoInterface.channel, wsManagementId, args, stack: error.stack });
      }
    },
    disconnect: async function (socket, reason, wsManagementId) {
      try {
        await IoInterface.disconnect(socket, this.client, reason, wsManagementId);
        delete this.client[socket.id];
      } catch (error) {
        logger.error(error, { channel: IoInterface.channel, wsManagementId, reason, stack: error.stack });
      }
    },
  };
};

export { IoCreateChannel };
