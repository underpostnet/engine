/**
 * Module for creating and managing WebSocket servers.
 * @module ws/IoServer
 */

'use strict';

import { Server } from 'socket.io';
import { loggerFactory } from '../server/logger.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @class IoServer
 * @classdesc Factory for creating and configuring Socket.IO server instances
 * with CORS configuration and HTTP server attachment.
 */
class IoServer {
  /**
   * Creates a new WebSocket server instance attached to an HTTP server.
   *
   * @static
   * @param {import('http').Server} httpServer - The HTTP server instance to attach to.
   * @param {Object} options - Configuration options.
   * @param {string[]} options.origins - Allowed CORS origins.
   * @param {string} options.path - Base API path. Socket.IO path is appended automatically.
   * @param {function(import('socket.io').Socket): void} connectionHandler - Handler for new connections.
   * @returns {{ options: import('socket.io').ServerOptions, ioServer: import('socket.io').Server, meta: ImportMeta }}
   */
  static create(httpServer, options = {}, connectionHandler = () => {}) {
    logger.info('origins', options.origins);
    const wsOptions = {
      cors: {
        origins: options.origins,
        methods: ['GET', 'POST', 'DELETE', 'PUT'],
        allowedHeaders: [
          'Access-Control-Allow-Headers',
          'Access-Control-Allow-Origin',
          'X-Requested-With',
          'X-Access-Token',
          'Content-Type',
          'Host',
          'Accept',
          'Connection',
          'Cache-Control',
          'Authorization',
        ],
        credentials: true,
      },
      path: options.path !== '/' ? `${options.path}/socket.io/` : '/socket.io/',
    };

    const ioServerInstance = Underpost.start.listenServerFactory(() =>
      new Server(httpServer, wsOptions).on('connection', connectionHandler),
    );

    logger.info('Socket.IO Server created and listening', { path: wsOptions.path });

    return {
      options: wsOptions,
      meta: import.meta,
      ioServer: ioServerInstance,
    };
  }
}

export { IoServer };
