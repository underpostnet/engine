import fs from 'fs-extra';
import { srcFormatted, componentFormatted, pathViewFormatted, viewFormatted } from './formatted.js';

const buildClient = async () => {
  let ViewRender;
  eval(srcFormatted(fs.readFileSync('./src/client/ssr/ViewRender.js', 'utf8')));
  const confClient = JSON.parse(fs.readFileSync(`./src/conf.client.json`, 'utf8'));
  const confServer = JSON.parse(fs.readFileSync(`./src/conf.server.json`, 'utf8'));
  const publicPath = `./public`;
  if (fs.existsSync(publicPath)) fs.removeSync(`${publicPath}`);
  for (const host of Object.keys(confServer)) {
    fs.mkdirSync(`${publicPath}/${host}/.well-known/acme-challenge`, { recursive: true });
    for (const path of Object.keys(confServer[host])) {
      const rootClientPath = `${publicPath}/${host}${path}`;
      fs.mkdirSync(rootClientPath, { recursive: true });
      const { client } = confServer[host][path];
      fs.copySync(`./src/client/public/${client}`, rootClientPath);

      const { components, dists, views } = confClient[client];

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

      const buildId = `index.${client}.${new Date().getTime()}`;

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
