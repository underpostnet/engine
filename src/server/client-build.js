import fs from 'fs-extra';
import { srcFormatted } from './formatted.js';

const clientBuild = async () => {
  let ViewRender;
  eval(srcFormatted(fs.readFileSync('./src/client/ssr/ViewRender.js', 'utf8')));
  const confClient = JSON.parse(fs.readFileSync(`./src/conf.client.json`, 'utf8'));
  const confServer = JSON.parse(fs.readFileSync(`./src/conf.server.json`, 'utf8'));
  const publicPath = `./public`;
  if (fs.existsSync(publicPath)) fs.removeSync(`${publicPath}`);
  for (const host of Object.keys(confServer)) {
    fs.mkdirSync(`${publicPath}/${host}/.well-known/acme-challenge`, { recursive: true });
    for (const path of Object.keys(confServer[host])) {
      fs.mkdirSync(`${publicPath}/${host}${path}`, { recursive: true });
      const { client } = confServer[host][path];
      fs.copySync(`./src/client/public/${client}`, `${publicPath}/${host}${path}`);
    }
  }
};

export { clientBuild };
