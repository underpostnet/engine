import { loggerFactory } from '../server/logger.js';

const IoCreateChannel = (
  IoInterface = {
    channel: '',
    meta: 'io-interface',
    connection: (socket = {}, client = {}, wsManagementId = '') => {},
    controller: (socket = {}, client = {}, args = '', wsManagementId = '') => {},
    disconnect: (socket = {}, client = {}, reason = '', wsManagementId = '') => {},
  },
) => {
  const logger = loggerFactory(IoInterface.meta);
  return {
    channel: IoInterface.channel,
    client: {},
    connection: function (socket, wsManagementId) {
      this.client[socket.id] = socket;
      logger.info(`on connection`, { id: socket.id });
      socket.on(IoInterface.channel, (args) => this.controller(socket, args, wsManagementId));
      IoInterface.connection(socket, this.client, wsManagementId);
    },
    controller: function (socket, args, wsManagementId) {
      args = JSON.parse(args);
      logger.info(`on controller`, { id: socket.id, args });
      IoInterface.controller(socket, this.client, args, wsManagementId);
    },
    disconnect: function (socket, reason, wsManagementId) {
      logger.info(`on disconnect`, { id: socket.id, reason });
      IoInterface.disconnect(socket, this.client, reason, wsManagementId);
      delete this.client[socket.id];
    },
  };
};

export { IoCreateChannel };
