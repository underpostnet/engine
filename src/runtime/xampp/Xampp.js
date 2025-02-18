import fs from 'fs-extra';
import { shellExec } from '../../server/process.js';

const Xampp = {
  ports: [],
  initService: async function (options = { daemon: false }) {
    let cmd;
    // windows
    fs.writeFileSync(
      `C:/xampp/apache/conf/httpd.conf`,
      fs.readFileSync(`C:/xampp/apache/conf/httpd.template.conf`, 'utf8').replace(`Listen 80`, ``),
      'utf8',
    );
    fs.writeFileSync(`C:/xampp/apache/conf/extra/httpd-ssl.conf`, this.router || '', 'utf8');
    cmd = `C:/xampp/xampp_stop.exe`;
    shellExec(cmd);
    cmd = `C:/xampp/xampp_start.exe`;
    if (this.router) fs.writeFileSync(`./tmp/xampp-router.conf`, this.router, 'utf-8');
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
