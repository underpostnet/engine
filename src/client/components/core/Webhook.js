import { SocketIo } from './SocketIo.js';

const Webhook = {
  register: async function (options = { user: {} }) {
    const { user } = options;
    SocketIo.Emit('mailer', {
      status: 'register-user',
      user,
    });
  },
  unregister: async function () {
    SocketIo.Emit('mailer', {
      status: 'unregister-user',
    });
  },
};

export { Webhook };
