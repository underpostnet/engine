/**
 * Module for creating and managing WebSocket servers.
 * @module src/ws/IoServer
 * @namespace SocketIoServer
 */

'use strict';

import { Server } from 'socket.io';
import { loggerFactory } from '../server/logger.js';
import UnderpostStartUp from '../server/start.js';

import http from 'http';

const logger = loggerFactory(import.meta);

/**
 * @class
 * @alias IoServerClass
 * @memberof SocketIoServer
 * @classdesc Provides a static factory method to create and configure a Socket.IO server,
 * encapsulating WebSocket server initialization logic and CORS configuration.
 */
class IoServerClass {
  /**
   * Creates a new WebSocket server instance attached to an HTTP server.
   *
   * @static
   * @param {http.Server} httpServer - The HTTP server instance to attach the WebSocket server to.
   * @param {Object} options - Configuration options for the WebSocket server.
   * @param {string[]} options.origins - List of allowed origins for Cross-Origin Resource Sharing (CORS).
   * @param {string} options.path - The base path for the API. The WebSocket path ('/socket.io') will be appended to this.
   * @param {function(import('socket.io').Socket): void} ConnectionHandler - The connection handler function to be executed on a new connection.
   * @returns {Object} An object containing the final options and the server instance.
   * @returns {import('socket.io').ServerOptions} return.options - The final options object used to create the WebSocket server.
   * @returns {import('socket.io').Server} return.ioServer - The created and listening WebSocket server instance.
   * @returns {object} return.meta - The module's import meta object (`import.meta`).
   */
  static create(httpServer, options = {}, ConnectionHandler = () => {}) {
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
      // Ensure the path ends correctly, appending '/socket.io/'
      path: options.path !== '/' ? `${options.path}/socket.io/` : '/socket.io/',
    };

    const ioServerInstance = UnderpostStartUp.API.listenServerFactory(() =>
      new Server(httpServer, wsOptions).on('connection', ConnectionHandler),
    );

    logger.info('Socket.IO Server created and listening', { path: wsOptions.path });

    return {
      options: wsOptions,
      meta: import.meta,
      ioServer: ioServerInstance,
    };
  }
}

/**
 * Backward compatibility export for the server creation function.
 * @memberof SocketIoServer
 * @function IoServer
 * @param {http.Server} httpServer - The HTTP server instance.
 * @param {Object} options - Configuration options.
 * @param {function(import('socket.io').Socket): void} ConnectionHandler - The connection handler function.
 * @returns {Object} The server configuration object.
 */
const IoServer = IoServerClass.create;

export { IoServerClass, IoServer };
