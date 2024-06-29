'use strict';

import express from 'express';
import https from 'https';
import fs from 'fs-extra';
import dotenv from 'dotenv';

import { createProxyMiddleware } from 'http-proxy-middleware';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { listenPortController, network } from './network.js';
import { newInstance, orderArrayFromAttrInt } from '../client/components/core/CommonJs.js';
import { Xampp } from '../runtime/xampp/Xampp.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const buildSSL = async (host) => {
  const sslPath = process.env.CERTBOT_LIVE_PATH;

  const files = await fs.readdir(sslPath);

  for (const folderHost of files)
    if (folderHost.match(host)) {
      const privateKeyPath = `${sslPath}/${folderHost}/privkey.pem`;
      const certificatePath = `${sslPath}/${folderHost}/cert.pem`;
      const caPath = `${sslPath}/${folderHost}/chain.pem`;
      const caFullPath = `${sslPath}/${folderHost}/fullchain.pem`;

      if (
        fs.existsSync(privateKeyPath) &&
        fs.existsSync(certificatePath) &&
        fs.existsSync(caPath) &&
        fs.existsSync(caFullPath)
      ) {
        const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        const certificate = fs.readFileSync(certificatePath, 'utf8');
        const ca = fs.readFileSync(caPath, 'utf8');
        const caFull = fs.readFileSync(caFullPath, 'utf8');

        logger.info(`SSL files update`, {
          privateKey,
          certificate,
          ca,
          caFull,
        });

        if (!fs.existsSync(`./engine-private/ssl/${host}`))
          fs.mkdirSync(`./engine-private/ssl/${host}`, { recursive: true });

        fs.writeFileSync(`./engine-private/ssl/${host}/key.key`, privateKey, 'utf8');
        fs.writeFileSync(`./engine-private/ssl/${host}/crt.crt`, certificate, 'utf8');
        fs.writeFileSync(`./engine-private/ssl/${host}/ca_bundle.crt`, caFull, 'utf8');

        fs.writeFileSync(`./engine-private/ssl/${host}/_ca_bundle.crt`, ca, 'utf8');
        fs.writeFileSync(`./engine-private/ssl/${host}/_ca_full_bundle.crt`, caFull, 'utf8');

        fs.removeSync(`${sslPath}/${host}`);
        return true;
      }
    }
  return false;
};

const validateSecureContext = async (host) => {
  await buildSSL(host);
  return (
    fs.existsSync(`./engine-private/ssl/${host}/key.key`) &&
    fs.existsSync(`./engine-private/ssl/${host}/crt.crt`) &&
    fs.existsSync(`./engine-private/ssl/${host}/ca_bundle.crt`)
  );
};

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
  for (const host of Object.keys(confServer)) {
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

    if (port === 443) {
      for (const host of Object.keys(hosts)) {
        const { redirect } = hosts[host];
        const [hostSSL, path = ''] = host.split('/');
        const validSSL = await validateSecureContext(hostSSL);
        if (validSSL) {
          if (!('key' in OptionSSL)) {
            OptionSSL = { ...buildSecureContext(hostSSL) };
            ServerSSL = https.createServer(OptionSSL, app);
          } else ServerSSL.addContext(hostSSL, buildSecureContext(hostSSL));
        }
      }

      if (ServerSSL) await listenPortController(ServerSSL, port, runningData);
    } else await listenPortController(app, port, runningData);

    logger.info('Proxy running', { port, options });
  }
};

export { buildProxy, buildSSL, validateSecureContext, buildSecureContext };
