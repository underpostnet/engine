import { SocketIo } from '../core/SocketIo.js';

const SocketIoCyberia = {
  Init: async function () {
    SocketIo.Event.user['face-instance'] = (args) => {
      console.log(`SocketIo.Event.user['face-instance']`, args);
    };
  },
};

export { SocketIoCyberia };
