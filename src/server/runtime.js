import fs from 'fs-extra';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fileUpload from 'express-fileupload';
import swaggerUi from 'swagger-ui-express';
import * as promClient from 'prom-client';
import compression from 'compression';

import { createServer } from 'http';
import { getRootDirectory } from './process.js';
import UnderpostStartUp from './start.js';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { getCapVariableName, newInstance } from '../client/components/core/CommonJs.js';
import { Xampp } from '../runtime/xampp/Xampp.js';
import { MailerProvider } from '../mailer/MailerProvider.js';
import { DataBaseProvider } from '../db/DataBaseProvider.js';
// import { createProxyMiddleware } from 'http-proxy-middleware';
import { createPeerServer } from './peer.js';
import { Lampp } from '../runtime/lampp/Lampp.js';
import { getDeployId } from './conf.js';
import { JSONweb, ssrFactory } from './client-formatted.js';
import Underpost from '../index.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const buildRuntime = async () => {
  const deployId = getDeployId();

  const collectDefaultMetrics = promClient.collectDefaultMetrics;
  collectDefaultMetrics();

  const promCounterOption = {
    name: `${deployId.replaceAll('-', '_')}_http_requests_total`,
    help: 'Total number of HTTP requests',
    labelNames: ['instance', 'method', 'status_code'],
  };

  // logger.info('promCounterOption', promCounterOption);

  const requestCounter = new promClient.Counter(promCounterOption);
  const initPort = parseInt(process.env.PORT) + 1;
  let currentPort = initPort;
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const confSSR = JSON.parse(fs.readFileSync(`./conf/conf.ssr.json`, 'utf8'));
  const singleReplicaHosts = [];
  for (const host of Object.keys(confServer)) {
    if (singleReplicaHosts.length > 0 && !singleReplicaHosts.includes(host)) {
      currentPort += singleReplicaHosts.reduce((accumulator, currentValue) => accumulator + currentValue.replicas, 0);
    }
    const rootHostPath = `/public/${host}`;
    for (const path of Object.keys(confServer[host])) {
      confServer[host][path].port = newInstance(currentPort);
      const {
        runtime,
        port,
        client,
        apis,
        origins,
        directory,
        ws,
        mailer,
        db,
        redirect,
        peer,
        singleReplica,
        replicas,
      } = confServer[host][path];

      if (singleReplica && replicas && replicas.length > 0 && !singleReplicaHosts.includes(host)) {
        singleReplicaHosts.push({
          host,
          replicas: replicas.length,
        });
        continue;
      }

      const runningData = {
        host,
        path,
        runtime,
        client,
        meta: import.meta,
        apis,
      };

      const redirectTarget = redirect
        ? redirect[redirect.length - 1] === '/'
          ? redirect.slice(0, -1)
          : redirect
        : undefined;

      // if (redirect) logger.info('redirect', new URL(redirect));

      switch (runtime) {
        case 'lampp':
          if (!Lampp.enabled()) continue;
          if (!Lampp.ports.includes(port)) Lampp.ports.push(port);
          if (currentPort === initPort) Lampp.removeRouter();
          Lampp.appendRouter(`
            
        Listen ${port}

        <VirtualHost *:${port}>    
            DocumentRoot "${directory ? directory : `${getRootDirectory()}${rootHostPath}`}"
            ServerName ${host}:${port}

            <Directory "${directory ? directory : `${getRootDirectory()}${rootHostPath}`}">
              Options Indexes FollowSymLinks MultiViews
              AllowOverride All
              Require all granted
            </Directory>

              ${
                redirect
                  ? `
                  RewriteEngine on
                  
                  RewriteCond %{REQUEST_URI} !^/.well-known/acme-challenge
                  RewriteRule ^(.*)$ ${redirectTarget}%{REQUEST_URI} [R=302,L]
              `
                  : ''
              }

            ErrorDocument 400 ${path === '/' ? '' : path}/400.html
            ErrorDocument 404 ${path === '/' ? '' : path}/400.html
            ErrorDocument 500 ${path === '/' ? '' : path}/500.html
            ErrorDocument 502 ${path === '/' ? '' : path}/500.html
            ErrorDocument 503 ${path === '/' ? '' : path}/500.html
            ErrorDocument 504 ${path === '/' ? '' : path}/500.html

          </VirtualHost>
            
                          `);
          // ERR too many redirects:
          // Check: SELECT * FROM database.wp_options where option_name = 'siteurl' or option_name = 'home';
          // Check: wp-config.php
          // if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
          //   $_SERVER['HTTPS'] = 'on';
          // }

          // ErrorDocument 404 /custom_404.html
          // ErrorDocument 500 /custom_50x.html
          // ErrorDocument 502 /custom_50x.html
          // ErrorDocument 503 /custom_50x.html
          // ErrorDocument 504 /custom_50x.html

          // Respond When Error Pages are Directly Requested

          // <Files "custom_404.html">
          //     <If "-z %{ENV:REDIRECT_STATUS}">
          //         RedirectMatch 404 ^/custom_404.html$
          //     </If>
          // </Files>

          // <Files "custom_50x.html">
          //     <If "-z %{ENV:REDIRECT_STATUS}">
          //         RedirectMatch 404 ^/custom_50x.html$
          //     </If>
          // </Files>

          // Add www or https with htaccess rewrite

          // Options +FollowSymLinks
          // RewriteEngine On
          // RewriteCond %{HTTP_HOST} ^ejemplo.com [NC]
          // RewriteRule ^(.*)$ http://ejemplo.com/$1 [R=301,L]

          // Redirect http to https with htaccess rewrite

          // RewriteEngine On
          // RewriteCond %{SERVER_PORT} 80
          // RewriteRule ^(.*)$ https://www.ejemplo.com/$1 [R,L]

          // Redirect to HTTPS with www subdomain

          // RewriteEngine On
          // RewriteCond %{HTTPS} off [OR]
          // RewriteCond %{HTTP_HOST} ^www\. [NC]
          // RewriteCond %{HTTP_HOST} ^(?:www\.)?(.+)$ [NC]
          // RewriteRule ^ https://%1%{REQUEST_URI} [L,NE,R=301]

          await UnderpostStartUp.API.listenPortController(
            UnderpostStartUp.API.listenServerFactory(),
            port,
            runningData,
          );
          break;
        case 'xampp':
          if (!Xampp.enabled()) continue;
          if (!Xampp.ports.includes(port)) Xampp.ports.push(port);
          if (currentPort === initPort) Xampp.removeRouter();
          Xampp.appendRouter(`
            
        Listen ${port}

        <VirtualHost *:${port}>    
            DocumentRoot "${directory ? directory : `${getRootDirectory()}${rootHostPath}`}"
            ServerName ${host}:${port}

            <Directory "${directory ? directory : `${getRootDirectory()}${rootHostPath}`}">
              Options Indexes FollowSymLinks MultiViews
              AllowOverride All
              Require all granted
            </Directory>

            ${
              redirect
                ? `
                RewriteEngine on
                
                RewriteCond %{REQUEST_URI} !^/.well-known/acme-challenge
                RewriteRule ^(.*)$ ${redirectTarget}%{REQUEST_URI} [R=302,L]
            `
                : ''
            }

            ErrorDocument 400 ${path === '/' ? '' : path}/400.html
            ErrorDocument 404 ${path === '/' ? '' : path}/400.html
            ErrorDocument 500 ${path === '/' ? '' : path}/500.html
            ErrorDocument 502 ${path === '/' ? '' : path}/500.html
            ErrorDocument 503 ${path === '/' ? '' : path}/500.html
            ErrorDocument 504 ${path === '/' ? '' : path}/500.html

          </VirtualHost>
            
                          `);
          // ERR too many redirects:
          // Check: SELECT * FROM database.wp_options where option_name = 'siteurl' or option_name = 'home';
          // Check: wp-config.php
          // if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
          //   $_SERVER['HTTPS'] = 'on';
          // }
          await UnderpostStartUp.API.listenPortController(
            UnderpostStartUp.API.listenServerFactory(),
            port,
            runningData,
          );
          break;
        case 'nodejs':
          const app = express();

          app.use((req, res, next) => {
            // const info = `${req.headers.host}${req.url}`;
            return next();
          });

          // https://github.com/prometheus/prometheus/blob/main/documentation/examples/prometheus.yml
          // https://github.com/grafana/grafana/tree/main/conf
          // https://medium.com/@diego.coder/monitoreo-de-aplicaciones-con-node-js-grafana-y-prometheus-afd2b33e3f91
          // for grafana prometheus server: host.docker.internal:9090

          app.use((req, res, next) => {
            requestCounter.inc({
              instance: `${host}:${port}${path}`,
              method: req.method,
              status_code: res.statusCode,
            });
            // decodeURIComponent(req.url)
            return next();
          });

          app.get(`${path === '/' ? '' : path}/metrics`, async (req, res) => {
            res.set('Content-Type', promClient.register.contentType);
            return res.end(await promClient.register.metrics());
          });

          // set logger
          app.use(loggerMiddleware(import.meta));

          // instance public static
          app.use('/', express.static(directory ? directory : `.${rootHostPath}`));

          // js src compression
          app.use(compression({ filter: shouldCompress }));
          function shouldCompress(req, res) {
            if (req.headers['x-no-compression']) {
              // don't compress responses with this request header
              return false;
            }

            // fallback to standard filter function
            return compression.filter(req, res);
          }

          if (process.argv.includes('static')) {
            logger.info('Build static server runtime', `${host}${path}`);
            currentPort += 2;
            const staticPort = newInstance(currentPort);

            await UnderpostStartUp.API.listenPortController(app, staticPort, runningData);
            currentPort++;
            continue;
          }
          logger.info('Build api server runtime', `${host}${path}`);

          // parse requests of content-type - application/json
          app.use(express.json({ limit: '100MB' }));

          // parse requests of content-type - application/x-www-form-urlencoded
          app.use(express.urlencoded({ extended: true, limit: '20MB' }));

          // file upload middleware
          app.use(fileUpload());

          // json formatted response
          if (process.env.NODE_ENV === 'development') app.set('json spaces', 2);

          // lang handling middleware
          app.use(function (req, res, next) {
            const lang = req.headers['accept-language'] || 'en';
            if (typeof lang === 'string' && lang.toLowerCase().match('es')) {
              req.lang = 'es';
            } else req.lang = 'en';
            return next();
          });

          // cors
          const originPayload = {
            origin: origins.concat(
              apis && process.env.NODE_ENV === 'development' ? [`http://localhost:${currentPort + 2}`] : [],
            ),
          };
          // logger.info('originPayload', originPayload);
          app.use(cors(originPayload));

          if (redirect) {
            app.use(function (req = express.Request, res = express.Response, next = express.NextFunction) {
              if (process.env.NODE_ENV === 'production' && !req.url.startsWith(`/.well-known/acme-challenge`))
                return res.status(302).redirect(redirectTarget + req.url);
              // if (!req.url.startsWith(`/.well-known/acme-challenge`)) return res.status(302).redirect(redirect);
              return next();
            });
            // app.use(
            //   '*',
            //   createProxyMiddleware({
            //     target: redirect,
            //     changeOrigin: true,
            //   }),
            // );

            await UnderpostStartUp.API.listenPortController(app, port, runningData);
            break;
          }

          const swaggerJsonPath = `./public/${host}${path === '/' ? path : `${path}/`}swagger-output.json`;
          if (fs.existsSync(swaggerJsonPath)) {
            // logger.info('Build swagger serve', swaggerJsonPath);

            const swaggerInstance =
              (swaggerDoc) =>
              (...args) =>
                swaggerUi.setup(swaggerDoc)(...args);

            const swaggerDoc = JSON.parse(fs.readFileSync(swaggerJsonPath, 'utf8'));

            app.use(`${path === '/' ? `/api-docs` : `${path}/api-docs`}`, swaggerUi.serve, swaggerInstance(swaggerDoc));
          }

          if (db && apis) await DataBaseProvider.load({ apis, host, path, db });

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
          if (apis) {
            const apiPath = `${path === '/' ? '' : path}/${process.env.BASE_API}`;
            for (const api of apis)
              await (async () => {
                const { ApiRouter } = await import(`../api/${api}/${api}.router.js`);
                const router = ApiRouter({ host, path, apiPath, mailer, db });
                // router.use(cors({ origin: origins }));
                // logger.info('Load api router', { host, path: apiPath, api });
                app.use(`${apiPath}/${api}`, router);
              })();
          }

          const Render = await ssrFactory();
          const ssrPath = path === '/' ? path : `${path}/`;

          const defaultHtmlSrc404 = Render({
            title: '404 Not Found',
            ssrPath,
            ssrHeadComponents: '',
            ssrBodyComponents: (await ssrFactory(`./src/client/ssr/body/404.js`))(),
            renderPayload: {
              apiBasePath: process.env.BASE_API,
              version: Underpost.version,
            },
            renderApi: {
              JSONweb,
            },
          });
          const path404 = `${directory ? directory : `${getRootDirectory()}${rootHostPath}`}/404/index.html`;
          const page404 = fs.existsSync(path404) ? `${path === '/' ? '' : path}/404` : undefined;
          app.use(function (req, res, next) {
            if (page404) return res.status(404).redirect(page404);
            else {
              res.set('Content-Type', 'text/html');
              return res.status(404).send(defaultHtmlSrc404);
            }
          });

          const defaultHtmlSrc500 = Render({
            title: '500 Server Error',
            ssrPath,
            ssrHeadComponents: '',
            ssrBodyComponents: (await ssrFactory(`./src/client/ssr/body/500.js`))(),
            renderPayload: {
              apiBasePath: process.env.BASE_API,
              version: Underpost.version,
            },
            renderApi: {
              JSONweb,
            },
          });
          const path500 = `${directory ? directory : `${getRootDirectory()}${rootHostPath}`}/500/index.html`;
          const page500 = fs.existsSync(path500) ? `${path === '/' ? '' : path}/500` : undefined;
          app.use(function (err, req, res, next) {
            logger.error(err, err.stack);
            if (page500) return res.status(500).redirect(page500);
            else {
              res.set('Content-Type', 'text/html');
              return res.status(500).send(defaultHtmlSrc500);
            }
          });

          // instance server
          const server = createServer({}, app);

          if (ws)
            await (async () => {
              const { createIoServer } = await import(`../ws/${ws}/${ws}.ws.server.js`);
              // logger.info('Load socket.io ws router', { host, ws });
              // start socket.io
              const { options, meta } = await createIoServer(server, {
                host,
                path,
                db,
                port,
                origins,
              });
              await UnderpostStartUp.API.listenPortController(UnderpostStartUp.API.listenServerFactory(), port, {
                runtime: 'nodejs',
                client: null,
                host,
                path: options.path,
                meta,
              });
            })();

          if (peer) {
            currentPort++;
            const peerPort = newInstance(currentPort);
            const { options, meta, peerServer } = await createPeerServer({
              port: peerPort,
              devPort: port,
              origins,
              host,
              path,
            });

            await UnderpostStartUp.API.listenPortController(peerServer, peerPort, {
              runtime: 'nodejs',
              client: null,
              host,
              path: options.path,
              meta,
            });
          }

          await UnderpostStartUp.API.listenPortController(server, port, runningData);

          break;
        default:
          break;
      }
      currentPort++;
    }
  }

  if (Xampp.enabled() && Xampp.router) Xampp.initService();
  if (Lampp.enabled() && Lampp.router) Lampp.initService();

  UnderpostStartUp.API.logRuntimeRouter();
};

export { buildRuntime };
