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
import { matchPathRoute } from './path-routes.js';
import { LOCAL_SSL_ROOT, TLS } from './tls.js';
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

/** The path of a URL, never its query: a query may carry a code or a token. */
const pathnameOf = (url = '/') => new URL(url, 'http://route.invalid').pathname;

/**
 * @method pathRouteForwarderFactory
 * @description Forwards the requests a route plan matches to the local port of their destination,
 * with the public host, path, query and body of the request, and answers a redirect match with a
 * `308` to the same path and query on the public origin of its destination: `https://<host>`, or
 * `http://localhost:<port>` in development. A request no route matches goes on to the host path
 * itself. The forwarder routes where no gateway routes the plan first. Each routed request logs
 * its route, destination, port, status and redirect path.
 * @param {ReturnType<typeof import('./path-routes.js').pathRoutePlan>} plan - The route plan of one host path.
 * @param {{development?: boolean}} [options]
 * @returns {{middleware: import('express').RequestHandler, attach: (server: import('http').Server) => void}}
 *   The middleware for requests, and the hook that forwards the upgrades of a listening server.
 * @memberof ProxyService
 */
const pathRouteForwarderFactory = (plan, { development = false } = {}) => {
  const proxy = createProxyServer({ xfwd: true });
  const entries = new WeakMap();
  const matched = (req) => {
    const entry = matchPathRoute(plan, req.url);
    if (entry) entries.set(req, entry);
    return entry;
  };
  const target = (entry) => `http://127.0.0.1:${entry.destination.port}`;
  const redirectOrigin = ({ destination }) =>
    development ? `http://localhost:${destination.port}` : `https://${destination.host}`;
  const diagnostic = (req) => {
    const { route, kind, destination } = entries.get(req) ?? {};
    return {
      host: req.headers.host,
      path: pathnameOf(req.url),
      route,
      kind,
      destination: destination && `${destination.host}${destination.path}:${destination.port}`,
    };
  };

  proxy.on('error', (error, req, res) => {
    logger.error('Path route failed', { ...diagnostic(req), code: error.code || error.message });
    if (typeof res?.writeHead !== 'function') return res?.destroy?.();
    if (res.headersSent) return res.end();
    const status = proxyErrorStatusFactory(error.code);
    if (entries.get(req)?.service)
      return res
        .writeHead(status, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ status: 'error', message: 'The destination of the path route is unreachable' }));
    res.writeHead(status, { 'Content-Type': 'text/plain' }).end('The destination of the path route is unreachable');
  });
  proxy.on('proxyRes', (proxyRes, req) =>
    logger.info('Path route', {
      ...diagnostic(req),
      status: proxyRes.statusCode,
      ...(proxyRes.headers.location ? { location: pathnameOf(proxyRes.headers.location) } : undefined),
    }),
  );

  return {
    middleware: (req, res, next) => {
      const entry = matched(req);
      if (!entry) return next();
      if (entry.redirect) {
        const location = `${redirectOrigin(entry)}${req.url}`;
        logger.info('Path route', { ...diagnostic(req), status: 308, location: pathnameOf(location) });
        return res.set('Cache-Control', 'no-cache').redirect(308, location);
      }
      proxy.web(req, res, { target: target(entry) }).catch((error) => proxy.emit('error', error, req, res));
    },
    attach: (server) =>
      server.on('upgrade', (req, socket, head) => {
        const entry = matched(req);
        if (entry?.protocol === 'websocket')
          proxy
            .ws(req, socket, { target: target(entry) }, head)
            .catch((error) => proxy.emit('error', error, req, socket));
      }),
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
            TLS.ensureLocalCertificate(tlsHost);
            tlsHosts[tlsHost] = {};
          }
          ({ ServerSSL: server } = await TLS.createSslServer(app, tlsHosts, { root: LOCAL_SSL_ROOT }));
        } else ({ ServerSSL: server } = await TLS.createSslServer(app, hosts));
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

export {
  ProxyService,
  buildProxy,
  pathRouteForwarderFactory,
  proxyErrorStatusFactory,
  proxyMiddlewareFactory,
  proxyTargetFactory,
};
