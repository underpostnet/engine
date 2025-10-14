/**
 * Module for creating and initializing the main WebSocket server instance.
 * @module ws/core.ws.server
 * @namespace CoreWsServer
 */

'use strict';

import { IoServerClass } from '../IoServer.js';
import { CoreWsConnection } from './core.ws.connection.js';
import { CoreWsChatManagement } from './management/core.ws.chat.js';
import { CoreWsMailerManagement } from './management/core.ws.mailer.js';
import { CoreWsStreamManagement } from './management/core.ws.stream.js';
import http from 'http'; // Added for JSDoc type hinting

// https://socket.io/docs/v3/

/**
 * @class CoreWsServerClass
 * @alias CoreWsServerClass
 * @memberof CoreWsServer
 * @classdesc Manages the creation and initialization of the main WebSocket server,
 * including setting up the management instances for all channels.
 */
class CoreWsServerClass {
  /**
   * Initializes channel management instances and creates the Socket.IO server.
   *
   * @static
   * @async
   * @param {http.Server} httpServer - The HTTP server instance to attach the WebSocket server to.
   * @param {Object} options - Configuration options for the WebSocket server.
   * @param {string} options.host - The host address.
   * @param {string} options.path - The base path for the API.
   * @returns {Promise<Object>} The result object from IoServer creation.
   */
  static async create(httpServer, options) {
    const { host, path } = options;
    if (!host || !path) {
      throw new Error('Host and path must be provided in server options.');
    }

    // Create a unique identifier for this server instance's management context
    const wsManagementId = `${host}${path}`;

    // Initialize/Retrieve singleton management instances for all channels
    CoreWsChatManagement.instance(wsManagementId);
    CoreWsMailerManagement.instance(wsManagementId);
    CoreWsStreamManagement.instance(wsManagementId);

    // Use the IoServerClass factory to create the server, passing the connection handler
    return IoServerClass.create(httpServer, options, (socket) => CoreWsConnection(socket, wsManagementId));
  }
}

/**
 * Backward compatibility export for the server creation function.
 * @memberof CoreWsServer
 * @function createIoServer
 * @param {http.Server} httpServer - The HTTP server instance.
 * @param {Object} options - Configuration options.
 * @returns {Promise<Object>} The server creation result.
 */
const createIoServer = CoreWsServerClass.create;

/**
 * Backward compatibility alias.
 * @memberof CoreWsServer
 * @function CoreWsServer
 * @param {import('http').Server} httpServer - The HTTP server instance.
 * @param {Object} options - Configuration options.
 * @returns {Promise<Object>} The server creation result.
 */
const CoreWsServer = createIoServer;

export { CoreWsServerClass, createIoServer, CoreWsServer };
