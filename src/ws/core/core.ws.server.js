/**
 * Core WebSocket server factory — initializes channels and creates the Socket.IO server.
 * @module ws/core/core.ws.server
 */

'use strict';

import { IoServer } from '../IoServer.js';
import { CoreWsConnectionHandler } from './core.ws.connection.js';
import { CoreWsChatChannel } from './channels/core.ws.chat.js';
import { CoreWsMailerChannel } from './channels/core.ws.mailer.js';
import { CoreWsStreamChannel } from './channels/core.ws.stream.js';

/**
 * @class CoreWsServer
 * @classdesc Creates the core WebSocket server, initializing all channel state
 * before attaching the connection handler.
 */
class CoreWsServer {
  /**
   * Initializes channel state and creates the Socket.IO server.
   * @param {import('http').Server} httpServer
   * @param {Object} options
   * @param {string} options.host
   * @param {string} options.path
   * @returns {{ options: import('socket.io').ServerOptions, ioServer: import('socket.io').Server, meta: ImportMeta }}
   */
  static create(httpServer, options) {
    const { host, path } = options;
    const wsManagementId = `${host}${path}`;

    CoreWsChatChannel.init(wsManagementId);
    CoreWsMailerChannel.init(wsManagementId);
    CoreWsStreamChannel.init(wsManagementId);

    return IoServer.create(httpServer, options, (socket) => CoreWsConnectionHandler.handle(socket, wsManagementId));
  }
}

/** Required by Express.js dynamic import: `const { createIoServer } = await import(...)` */
const createIoServer = CoreWsServer.create.bind(CoreWsServer);

export { CoreWsServer, createIoServer };
