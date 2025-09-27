import fs from 'fs-extra';
import { getRootDirectory, shellCd, shellExec } from '../../server/process.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const Lampp = {
  ports: [],
  initService: async function (options = { daemon: false }) {
    let cmd;
    // linux
    // /opt/lampp/apache2/conf/httpd.conf
    fs.writeFileSync(`/opt/lampp/etc/extra/httpd-vhosts.conf`, this.router || '', 'utf8');
    fs.writeFileSync(
      `/opt/lampp/etc/httpd.conf`,
      fs
        .readFileSync(`/opt/lampp/etc/httpd.conf`, 'utf8')
        .replace(`#Include etc/extra/httpd-vhosts.conf`, `Include etc/extra/httpd-vhosts.conf`),
      'utf8',
    );

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
    cmd = `sudo /opt/lampp/lampp start`;
    if (this.router) fs.writeFileSync(`./tmp/lampp-router.conf`, this.router, 'utf-8');
    shellExec(cmd);
  },
  enabled: () => fs.existsSync(`/opt/lampp/etc/httpd.conf`),
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
          }

          if (fs.existsSync(`/opt/lampp/logs/access_log`))
            fs.copySync(`/opt/lampp/logs/access_log`, `/opt/lampp/logs/access.log`);
          if (fs.existsSync(`/opt/lampp/logs/error_log`))
            fs.copySync(`/opt/lampp/logs/error_log`, `/opt/lampp/logs/error.log`);
          if (fs.existsSync(`/opt/lampp/logs/php_error_log`))
            fs.copySync(`/opt/lampp/logs/php_error_log`, `/opt/lampp/logs/php_error.log`);
          if (fs.existsSync(`/opt/lampp/logs/ssl_request_log`))
            fs.copySync(`/opt/lampp/logs/ssl_request_log`, `/opt/lampp/logs/ssl_request.log`);

          await Lampp.initService({ daemon: true });
        }

        break;

      default:
        break;
    }
  },
  createApp: async ({ port, host, path, directory, rootHostPath, redirect, redirectTarget }) => {
    if (!Lampp.enabled()) return { disabled: true };
    if (!Lampp.ports.includes(port)) Lampp.ports.push(port);
    if (currentPort === initPort) Lampp.removeRouter();
    Lampp.appendRouter(`
Listen ${port}

<VirtualHost *:${port}>
  DocumentRoot "${directory ? directory : `${getRootDirectory()}${rootHostPath}`}"
  ServerName ${host}:${port}

  <Directory "${directory ? directory : `${getRootDirectory()}${rootHostPath}`}">
    Options Indexes FollowSymLinks MultiViews
    AllowOverride All
    Require all granted
  </Directory>

  ${
    redirect
      ? `
    RewriteEngine on

    RewriteCond %{REQUEST_URI} !^/.well-known/acme-challenge
    RewriteRule ^(.*)$ ${redirectTarget}%{REQUEST_URI} [R=302,L]
  `
      : ''
  }

  ErrorDocument 400 ${path === '/' ? '' : path}/400.html
  ErrorDocument 404 ${path === '/' ? '' : path}/400.html
  ErrorDocument 500 ${path === '/' ? '' : path}/500.html
  ErrorDocument 502 ${path === '/' ? '' : path}/500.html
  ErrorDocument 503 ${path === '/' ? '' : path}/500.html
  ErrorDocument 504 ${path === '/' ? '' : path}/500.html

</VirtualHost>
            
`);
    // ERR too many redirects:
    // Check: SELECT * FROM database.wp_options where option_name = 'siteurl' or option_name = 'home';
    // Check: wp-config.php
    // if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
    //   $_SERVER['HTTPS'] = 'on';
    // }
    // For plugins:
    // define( 'FS_METHOD', 'direct' );

    // ErrorDocument 404 /custom_404.html
    // ErrorDocument 500 /custom_50x.html
    // ErrorDocument 502 /custom_50x.html
    // ErrorDocument 503 /custom_50x.html
    // ErrorDocument 504 /custom_50x.html

    // Respond When Error Pages are Directly Requested

    // <Files "custom_404.html">
    //     <If "-z %{ENV:REDIRECT_STATUS}">
    //         RedirectMatch 404 ^/custom_404.html$
    //     </If>
    // </Files>

    // <Files "custom_50x.html">
    //     <If "-z %{ENV:REDIRECT_STATUS}">
    //         RedirectMatch 404 ^/custom_50x.html$
    //     </If>
    // </Files>

    // Add www or https with htaccess rewrite

    // Options +FollowSymLinks
    // RewriteEngine On
    // RewriteCond %{HTTP_HOST} ^ejemplo.com [NC]
    // RewriteRule ^(.*)$ http://ejemplo.com/$1 [R=301,L]

    // Redirect http to https with htaccess rewrite

    // RewriteEngine On
    // RewriteCond %{SERVER_PORT} 80
    // RewriteRule ^(.*)$ https://www.ejemplo.com/$1 [R,L]

    // Redirect to HTTPS with www subdomain

    // RewriteEngine On
    // RewriteCond %{HTTPS} off [OR]
    // RewriteCond %{HTTP_HOST} ^www\. [NC]
    // RewriteCond %{HTTP_HOST} ^(?:www\.)?(.+)$ [NC]
    // RewriteRule ^ https://%1%{REQUEST_URI} [L,NE,R=301]
  },
};

export { Lampp };
