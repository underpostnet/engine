/**
 * WebSocket session registration bridge.
 * Registers and unregisters the authenticated user's identity with the server-side
 * WebSocket management layer, enabling targeted real-time pushes (e.g. email confirmation).
 *
 * @module client/core/Webhook
 * @namespace WebhookProvider
 */
import { SocketIo } from './SocketIo.js';

/**
 * @class WebhookProvider
 * @classdesc Provides static methods to register/unregister the authenticated user
 * with the server-side WebSocket session management channels.
 * @memberof WebhookProvider
 */
class WebhookProvider {
  /**
   * Registers the authenticated user with the server-side WebSocket channels.
   * Creates a user↔socket mapping on the server, enabling targeted events.
   *
   * @static
   * @async
   * @param {Object} options - Registration options.
   * @param {Object} options.user - The authenticated user object to register.
   * @returns {Promise<void>}
   */
  static async register(options = { user: {} }) {
    const { user } = options;
    SocketIo.Emit('mailer', {
      status: 'register-user',
      user,
    });
    SocketIo.Emit('user', {
      status: 'register-user',
      user,
    });
  }

  /**
   * Unregisters the current user from server-side WebSocket channels.
   * Cleans up the user↔socket mapping on the server.
   *
   * @static
   * @async
   * @returns {Promise<void>}
   */
  static async unregister() {
    SocketIo.Emit('mailer', {
      status: 'unregister-user',
    });
    SocketIo.Emit('user', {
      status: 'unregister-user',
    });
  }
}

/** @type {WebhookProvider} Backward compatibility alias. */
const Webhook = WebhookProvider;

export { WebhookProvider, Webhook };
