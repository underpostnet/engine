/**
 * @namespace Ssl
 * @description Provides utilities for managing, building, and serving SSL/TLS contexts,
 * primarily using Certbot files and creating HTTPS servers.
 * @module src/server/ssl.js
 */

import fs from 'fs-extra';
import dotenv from 'dotenv';
import https from 'https';
import { loggerFactory } from './logger.js';
import { range } from '../client/components/core/CommonJs.js';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * Main class for handling SSL/TLS operations.
 * All utility methods are implemented as static to serve as a namespace container.
 * @class
 * @augments Ssl
 */
class Ssl {
  /**
   * Searches for and copies Certbot SSL files (key, cert, chain) from the
   * configured live path to the private engine directory for a given host.
   * @async
   * @static
   * @memberof Ssl
   * @param {string} host The hostname or host path to process (e.g., 'example.com' or 'example.com/path').
   * @returns {Promise<boolean>} True if SSL files were successfully found and copied, false otherwise.
   */
  static async buildSSL(host) {
    const sslPath = process.env.CERTBOT_LIVE_PATH;
    host = host.replaceAll(`\\`, '/');
    const [hostSSL, path] = host.split('/');
    if (path || !fs.existsSync(sslPath)) return false;
    const files = await fs.readdir(sslPath);

    for (const folderHost of files)
      if (folderHost.match(host.split('/')[0]) && host.split('.')[0] === folderHost.split('.')[0]) {
        // Certbot often appends a number to certificate files during renewal, check up to 10
        for (const i of [''].concat(range(1, 10))) {
          const privateKeyPath = `${sslPath}/${folderHost}/privkey${i}.pem`;
          const certificatePath = `${sslPath}/${folderHost}/cert${i}.pem`;
          const caPath = `${sslPath}/${folderHost}/chain${i}.pem`;
          const caFullPath = `${sslPath}/${folderHost}/fullchain${i}.pem`;

          if (
            fs.existsSync(privateKeyPath) &&
            fs.existsSync(certificatePath) &&
            fs.existsSync(caPath) &&
            fs.existsSync(caFullPath)
          ) {
            const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
            const certificate = fs.readFileSync(certificatePath, 'utf8');
            const ca = fs.readFileSync(caPath, 'utf8');
            const caFull = fs.readFileSync(caFullPath, 'utf8');

            logger.info(`SSL files update`, host);

            const targetDir = `./engine-private/ssl/${host}`;
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

            // Save files to the local private directory
            fs.writeFileSync(`${targetDir}/key.key`, privateKey, 'utf8');
            fs.writeFileSync(`${targetDir}/crt.crt`, certificate, 'utf8');
            fs.writeFileSync(`${targetDir}/ca_bundle.crt`, caFull, 'utf8'); // Full chain commonly used as 'cert' in Node

            // Save intermediate files for reference
            fs.writeFileSync(`${targetDir}/_ca_bundle.crt`, ca, 'utf8');
            fs.writeFileSync(`${targetDir}/_ca_full_bundle.crt`, caFull, 'utf8');

            return true;
          }
        }
      }
    return false;
  }

  /**
   * Checks if the required SSL files for a host exist in the private engine directory.
   * @static
   * @memberof Ssl
   * @param {string} host The hostname to check.
   * @returns {boolean} True if key, cert, and ca_bundle files are present.
   */
  static validateSecureContext(host) {
    return (
      fs.existsSync(`./engine-private/ssl/${host}/key.key`) &&
      fs.existsSync(`./engine-private/ssl/${host}/crt.crt`) &&
      fs.existsSync(`./engine-private/ssl/${host}/ca_bundle.crt`)
    );
  }

  /**
   * Creates a Node.js compatible secure context object for `https.createServer`.
   * @static
   * @memberof Ssl
   * @param {string} host The hostname for which to build the context.
   * @returns {object} The secure context object with key, cert, and ca properties.
   */
  static buildSecureContext(host) {
    return {
      key: fs.readFileSync(`./engine-private/ssl/${host}/key.key`, 'utf8'),
      // Certbot full chain is used as the main certificate here
      cert: fs.readFileSync(`./engine-private/ssl/${host}/ca_bundle.crt`, 'utf8'),
      ca: fs.readFileSync(`./engine-private/ssl/${host}/ca_bundle.crt`, 'utf8'),
    };
  }

  /**
   * Creates an HTTPS server or adds contexts to an existing one for all configured hosts.
   * @async
   * @static
   * @memberof Ssl
   * @param {express.Application} app The Express application instance to handle requests.
   * @param {object} hosts A map of hostnames to configuration objects.
   * @returns {Promise<{ServerSSL: (https.Server|undefined)}>} An object containing the created HTTPS server instance.
   */
  static async createSslServer(app, hosts) {
    let ServerSSL;
    for (const host of Object.keys(hosts)) {
      const [hostSSL, path = ''] = host.split('/');
      await Ssl.buildSSL(host);
      const validSSL = Ssl.validateSecureContext(hostSSL);
      if (validSSL) {
        if (!ServerSSL) ServerSSL = https.createServer(Ssl.buildSecureContext(hostSSL), app);
        else ServerSSL.addContext(hostSSL, Ssl.buildSecureContext(hostSSL));
      } else logger.error('Invalid SSL context', { host, ...hosts[host] });
    }
    return { ServerSSL };
  }

  /**
   * Middleware to redirect insecure HTTP requests (port 80) to HTTPS (port 443) in production.
   * It skips redirect for ACME challenge paths used by Certbot.
   * @static
   * @memberof Ssl
   * @param {object} req Express request object.
   * @param {object} res Express response object.
   * @param {number} port The port the current server is listening on.
   * @param {object} proxyRouter The full proxy routing table to check for valid SSL hosts on port 443.
   * @returns {void|express.Response} Returns a redirect response if conditions are met.
   */
  static sslRedirectMiddleware(req, res, port, proxyRouter) {
    const sslRedirectUrl = `https://${req.headers.host}${req.url}`;
    if (
      process.env.NODE_ENV === 'production' &&
      port !== 443 &&
      !req.secure &&
      !req.url.startsWith(`/.well-known/acme-challenge`) &&
      proxyRouter[443] &&
      Object.keys(proxyRouter[443]).find((host) => {
        const [hostSSL, path = ''] = host.split('/');
        return sslRedirectUrl.match(hostSSL) && Ssl.validateSecureContext(hostSSL);
      })
    )
      return res.status(302).redirect(sslRedirectUrl);
  }
}

// Backward compatibility exports
/** @type {function(string): Promise<boolean>} */
const buildSSL = Ssl.buildSSL;
/** @type {function(string): object} */
const buildSecureContext = Ssl.buildSecureContext;
/** @type {function(string): boolean} */
const validateSecureContext = Ssl.validateSecureContext;
/** @type {function(express.Application, object): Promise<{ServerSSL: (https.Server|undefined)}>} */
const createSslServer = Ssl.createSslServer;
/** @type {function(object, object, number, object): (void|express.Response)} */
const sslRedirectMiddleware = Ssl.sslRedirectMiddleware;

export { Ssl, buildSSL, buildSecureContext, validateSecureContext, createSslServer, sslRedirectMiddleware };
