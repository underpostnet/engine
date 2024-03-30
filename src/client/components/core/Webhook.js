import { SocketIo } from './SocketIo.js';

const Webhook = {
  register: async function (options = { user: {} }) {
    const { user } = options;
    SocketIo.Emit('mailer', {
      status: 'register-user',
      user,
    });
    SocketIo.Emit('user', {
      status: 'register-user',
      user,
    });
  },
  unregister: async function () {
    SocketIo.Emit('mailer', {
      status: 'unregister-user',
    });
    SocketIo.Emit('user', {
      status: 'unregister-user',
    });
  },
};

export { Webhook };
