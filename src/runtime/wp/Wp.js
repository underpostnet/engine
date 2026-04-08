/**
 * WordPress runtime for the Underpost engine.
 * Manages WordPress installations backed by LAMPP (Apache + PHP 8+) and MariaDB.
 *
 * Two provisioning modes:
 *   - **clone**  — `conf.repository` is set: clones that GitHub repo as the wp root.
 *   - **fresh**  — no `conf.repository`: downloads wordpress.org/latest.zip, creates
 *                  the database if it does not exist, and writes wp-config.php.
 *
 * @module src/runtime/wp/Wp.js
 * @namespace WpService
 */

import fs from 'fs-extra';
import path from 'path';
import { shellExec } from '../../server/process.js';
import { loggerFactory } from '../../server/logger.js';
import { Lampp } from '../lampp/Lampp.js';

const logger = loggerFactory(import.meta);

const WP_DOWNLOAD_URL = 'https://wordpress.org/latest.zip';
const WP_ZIP_PATH = '/tmp/wordpress-latest.zip';
const WP_BASE_DIR = '/opt/lampp/htdocs/wp';

/**
 * @class WpService
 * @description Manages WordPress provisioning and Apache virtual-host wiring
 * on top of the LAMPP service.  Each server conf entry with `runtime: 'wp'`
 * is handled here.
 * @memberof WpService
 */
class WpService {
  /**
   * Ensures the base WordPress hosting directory exists.
   */
  static ensureBaseDir() {
    if (!fs.existsSync(WP_BASE_DIR)) fs.mkdirSync(WP_BASE_DIR, { recursive: true });
  }

  /**
   * Returns the on-disk root path for a WordPress site.
   * @param {string} host  - Virtual-host name (used as folder name).
   * @returns {string}
   */
  static siteDir(host) {
    return path.join(WP_BASE_DIR, host);
  }

  /**
   * Provisions a WordPress site and registers it with the LAMPP virtual-host router.
   *
   * Directory layout (e.g. host='test.nexodev.org', pathRoute='/wp'):
   *   - DocumentRoot (vhostDir): /opt/lampp/htdocs/wp/test.nexodev.org
   *   - WordPress files (wpDir): /opt/lampp/htdocs/wp/test.nexodev.org/wp
   *   - Root .htaccess rewrites / → /wp/ so Apache serves WordPress transparently.
   *
   * When pathRoute='/' the DocumentRoot and wpDir are the same directory.
   *
   * @param {object} opts
   * @param {number}      opts.port            - Apache VirtualHost listen port.
   * @param {string}      opts.host            - Server name / virtual host.
   * @param {string}      opts.pathRoute       - URL path (e.g. '/wp' or '/').
   * @param {string|null} [opts.repository]    - GitHub HTTPS clone URL. When set the
   *                                             site root is cloned instead of downloading WordPress.
   * @param {object|null} [opts.db]            - MariaDB connection config:
   *                                             `{ host, name, user, password }`.
   *                                             Required for fresh installs; ignored when
   *                                             `repository` is set (wp-config.php is assumed
   *                                             to be part of the repo).
   * @param {object|null} [opts.wp]            - WordPress install config:
   *                                             `{ title, adminUser, adminPassword, adminEmail }`.
   * @param {boolean}     [opts.redirect]      - If true, enables Apache RewriteEngine redirection.
   * @param {string}      [opts.redirectTarget] - Target URL for the redirect rule.
   * @param {boolean}     [opts.resetRouter]   - Clear LAMPP router before appending.
   * @returns {{ disabled: boolean }}
   */
  static createApp({ port, host, pathRoute, repository, db, wp, redirect, redirectTarget, resetRouter }) {
    if (!Lampp.enabled()) {
      logger.warn(`LAMPP not installed — skipping ${host}`);
      return { disabled: true };
    }

    WpService.ensureBaseDir();

    // DocumentRoot for the Apache VirtualHost — always under WP_BASE_DIR/<host>
    const vhostDir = WpService.siteDir(host);

    // When pathRoute is a subdirectory (e.g. '/wp'), WordPress files live one level deeper.
    // When pathRoute is '/' they share the same directory as the DocumentRoot.
    const subDir = pathRoute && pathRoute !== '/' ? pathRoute.replace(/^\/+/, '').replace(/\/+$/, '') : '';
    const wpDir = subDir ? path.join(vhostDir, subDir) : vhostDir;

    if (repository) {
      WpService.provisionClone({ host, siteRoot: wpDir, repository, db, wp, subDir });
    } else {
      WpService.provisionFresh({ host, siteRoot: wpDir, db, wp, subDir });
    }

    // Write a root .htaccess that rewrites / → /subDir/ when running in subdirectory mode
    if (subDir) {
      WpService.ensureSubdirHtaccess({ vhostDir, subDir });
    }

    // Wire up Apache VirtualHost via Lampp — DocumentRoot is always vhostDir;
    // Lampp.createApp uses `directory` directly as the DocumentRoot.
    const { disabled } = Lampp.createApp({
      port,
      host,
      path: pathRoute,
      directory: vhostDir,
      redirect,
      redirectTarget,
      resetRouter,
    });

    return { disabled };
  }

  /**
   * Clone mode — clones `repository` into `siteRoot` if not present, then
   * verifies `wp-config.php` exists.  If it is missing the site root is wiped
   * and a fresh WordPress install is performed (requires `db` config).
   * @param {object} opts
   * @param {string}      opts.host       - Virtual-host name (for logging).
   * @param {string}      opts.siteRoot   - Absolute path where the site should live.
   * @param {string}      opts.repository - HTTPS clone URL.
   * @param {object|null} [opts.db]       - MariaDB config used as fallback for fresh install.
   */
  static provisionClone({ host, siteRoot, repository, db, wp, subDir = '' }) {
    // Step 0 — verify the remote repository is reachable; fall back to fresh install if not
    const remoteCheck = shellExec(`git ls-remote "${repository}" HEAD 2>/dev/null`, {
      stdout: true,
      silent: true,
    });
    if (!remoteCheck || !remoteCheck.trim()) {
      logger.warn(`${host}: remote repository not accessible (${repository}) — running fresh install`);
      WpService.provisionFresh({ host, siteRoot, db, wp, subDir });
      return;
    }

    // Step 1 — clone if the directory does not exist yet
    if (!fs.existsSync(siteRoot)) {
      logger.info(`${host}: cloning ${repository} → ${siteRoot}`);
      const tmp = `${siteRoot}.tmp`;
      if (fs.existsSync(tmp)) shellExec(`sudo rm -rf "${tmp}"`);
      shellExec(`git clone "${repository}" "${tmp}"`);
      shellExec(`sudo mv "${tmp}" "${siteRoot}"`);
      shellExec(`sudo chmod -R 755 "${siteRoot}"`);
      shellExec(`sudo chown -R $(whoami):$(whoami) "${siteRoot}"`);
    } else {
      logger.info(`${host}: repo already present at ${siteRoot}`);
    }

    // Step 2 — verify wp-config.php; if missing, wipe and do a fresh install
    if (!fs.existsSync(path.join(siteRoot, 'wp-config.php'))) {
      logger.warn(`${host}: wp-config.php not found — wiping site root and running fresh install`);
      shellExec(`sudo rm -rf "${siteRoot}"`);
      WpService.provisionFresh({ host, siteRoot, db, wp, subDir });
    }
  }

  /**
   * Fresh-install mode — downloads wordpress.org/latest.zip, extracts it,
   * creates the MariaDB database, and writes wp-config.php.
   * @param {object}      opts
   * @param {string}      opts.host     - Virtual-host name (for logging).
   * @param {string}      opts.siteRoot - Absolute path where WordPress should live.
   * @param {object|null} opts.db       - `{ host, name, user, password }`.
   */
  static provisionFresh({ host, siteRoot, db, wp, subDir = '' }) {
    // Validator: wp-config.php presence means installation is complete/valid
    if (fs.existsSync(path.join(siteRoot, 'wp-config.php'))) {
      logger.info(`${host}: wp-config.php found at ${siteRoot}, skipping fresh install`);
      return;
    }

    logger.info(`${host}: fresh install → ${siteRoot}`);

    // Download WordPress zip if not already cached
    if (!fs.existsSync(WP_ZIP_PATH)) {
      shellExec(`curl -Lo "${WP_ZIP_PATH}" "${WP_DOWNLOAD_URL}"`);
    }

    // Extract to /tmp/wordpress then move to siteRoot
    const extractDir = '/tmp/wp-extract';
    if (fs.existsSync(extractDir)) shellExec(`sudo rm -rf "${extractDir}"`);
    fs.mkdirSync(extractDir, { recursive: true });
    shellExec(`unzip -q "${WP_ZIP_PATH}" -d "${extractDir}"`);
    // The zip always extracts to /tmp/wp-extract/wordpress/
    const extracted = path.join(extractDir, 'wordpress');
    if (fs.existsSync(siteRoot)) shellExec(`sudo rm -rf "${siteRoot}"`);
    // Ensure parent directory exists (e.g. /opt/lampp/htdocs/wp/<host>/)
    const parentDir = path.dirname(siteRoot);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
    shellExec(`sudo mv "${extracted}" "${siteRoot}"`);
    shellExec(`sudo chmod -R 755 "${siteRoot}"`);
    shellExec(`sudo chown -R $(whoami):$(whoami) "${siteRoot}"`);

    if (db) {
      WpService.createDatabase(db);
      WpService.writeWpConfig({ siteRoot, db, host, subDir });
      WpService.wpCliInstall({ siteRoot, db, host, wp, subDir });
    } else {
      logger.warn(`${host}: no db config provided — wp-config.php not written`);
    }
  }

  /**
   * Runs WP-CLI to complete the WordPress installation non-interactively,
   * then installs and activates the Wordfence security plugin.
   * Safe to call on an already-installed site — wp-cli will detect it and skip.
   * @param {object} opts
   * @param {string} opts.siteRoot - Absolute path to the WordPress installation.
   * @param {object} opts.db       - MariaDB config (unused here but kept for signature consistency).
   * @param {string} opts.host     - Virtual-host name.
   * @param {object|null} [opts.wp] - WordPress install config from server conf:
   *                                  `{ title, adminUser, adminPassword, adminEmail }`.
   * @param {string} [opts.subDir] - Subdirectory name (e.g. 'wp').
   */
  static wpCliInstall({ siteRoot, db, host, wp, subDir = '' }) {
    const siteUrl = subDir ? `https://${host}/${subDir}` : `https://${host}`;
    const adminUser = (wp && wp.adminUser) || process.env.WP_ADMIN_USER || 'admin';
    const adminPassword =
      (wp && wp.adminPassword) ||
      process.env.WP_ADMIN_PASSWORD ||
      'ChangeMe_' + Math.random().toString(36).slice(2, 10);
    const adminEmail = (wp && wp.adminEmail) || process.env.WP_ADMIN_EMAIL || `admin@${host}`;
    const siteTitle = (wp && wp.title) || process.env.WP_SITE_TITLE || host;
    const wpCli = (cmd) => shellExec(`wp --allow-root --path="${siteRoot}" ${cmd}`, { stdout: true, silent: false });

    // Step 1 — install WordPress core (skipped automatically by WP-CLI if already installed)
    logger.info(`${host}: running wp core install`);
    wpCli(
      `core install` +
        ` --url="${siteUrl}"` +
        ` --title="${siteTitle}"` +
        ` --admin_user="${adminUser}"` +
        ` --admin_password="${adminPassword}"` +
        ` --admin_email="${adminEmail}"` +
        ` --skip-email`,
    );

    // Step 2 — install and activate Wordfence Security
    logger.info(`${host}: installing Wordfence security plugin`);
    wpCli(`plugin install wordfence --activate`);

    // Step 3 — enable auto-updates for the plugin
    wpCli(`plugin auto-updates enable wordfence`);

    logger.info(`${host}: WP-CLI provisioning complete`, { siteUrl, adminUser, adminEmail });
  }

  /**
   * Writes a .htaccess file at the vhost document root that rewrites all
   * requests to a WordPress subdirectory (Method I — without URL change).
   * @param {{ vhostDir: string, subDir: string }} opts
   */
  static ensureSubdirHtaccess({ vhostDir, subDir }) {
    if (!fs.existsSync(vhostDir)) fs.mkdirSync(vhostDir, { recursive: true });
    const htaccessPath = path.join(vhostDir, '.htaccess');
    const content = `<IfModule mod_rewrite.c>
RewriteEngine on
RewriteCond %{REQUEST_URI} !^\/${subDir}\/
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ \/${subDir}\/$1
RewriteRule ^(\/)?$ \/${subDir}\/index.php [L]
<\/IfModule>
`;
    fs.writeFileSync(htaccessPath, content, 'utf8');
    logger.info(`subdirectory .htaccess written`, { vhostDir, subDir });
  }

  /**
   * Creates a MariaDB database and user if they do not already exist.
   * @param {{ host: string, name: string, user: string, password: string }} db
   */
  static createDatabase({ host, name, user, password }) {
    logger.info(`Creating database "${name}" on ${host} if not exists`);
    // Use the LAMPP bundled mysql client
    const mysql = `/opt/lampp/bin/mysql`;
    const q = (s) => s.replace(/'/g, "\\'");
    shellExec(
      `${mysql} -h '${host}' -u '${q(user)}' -p'${q(password)}' -e ` +
        `"CREATE DATABASE IF NOT EXISTS \\\`${q(name)}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`,
    );
  }

  /**
   * Writes a minimal `wp-config.php` from `wp-config-sample.php`.
   * @param {{ siteRoot: string, db: { host: string, name: string, user: string, password: string } }} opts
   */
  static writeWpConfig({ siteRoot, db, host = '', subDir = '' }) {
    const sample = path.join(siteRoot, 'wp-config-sample.php');
    const target = path.join(siteRoot, 'wp-config.php');
    if (!fs.existsSync(sample)) {
      logger.warn(`wp-config-sample.php not found at ${siteRoot}`);
      return;
    }
    let cfg = fs.readFileSync(sample, 'utf8');
    cfg = cfg
      .replace("define( 'DB_NAME', 'database_name_here' );", `define( 'DB_NAME', '${db.name}' );`)
      .replace("define( 'DB_USER', 'username_here' );", `define( 'DB_USER', '${db.user}' );`)
      .replace("define( 'DB_PASSWORD', 'password_here' );", `define( 'DB_PASSWORD', '${db.password}' );`)
      .replace("define( 'DB_HOST', 'localhost' );", `define( 'DB_HOST', '${db.host}' );`)
      .replace("define( 'DB_CHARSET', 'utf8' );", `define( 'DB_CHARSET', 'utf8mb4' );`);
    // When WordPress is installed in a subdirectory, WP_HOME and WP_SITEURL must be set
    if (host && subDir) {
      const wpSiteUrl = `https://${host}/${subDir}`;
      cfg = cfg.replace(
        '/** Absolute path to the WordPress directory. */',
        `define( 'WP_HOME', '${wpSiteUrl}' );\ndefine( 'WP_SITEURL', '${wpSiteUrl}' );\n\n/** Absolute path to the WordPress directory. */`,
      );
    }
    // Inject reverse-proxy HTTPS detection (needed behind Contour/envoy)
    const httpsSnippet = `
if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
  $_SERVER['HTTPS'] = 'on';
}
`;
    cfg = cfg.replace('<?php', `<?php\n${httpsSnippet}`);
    fs.writeFileSync(target, cfg, 'utf8');
    logger.info(`wp-config.php written for ${db.name}`);
  }

  /**
   * Backs up a WordPress site: exports the MariaDB database and pushes the
   * site directory to its git remote (if it is a git repo).
   * @param {object} opts
   * @param {string} opts.host       - Virtual-host name.
   * @param {object|null} opts.db    - MariaDB config `{ host, name, user, password }`.
   */
  static backup({ host }) {
    const siteRoot = WpService.siteDir(host);
    logger.info(`backup: ${host}`);

    // MariaDB export is handled by the shared db.js backup flow — no duplicate dump here.
    if (fs.existsSync(path.join(siteRoot, '.git'))) {
      shellExec(`cd "${siteRoot}" && git add -A && git commit -m "wp backup $(date -u +%Y-%m-%dT%H:%M:%SZ)" || true`);
      shellExec(`cd "${siteRoot}" && git push`);
      logger.info(`backup: git push done for ${siteRoot}`);
    }
  }
}

export { WpService };
