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
      if (confServer[host][path].disabled) continue;
      confServer[host][path].port = newInstance(currentPort);
      for (const port of confServer[host][path].proxy) {
        if (!(port in proxyRouter)) proxyRouter[port] = {};
        proxyRouter[port][`${host}${path}`] = {
          // target: `http://${host}:${confServer[host][path].port}${path}`,
          target: `http://localhost:${confServer[host][path].port}`,
          // target: `http://127.0.0.1:${confServer[host][path].port}`,
          // disabled: confServer[host][path].disabled,
          proxy: confServer[host][path].proxy,
          runtime: confServer[host][path].runtime,
        };
        if (confServer[host][path].redirect)
          proxyRouter[port][`${host}${path}`].redirect = confServer[host][path].redirect;
        if (confServer[host][path].internalRedirect)
          proxyRouter[port][`${host}${path}`].target = `http://localhost:${
            confServer[confServer[host][path].internalRedirect.host][confServer[host][path].internalRedirect.path].port
          }`;
        if (port === 443) proxyRouter[port][`${host}${path}`].forceSSL = confServer[host][path].forceSSL;
      }
      currentPort++;
    }

  // logger.info('Proxy router', proxyRouter);

  let server;
  let optionsSSL = {};
  let forceSSL = [];
  let redirects = {};

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
      pathRewrite: {
        // only add path
        // '^/target-path': '/',
      },
      onProxyReq: (proxyReq, req, res) => {
        /* handle proxyReq */
        // `[HPM][${req.method}][SSL:${req.secure}] ${req.headers.host}${req.url}
        if (`${req.headers.host}/` in redirects) return res.redirect(`http://${redirects[`${req.headers.host}/`]}`);
        if (req.headers.host in redirects) return res.redirect(`http://${redirects[req.headers.host]}`);
        if (
          !req.secure &&
          forceSSL.find((forceData) => forceData.host === req.headers.host && req.url.startsWith(forceData.path))
        )
          return res.redirect(`https://${req.headers.host}${req.url}`);
      },
    };

    // build router
    const hosts = proxyRouter[port];
    Object.keys(hosts).map((host) => {
      const { target, proxy, redirect } = hosts[host];
      if (!proxy.includes(port)) return;
      if (redirect) return (redirects[host] = redirect);
      if (host[host.length - 1] === '/') host = host.slice(0, -1);
      if ([80, 443].includes(port)) options.router[host] = target;
      else options.router[`${host.split('/')[0]}:${port}/${host.split('/')[1]}`] = target;
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
        if (hosts[host].disabled) return;
        const [hostSSL, path = ''] = host.split('/');
        if (validateSecureContext(hostSSL) && hosts[host].runtime) {
          if (!('key' in optionsSSL)) {
            optionsSSL = { ...buildSecureContext(hostSSL) };
            server = https.createServer(optionsSSL, app);
          } else server.addContext(hostSSL, buildSecureContext(hostSSL));
          if (hosts[host].forceSSL) forceSSL.push({ host: hostSSL, path: `/${path}` });
        }
      });

      if (server) await listenPortController(server, port, { port, options });
    } else await listenPortController(app, port, { port, options });
  }
  // logger.info('Force SSL', forceSSL);
  // logger.info('Redirects', redirects);
};

export { buildProxy };
