import fs from 'fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fileUpload from 'express-fileupload';
import swaggerUi from 'swagger-ui-express';

import { createServer } from 'http';
import { getRootDirectory } from './process.js';
import { network, listenPortController, ip, networkRouter, logNetworkRouter } from './network.js';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { newInstance } from '../client/components/core/CommonJs.js';
import { Xampp } from '../runtime/xampp/Xampp.js';
import { MailerProvider } from '../mailer/MailerProvider.js';
import { DataBaseProvider } from '../db/DataBaseProvider.js';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createPeerServer } from './peer.js';
import { Lampp } from '../runtime/lampp/Lampp.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const buildRuntime = async () => {
  const ipInstance = ''; // await ip.public.ipv4();
  let currentPort = parseInt(process.env.PORT) + 1;
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  for (const host of Object.keys(confServer)) {
    const rootHostPath = `/public/${host}`;
    for (const path of Object.keys(confServer[host])) {
      confServer[host][path].port = newInstance(currentPort);
      const { runtime, port, client, apis, origins, directory, ws, mailer, db, redirect, peer } =
        confServer[host][path];

      const runningData = {
        runtime,
        client,
        public: `http://${ipInstance}:${port}${path}`,
        host: [443, 80].includes(port) ? `http://${host}${path}` : `http://${host}:${port}${path}`,
        local: `http://localhost:${port}${path}`,
      };

      let redirectUrl;
      let redirectTarget;
      if (redirect) {
        redirectUrl = new URL(redirect);
        redirectTarget = redirect[redirect.length - 1] === '/' ? redirect.slice(0, -1) : redirect;
      }

      switch (runtime) {
        case 'lampp':
          if (!Lampp.enabled()) continue;
          if (!Lampp.ports.includes(port)) Lampp.ports.push(port);
          if (confServer[host][path].resetRouter) Lampp.removeRouter();
          Lampp.appendRouter(`
            
        Listen ${port}

        <VirtualHost *:${port}>    
            DocumentRoot "${directory ? directory.replace(path, '/') : `${getRootDirectory()}${rootHostPath}`}"
            ServerName ${host}:${port}

            <Directory "${directory ? directory.replace(path, '/') : `${getRootDirectory()}${rootHostPath}`}">
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

          </VirtualHost>
            
                          `);
          // ERR too many redirects:
          // Check: SELECT * FROM database.wp_options where option_name = 'siteurl' or option_name = 'home';
          // Check: wp-config.php
          // if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
          //   $_SERVER['HTTPS'] = 'on';
          // }
          await listenPortController({ listen: (...args) => args[1]() }, port, runningData);
          break;
        case 'xampp':
          if (!Xampp.enabled()) continue;
          if (!Xampp.ports.includes(port)) Xampp.ports.push(port);
          if (confServer[host][path].resetRouter) Xampp.removeRouter();
          Xampp.appendRouter(`
            
        Listen ${port}

        <VirtualHost *:${port}>    
            DocumentRoot "${directory ? directory.replace(path, '/') : `${getRootDirectory()}${rootHostPath}`}"
            ServerName ${host}:${port}

            <Directory "${directory ? directory.replace(path, '/') : `${getRootDirectory()}${rootHostPath}`}">
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

          </VirtualHost>
            
                          `);
          // ERR too many redirects:
          // Check: SELECT * FROM database.wp_options where option_name = 'siteurl' or option_name = 'home';
          // Check: wp-config.php
          // if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
          //   $_SERVER['HTTPS'] = 'on';
          // }
          await listenPortController({ listen: (...args) => args[1]() }, port, runningData);
          break;
        case 'nodejs':
          const app = express();

          app.use((req, res, next) => {
            // const info = `${req.headers.host}${req.url}`;
            return next();
          });

          app.use((req, res, next) => {
            // internal redirect
            if (req.url.startsWith(`/${process.env.BASE_API}/$`))
              return res.redirect(
                decodeURIComponent(
                  `${req.url.replaceAll(
                    `${path === '/' ? '' : path}/${process.env.BASE_API}/$`,
                    `/${process.env.BASE_API}/`,
                  )}`,
                ),
              );
            return next();
          });

          // set logger
          app.use(loggerMiddleware(import.meta));

          // instance public static
          app.use('/', express.static(directory ? directory : `.${rootHostPath}`));

          // parse requests of content-type - application/json
          app.use(express.json({ limit: '100MB' }));

          // parse requests of content-type - application/x-www-form-urlencoded
          app.use(express.urlencoded({ extended: true, limit: '20MB' }));

          // file upload middleware
          app.use(fileUpload());

          // json formatted response
          app.set('json spaces', 2);

          // cors
          app.use(cors({ origin: origins }));

          if (redirect) {
            app.use(function (req = express.Request, res = express.Response, next = express.NextFunction) {
              if (!req.url.startsWith(`/.well-known/acme-challenge`))
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
            await network.port.portClean(port);
            await listenPortController(app, port, runningData);
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

          if (mailer)
            await MailerProvider.load({
              id: `${host}${path}`,
              meta: `mailer-${host}${path}`,
              host,
              path,
              ...mailer,
            });

          if (apis)
            for (const api of apis)
              await (async () => {
                const { ApiRouter } = await import(`../api/${api}/${api}.router.js`);
                const apiPath = `${path === '/' ? '' : path}/${process.env.BASE_API}`;
                // logger.info('Load api router', { host, path: apiPath, api });
                app.use(apiPath, ApiRouter({ host, path, apiPath, mailer, db }));
              })();

          // instance server
          const server = createServer({}, app);

          if (ws)
            await (async () => {
              const { createIoServer } = await import(`../ws/${ws}/${ws}.ws.server.js`);
              // logger.info('Load socket.io ws router', { host, ws });
              // start socket.io
              const ioServer = createIoServer(server, {
                host,
                path,
                db,
                port,
                origins,
              });
            })();

          if (peer) {
            currentPort++;
            const peerPort = newInstance(currentPort);
            await createPeerServer({ port: peerPort, devPort: port, origins, host, path });
          }

          await network.port.portClean(port);
          await listenPortController(server, port, runningData);

          break;
        default:
          break;
      }
      currentPort++;
    }
  }
  if (Xampp.enabled() && Xampp.router) await Xampp.initService({ daemon: true });
  if (Lampp.enabled() && Lampp.router) await Lampp.initService({ daemon: true });

  logNetworkRouter(logger);
};

export { buildRuntime };
