import fs from 'fs';
import express from 'express';
import cors from 'cors';

import { createServer } from 'http';
import { createIoServer } from './socket.io.js';
import { getRootDirectory, shellExec } from './process.js';
import { network, listenPortController } from './network.js';
import { loggerFactory, loggerMiddleware } from './logger.js';

const buildRuntime = async () => {
  let cmd;
  const confServer = JSON.parse(fs.readFileSync(`./src/conf.server.json`, 'utf8'));
  const xampp = {
    router: '',
    roots: [],
    ports: [],
  };
  for (const host of Object.keys(confServer)) {
    const rootHostPath = `/public/${host}`;
    for (const path of Object.keys(confServer[host])) {
      const { runtime, port, client, origins } = confServer[host][path];

      switch (runtime) {
        case 'xampp':
          if (!xampp.ports.includes(port)) {
            xampp.ports.push(port);
            xampp.router += `
        Listen ${port}
            `;
          }
          if (!xampp.roots.includes(rootHostPath)) {
            xampp.roots.push(rootHostPath);
            xampp.router += `
        <VirtualHost *:${port}>            
            DocumentRoot "${getRootDirectory()}${rootHostPath}"
            ServerName localhost
            <Directory "${getRootDirectory()}${rootHostPath}">
                Options Indexes FollowSymLinks MultiViews
                AllowOverride All
                Require all granted
            </Directory>
        </VirtualHost>
          `;
          }
          break;
        case 'nodejs':
          const meta = { url: `app-${client}-${port}` };

          const logger = loggerFactory(meta);

          const app = express();
          // instance public static
          app.use('/', express.static(`.${rootHostPath}`));

          app.use((req, res, next) => {
            // `[app-${client}][${req.method}] ${req.headers.host}${req.url}`
            return next();
          });

          // set logger
          app.use(loggerMiddleware(meta));

          // parse requests of content-type - application/json
          app.use(express.json({ limit: '100MB' }));

          // parse requests of content-type - application/x-www-form-urlencoded
          app.use(express.urlencoded({ extended: true, limit: '20MB' }));

          // json formatted response
          app.set('json spaces', 2);

          // cors
          app.use(cors({ origin: origins }));

          // instance server
          const server = createServer({}, app);

          // start socket.io
          const ioServer = createIoServer(server, {
            meta: { url: `socket.io-${meta.url}` },
            path,
            ...confServer[host][path],
          });

          await network.port.portClean(port);
          await listenPortController(server, port, () => logger.info(`App ${client} running on port`, port));

          break;
        default:
          break;
      }
    }
  }
  if (xampp.router && fs.existsSync(`C:/xampp/apache/conf/httpd.conf`)) {
    // windows
    fs.writeFileSync(
      `C:/xampp/apache/conf/httpd.conf`,
      fs.readFileSync(`C:/xampp/apache/conf/httpd.template.conf`, 'utf8').replace(`Listen 80`, ``),
      'utf8'
    );
    fs.writeFileSync(`C:/xampp/apache/conf/extra/httpd-ssl.conf`, xampp.router, 'utf8');
    // cmd = `C:/xampp/xampp_stop.exe`;
    // shellExec(cmd);
    for (const port of xampp.ports) await network.port.portClean(port);
    cmd = `C:/xampp/xampp_start.exe`;
    shellExec(cmd);
  }
};

export { buildRuntime };
