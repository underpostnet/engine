'use strict';

import express from 'express';
import fs from 'fs-extra';
import dotenv from 'dotenv';

import { createProxyMiddleware } from 'http-proxy-middleware';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { listenPortController, network } from './network.js';
import { newInstance, orderArrayFromAttrInt, range } from '../client/components/core/CommonJs.js';
import { Xampp } from '../runtime/xampp/Xampp.js';
import { Lampp } from '../runtime/lampp/Lampp.js';
import { createSslServer, sslRedirectMiddleware } from './ssl.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const buildProxy = async () => {
  let currentPort = parseInt(process.env.PORT);

  // default target
  const defaultTargetPort = newInstance(currentPort);
  currentPort++;
  await network.port.portClean(defaultTargetPort);
  express().listen(defaultTargetPort);

  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const proxyRouter = {};
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      switch (confServer[host][path].runtime) {
        case 'xampp':
          if (!Xampp.enabled()) continue;
          break;
        case 'lampp':
          if (!Lampp.enabled()) continue;
          break;
        default:
          break;
      }
      confServer[host][path].port = newInstance(currentPort);
      for (const port of confServer[host][path].proxy) {
        if (!(port in proxyRouter)) proxyRouter[port] = {};
        proxyRouter[port][`${host}${path}`] = {
          // target: `http://${host}:${confServer[host][path].port}${path}`,
          target: `http://localhost:${confServer[host][path].port}`,
          // target: `http://127.0.0.1:${confServer[host][path].port}`,
          proxy: confServer[host][path].proxy,
          redirect: confServer[host][path].redirect,
          host,
          path,
        };
      }
      currentPort++;
      if (confServer[host][path].peer) {
        const peerPath = path === '/' ? `/peer` : `${path}/peer`;
        confServer[host][peerPath] = newInstance(confServer[host][path]);
        confServer[host][peerPath].port = newInstance(currentPort);
        for (const port of confServer[host][path].proxy) {
          if (!(port in proxyRouter)) proxyRouter[port] = {};
          proxyRouter[port][`${host}${peerPath}`] = {
            // target: `http://${host}:${confServer[host][peerPath].port}${peerPath}`,
            target: `http://localhost:${confServer[host][peerPath].port}`,
            // target: `http://127.0.0.1:${confServer[host][peerPath].port}`,
            proxy: confServer[host][peerPath].proxy,
            host,
            path: peerPath,
          };
        }
        currentPort++;
      }
    }
  }

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
      target: `http://localhost:${defaultTargetPort}`,
      router: {},
      xfwd: true, // adds x-forward headers
      // preserveHeaderKeyCase: true,
      // secure: true, warn validator
      onProxyReq: (proxyReq, req, res, options) => {
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

    // order router
    const router = {};
    for (const absoluteHostKey of orderArrayFromAttrInt(Object.keys(options.router), 'length'))
      router[absoluteHostKey] = options.router[absoluteHostKey];
    options.router = router;

    if (Object.keys(options.router).length === 0) continue;

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
