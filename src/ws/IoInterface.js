import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

const IoCreateChannel = (
  IoInterface = {
    channel: '',
    connection: (socket = {}, client = {}, wsManagementId = '') => {},
    controller: (socket = {}, client = {}, args = '', wsManagementId = '') => {},
    disconnect: (socket = {}, client = {}, reason = '', wsManagementId = '') => {},
  },
) => {
  return {
    channel: IoInterface.channel,
    client: {},
    connection: function (socket, wsManagementId) {
      this.client[socket.id] = socket;
      socket.on(IoInterface.channel, (...args) => this.controller(socket, args, wsManagementId));
      IoInterface.connection(socket, this.client, wsManagementId);
    },
    controller: function (socket, args, wsManagementId) {
      let payload = args[0];
      try {
        payload = JSON.parse(args[0]);
      } catch (error) {}
      IoInterface.controller(socket, this.client, payload, wsManagementId, args);
    },
    disconnect: function (socket, reason, wsManagementId) {
      IoInterface.disconnect(socket, this.client, reason, wsManagementId);
      delete this.client[socket.id];
    },
  };
};

export { IoCreateChannel };
