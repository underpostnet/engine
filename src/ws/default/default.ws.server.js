/**
 * Default WebSocket server factory — initializes the main channel and creates the Socket.IO server.
 * @module ws/default/default.ws.server
 */

'use strict';

import { IoServer } from '../IoServer.js';
import { DefaultWsConnectionHandler } from './default.ws.connection.js';
import { DefaultWsMainChannel } from './channels/default.ws.main.js';

/**
 * @class DefaultWsServer
 * @classdesc Creates the default WebSocket server with a single main channel.
 */
class DefaultWsServer {
  /**
   * Initializes the main channel and creates the Socket.IO server.
   * @param {import('http').Server} httpServer
   * @param {Object} options
   * @param {string} options.host
   * @param {string} options.path
   * @returns {{ options: import('socket.io').ServerOptions, ioServer: import('socket.io').Server, meta: ImportMeta }}
   */
  static create(httpServer, options) {
    const { host, path } = options;
    const wsManagementId = `${host}${path}`;

    DefaultWsMainChannel.init(wsManagementId);

    return IoServer.create(httpServer, options, (socket) => DefaultWsConnectionHandler.handle(socket, wsManagementId));
  }
}

/** Required by Express.js dynamic import: `const { createIoServer } = await import(...)` */
const createIoServer = DefaultWsServer.create.bind(DefaultWsServer);

export { DefaultWsServer, createIoServer };
