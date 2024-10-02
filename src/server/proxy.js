'use strict';

import express from 'express';
import fs from 'fs-extra';
import dotenv from 'dotenv';

import { createProxyMiddleware } from 'http-proxy-middleware';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { listenPortController, network } from './network.js';
import { orderArrayFromAttrInt } from '../client/components/core/CommonJs.js';
import { createSslServer, sslRedirectMiddleware } from './ssl.js';
import { buildProxyRouter } from './conf.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const buildProxy = async () => {
  // default target
  await network.port.portClean(process.env.PORT);
  express().listen(process.env.PORT);

  const proxyRouter = buildProxyRouter();

  for (let port of Object.keys(proxyRouter)) {
    port = parseInt(port);
    const hosts = proxyRouter[port];
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

    // build router
    Object.keys(hosts).map((hostKey) => {
      let { host, path, target, proxy, peer } = hosts[hostKey];
      if (process.env.NODE_ENV === 'development') host = `localhost`;

      if (!proxy.includes(port)) return;
      const absoluteHost = [80, 443].includes(port)
        ? `${host}${path === '/' ? '' : path}`
        : `${host}:${port}${path === '/' ? '' : path}`;

      if (!(absoluteHost in options.router)) options.router[absoluteHost] = target;
    });
    if (Object.keys(options.router).length === 0) continue;

    // order router
    const router = {};
    for (const absoluteHostKey of orderArrayFromAttrInt(Object.keys(options.router), 'length'))
      router[absoluteHostKey] = options.router[absoluteHostKey];
    options.router = router;

    // instance proxy server
    const proxyPath = '/';
    const proxyHost = 'localhost';

    const filter = false
      ? (pathname, req) => {
          // return pathname.match('^/api') && req.method === 'GET';
          return true;
        }
      : proxyPath;
    app.use(proxyPath, createProxyMiddleware(filter, options));
    await network.port.portClean(port);

    const runningData = { host: proxyHost, path: proxyPath, client: null, runtime: 'nodejs', meta: import.meta };

    switch (process.env.NODE_ENV) {
      case 'production':
        switch (port) {
          case 443:
            const { ServerSSL } = await createSslServer(app, hosts);
            await listenPortController(ServerSSL, port, runningData);
            break;

          default:
            await listenPortController(app, port, runningData);

            break;
        }

        break;

      default:
        await listenPortController(app, port, runningData);

        break;
    }
    logger.info('Proxy running', { port, options });
  }
};

export { buildProxy };
