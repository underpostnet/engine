'use strict';

import express from 'express';
import dotenv from 'dotenv';

import { createProxyMiddleware } from 'http-proxy-middleware';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { createSslServer, sslRedirectMiddleware } from './ssl.js';
import { buildPortProxyRouter, buildProxyRouter } from './conf.js';
import UnderpostStartUp from './start.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const buildProxy = async () => {
  // default target

  express().listen(process.env.PORT);

  const proxyRouter = buildProxyRouter();

  for (let port of Object.keys(proxyRouter)) {
    port = parseInt(port);
    const hosts = proxyRouter[port];
    const proxyPath = '/';
    const proxyHost = 'localhost';
    const runningData = { host: proxyHost, path: proxyPath, client: null, runtime: 'nodejs', meta: import.meta };
    const app = express();

    // set logger
    app.use(loggerMiddleware(import.meta));

    // instance proxy options
    // https://github.com/chimurai/http-proxy-middleware/tree/v2.0.4#readme

    // proxy middleware options
    /** @type {import('http-proxy-middleware/dist/types').Options} */
    const options = {
      ws: true,
      // changeOrigin: true,
      // autoRewrite: false,
      target: `http://localhost:${process.env.PORT}`,
      router: {},
      xfwd: true, // adds x-forward headers
      // preserveHeaderKeyCase: true,
      // secure: true, warn validator
      onProxyReq: (proxyReq, req, res, options) => {
        // https://wtools.io/check-http-status-code
        // http://nexodev.org
        sslRedirectMiddleware(req, res, port, proxyRouter);
      },
      pathRewrite: {
        // only add path
        // '^/target-path': '/',
      },
    };
    options.router = buildPortProxyRouter(port, proxyRouter);

    const filter = false
      ? (pathname, req) => {
          // return pathname.match('^/api') && req.method === 'GET';
          return true;
        }
      : proxyPath;
    app.use(proxyPath, createProxyMiddleware(filter, options));

    switch (process.env.NODE_ENV) {
      case 'production':
        switch (port) {
          case 443:
            const { ServerSSL } = await createSslServer(app, hosts);
            await UnderpostStartUp.API.listenPortController(ServerSSL, port, runningData);
            break;

          default:
            await UnderpostStartUp.API.listenPortController(app, port, runningData);

            break;
        }

        break;

      default:
        await UnderpostStartUp.API.listenPortController(app, port, runningData);

        break;
    }
    logger.info('Proxy running', { port, options });
  }
};

export { buildProxy };
