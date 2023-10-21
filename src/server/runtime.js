import fs from 'fs';
import { getRootDirectory, shellExec } from './process.js';
import { network } from './network.js';

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
      const { runtime, port } = confServer[host][path];

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
