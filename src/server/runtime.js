import fs from 'fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fileUpload from 'express-fileupload';

import { createServer } from 'http';
import { getRootDirectory } from './process.js';
import { network, listenPortController, ip } from './network.js';
import { loggerFactory, loggerMiddleware } from './logger.js';
import { newInstance } from '../client/components/core/CommonJs.js';
import { Xampp } from '../runtime/xampp/Xampp.js';

dotenv.config();

const buildRuntime = async () => {
  const ipInstance = await ip.public.ipv4();
  let currentPort = parseInt(process.env.PORT) + 1;
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  for (const host of Object.keys(confServer)) {
    const rootHostPath = `/public/${host}`;
    for (const path of Object.keys(confServer[host])) {
      confServer[host][path].port = newInstance(currentPort);
      const { runtime, port, client, apis, db, origins, disabled, directory, wss } = confServer[host][path];
      const meta = { url: `app-${client}-${port}` };
      const logger = loggerFactory(meta);
      const loggerOnRunningApp = () =>
        logger.info(`App running`, {
          runtime,
          client,
          public: `http://${ipInstance}:${port}${path}`,
          host: `http://${host}:${port}${path}`,
          local: `http://localhost:${port}${path}`,
        });
      if (disabled) continue;

      switch (runtime) {
        case 'xampp':
          if (!Xampp.enabled()) continue;
          if (!Xampp.ports.includes(port)) Xampp.ports.push(port);
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
          loggerOnRunningApp();
          break;
        case 'nodejs':
          const app = express();

          app.use((req, res, next) => {
            // `[app-${client}][${req.method}] ${req.headers.host}${req.url}`
            return next();
          });

          // set logger
          app.use(loggerMiddleware(meta));

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

          if (apis)
            for (const api of apis)
              await (async () => {
                const { ApiRouter } = await import(`../api/${api}/${api}.router.js`);
                const apiPath = `${path === '/' ? '' : path}/api`;
                logger.info('Load api router', { host, path: apiPath, api });
                app.use(apiPath, ApiRouter({ host, path: apiPath, db }));
              })();

          // instance server
          const server = createServer({}, app);

          if (wss)
            for (const ws of wss)
              await (async () => {
                const { createIoServer } = await import(`../ws/${ws}/${ws}.ws.server.js`);
                logger.info('Load socket.io ws router', { host, ws });
                // start socket.io
                const ioServer = createIoServer(server, {
                  path,
                  ...confServer[host][path],
                });
              })();

          await network.port.portClean(port);
          await listenPortController(server, port, loggerOnRunningApp);

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
