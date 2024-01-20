import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

const IoCreateChannel = (
  IoInterface = {
    channel: '',
    connection: (socket, client) => {},
    controller: (socket, client, args) => {},
    disconnect: (socket, client, reason) => {},
  },
) => {
  return {
    client: {},
    connection: function (socket) {
      this.client[socket.id] = socket;
      logger.info(`on connection`, { id: socket.id });
      socket.on(IoInterface.channel, (args) => this.controller(socket, args));
      IoInterface.connection(socket, this.client);
    },
    controller: function (socket, args) {
      args = JSON.parse(args);
      logger.info(`on controller`, { id: socket.id, args });
      IoInterface.controller(socket, this.client, args);
    },
    disconnect: function (socket, reason) {
      logger.info(`on disconnect`, { id: socket.id, reason });
      IoInterface.disconnect(socket, this.client, reason);
      delete this.client[socket.id];
    },
  };
};

export { IoCreateChannel };
