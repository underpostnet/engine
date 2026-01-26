/**
 * Manages the creation and configuration of the reverse proxy server,
 * including handling HTTP/HTTPS listeners and routing based on host configuration.
 * @module src/server/proxy.js
 * @namespace ProxyService
 */
'use strict';

import express from 'express';
import dotenv from 'dotenv';

import { createProxyMiddleware } from 'http-proxy-middleware';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { buildPortProxyRouter, buildProxyRouter, getTlsHosts, isDevProxyContext, isTlsDevProxy } from './conf.js';

import { SSL_BASE, TLS } from './tls.js';
import { shellExec } from './process.js';
import fs from 'fs-extra';

import Underpost from '../index.js';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * Main class for building and running the proxy server.
 * All utility methods are implemented as static to serve as a namespace container.
 * @class ProxyService
 * @memberof ProxyService
 */
class ProxyService {
  /**
   * Builds and starts the proxy server with appropriate routing and SSL configuration.
   * @static
   * @returns {Promise<void>} Resolves when the server is successfully started.
   */
  static async build() {
    if (process.env.NODE_ENV === 'production') process.env.DEV_PROXY_PORT_OFFSET = 0;

    // Start a default Express listener on process.env.PORT (potentially unused, but ensures Express is initialized)
    process.env.PORT = parseInt(process.env.PORT) + parseInt(process.env.DEV_PROXY_PORT_OFFSET);
    express().listen(process.env.PORT);

    const proxyRouter = buildProxyRouter();

    for (let port of Object.keys(proxyRouter)) {
      const hosts = proxyRouter[port];
      port = parseInt(port) + parseInt(process.env.DEV_PROXY_PORT_OFFSET);
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
        target: `http://localhost:${parseInt(process.env.PORT - 1)}`, // Default target (should be overridden by router)
        router: {},
        // changeOrigin: true,
        logLevel: 'debug',
        xfwd: true, // Adds x-forward headers (Host, Proto, etc.)
        onProxyReq: (proxyReq, req, res, options) => {},
        pathRewrite: {},
      };

      options.router = buildPortProxyRouter({
        port,
        proxyRouter,
        hosts,
        orderByPathLength: true,
        devProxyContext: process.env.NODE_ENV !== 'production',
      });

      const filter = proxyPath; // Use '/' as the general filter
      app.use(proxyPath, createProxyMiddleware(filter, options));

      // Determine which server to start (HTTP or HTTPS) based on port and environment
      switch (process.env.NODE_ENV) {
        case 'production':
          switch (port) {
            case 443:
              // For port 443 (HTTPS), create the SSL server
              const { ServerSSL } = await TLS.createSslServer(app, hosts);
              await Underpost.start.listenPortController(ServerSSL, port, runningData);
              break;

            default:
              // For other ports in production, use standard HTTP
              await Underpost.start.listenPortController(app, port, runningData);
              break;
          }
          break;

        default:
          switch (port) {
            case 443: {
              let tlsHosts = hosts;
              if (isDevProxyContext() && isTlsDevProxy()) {
                tlsHosts = {};
                for (const tlsHost of getTlsHosts(hosts)) {
                  if (fs.existsSync(SSL_BASE(tlsHost))) fs.removeSync(SSL_BASE(tlsHost));
                  if (!TLS.validateSecureContext(tlsHost)) shellExec(`node bin/deploy tls "${tlsHost}"`);
                  tlsHosts[tlsHost] = {};
                }
              }
              const { ServerSSL } = await TLS.createSslServer(app, tlsHosts);
              await Underpost.start.listenPortController(ServerSSL, port, runningData);
              break;
            }
            default: // In non-production, always use standard HTTP listener
              await Underpost.start.listenPortController(app, port, runningData);
              break;
          }
      }
      logger.info('Proxy running', { port, options });
      if (process.env.NODE_ENV === 'development')
        logger.info(
          Underpost.deploy.etcHostFactory(Object.keys(options.router), {
            append: true,
          }).renderHosts,
        );
    }
  }
}

/**
 * Backward compatibility export
 * @type {function(): Promise<void>}
 * @memberof ProxyService
 */
const buildProxy = ProxyService.build;

export { ProxyService, buildProxy };
