import { loggerFactory } from '../../../server/logger.js';

const channel = 'user';
const meta = { url: `ws-cyberia-${channel}` };
const logger = loggerFactory(meta);

const CyberiaWsUserChannel = {
  controller: function (socket, args) {
    logger.info(`CyberiaWsUserChannel controller`, socket.id, args);
  },
  connection: function (socket) {
    logger.info(`CyberiaWsUserChannel connection`, socket.id);
    socket.on(channel, (args) => this.controller(socket, args));

    socket.broadcast.emit(
      channel,
      JSON.stringify({
        id: socket.id,
        element: {},
      }),
    );
  },
  disconnect: function (socket, reason) {
    logger.info(`CyberiaWsUserChannel disconnect`, socket.id, reason);
  },
};

export { CyberiaWsUserChannel };
