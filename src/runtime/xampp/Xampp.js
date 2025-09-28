import fs from 'fs-extra';
import { shellExec, getRootDirectory } from '../../server/process.js';

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
  createApp: async ({ port, host, path, directory, rootHostPath, redirect, redirectTarget, resetRouter }) => {
    if (!Xampp.enabled()) {
      return { disabled: true };
    }
    if (!Xampp.ports.includes(port)) Xampp.ports.push(port);
    if (resetRouter) Xampp.removeRouter();
    Xampp.appendRouter(`
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
  },
};

export { Xampp };
