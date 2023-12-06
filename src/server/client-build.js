'use strict';

import fs from 'fs-extra';
import { srcFormatted, componentFormatted, pathViewFormatted, viewFormatted } from './formatted.js';
import { loggerFactory } from './logger.js';

// Static Site Generation (SSG)

const buildClient = async () => {
  const logger = loggerFactory(import.meta);
  let ViewRender;
  eval(srcFormatted(fs.readFileSync('./src/client/ssr/ViewRender.js', 'utf8')));
  const confClient = JSON.parse(fs.readFileSync(`./conf/conf.client.json`, 'utf8'));
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const acmeChallengePath = `/.well-known/acme-challenge`;
  const publicPath = `./public`;
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      const { client, directory, disabled, disabledRebuild, db } = confServer[host][path];
      if (disabled || disabledRebuild || !client) continue;

      const { components, dists, views, services } = confClient[client];
      const rootClientPath = directory ? directory : `${publicPath}/${host}${path}`;

      fs.removeSync(rootClientPath);
      fs.mkdirSync(rootClientPath, { recursive: true });
      fs.mkdirSync(directory ? `${directory}${acmeChallengePath}` : `${publicPath}/${host}${acmeChallengePath}`, {
        recursive: true,
      });

      if (fs.existsSync(`./src/client/public/${client}`)) fs.copySync(`./src/client/public/${client}`, rootClientPath);
      else if (fs.existsSync(`./engine-private/src/client/public/${client}`)) {
        switch (client) {
          case 'mysql_test':
            if (db) {
              fs.copySync(`./engine-private/src/client/public/${client}`, rootClientPath);
              fs.writeFileSync(
                `${rootClientPath}/index.php`,
                fs
                  .readFileSync(`${rootClientPath}/index.php`, 'utf8')
                  .replace('test_servername', 'localhost')
                  .replace('test_username', db.user)
                  .replace('test_password', db.password)
                  .replace('test_dbname', db.name),
                'utf8',
              );
            }
            break;

          default:
            break;
        }
      }

      Object.keys(components).map((module) => {
        if (!fs.existsSync(`${rootClientPath}/components/${module}`))
          fs.mkdirSync(`${rootClientPath}/components/${module}`, { recursive: true });

        components[module].map((component) =>
          fs.writeFileSync(
            `${rootClientPath}/components/${module}/${component}.js`,
            componentFormatted(
              srcFormatted(fs.readFileSync(`./src/client/components/${module}/${component}.js`, 'utf8')),
              module,
              dists,
              path,
              'components',
            ),
            'utf8',
          ),
        );
      });

      if (services) {
        for (const module of services) {
          if (!fs.existsSync(`${rootClientPath}/services/${module}`))
            fs.mkdirSync(`${rootClientPath}/services/${module}`, { recursive: true });

          fs.writeFileSync(
            `${rootClientPath}/services/${module}/${module}.service.js`,
            componentFormatted(
              srcFormatted(fs.readFileSync(`./src/client/services/${module}/${module}.service.js`, 'utf8')),
              module,
              dists,
              path,
              'services',
            ),
            'utf8',
          );
        }
      }

      for (const dist of dists) {
        if ('folder' in dist) {
          fs.mkdirSync(`${rootClientPath}${dist.public_folder}`, { recursive: true });
          fs.copySync(dist.folder, `${rootClientPath}${dist.public_folder}`);
        }
        if ('styles' in dist) {
          fs.mkdirSync(`${rootClientPath}${dist.public_styles_folder}`, { recursive: true });
          fs.copySync(dist.styles, `${rootClientPath}${dist.public_styles_folder}`);
        }
      }

      const buildId = `index.${client}`;

      views.map((view) => {
        const buildPath = `${
          rootClientPath[rootClientPath.length - 1] === '/' ? rootClientPath.slice(0, -1) : rootClientPath
        }${pathViewFormatted(view.path)}`;

        logger.info('Build path', buildPath);

        if (!fs.existsSync(buildPath)) fs.mkdirSync(buildPath, { recursive: true });

        fs.writeFileSync(
          `${buildPath}${buildId}.js`,
          viewFormatted(srcFormatted(fs.readFileSync(`./src/client/${view.client}.js`, 'utf8')), dists, path),
          'utf8',
        );

        fs.writeFileSync(`${buildPath}index.html`, ViewRender({ title: view.title, path, buildId }), 'utf8');
      });
    }
  }
};

export { buildClient };
