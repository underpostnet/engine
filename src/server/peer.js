/**
 * Module for peerjs server management.
 * Initializes and configures the PeerJS server instance, typically running
 * alongside a main Node.js application.
 *
 * @module src/server/peer.js
 * @namespace Peer
 */

import { PeerServer } from 'peer';
import dotenv from 'dotenv';
import { loggerFactory } from './logger.js';
import UnderpostStartUp from './start.js';

dotenv.config();

/**
 * Logger instance for this module, utilizing the framework's factory.
 * @type {function(*): void}
 * @memberof Peer
 * @private
 */
const logger = loggerFactory(import.meta);

// Documentation references:
// https://github.com/peers/peerjs
// https://github.com/peers/peerjs-server

/**
 * Creates and starts a configured PeerJS server instance.
 *
 * This function handles port configuration, CORS origins, and paths, then uses
 * a listener factory to start the server.
 *
 * @async
 * @function createPeerServer
 * @memberof Peer
 * @param {object} config - Configuration object for the PeerJS server setup.
 * @param {number} config.port - The primary port on which the PeerJS server will listen.
 * @param {number} [config.devPort] - Optional development port. If provided and in 'development' NODE_ENV, 'http://localhost:${devPort}' is added to allowed origins.
 * @param {string[]} config.origins - An array of allowed domain origins for Cross-Origin Resource Sharing (CORS).
 * @param {string} config.host - The host address the server is bound to (used internally for configuration).
 * @param {string} config.path - The base path for the API. The PeerJS path ('/peer') will be appended to this.
 * @returns {Promise<object>} A promise that resolves to an object containing the final configuration and the server instance.
 * @returns {import('peer').IConfig} return.options - The final options object used to create the PeerServer.
 * @returns {import('peer').Server} return.peerServer - The created and listening PeerServer instance (wrapped by the listening server factory).
 * @returns {object} return.meta - The module's import meta object (`import.meta`).
 */
const createPeerServer = async ({ port, devPort, origins, host, path }) => {
  if (process.env.NODE_ENV === 'development' && devPort) {
    logger.warn(`Adding development origin: http://localhost:${devPort}`);
    origins.push(`http://localhost:${devPort}`);
  }

  /** @type {import('peer').IConfig} */
  const options = {
    port,
    // Ensure the path is correctly formatted, handling the root path case
    path: `${path === '/' ? '' : path}/peer`,
    corsOptions: {
      origin: origins,
    },
    proxied: true,
    // key: fs.readFileSync(''), // Example for HTTPS/SSL
    // cert: fs.readFileSync(''), // Example for HTTPS/SSL
    // ca: fs.readFileSync(''),   // Example for HTTPS/SSL
  };

  // Use the framework's factory to listen on the server, ensuring graceful startup/shutdown
  const peerServer = UnderpostStartUp.API.listenServerFactory(() => PeerServer(options));

  return { options, peerServer, meta: import.meta };
};

export { createPeerServer };
