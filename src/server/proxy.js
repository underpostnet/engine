'use strict';

import express from 'express';
import https from 'https';
import fs from 'fs';
import dotenv from 'dotenv';

import { createProxyMiddleware } from 'http-proxy-middleware';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { listenPortController, network } from './network.js';
import { newInstance } from '../client/components/core/CommonJs.js';
import { Xampp } from '../runtime/xampp/Xampp.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const validateSecureContext = (host) =>
  fs.existsSync(`./engine-private/ssl/${host}/key.key`) &&
  fs.existsSync(`./engine-private/ssl/${host}/crt.crt`) &&
  fs.existsSync(`./engine-private/ssl/${host}/ca_bundle.crt`);

const buildSecureContext = (host) => {
  return {
    key: fs.readFileSync(`./engine-private/ssl/${host}/key.key`, 'utf8'),
    cert: fs.readFileSync(`./engine-private/ssl/${host}/crt.crt`, 'utf8'),
    ca: fs.readFileSync(`./engine-private/ssl/${host}/ca_bundle.crt`, 'utf8'),
  };
};

const buildProxy = async () => {
  let currentPort = parseInt(process.env.PORT);

  // default target
  const defaultTargetPort = newInstance(currentPort);
  currentPort++;
  await network.port.portClean(defaultTargetPort);
  express().listen(defaultTargetPort);

  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const proxyRouter = {};
  for (const host of Object.keys(confServer))
    for (const path of Object.keys(confServer[host])) {
      switch (confServer[host][path].runtime) {
        case 'xampp':
          if (!Xampp.enabled()) continue;
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
          peer: confServer[host][path].peer,
          redirect: confServer[host][path].redirect,
        };
      }
      currentPort++;
    }

  // logger.info('Proxy router', proxyRouter);

  let ServerSSL;
  let OptionSSL = {};

  for (let port of Object.keys(proxyRouter)) {
    port = parseInt(port);
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
      // onProxyReq: (proxyReq, req, res, options) => {},
      pathRewrite: {
        // only add path
        // '^/target-path': '/',
      },
    };

    // build router
    const hosts = proxyRouter[port];
    Object.keys(hosts).map((host) => {
      const { target, proxy, peer } = hosts[host];
      if (!proxy.includes(port)) return;
      if (host[host.length - 1] === '/') host = host.slice(0, -1);
      if ([80, 443].includes(port)) {
        if (peer) options.router[`${host}/peer`] = `http://localhost:${peer.port}`;
        options.router[host] = target;
      } else options.router[`${host.split('/')[0]}:${port}/${host.split('/')[1]}`] = target;
      // options.router[`localhost:${port}/${host.split('/')[1]}`] = target;
      // options.router[`127.0.0.1:${port}/${host.split('/')[1]}`] = target;
      // options.pathRewrite[`/${host.split('/')[1]}`] = '/';
    });

    if (Object.keys(options.router).length === 0) continue;

    // instance proxy server

    const filter = false
      ? (pathname, req) => {
          // return pathname.match('^/api') && req.method === 'GET';
          return true;
        }
      : '/';
    app.use('/', createProxyMiddleware(filter, options));
    await network.port.portClean(port);
    if (port === 443) {
      Object.keys(hosts).map((host) => {
        const { redirect } = hosts[host];
        const [hostSSL, path = ''] = host.split('/');
        if (validateSecureContext(hostSSL) && !redirect) {
          if (!('key' in OptionSSL)) {
            OptionSSL = { ...buildSecureContext(hostSSL) };
            ServerSSL = https.createServer(OptionSSL, app);
          } else ServerSSL.addContext(hostSSL, buildSecureContext(hostSSL));
        }
      });

      if (ServerSSL) await listenPortController(ServerSSL, port, { port, options });
    } else await listenPortController(app, port, { port, options });
  }
};

export { buildProxy };
