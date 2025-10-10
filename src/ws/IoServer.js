/**
 * Module for creating and managing WebSocket servers.
 * @module src/ws/IoServer.js
 * @namespace SocketIoServer
 */

'use strict';

import { Server } from 'socket.io';
import { loggerFactory } from '../server/logger.js';

// https://socket.io/docs/v3/

const logger = loggerFactory(import.meta);

/**
 * Creates a new WebSocket server instance.
 *
 * @param {http.Server} httpServer - The HTTP server instance to attach the WebSocket server to.
 * @param {Object} options - Configuration options for the WebSocket server.
 * @param {string[]} options.origins - List of allowed origins for Cross-Origin Resource Sharing (CORS).
 * @param {string} options.path - The base path for the API. The WebSocket path ('/socket.io') will be appended to this.
 * @param {function} Connection - The connection handler function.
 * @returns {Object} An object containing the final options and the server instance.
 * @returns {import('socket.io').ServerOptions} return.options - The final options object used to create the WebSocket server.
 * @returns {import('socket.io').Server} return.ioServer - The created and listening WebSocket server instance (wrapped by the listening server factory).
 * @returns {object} return.meta - The module's import meta object (`import.meta`).
 * @memberof SocketIoServer
 */
const IoServer = (httpServer, options = {}, Connection = () => {}) => {
  const wsOptions = {
    cors: {
      // origin: `http://localhost:${options.port}`,
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
    path: options.path !== '/' ? `${options.path}/socket.io/` : '/socket.io',
  };
  return {
    options: wsOptions,
    meta: import.meta,
    ioServer: new Server(httpServer, wsOptions).on('connection', Connection),
  };
};

export { IoServer };
