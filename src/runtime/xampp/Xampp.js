import fs from 'fs-extra';
import { network } from '../../server/network.js';
import { shellExec } from '../../server/process.js';

const Xampp = {
  ports: [],
  initService: async function () {
    let cmd;
    // windows
    fs.writeFileSync(
      `C:/xampp/apache/conf/httpd.conf`,
      fs.readFileSync(`C:/xampp/apache/conf/httpd.template.conf`, 'utf8').replace(`Listen 80`, ``),
      'utf8',
    );
    fs.writeFileSync(`C:/xampp/apache/conf/extra/httpd-ssl.conf`, Xampp.router || '', 'utf8');
    cmd = `C:/xampp/xampp_stop.exe`;
    shellExec(cmd);
    await network.port.portClean(3306);
    for (const port of Xampp.ports) await network.port.portClean(port);
    cmd = `C:/xampp/xampp_start.exe`;
    fs.writeFileSync(`./tmp/xampp-router.conf`, Xampp.router, 'utf-8');
    shellExec(cmd);
  },
  enabled: () => fs.existsSync(`C:/xampp/apache/conf/httpd.conf`),
  appendRouter: function (render) {
    if (!this.router) {
      if (fs.existsSync(`./tmp/xampp-router.conf`))
        return (this.router = fs.readFileSync(`./tmp/xampp-router.conf`, 'utf-8')) + render;
      return (this.router = render);
    }
    return (this.router += render);
  },
  removeRouter: function () {
    this.router = undefined;
    if (fs.existsSync(`./tmp/xampp-router.conf`)) fs.rmSync(`./tmp/xampp-router.conf`);
  },
};

export { Xampp };
