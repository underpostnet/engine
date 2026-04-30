/**
 * Shared factory for app-specific WebSocket event handlers.
 * Eliminates duplication across per-app SocketIo*.js modules by providing
 * common channel event handling (chat, email-confirmed, etc.).
 *
 * @module client/core/SocketIoHandler
 * @namespace SocketIoHandlerProvider
 */
import { Account } from './Account.js';
import { Chat } from './Chat.js';
import { s4 } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { SocketIo } from './SocketIo.js';
import { s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

/**
 * @class SocketIoHandlerProvider
 * @classdesc Provides a static factory method to create app-specific SocketIo event handlers
 * from an {@link AppStore} instance. Handles common channel events (chat, email-confirmed)
 * and wires connect/disconnect lifecycle.
 * @memberof SocketIoHandlerProvider
 */
class SocketIoHandlerProvider {
  /**
   * Creates a standard SocketIo event initialization object for an app module.
   *
   * @static
   * @param {import('./AppStore.js').AppStore} appStore - The app-specific AppStore instance.
   * @returns {{ instance: function(): Promise<void> }} An object with an `instance` method for SocketIo event registration.
   */
  static create(appStore) {
    return {
      instance() {
        return new Promise((resolve) => {
          for (const type of Object.keys(appStore.Data)) {
            SocketIo.onChannel(type, async ({ args }) => {
              args = JSON.parse(args[0]);
              switch (type) {
                case 'chat':
                  {
                    const idModal = 'modal-chat';
                    if (s(`.${idModal}-chat-box`)) Chat.appendChatBox({ idModal, ...args });
                  }
                  break;

                default:
                  break;
              }
              const { status } = args;

              switch (status) {
                case 'email-confirmed': {
                  const newUser = { ...appStore.Data.user.main.model.user, emailConfirmed: true };
                  Account.renderVerifyEmailStatus(newUser);
                  Account.triggerUpdateEvent({ user: newUser });
                  break;
                }

                default:
                  break;
              }
            }, { key: s4() });
          }
          SocketIo.onConnect(async ({ id }) => {}, { key: s4() });
          SocketIo.onDisconnect(async ({ reason }) => {}, { key: s4() });
          return resolve();
        });
      },
    };
  }
}

export { SocketIoHandlerProvider };
