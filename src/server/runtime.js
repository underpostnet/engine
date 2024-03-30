import fs from 'fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fileUpload from 'express-fileupload';
import swaggerUi from 'swagger-ui-express';

import { createServer } from 'http';
import { getRootDirectory } from './process.js';
import { network, listenPortController, ip } from './network.js';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { newInstance } from '../client/components/core/CommonJs.js';
import { Xampp } from '../runtime/xampp/Xampp.js';
import { MailerProvider } from '../mailer/MailerProvider.js';
import { DataBaseProvider } from '../db/DataBaseProvider.js';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createPeerServer } from './peer.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const buildRuntime = async () => {
  const ipInstance = await ip.public.ipv4();
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
        host: `http://${host}:${port}${path}`,
        local: `http://localhost:${port}${path}`,
        peer: peer ? `http://localhost:${peer.port}` : undefined,
      };

      switch (runtime) {
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
                
                RewriteCond %{REQUEST_URI} ^/.well-known/acme-challenge
                RewriteRule ^(.*)$ /.well-known/acme-challenge [R=302,L]
                RewriteRule ^(.*)$ ${redirect} [R=302,L]
            `
                : ''
            }
            ${
              client === 'wordpress'
                ? `
                  # BEGIN WordPress
                  <IfModule mod_rewrite.c>
                    RewriteEngine On
                    RewriteRule ^index\.php$ - [L]
                    RewriteCond $1 ^(index\.php)?$ [OR]
                    # RewriteCond $1 \.(gif|jpg|png|ico|css|js|php)$ [NC,OR]
                    RewriteCond $1 \.(.*) [NC,OR]
                    RewriteCond %{REQUEST_FILENAME} -f [OR]
                    RewriteCond %{REQUEST_FILENAME} -d
                    RewriteRule ^(.*)$ - [S=1]
                    RewriteRule . /index.php [L]
                  </IfModule>
                  # END wordpress
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

          // set logger
          app.use(loggerMiddleware(import.meta));
          if (redirect) {
            // TODO: proxy redirect
            // app.use(
            //   '*',
            //   createProxyMiddleware({
            //     target: redirect,
            //     changeOrigin: true,
            //   }),
            // );
            app.use(function (req, res) {
              return res.status(302).redirect(redirect);
            });
            await network.port.portClean(port);
            await listenPortController(app, port, runningData);
            break;
          }

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

          const swaggerJsonPath = `./public/${host}${path === '/' ? path : `${path}/`}swagger-output.json`;
          if (fs.existsSync(swaggerJsonPath)) {
            logger.info('Build swagger serve', swaggerJsonPath);
            app.use(
              `${path === '/' ? `/api-docs` : `${path}/api-docs`}`,
              swaggerUi.serve,
              swaggerUi.setup(JSON.parse(fs.readFileSync(swaggerJsonPath, 'utf8'))),
            );
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
                logger.info('Load api router', { host, path: apiPath, api });
                app.use(apiPath, ApiRouter({ host, path, apiPath, mailer, db }));
              })();

          // instance server
          const server = createServer({}, app);

          if (ws)
            await (async () => {
              const { createIoServer } = await import(`../ws/${ws}/${ws}.ws.server.js`);
              logger.info('Load socket.io ws router', { host, ws });
              // start socket.io
              const ioServer = createIoServer(server, {
                host,
                path,
                db,
                port,
                origins,
              });
            })();

          if (peer) createPeerServer({ port: peer.port, devPort: port, origins });

          await network.port.portClean(port);
          await listenPortController(server, port, runningData);

          break;
        default:
          break;
      }
      currentPort++;
    }
  }
  if (Xampp.enabled() && Xampp.router) await Xampp.initService();
};

export { buildRuntime };
