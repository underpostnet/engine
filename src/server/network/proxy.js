/**
 * Manages the creation and configuration of the reverse proxy server,
 * including handling HTTP/HTTPS listeners and routing based on host configuration.
 * @module src/server/network/proxy.js
 * @namespace ProxyService
 */
'use strict';

import express from 'express';
import { createProxyServer } from 'httpxy';
import { loggerFactory, loggerMiddleware } from '../ops/logger.js';
import { etcHostFactory, getTlsHosts, isDevProxyContext, isTlsDevProxy } from '../runtime/conf.js';
import { buildPortProxyRouter, buildProxyRouter } from './router.js';
import Underpost from '../../index.js';

const logger = loggerFactory(import.meta);

/**
 * @method proxyTargetFactory
 * @description The target a router table assigns to a request; the first matching key wins.
 * A `host` key needs the same Host header, a `host/path` key also needs the URL to start with the
 * path, and a `/path` key needs only that.
 * @param {Object<string, string>} [router] - Router table, in priority order.
 * @param {{host?: string, url?: string}} [request] - Host header and request URL.
 * @returns {string|undefined} Target URL, or undefined when no key matches.
 * @memberof ProxyService
 */
const proxyTargetFactory = (router = {}, { host = '', url = '' } = {}) => {
  for (const [key, target] of Object.entries(router)) {
    const slash = key.indexOf('/');
    if (slash === -1 ? key === host : (slash === 0 || key.slice(0, slash) === host) && url.startsWith(key.slice(slash)))
      return target;
  }
  return undefined;
};

/**
 * @method proxyErrorStatusFactory
 * @description The status a failed proxy request answers with; an unreachable target is a gateway timeout.
 * @param {string} [code] - Error code.
 * @returns {number} HTTP status.
 * @memberof ProxyService
 */
const proxyErrorStatusFactory = (code = '') =>
  /HPE_INVALID/.test(code) ? 502 : ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(code) ? 504 : 500;

/**
 * @method proxyMiddlewareFactory
 * @description Express middleware that forwards every request to the target the router table
 * selects, else to `target`.
 *
 * WebSocket upgrades are taken over from the server the first proxied request arrives on, so
 * TLS and plain listeners need no extra wiring.
 * @param {object} params
 * @param {string} params.target - Default target.
 * @param {Object<string, string>} [params.router] - Router table, in priority order.
 * @param {boolean} [params.ws] - Proxy WebSocket upgrades.
 * @param {boolean} [params.xfwd] - Add the X-Forwarded headers.
 * @param {object} [params.logger] - Logger for proxied responses and proxy errors.
 * @returns {Function} Express middleware.
 * @memberof ProxyService
 */
const proxyMiddlewareFactory = ({ target, router = {}, ws = false, xfwd = false, logger: proxyLogger = logger }) => {
  const proxy = createProxyServer({});
  const targets = new WeakMap();
  const upgradeServers = new WeakSet();
  const optionsFactory = (req) => {
    const selected = proxyTargetFactory(router, { host: req.headers.host, url: req.url }) || target;
    targets.set(req, selected);
    return { target: selected, ws, xfwd };
  };
  const escape = (value = '') => `${value}`.replace(/[<>]/g, (character) => encodeURIComponent(character));

  proxy.on('error', (error, req, res) => {
    proxyLogger.error('Proxy request failed', {
      request: `${req?.headers?.host}${req?.url}`,
      target: targets.get(req),
      code: error.code || error.message,
    });
    if (typeof res?.writeHead !== 'function') return res?.destroy?.();
    if (!res.headersSent) res.writeHead(proxyErrorStatusFactory(error.code));
    res.end(`Error occurred while trying to proxy: ${escape(req.headers.host)}${escape(req.url)}`);
  });
  proxy.on('proxyRes', (proxyRes, req) =>
    proxyLogger.info(
      `${req.method} ${req.originalUrl ?? req.url} -> ${new URL(proxyRes.req.path, targets.get(req))} [${proxyRes.statusCode}]`,
    ),
  );

  const upgrade = (req, socket, head) =>
    proxy.ws(req, socket, optionsFactory(req), head).catch((error) => proxy.emit('error', error, req, socket));

  return (req, res) => {
    const server = req.socket?.server;
    if (ws && server && !upgradeServers.has(server)) {
      upgradeServers.add(server);
      server.on('upgrade', upgrade);
    }
    proxy.web(req, res, optionsFactory(req)).catch((error) => proxy.emit('error', error, req, res));
  };
};

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

    for (const confPort of Object.keys(proxyRouter)) {
      const hosts = proxyRouter[confPort];
      // The configured port decides TLS; the dev offset only moves where the proxy listens.
      const port = parseInt(confPort) + parseInt(process.env.DEV_PROXY_PORT_OFFSET);
      const proxyPath = '/';
      const proxyHost = 'localhost';
      const runningData = { host: proxyHost, path: proxyPath, client: null, runtime: 'nodejs', meta: import.meta };
      const app = express();

      // Set logger middleware
      app.use(loggerMiddleware(import.meta));

      const options = {
        target: `http://localhost:${parseInt(process.env.PORT - 1)}`,
        router: buildPortProxyRouter({
          port,
          proxyRouter,
          hosts,
          orderByPathLength: true,
          devProxyContext: process.env.NODE_ENV !== 'production',
        }),
        ws: true,
        xfwd: true,
      };

      app.use(proxyPath, proxyMiddlewareFactory(options));

      let server = app;
      if (parseInt(confPort) === 443) {
        if (process.env.NODE_ENV !== 'production' && isDevProxyContext() && isTlsDevProxy()) {
          // A dev proxy serves this machine's own certificates, never the stored ones of the real domain.
          const tlsHosts = {};
          for (const tlsHost of getTlsHosts(hosts)) {
            Underpost.tls.ensureLocalCertificate(tlsHost);
            tlsHosts[tlsHost] = {};
          }
          ({ ServerSSL: server } = await Underpost.tls.createSslServer(app, tlsHosts, {
            root: Underpost.tls.LOCAL_SSL_ROOT,
          }));
        } else ({ ServerSSL: server } = await Underpost.tls.createSslServer(app, hosts));
      }
      await Underpost.start.listenPortController(server, port, runningData);
      logger.info('Proxy running', { port, router: options.router });
      if (process.env.NODE_ENV === 'development')
        logger.info(
          etcHostFactory(Object.keys(options.router), {
            blockId: `dev-proxy-${port}`,
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

export { ProxyService, buildProxy, proxyErrorStatusFactory, proxyMiddlewareFactory, proxyTargetFactory };
