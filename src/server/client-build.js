'use strict';

import fs from 'fs-extra';
import { srcFormatted, componentFormatted, pathViewFormatted, viewFormatted } from './formatted.js';

const buildClient = async () => {
  let ViewRender;
  eval(srcFormatted(fs.readFileSync('./src/client/ssr/ViewRender.js', 'utf8')));
  const confClient = JSON.parse(fs.readFileSync(`./conf/conf.client.json`, 'utf8'));
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const acmeChallengePath = `/.well-known/acme-challenge`;
  const publicPath = `./public`;
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      const { client, directory, disabled, disabledRebuild } = confServer[host][path];
      if (disabled || disabledRebuild) continue;

      const { components, dists, views } = confClient[client];
      const rootClientPath = directory ? directory : `${publicPath}/${host}${path}`;

      fs.removeSync(rootClientPath);
      fs.mkdirSync(rootClientPath, { recursive: true });
      fs.mkdirSync(directory ? `${directory}${acmeChallengePath}` : `${publicPath}/${host}${acmeChallengePath}`, {
        recursive: true,
      });

      if (fs.existsSync(`./src/client/public/${client}`)) fs.copySync(`./src/client/public/${client}`, rootClientPath);

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
              path
            ),
            'utf8'
          )
        );
      });

      for (const dist of dists) {
        if ('folder' in dist) {
          fs.mkdirSync(`${rootClientPath}${dist.public_folder}`, { recursive: true });
          fs.copySync(dist.folder, `${rootClientPath}${dist.public_folder}`);
        }
      }

      const buildId = `index.${client}`;

      views.map((view) => {
        if (!fs.existsSync(`${rootClientPath}${pathViewFormatted(view.path)}`))
          fs.mkdirSync(`${rootClientPath}${`${pathViewFormatted(view.path)}`}`, { recursive: true });

        fs.writeFileSync(
          `${rootClientPath}${pathViewFormatted(view.path)}${buildId}.js`,
          viewFormatted(srcFormatted(fs.readFileSync(`./src/client/${view.client}.js`, 'utf8')), dists, path),
          'utf8'
        );

        fs.writeFileSync(
          `${rootClientPath}${pathViewFormatted(view.path)}index.html`,
          ViewRender({ title: view.title, path, buildId }),
          'utf8'
        );
      });
    }
  }
};

export { buildClient };
