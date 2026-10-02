/**
 * Nginx reverse-proxy configuration primitives: maps, servers and their locations, rendered into
 * one `conf.d` document. The Docker Compose stacks write their gateway with them.
 * @module src/runtime/nginx/Nginx.js
 * @namespace NginxService
 */

import fs from 'fs-extra';
import path from 'path';
import { loggerFactory } from '../../server/ops/logger.js';

const logger = loggerFactory(import.meta);

/** Docker's embedded DNS server, reachable from every container of a user-defined network. */
const DOCKER_RESOLVER = '127.0.0.11';

/** The headers every proxied location forwards, websocket upgrade included. */
const PROXY_HEADERS = [
  'proxy_set_header Host $host;',
  'proxy_set_header X-Real-IP $remote_addr;',
  'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
  'proxy_set_header X-Forwarded-Proto $scheme;',
  'proxy_set_header Upgrade $http_upgrade;',
  'proxy_set_header Connection $connection_upgrade;',
  'proxy_read_timeout 3600s;',
];

const HEALTH_DIRECTIVES = ['access_log off;', 'return 200 "ok\\n";', 'add_header Content-Type text/plain;'];

const renderBlock = (head, lines, indent = '') =>
  `${indent}${head} {\n${lines.map((line) => `${indent}    ${line}`).join('\n')}\n${indent}}`;

/**
 * @class NginxService
 * @description Accumulates `map` and `server` blocks, then renders them as one config document.
 * @memberof NginxService
 */
class NginxService {
  constructor() {
    this.reset();
  }

  /**
   * Clears every block and the resolver.
   * @returns {NginxService}
   * @memberof NginxService
   */
  reset() {
    this.resolver = '';
    this.maps = [];
    this.servers = [];
    return this;
  }

  /**
   * Resolves proxy targets per request, so an upstream that is down never fails startup or reload.
   * @param {string} [address] - The DNS server; Docker's embedded one by default.
   * @returns {NginxService}
   * @memberof NginxService
   */
  useResolver(address = DOCKER_RESOLVER) {
    this.resolver = address;
    return this;
  }

  /**
   * Adds a `map` block.
   * @param {object} map
   * @param {string} map.source - The variable mapped, e.g. `$host`.
   * @param {string} map.variable - The variable set, e.g. `$engine_upstream`.
   * @param {Object<string,string>} map.entries - Source value to result; `default` is the fallback.
   * @returns {NginxService}
   * @memberof NginxService
   */
  addMap({ source, variable, entries }) {
    this.maps.push({ source, variable, entries });
    return this;
  }

  /**
   * Adds a `server` block.
   * @param {object} server
   * @param {Array<number|string>} [server.listen] - Each `listen` value, e.g. `80` or `'8081 default_server'`.
   * @param {string[]} [server.names] - The `server_name` values.
   * @param {boolean} [server.health] - Answer `GET /healthz` with 200.
   * @param {Array<{match:string, proxy?:string, redirect?:string}>} [server.locations] - `match` is the
   *   location argument (`/api/`, `= /ws`, `^~ /test/`). `proxy` is a `host:port` or a `$variable`;
   *   `redirect` is a 301 destination.
   * @returns {NginxService}
   * @memberof NginxService
   */
  addServer({ listen = [80], names = ['_'], health = false, locations = [] }) {
    this.servers.push({ listen, names, health, locations });
    return this;
  }

  /**
   * Renders the `proxy_pass` of a target. A host target goes through a variable when a resolver is
   * set, so nginx resolves it per request.
   * @param {string} target - `host:port` or `$variable`.
   * @returns {string[]} Directive lines.
   * @memberof NginxService
   */
  proxyDirectives(target) {
    if (target.startsWith('$') || !this.resolver) return [`proxy_pass http://${target};`];
    const variable = `$up_${target.replace(/[^A-Za-z0-9]/g, '_')}`;
    return [`set ${variable} ${target};`, `proxy_pass http://${variable};`];
  }

  /**
   * Renders one location block.
   * @param {{match:string, proxy?:string, redirect?:string}} location
   * @returns {string}
   * @memberof NginxService
   */
  renderLocation({ match, proxy, redirect }) {
    const directives = redirect ? [`return 301 ${redirect};`] : [...this.proxyDirectives(proxy), ...PROXY_HEADERS];
    return renderBlock(`location ${match}`, directives, '    ');
  }

  /**
   * Renders the whole document.
   * @param {object} [options]
   * @param {string} [options.origin] - What generates the document, named in its header.
   * @returns {string}
   * @memberof NginxService
   */
  render({ origin = 'src/runtime/nginx/Nginx.js' } = {}) {
    const maps = [
      { source: '$http_upgrade', variable: '$connection_upgrade', entries: { default: 'upgrade', "''": 'close' } },
      ...this.maps,
    ].map(({ source, variable, entries }) => {
      const width = Math.max(...Object.keys(entries).map((key) => key.length));
      return renderBlock(
        `map ${source} ${variable}`,
        Object.entries(entries).map(([key, value]) => `${key.padEnd(width)} ${value};`),
      );
    });
    const servers = this.servers.map(({ listen, names, health, locations }) => {
      const blocks = [
        ...(health ? [renderBlock('location = /healthz', HEALTH_DIRECTIVES, '    ')] : []),
        ...locations.map((location) => this.renderLocation(location)),
      ];
      const head = [...listen.map((value) => `    listen ${value};`), `    server_name ${names.join(' ')};`];
      return `server {\n${head.join('\n')}\n\n${blocks.join('\n\n')}\n}`;
    });
    return `${[
      `# Generated by ${origin} — do not hand-edit.`,
      ...maps,
      ...(this.resolver ? [`resolver ${this.resolver} ipv6=off valid=10s;`] : []),
      'proxy_http_version 1.1;',
      ...servers,
    ].join('\n\n')}\n`;
  }

  /**
   * Writes the rendered document, creating its directory.
   * @param {string} confPath - Destination path.
   * @param {object} [options] - See {@link NginxService#render}.
   * @returns {string} The absolute path written.
   * @memberof NginxService
   */
  writeConf(confPath, options) {
    const target = path.resolve(confPath);
    fs.mkdirpSync(path.dirname(target));
    fs.writeFileSync(target, this.render(options), 'utf8');
    logger.info('nginx config written', { path: target, servers: this.servers.length });
    return target;
  }
}

export { NginxService };
export default NginxService;
