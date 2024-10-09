import fs from 'fs-extra';
import { network } from '../../server/network.js';
import { shellCd, shellExec } from '../../server/process.js';
import { timer } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const Lampp = {
  ports: [],
  initService: async function (options = { daemon: false }) {
    let cmd;
    // linux
    fs.writeFileSync(`/opt/lampp/apache2/conf/httpd.conf`, this.router || '', 'utf8');
    cmd = `sudo /opt/lampp/lampp stop`;
    if (!fs.readFileSync(`/opt/lampp/etc/httpd.conf`, 'utf8').match(`# Listen 80`))
      fs.writeFileSync(
        `/opt/lampp/etc/httpd.conf`,
        fs.readFileSync(`/opt/lampp/etc/httpd.conf`, 'utf8').replace(`Listen 80`, `# Listen 80`),
        'utf8',
      );
    if (!fs.readFileSync(`/opt/lampp/etc/extra/httpd-ssl.conf`, 'utf8').match(`# Listen 443`))
      fs.writeFileSync(
        `/opt/lampp/etc/extra/httpd-ssl.conf`,
        fs.readFileSync(`/opt/lampp/etc/extra/httpd-ssl.conf`, 'utf8').replace(`Listen 443`, `# Listen 443`),
        'utf8',
      );
    if (!fs.readFileSync(`/opt/lampp/lampp`, 'utf8').match(`testport 443 && false`))
      fs.writeFileSync(
        `/opt/lampp/lampp`,
        fs.readFileSync(`/opt/lampp/lampp`, 'utf8').replace(`testport 443`, `testport 443 && false`),
        'utf8',
      );
    if (!fs.readFileSync(`/opt/lampp/lampp`, 'utf8').match(`testport 80 && false`))
      fs.writeFileSync(
        `/opt/lampp/lampp`,
        fs.readFileSync(`/opt/lampp/lampp`, 'utf8').replace(`testport 80`, `testport 80 && false`),
        'utf8',
      );

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
  install: async function () {
    switch (process.platform) {
      case 'linux':
        {
          if (!fs.existsSync(`./engine-private/setup`)) fs.mkdirSync(`./engine-private/setup`, { recursive: true });

          shellCd(`./engine-private/setup`);

          if (!process.argv.includes(`server`)) {
            shellExec(
              `curl -Lo xampp-linux-installer.run https://sourceforge.net/projects/xampp/files/XAMPP%20Linux/7.4.30/xampp-linux-x64-7.4.30-1-installer.run?from_af=true`,
            );
            shellExec(`sudo chmod +x xampp-linux-installer.run`);
            shellExec(
              `sudo ./xampp-linux-installer.run --mode unattended && \\` +
                `ln -sf /opt/lampp/lampp /usr/bin/lampp && \\` +
                `sed -i.bak s'/Require local/Require all granted/g' /opt/lampp/etc/extra/httpd-xampp.conf && \\` +
                `sed -i.bak s'/display_errors=Off/display_errors=On/g' /opt/lampp/etc/php.ini && \\` +
                `mkdir /opt/lampp/apache2/conf.d && \\` +
                `echo "IncludeOptional /opt/lampp/apache2/conf.d/*.conf" >> /opt/lampp/etc/httpd.conf && \\` +
                `mkdir /www && \\` +
                `ln -s /www /opt/lampp/htdocs`,
            );

            if (fs.existsSync(`/opt/lampp/logs/access_log`))
              fs.copySync(`/opt/lampp/logs/access_log`, `/opt/lampp/logs/access.log`);
            if (fs.existsSync(`/opt/lampp/logs/error_log`))
              fs.copySync(`/opt/lampp/logs/error_log`, `/opt/lampp/logs/error.log`);
            if (fs.existsSync(`/opt/lampp/logs/php_error_log`))
              fs.copySync(`/opt/lampp/logs/php_error_log`, `/opt/lampp/logs/php_error.log`);
            if (fs.existsSync(`/opt/lampp/logs/ssl_request_log`))
              fs.copySync(`/opt/lampp/logs/ssl_request_log`, `/opt/lampp/logs/ssl_request.log`);
          }

          await Lampp.initService({ daemon: true });
        }

        break;

      default:
        break;
    }
  },
};

export { Lampp };
