/**
 * Exported singleton instance of the NginxService class.
 * Manages dynamic generation of nginx reverse-proxy router configuration used
 * by the Docker Compose development stack. Mirrors the conventions of
 * {@link module:src/runtime/lampp/Lampp.js LamppService}.
 * @module src/runtime/nginx/Nginx.js
 * @namespace NginxService
 */

import fs from 'fs-extra';
import path from 'path';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

/**
 * @class NginxService
 * @description Builds nginx `server` blocks (the router) for fronting upstream
 * application services and writes the rendered configuration to disk. The
 * router is accumulated in memory via {@link NginxService#createApp} and
 * flushed with {@link NginxService#writeConf}, keeping config generation
 * decoupled from the filesystem location it is written to.
 * @memberof NginxService
 */
class NginxService {
  /**
   * @type {string}
   * @description Accumulated nginx `server { ... }` blocks (the router definition).
   * @memberof NginxService
   */
  router = '';

  /**
   * @type {Set<string>}
   * @description Upstream blocks keyed by upstream name to avoid duplicates.
   * @memberof NginxService
   */
  upstreams;

  /**
   * @type {boolean}
   * @description Whether a default_server catch-all block has been emitted.
   * @memberof NginxService
   */
  hasDefaultServer;

  constructor() {
    this.reset();
  }

  /**
   * Resets the in-memory router, upstreams, and default-server flag.
   * @method reset
   * @returns {void}
   * @memberof NginxService
   */
  reset() {
    this.router = '';
    this.upstreams = new Map();
    this.hasDefaultServer = false;
  }

  /**
   * Appends a raw render fragment to the router string.
   * @method appendRouter
   * @param {string} render - The configuration fragment to append.
   * @returns {string} The complete, updated router configuration string.
   * @memberof NginxService
   */
  appendRouter(render) {
    if (!this.router) return (this.router = render);
    return (this.router += render);
  }

  /**
   * Clears the in-memory router configuration.
   * @method removeRouter
   * @returns {void}
   * @memberof NginxService
   */
  removeRouter() {
    this.reset();
  }

  /**
   * Registers a named upstream pointing at a container service:port.
   * Idempotent: repeated names with the same target are collapsed.
   * @method addUpstream
   * @param {string} name - The upstream identifier.
   * @param {string} service - The Docker service name (resolved via service discovery).
   * @param {number} port - The upstream container port.
   * @returns {string} The upstream name.
   * @memberof NginxService
   */
  addUpstream(name, service, port) {
    this.upstreams.set(name, `upstream ${name} { server ${service}:${port}; }`);
    return name;
  }

  /**
   * Renders the standard proxy directive block shared by all locations,
   * including websocket upgrade headers and forwarded headers.
   * @method proxyLocation
   * @param {string} location - The location path (e.g. '/', '/peer').
   * @param {string} upstream - The upstream name to proxy to.
   * @returns {string} The rendered `location { ... }` block.
   * @memberof NginxService
   */
  proxyLocation(location, upstream) {
    return `
    location ${location} {
        proxy_pass http://${upstream};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
    }
`;
  }

  /**
   * Renders the `/healthz` location used by the proxy container healthcheck.
   * @method healthLocation
   * @returns {string} The rendered health-check location block.
   * @memberof NginxService
   */
  healthLocation() {
    return `
    location = /healthz {
        access_log off;
        return 200 "ok\\n";
        add_header Content-Type text/plain;
    }
`;
  }

  /**
   * Creates an nginx virtual-host (`server`) entry for a host and appends it to
   * the router. Each route maps a URL prefix to an upstream service:port with
   * websocket support, mirroring the Contour HTTPProxy route model.
   *
   * @method createApp
   * @param {object} options - Virtual host options.
   * @param {string} options.host - The `server_name` (e.g. 'default.net').
   * @param {number} [options.listen=80] - The listen port.
   * @param {Array<{location: string, service: string, port: number}>} options.routes
   *   - Route table. Longer prefixes should precede '/' for correct matching.
   * @param {boolean} [options.resetRouter] - Clear the router before appending.
   * @returns {string} The complete, updated router configuration string.
   * @memberof NginxService
   */
  createApp({ host, listen = 80, routes = [], resetRouter = false }) {
    if (resetRouter) this.removeRouter();

    const safeHost = host.replace(/[^a-zA-Z0-9]/g, '_');
    const locationBlocks = routes
      .map(({ location, service, port }) => {
        const upstreamName = this.addUpstream(`up_${safeHost}_${port}`, service, port);
        return this.proxyLocation(location, upstreamName);
      })
      .join('');

    this.appendRouter(`
server {
    listen ${listen};
    server_name ${host};
${this.healthLocation()}${locationBlocks}}
`);

    return this.router;
  }

  /**
   * Emits a `default_server` catch-all that forwards to the given upstream and
   * answers the health probe for unmatched Host headers. Safe to call once.
   *
   * @method createDefaultServer
   * @param {object} options - Default server options.
   * @param {string} options.service - The Docker service name to fall back to.
   * @param {number} options.port - The upstream container port.
   * @param {number} [options.listen=80] - The listen port.
   * @returns {string} The complete, updated router configuration string.
   * @memberof NginxService
   */
  createDefaultServer({ service, port, listen = 80 }) {
    if (this.hasDefaultServer) return this.router;
    this.hasDefaultServer = true;
    const upstreamName = this.addUpstream('up_default', service, port);
    this.appendRouter(`
server {
    listen ${listen} default_server;
    server_name _;
${this.healthLocation()}${this.proxyLocation('/', upstreamName)}}
`);
    return this.router;
  }

  /**
   * Renders the full nginx config document: the websocket connection map, all
   * upstream blocks, the global `proxy_http_version`, and the accumulated router.
   * @method render
   * @returns {string} The complete nginx configuration file content.
   * @memberof NginxService
   */
  render() {
    const upstreamBlocks = Array.from(this.upstreams.values()).join('\n');
    return `# Generated by src/runtime/nginx/Nginx.js — do not hand-edit.
# Reverse proxy derived from manifests/deployment/*/proxy.yaml (Contour HTTPProxy).
# Upstreams resolve container services via the Docker internal network.

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

${upstreamBlocks}

proxy_http_version 1.1;
${this.router}`;
  }

  /**
   * Writes the rendered configuration to the given path, creating parent
   * directories as needed. Idempotent and safe to rerun.
   * @method writeConf
   * @param {string} confPath - Absolute or relative destination path.
   * @returns {string} The path written.
   * @memberof NginxService
   */
  writeConf(confPath) {
    const target = path.resolve(confPath);
    fs.mkdirpSync(path.dirname(target));
    fs.writeFileSync(target, this.render(), 'utf8');
    logger.info(`nginx config written`, { path: target, upstreams: this.upstreams.size });
    return target;
  }
}

/**
 * @description Exported singleton instance of the NginxService class.
 * @type {NginxService}
 * @memberof NginxService
 */
const Nginx = new NginxService();

export { Nginx, NginxService };
export default Nginx;
