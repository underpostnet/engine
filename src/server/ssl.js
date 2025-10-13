/**
 * Provides utilities for managing, building, and serving SSL/TLS contexts,
 * primarily using Certbot files and creating HTTPS servers.
 * @module src/server/ssl.js
 * @namespace Ssl
 */

import fs from 'fs-extra';
import https from 'https';
import path from 'path';
import dotenv from 'dotenv';
import { loggerFactory } from './logger.js';

dotenv.config();
const logger = loggerFactory(import.meta);

const DEFAULT_HOST = 'localhost';
const SSL_BASE = (host = DEFAULT_HOST) => path.resolve(`./engine-private/ssl/${host}`);

// Common filename candidates for certs/keys produced by various tools (mkcert, certbot, openssl scripts).
const CERT_CANDIDATES = [
  'fullchain.pem',
  'cert.pem',
  'ca_bundle.crt',
  'crt.crt',
  `${DEFAULT_HOST}.pem`,
  `${DEFAULT_HOST}.crt`,
  `${DEFAULT_HOST}-fullchain.pem`,
];
const KEY_CANDIDATES = [
  'privkey.pem',
  'key.key',
  'private.key',
  'key.pem',
  `${DEFAULT_HOST}-key.pem`,
  `${DEFAULT_HOST}.key`,
];
const ROOT_CANDIDATES = ['rootCA.pem', 'ca.pem', 'ca.crt', 'root.pem'];

class Ssl {
  /**
   * Look for existing SSL files under engine-private/ssl/<host> and return canonical paths.
   * It attempts to be permissive: accepts cert-only, cert+ca, or fullchain.
   * @param {string} host
   * @returns {{key?:string, cert?:string, fullchain?:string, ca?:string, dir:string}}
   * @memberof Ssl
   */
  static locateSslFiles(host = DEFAULT_HOST) {
    const dir = SSL_BASE(host);
    const result = { dir };

    if (!fs.existsSync(dir)) {
      logger.warn('SSL dir does not exist', { dir });
      return result;
    }

    // find key
    for (const name of KEY_CANDIDATES) {
      const p = path.join(dir, name);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        result.key = p;
        break;
      }
    }

    // find fullchain first
    for (const name of CERT_CANDIDATES) {
      const p = path.join(dir, name);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        // treat fullchain.pem / ca_bundle.crt as fullchain if name indicates so
        if (
          ['fullchain.pem', 'ca_bundle.crt', `${host}-fullchain.pem`].includes(name) ||
          name.endsWith('fullchain.pem')
        ) {
          result.fullchain = p;
          result.cert = p; // fullchain will be used as cert when building context
          break;
        }
        // otherwise candidate may be leaf cert
        if (!result.cert) result.cert = p;
      }
    }

    // find root/ca if not using fullchain
    if (!result.fullchain) {
      // check for direct ca bundle (cert + ca combined) names
      const caCandidates = ROOT_CANDIDATES.concat(['ca_bundle.crt']);
      for (const name of caCandidates) {
        const p = path.join(dir, name);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          result.ca = p;
          break;
        }
      }
      // if no dedicated ca found but cert looks like leaf and there is separate ca under other known names,
      // try to detect cert + ca in a single file (not trivial) — we prefer explicit ca
    }

    return result;
  }

  /**
   * Validate that a secure context can be built for host (key + cert or fullchain present)
   * @param {string} host
   * @returns {boolean}
   * @memberof Ssl
   */
  static validateSecureContext(host = DEFAULT_HOST) {
    const files = Ssl.locateSslFiles(host);
    return Boolean((files.key && files.cert) || (files.key && files.fullchain));
  }

  /**
   * Build a Node.js https.createServer options object (key, cert, ca) for the given host.
   * If a fullchain is available it will be used for cert and ca will be omitted (fullchain already includes chain).
   * If separate cert + ca are found, they will be used accordingly.
   * @param {string} host
   * @returns {{key:string, cert:string, ca?:string}} options
   * @memberof Ssl
   */
  static buildSecureContext(host = DEFAULT_HOST) {
    const files = Ssl.locateSslFiles(host);
    if (!files.key) throw new Error(`SSL key not found for host ${host} (looked in ${files.dir})`);
    if (!files.cert) throw new Error(`SSL certificate not found for host ${host} (looked in ${files.dir})`);

    const key = fs.readFileSync(files.key, 'utf8');
    const cert = fs.readFileSync(files.cert, 'utf8');

    // If we have a root CA file (explicit) and cert is leaf-only, include ca
    if (files.ca && files.ca !== files.cert) {
      const ca = fs.readFileSync(files.ca, 'utf8');
      return { key, cert, ca };
    }

    // If cert is fullchain (already contains chain), just return key/cert
    return { key, cert };
  }

  /**
   * Convenience: ensure default host directory exists and copy any matching cert/key files into it using canonical names.
   * This is useful if your generator produced nonstandard names and you want to normalize them.
   * The function will copy existing discovered files to: key.key, crt.crt, ca_bundle.crt when possible.
   * @param {string} host
   * @returns {boolean} true if at least key+cert exist after operation
   * @memberof Ssl
   */
  static async buildLocalSSL(host = DEFAULT_HOST) {
    const dir = SSL_BASE(host);
    await fs.ensureDir(dir);
    const files = Ssl.locateSslFiles(host);

    // If key+cert already exist under canonical names, done
    const canonicalKey = path.join(dir, 'key.key');
    const canonicalCert = path.join(dir, 'crt.crt');
    const canonicalCa = path.join(dir, 'ca_bundle.crt');

    try {
      if (files.key && files.key !== canonicalKey) await fs.copy(files.key, canonicalKey, { overwrite: true });
      if (files.cert && files.cert !== canonicalCert) await fs.copy(files.cert, canonicalCert, { overwrite: true });
      if (files.ca && files.ca !== canonicalCa) await fs.copy(files.ca, canonicalCa, { overwrite: true });

      // If we had a fullchain but not a separate ca, write fullchain also to ca_bundle if missing
      if (files.fullchain && !fs.existsSync(canonicalCa)) {
        await fs.copy(files.fullchain, canonicalCa, { overwrite: false });
      }
    } catch (err) {
      logger.warn('buildLocalSSL copy step failed', { err: err.message });
    }

    return Ssl.validateSecureContext(host);
  }

  /**
   * Create an HTTPS server (first host) and/or attach SNI contexts for additional hosts.
   * hosts param is an object whose keys are hostnames (e.g. { 'localhost': {...} }).
   * Returns the created https.Server instance (or undefined if none created).
   * @param {import('express').Application} app
   * @param {Object<string, any>} hosts
   * @returns {{ServerSSL?: https.Server}}
   * @memberof Ssl
   */
  static async createSslServer(app, hosts = { [DEFAULT_HOST]: {} }) {
    let server;
    for (const host of Object.keys(hosts)) {
      // ensure canonical files exist (copies where possible)
      await Ssl.buildLocalSSL(host);
      if (!Ssl.validate_secure_context_check(host)) {
        // backward compatibility: some callers expect validateSecureContext
        if (!Ssl.validateSecureContext(host)) {
          logger.error('Invalid SSL context, skipping host', { host });
          continue;
        }
      }

      // build secure context options
      try {
        const ctx = Ssl.buildSecureContext(host);
        if (!server) {
          server = https.createServer(ctx, app);
          logger.info('Created HTTPS server for host', { host });
        } else {
          server.addContext(host, ctx);
          logger.info('Added SNI context for host', { host });
        }
      } catch (err) {
        logger.error('Failed to build secure context', { host, message: err.message });
      }
    }

    return { ServerSSL: server };
  }

  /**
   * Middleware that redirects HTTP -> HTTPS in production for recognized hosts.
   * Skips ACME challenge paths.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {number} port
   * @param {Object<string, any>} proxyRouter
   * @returns {import('express').RequestHandler}
   * @memberof Ssl
   */
  static sslRedirectMiddleware(req, res, port = 80, proxyRouter = {}) {
    const sslRedirectUrl = `https://${req.headers.host}${req.url}`;
    if (
      process.env.NODE_ENV === 'production' &&
      port !== 443 &&
      !req.secure &&
      !req.url.startsWith('/.well-known/acme-challenge') &&
      proxyRouter[443] &&
      Object.keys(proxyRouter[443]).find((host) => {
        const [hostSSL] = host.split('/');
        return sslRedirectUrl.match(hostSSL) && Ssl.validateSecureContext(hostSSL);
      })
    ) {
      return res.status(302).redirect(sslRedirectUrl);
    }
  }
}

// small helper for internal backward compatibility check name typo in older code
Ssl.validate_secure_context_check = Ssl.validateSecureContext;

// Backward compatibility exports
const buildSSL = Ssl.buildLocalSSL;
const buildSecureContext = Ssl.buildSecureContext;
const validateSecureContext = Ssl.validateSecureContext;
const createSslServer = Ssl.createSslServer;
const sslRedirectMiddleware = Ssl.sslRedirectMiddleware;

export { Ssl, buildSSL, buildSecureContext, validateSecureContext, createSslServer, sslRedirectMiddleware };
