import fs from 'fs-extra';
import { network } from '../../server/network.js';
import { shellExec } from '../../server/process.js';
import { timer } from '../../client/components/core/CommonJs.js';

const Lampp = {
  ports: [],
  initService: async function (options = { daemon: false }) {
    let cmd;
    // linux
    fs.writeFileSync(`/opt/lampp/apache2/conf/httpd.conf`, this.router || '', 'utf8');
    cmd = `sudo /opt/lampp/lampp stop`;
    shellExec(cmd);
    await network.port.portClean(3306);
    for (const port of this.ports) await network.port.portClean(port);
    cmd = `sudo /opt/lampp/lampp start`;
    if (this.router) fs.writeFileSync(`./tmp/lampp-router.conf`, this.router, 'utf-8');
    shellExec(cmd, { async: true });
    if (options && options.daemon) this.daemon();
  },
  daemon: async function () {
    await timer(1000 * 60 * 2); // 2 minutes
    for (const port of this.ports) {
      const [portStatus] = await network.port.status([port]);
      if (!portStatus.open) return await this.initService();
    }
    this.daemon();
  },
  enabled: () => fs.existsSync(`/opt/lampp/apache2/conf/httpd.conf`),
  appendRouter: function (render) {
    if (!this.router) {
      if (fs.existsSync(`./tmp/lampp-router.conf`))
        return (this.router = fs.readFileSync(`./tmp/lampp-router.conf`, 'utf-8')) + render;
      return (this.router = render);
    }
    return (this.router += render);
  },
  removeRouter: function () {
    this.router = undefined;
    if (fs.existsSync(`./tmp/lampp-router.conf`)) fs.rmSync(`./tmp/lampp-router.conf`);
  },
};

export { Lampp };
