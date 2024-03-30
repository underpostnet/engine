import { SocketIo } from '../core/SocketIo.js';

const CyberiaWebhook = {
  register: function (options = { user: {} }) {
    const { user } = options;
    SocketIo.Emit('user', { status: 'register-cyberia-user', user });
  },
  unregister: function () {
    SocketIo.Emit('user', { status: 'unregister-cyberia-user' });
  },
};

export { CyberiaWebhook };
