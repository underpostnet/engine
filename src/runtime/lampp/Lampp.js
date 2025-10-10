/**
 * Exported singleton instance of the LamppService class.
 * This object is used to interact with the Lampp configuration and service.
 * @module src/runtime/lampp/Lampp.js
 * @namespace LamppService
 */

import fs from 'fs-extra';
import { getRootDirectory, shellCd, shellExec } from '../../server/process.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

/**
 * @class LamppService
 * @description Provides utilities for managing the XAMPP (Lampp) service on Linux,
 * including initialization, router configuration, and virtual host creation.
 * It manages the server's configuration files and controls the service process.
 * @memberof LamppService
 */
class LamppService {
  /**
   * @private
   * @type {string | undefined}
   * @description Stores the accumulated Apache virtual host configuration (router definition).
   * @memberof LamppService
   */
  router;

  /**
   * @public
   * @type {number[]}
   * @description A list of ports currently configured and listened to by the Lampp service.
   * @memberof LamppService
   */
  ports;

  /**
   * Creates an instance of LamppService.
   * Initializes the router configuration and ports list.
   * @method constructor
   * @memberof LamppService
   */
  constructor() {
    this.router = undefined;
    this.ports = [];
  }

  /**
   * Checks if the XAMPP (Lampp) service appears to be installed based on the presence of its main configuration file.
   *
   * @method enabled
   * @memberof LamppService
   * @returns {boolean} True if the configuration file exists, indicating Lampp is likely installed.
   * @throws {Error} If the configuration file does not exist.
   * @memberof LamppService
   */
  enabled() {
    return fs.existsSync('/opt/lampp/etc/httpd.conf');
  }

  /**
   * Initializes or restarts the Lampp Apache service.
   * This method configures virtual hosts, disables default ports (80/443) in the main config
   * to avoid conflicts, and starts or stops the service using shell commands.
   *
   * @method initService
   * @param {object} [options={daemon: false}] - Options for service initialization.
   * @param {boolean} [options.daemon=false] - Flag to indicate if the service should be run as a daemon (currently unused in logic).
   * @returns {Promise<void>}
   * @memberof LamppService
   */
  async initService(options = { daemon: false }) {
    let cmd;

    // 1. Write the current virtual host router configuration
    fs.writeFileSync(`/opt/lampp/etc/extra/httpd-vhosts.conf`, this.router || '', 'utf8');

    // 2. Ensure the vhosts file is included in the main httpd.conf
    const httpdConfPath = `/opt/lampp/etc/httpd.conf`;
    fs.writeFileSync(
      httpdConfPath,
      fs
        .readFileSync(httpdConfPath, 'utf8')
        .replace(`#Include etc/extra/httpd-vhosts.conf`, `Include etc/extra/httpd-vhosts.conf`),
      'utf8',
    );

    // 3. Stop the service before making port changes
    cmd = `sudo /opt/lampp/lampp stop`;
    shellExec(cmd);

    // 4. Comment out default port Listen directives (80 and 443) to prevent conflicts
    // Modify httpd.conf (port 80)
    if (!fs.readFileSync(httpdConfPath, 'utf8').match(/# Listen 80/))
      fs.writeFileSync(
        httpdConfPath,
        fs.readFileSync(httpdConfPath, 'utf8').replace(`Listen 80`, `# Listen 80`),
        'utf8',
      );

    // Modify httpd-ssl.conf (port 443)
    const httpdSslConfPath = `/opt/lampp/etc/extra/httpd-ssl.conf`;
    if (fs.existsSync(httpdSslConfPath) && !fs.readFileSync(httpdSslConfPath, 'utf8').match(/# Listen 443/))
      fs.writeFileSync(
        httpdSslConfPath,
        fs.readFileSync(httpdSslConfPath, 'utf8').replace(`Listen 443`, `# Listen 443`),
        'utf8',
      );

    // 5. Modify the lampp startup script to bypass port checking for 80 and 443
    const lamppScriptPath = `/opt/lampp/lampp`;
    if (!fs.readFileSync(lamppScriptPath, 'utf8').match(/testport 443 && false/))
      fs.writeFileSync(
        lamppScriptPath,
        fs.readFileSync(lamppScriptPath, 'utf8').replace(`testport 443`, `testport 443 && false`),
        'utf8',
      );
    if (!fs.readFileSync(lamppScriptPath, 'utf8').match(/testport 80 && false/))
      fs.writeFileSync(
        lamppScriptPath,
        fs.readFileSync(lamppScriptPath, 'utf8').replace(`testport 80`, `testport 80 && false`),
        'utf8',
      );

    // 6. Start the service
    cmd = `sudo /opt/lampp/lampp start`;
    if (this.router) fs.writeFileSync(`./tmp/lampp-router.conf`, this.router, 'utf-8');
    shellExec(cmd);
  }

  /**
   * Appends new Apache VirtualHost configuration content to the internal router string.
   * If a router config file exists from a previous run, it loads it first.
   *
   * @method appendRouter
   * @param {string} render - The new VirtualHost configuration string to append.
   * @returns {string} The complete, updated router configuration string.
   * @memberof LamppService
   */
  appendRouter(render) {
    if (!this.router) {
      if (fs.existsSync(`./tmp/lampp-router.conf`)) {
        this.router = fs.readFileSync(`./tmp/lampp-router.conf`, 'utf-8');
        return this.router + render;
      }
      return (this.router = render);
    }
    return (this.router += render);
  }

  /**
   * Resets the internal router configuration and removes the temporary configuration file.
   *
   * @memberof LamppService
   * @returns {void}
   */
  removeRouter() {
    this.router = undefined;
    if (fs.existsSync(`./tmp/lampp-router.conf`)) fs.rmSync(`./tmp/lampp-router.conf`);
  }

  /**
   * Installs and configures the Lampp service on Linux.
   * This includes downloading the installer, running it, and setting up initial configurations.
   * Only runs on the 'linux' platform.
   *
   * @method install
   * @returns {Promise<void>}
   * @memberof LamppService
   */
  async install() {
    if (process.platform === 'linux') {
      if (!fs.existsSync(`./engine-private/setup`)) fs.mkdirSync(`./engine-private/setup`, { recursive: true });

      shellCd(`./engine-private/setup`);

      if (!process.argv.includes(`server`)) {
        // Download and run the XAMPP installer
        shellExec(
          `curl -Lo xampp-linux-installer.run https://sourceforge.net/projects/xampp/files/XAMPP%20Linux/7.4.30/xampp-linux-x64-7.4.30-1-installer.run?from_af=true`,
        );
        shellExec(`sudo chmod +x xampp-linux-installer.run`);
        shellExec(
          `sudo ./xampp-linux-installer.run --mode unattended && \\` +
            // Create symlink for easier access
            `ln -sf /opt/lampp/lampp /usr/bin/lampp && \\` +
            // Allow all access to xampp config (security measure override)
            `sed -i.bak s'/Require local/Require all granted/g' /opt/lampp/etc/extra/httpd-xampp.conf && \\` +
            // Enable display errors in PHP
            `sed -i.bak s'/display_errors=Off/display_errors=On/g' /opt/lampp/etc/php.ini && \\` +
            // Allow including custom Apache configuration files
            `mkdir /opt/lampp/apache2/conf.d && \\` +
            `echo "IncludeOptional /opt/lampp/apache2/conf.d/*.conf" >> /opt/lampp/etc/httpd.conf && \\` +
            // Create /www directory and symlink it to htdocs
            `mkdir /www && \\` +
            `ln -s /www /opt/lampp/htdocs`,
        );
      }

      // Copy log files to standard names for easier consumption
      if (fs.existsSync(`/opt/lampp/logs/access_log`))
        fs.copySync(`/opt/lampp/logs/access_log`, `/opt/lampp/logs/access.log`);
      if (fs.existsSync(`/opt/lampp/logs/error_log`))
        fs.copySync(`/opt/lampp/logs/error_log`, `/opt/lampp/logs/error.log`);
      if (fs.existsSync(`/opt/lampp/logs/php_error_log`))
        fs.copySync(`/opt/lampp/logs/php_error_log`, `/opt/lampp/logs/php_error.log`);
      if (fs.existsSync(`/opt/lampp/logs/ssl_request_log`))
        fs.copySync(`/opt/lampp/logs/ssl_request_log`, `/opt/lampp/logs/ssl_request.log`);

      // Initialize the service after installation
      await this.initService({ daemon: true });
    }
  }

  /**
   * Creates and appends a new Apache VirtualHost entry to the router configuration for a web application.
   * The router is then applied by calling {@link LamppService#initService}.
   *
   * @method createApp
   * @param {object} options - Configuration options for the new web application.
   * @param {number} options.port - The port the VirtualHost should listen on.
   * @param {string} options.host - The ServerName/host for the VirtualHost.
   * @param {string} options.path - The base path for error documents (e.g., '/app').
   * @param {string} [options.directory] - Optional absolute path to the document root.
   * @param {string} [options.rootHostPath] - Relative path from the root directory to the document root, used if `directory` is not provided.
   * @param {boolean} [options.redirect] - If true, enables RewriteEngine for redirection.
   * @param {string} [options.redirectTarget] - The target URL for redirection.
   * @param {boolean} [options.resetRouter] - If true, clears the existing router configuration before appending the new one.
   * @returns {{disabled: boolean}} An object indicating if the service is disabled.
   * @memberof LamppService
   */
  createApp({ port, host, path, directory, rootHostPath, redirect, redirectTarget, resetRouter }) {
    if (!this.enabled()) return { disabled: true };

    if (!this.ports.includes(port)) this.ports.push(port);
    if (resetRouter) this.removeRouter();

    const documentRoot = directory ? directory : `${getRootDirectory()}${rootHostPath}`;

    // Append the new VirtualHost configuration
    this.appendRouter(`
Listen ${port}

<VirtualHost *:${port}>
  DocumentRoot "${documentRoot}"
  ServerName ${host}:${port}

  <Directory "${documentRoot}">
    Options Indexes FollowSymLinks MultiViews
    AllowOverride All
    Require all granted
  </Directory>

  ${
    redirect
      ? `
    RewriteEngine on

    # Exclude the ACME challenge path for certificate renewals
    RewriteCond %{REQUEST_URI} !^/.well-known/acme-challenge
    RewriteRule ^(.*)$ ${redirectTarget}%{REQUEST_URI} [R=302,L]
  `
      : ''
  }

  # Custom Error Documents
  ErrorDocument 400 ${path === '/' ? '' : path}/400.html
  ErrorDocument 404 ${path === '/' ? '' : path}/400.html
  ErrorDocument 500 ${path === '/' ? '' : path}/500.html
  ErrorDocument 502 ${path === '/' ? '' : path}/500.html
  ErrorDocument 503 ${path === '/' ? '' : path}/500.html
  ErrorDocument 504 ${path === '/' ? '' : path}/500.html

</VirtualHost>
            
`);

    return { disabled: false };
  }
}

/**
 * @description Exported singleton instance of the LamppService class.
 * This object is used to interact with the Lampp configuration and service.
 * @memberof LamppService
 * @type {LamppService}
 */
const Lampp = new LamppService();

export { Lampp };

// -- helper info --

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
// RewriteCond %{HTTP_HOST} ^example.com [NC]
// RewriteRule ^(.*)$ http://example.com/$1 [R=301,L]

// Redirect http to https with htaccess rewrite

// RewriteEngine On
// RewriteCond %{SERVER_PORT} 80
// RewriteRule ^(.*)$ https://www.example.com/$1 [R,L]

// Redirect to HTTPS with www subdomain

// RewriteEngine On
// RewriteCond %{HTTPS} off [OR]
// RewriteCond %{HTTP_HOST} ^www\. [NC]
// RewriteCond %{HTTP_HOST} ^(?:www\.)?(.+)$ [NC]
// RewriteRule ^ https://%1%{REQUEST_URI} [L,NE,R=301]
