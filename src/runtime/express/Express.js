/**
 * A service dedicated to creating and configuring an Express.js application
 * instance based on server configuration data.
 * @module src/runtime/express/Express.js
 * @namespace ExpressService
 */

import fs from 'fs-extra';
import express from 'express';
import fileUpload from 'express-fileupload';
import swaggerUi from 'swagger-ui-express';
import compression from 'compression';
import { createServer } from 'http';

import { loggerFactory, loggerMiddleware } from '../../server/logger.js';
import { getCapVariableName, newInstance } from '../../client/components/core/CommonJs.js';
import { MailerProvider } from '../../mailer/MailerProvider.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { createPeerServer } from '../../server/peer.js';
import { createValkeyConnection } from '../../server/valkey.js';
import { applySecurity, authMiddlewareFactory } from '../../server/auth.js';
import { ssrMiddlewareFactory } from '../../server/ssr.js';
import { buildSwaggerUiOptions } from '../../server/client-build-docs.js';

import { shellExec } from '../../server/process.js';
import { devProxyHostFactory, isDevProxyContext, isTlsDevProxy } from '../../server/conf.js';

import Underpost from '../../index.js';

const logger = loggerFactory(import.meta);

/**
 * @class ExpressService
 * @description A service dedicated to creating and configuring an Express.js application
 * instance based on server configuration data.
 * @memberof ExpressService
 */
class ExpressService {
  /**
   * Creates and configures a complete Express application instance for a specific host/path configuration.
   *
   * @method createApp
   * @memberof ExpressService
   * @param {string} config.host - The host name for the instance (e.g., 'www.example.com').
   * @param {string} config.path - The URL path for the instance (e.g., '/', '/api/v1').
   * @param {number} config.port - The primary listening port for the instance.
   * @param {string} config.client - The client associated with the instance (used for SSR/Mailer configuration lookup).
   * @param {string[]} [config.apis] - A list of API names to load and attach routers for.
   * @param {string[]} config.origins - Allowed origins for CORS.
   * @param {string} [config.directory] - The directory for static files (if overriding default).
   * @param {boolean} [config.useLocalSsl] - Whether to use local SSL for the instance.
   * @param {string} [config.ws] - The WebSocket server name to use.
   * @param {object} [config.mailer] - Mailer configuration.
   * @param {object} [config.db] - Database configuration.
   * @param {string} [config.redirect] - URL or flag to indicate an HTTP redirect should be configured.
   * @param {boolean} [config.peer] - Whether to enable the peer server.
   * @param {object} [config.valkey] - Valkey connection configuration.
   * @param {string} [config.apiBaseHost] - Base host for the API (if running separate API).
   * @param {string} config.redirectTarget - The full target URL for redirection (used if `redirect` is true).
   * @param {string} config.rootHostPath - The root path for public host assets (e.g., `/public/hostname`).
   * @param {object} config.confSSR - The SSR configuration object, used to look up Mailer templates.
   * @param {import('prom-client').Counter<string>} config.promRequestCounter - Prometheus request counter instance.
   * @param {import('prom-client').Registry} config.promRegister - Prometheus register instance for metrics.
   * @returns {Promise<{portsUsed: number}>} An object indicating how many additional ports were used (e.g., for PeerServer).
   */
  async createApp({
    host,
    path,
    port,
    client,
    apis,
    origins,
    directory,
    useLocalSsl,
    ws,
    mailer,
    db,
    redirect,
    peer,
    valkey,
    apiBaseHost,
    redirectTarget,
    rootHostPath,
    confSSR,
    promRequestCounter,
    promRegister,
  }) {
    let portsUsed = 0;
    const runningData = {
      host,
      path,
      runtime: 'nodejs',
      client,
      meta: import.meta,
      apis,
    };

    const app = express();

    if (origins && isDevProxyContext())
      origins.push(devProxyHostFactory({ host, includeHttp: true, tls: isTlsDevProxy() }));
    app.set('trust proxy', true);

    app.use((req, res, next) => {
      res.on('finish', () => {
        promRequestCounter.inc({
          instance: `${host}:${port}${path}`,
          method: req.method,
          status_code: res.statusCode,
        });
      });
      return next();
    });

    // Metrics endpoint
    app.get(`${path === '/' ? '' : path}/metrics`, async (req, res) => {
      res.set('Content-Type', promRegister.contentType);
      return res.end(await promRegister.metrics());
    });

    // Logging, Compression, and Body Parsers
    app.use(loggerMiddleware(import.meta));
    app.use(compression({ filter: (req, res) => !req.headers['x-no-compression'] && compression.filter(req, res) }));
    app.use(express.json({ limit: '100MB' }));
    app.use(express.urlencoded({ extended: true, limit: '20MB' }));
    app.use(fileUpload());

    if (process.env.NODE_ENV === 'development') app.set('json spaces', 2);

    // Language handling middleware
    app.use((req, res, next) => {
      const lang = req.headers['accept-language'] || 'en';
      req.lang = typeof lang === 'string' && lang.toLowerCase().match('es') ? 'es' : 'en';
      return next();
    });

    // Static file serving
    app.use('/', express.static(directory ? directory : `.${rootHostPath}`));

    // Handle redirection-only instances
    if (redirect) {
      app.use((req, res, next) => {
        if (process.env.NODE_ENV === 'production' && !req.url.startsWith(`/.well-known/acme-challenge`)) {
          return res.status(302).redirect(redirectTarget + req.url);
        }
        return next();
      });
      await Underpost.start.listenPortController(app, port, runningData);
      return { portsUsed };
    }

    // Create HTTP server for regular instances (required for WebSockets)
    const server = createServer({}, app);

    if (!apiBaseHost) {
      // Swagger path definition
      const swaggerJsonPath = `./public/${host}${path === '/' ? path : `${path}/`}swagger-output.json`;
      const swaggerPath = `${path === '/' ? `/api-docs` : `${path}/api-docs`}`;

      // Flag swagger requests before security middleware
      if (fs.existsSync(swaggerJsonPath)) {
        app.use(swaggerPath, (req, res, next) => {
          res.locals.isSwagger = true;
          next();
        });
      }

      // Swagger UI setup
      if (fs.existsSync(swaggerJsonPath)) {
        const swaggerDoc = JSON.parse(fs.readFileSync(swaggerJsonPath, 'utf8'));
        const swaggerUiOptions = await buildSwaggerUiOptions();
        app.use(swaggerPath, swaggerUi.serve, swaggerUi.setup(swaggerDoc, swaggerUiOptions));
      }

      // Security and CORS
      if (process.env.NODE_ENV === 'development' && useLocalSsl)
        origins = origins.map((origin) => origin.replace('http', 'https'));

      applySecurity(app, {
        origin: origins,
      });

      // Database and Valkey connections
      if (db && apis) await DataBaseProvider.load({ apis, host, path, db });

      if (valkey) await createValkeyConnection({ host, path }, valkey);

      // Mailer setup
      if (mailer) {
        const mailerSsrConf = confSSR[getCapVariableName(client)];
        await MailerProvider.load({
          id: `${host}${path}`,
          meta: `mailer-${host}${path}`,
          host,
          path,
          ...mailer,
          templates: mailerSsrConf ? mailerSsrConf.mailer : {},
        });
      }

      // API router loading
      if (apis && apis.length > 0) {
        const authMiddleware = authMiddlewareFactory({ host, path });
        const apiPath = `${path === '/' ? '' : path}/${process.env.BASE_API}`;
        for (const api of apis) {
          logger.info(`Build api server`, `${host}${apiPath}/${api}`);
          const { ApiRouter } = await import(`../../api/${api}/${api}.router.js`);
          const router = ApiRouter({ app, host, path, apiPath, mailer, db, authMiddleware, origins });
          app.use(`${apiPath}/${api}`, router);
        }
      }

      // WebSocket server setup
      if (ws) {
        const { createIoServer } = await import(`../../ws/${ws}/${ws}.ws.server.js`);
        const { options, meta, ioServer } = await createIoServer(server, { host, path, db, port, origins });

        // Listen on the main port for the WS server
        await Underpost.start.listenPortController(ioServer, port, {
          runtime: 'nodejs',
          client: null,
          host,
          path: options.path,
          meta,
        });
      }

      // Peer server setup
      if (peer) {
        portsUsed++; // Peer server uses one additional port
        const peerPort = newInstance(port + portsUsed); // portsUsed is 1 here
        const { options, meta, peerServer } = await createPeerServer({
          port: peerPort,
          origins,
          path,
        });
        await Underpost.start.listenPortController(peerServer, peerPort, {
          runtime: 'nodejs',
          client: null,
          host,
          path: options.path,
          meta,
        });
      }
    }

    // SSR middleware loading
    const ssr = await ssrMiddlewareFactory({ app, directory, rootHostPath, path });
    for (const [_, ssrMiddleware] of Object.entries(ssr)) app.use(ssrMiddleware);

    // Start listening on the main port
    if (useLocalSsl && process.env.NODE_ENV === 'development') {
      if (!Underpost.tls.validateSecureContext()) shellExec(`node bin/deploy tls`);
      const { ServerSSL } = await Underpost.tls.createSslServer(app);
      await Underpost.start.listenPortController(ServerSSL, port, runningData);
    } else await Underpost.start.listenPortController(server, port, runningData);

    return { portsUsed };
  }
}

export default new ExpressService();
