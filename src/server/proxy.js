/**
 * @namespace Proxy
 * @description Manages the creation and configuration of the reverse proxy server,
 * including handling HTTP/HTTPS listeners and routing based on host configuration.
 * @memberof src/server/proxy.js
 */
'use strict';

import express from 'express';
import dotenv from 'dotenv';

import { createProxyMiddleware } from 'http-proxy-middleware';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { Ssl } from './ssl.js';
import { buildPortProxyRouter, buildProxyRouter } from './conf.js';
import UnderpostStartUp from './start.js';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * Main class for building and running the proxy server.
 * All utility methods are implemented as static to serve as a namespace container.
 * @class
 * @augments Proxy
 * @memberof Proxy
 */
class Proxy {
  /**
   * Initializes and starts the reverse proxy server for all configured ports and hosts.
   * @async
   * @static
   * @memberof Proxy
   * @returns {Promise<void>}
   */
  static async buildProxy() {
    // Start a default Express listener on process.env.PORT (potentially unused, but ensures Express is initialized)
    express().listen(process.env.PORT);

    const proxyRouter = buildProxyRouter();

    for (let port of Object.keys(proxyRouter)) {
      port = parseInt(port);
      const hosts = proxyRouter[port];
      const proxyPath = '/';
      const proxyHost = 'localhost';
      const runningData = { host: proxyHost, path: proxyPath, client: null, runtime: 'nodejs', meta: import.meta };
      const app = express();

      // Set logger middleware
      app.use(loggerMiddleware(import.meta));

      // Proxy middleware options
      /** @type {import('http-proxy-middleware/dist/types').Options} */
      const options = {
        ws: true, // Enable websocket proxying
        target: `http://localhost:${process.env.PORT}`, // Default target (should be overridden by router)
        router: {},
        xfwd: true, // Adds x-forward headers (Host, Proto, etc.)
        onProxyReq: (proxyReq, req, res, options) => {
          // Use the static method from the Ssl class for redirection logic
          Ssl.sslRedirectMiddleware(req, res, port, proxyRouter);
        },
        pathRewrite: {
          // Add path rewrite rules here if necessary
        },
      };

      options.router = buildPortProxyRouter(port, proxyRouter);

      const filter = proxyPath; // Use '/' as the general filter
      app.use(proxyPath, createProxyMiddleware(filter, options));

      // Determine which server to start (HTTP or HTTPS) based on port and environment
      switch (process.env.NODE_ENV) {
        case 'production':
          switch (port) {
            case 443:
              // For port 443 (HTTPS), create the SSL server
              const { ServerSSL } = await Ssl.createSslServer(app, hosts);
              await UnderpostStartUp.API.listenPortController(ServerSSL, port, runningData);
              break;

            default:
              // For other ports in production, use standard HTTP
              await UnderpostStartUp.API.listenPortController(app, port, runningData);
              break;
          }
          break;

        default:
          // In non-production, always use standard HTTP listener
          await UnderpostStartUp.API.listenPortController(app, port, runningData);
          break;
      }
      logger.info('Proxy running', { port, options });
    }
  }
}

// Backward compatibility export
/** @type {function(): Promise<void>} */
const buildProxy = Proxy.buildProxy;

export { Proxy, buildProxy };
