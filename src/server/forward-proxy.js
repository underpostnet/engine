/**
 * Authenticated HTTP/HTTPS forward-proxy primitives.
 * @module src/server/forward-proxy.js
 * @namespace ForwardProxy
 */
'use strict';

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import { environmentValueFactory } from './environment.js';
import { loggerFactory, loggerMiddleware } from './logger.js';
import {
  nodeCandidatesFactory,
  nodeProbeCommandFactory,
  scriptProbeCommandFactory,
  systemdServiceCommandsFactory,
  systemdUnitFactory,
} from './systemd.js';

const logger = loggerFactory(import.meta);
const proxyLogger = loggerFactory(import.meta, 'debug');

/**
 * Forward-proxy defaults, service metadata, and environment variable names.
 * @constant {object}
 * @memberof ForwardProxy
 */
const FORWARD_PROXY = Object.freeze({
  port: 1080,
  timeoutMs: 30000,
  env: Object.freeze({
    apiKey: 'FORWARD_PROXY_API_KEY',
    host: 'FORWARD_PROXY_HOST',
    port: 'FORWARD_PROXY_PORT',
  }),
  serviceName: 'underpost-forward-proxy',
  unitPath: '/etc/systemd/system/underpost-forward-proxy.service',
  supervisedEnv: 'UNDERPOST_FORWARD_PROXY_SUPERVISED',
  restartSeconds: 5,
  nodePaths: Object.freeze(['/usr/bin/node', '/usr/local/bin/node', '/bin/node']),
  defaultHost: '10.0.0.1',
});

/**
 * Hop-by-hop headers that must not be sent to an upstream server.
 * @constant {Set<string>}
 * @private
 * @memberof ForwardProxy
 */
const FORWARD_PROXY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/**
 * Compares two non-empty values without returning early on a mismatched byte.
 * @method secretEqual
 * @param {*} a - First value.
 * @param {*} b - Second value.
 * @returns {boolean} Whether both values are equal and non-empty.
 * @private
 * @memberof ForwardProxy
 */
const secretEqual = (a, b) => {
  const left = `${a ?? ''}`;
  const right = `${b ?? ''}`;
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
};

/**
 * Validates a bearer credential against a configured proxy API key.
 * @method forwardProxyAuthorizedFactory
 * @param {{header?: string, apiKey?: string}} [options={}] - Credential inputs.
 * @returns {boolean} Whether the request is authorized.
 * @memberof ForwardProxy
 */
const forwardProxyAuthorizedFactory = ({ header = '', apiKey = '' } = {}) => {
  const expected = `${apiKey || ''}`.trim();
  if (!expected) return false;
  const match = /^Bearer\s+(.+)$/i.exec(`${header || ''}`.trim());
  return match ? secretEqual(match[1].trim(), expected) : false;
};

/**
 * Parses an absolute HTTP request URI into upstream request options.
 * @method forwardProxyTargetFactory
 * @param {string} requestUrl - Absolute HTTP request URI.
 * @returns {{hostname: string, port: number, host: string, path: string}|null} Parsed target or `null` when invalid.
 * @memberof ForwardProxy
 */
const forwardProxyTargetFactory = (requestUrl) => {
  try {
    const target = new URL(requestUrl);
    if (target.protocol !== 'http:' || !target.hostname) return null;
    return {
      hostname: target.hostname,
      port: Number(target.port) || 80,
      host: target.host,
      path: `${target.pathname}${target.search}`,
    };
  } catch {
    return null;
  }
};

/**
 * Parses a CONNECT authority into a hostname and TCP port.
 * @method forwardProxyTunnelTargetFactory
 * @param {string} authority - CONNECT authority, optionally including a port.
 * @returns {{hostname: string, port: number}|null} Parsed target or `null` when invalid.
 * @memberof ForwardProxy
 */
const forwardProxyTunnelTargetFactory = (authority) => {
  const match = /^(\[[^\]]+\]|[^:@/\s]+)(?::(\d+))?$/.exec(`${authority || ''}`.trim());
  if (!match) return null;
  const port = Number(match[2] || 443);
  if (port < 1 || port > 65535) return null;
  return { hostname: match[1].replace(/^\[|\]$/g, ''), port };
};

/**
 * Removes hop-by-hop headers before forwarding a request or response.
 * @method forwardProxyHeadersFactory
 * @param {object} [headers={}] - Header map to filter.
 * @returns {object} Header map safe to forward.
 * @memberof ForwardProxy
 */
const forwardProxyHeadersFactory = (headers = {}) =>
  Object.fromEntries(
    Object.entries(headers || {}).filter(([name]) => !FORWARD_PROXY_HOP_HEADERS.has(`${name}`.toLowerCase())),
  );

/**
 * Resolves proxy connection settings from explicit values and environment variables.
 * @method forwardProxyConfigFactory
 * @param {{host?: string, port?: string|number, apiKey?: string}} [options={}] - Proxy overrides.
 * @returns {{host: string, port: number, apiKey: string}} Resolved proxy configuration.
 * @memberof ForwardProxy
 */
const forwardProxyConfigFactory = ({ host, port, apiKey } = {}) => ({
  host: `${host || environmentValueFactory(FORWARD_PROXY.env.host)}`.trim() || FORWARD_PROXY.defaultHost,
  port: Number(port || environmentValueFactory(FORWARD_PROXY.env.port)) || FORWARD_PROXY.port,
  apiKey: `${apiKey || environmentValueFactory(FORWARD_PROXY.env.apiKey)}`.trim(),
});

/**
 * Builds the CLI command that starts the forward-proxy server.
 * @method forwardProxyCommandFactory
 * @param {{host?: string, port?: string|number, execPath?: string, scriptPath?: string}} options - Command inputs.
 * @returns {string} Shell command.
 * @memberof ForwardProxy
 */
const forwardProxyCommandFactory = ({ host, port, execPath = process.execPath, scriptPath = process.argv[1] }) =>
  [
    execPath,
    scriptPath,
    'wireguard',
    '--forward-proxy-server',
    `--forward-proxy-server-host ${host}`,
    `--forward-proxy-server-port ${port}`,
  ].join(' ');

/**
 * Orders Node executable candidates for a systemd service probe.
 * @method forwardProxyNodeCandidatesFactory
 * @param {{execPath?: string, systemPaths?: string[]}} [options={}] - Candidate sources.
 * @returns {string[]} Ordered, unique executable paths.
 * @memberof ForwardProxy
 */
const forwardProxyNodeCandidatesFactory = ({
  execPath = process.execPath,
  systemPaths = FORWARD_PROXY.nodePaths,
} = {}) => nodeCandidatesFactory({ execPath, systemPaths });

/**
 * Builds a transient systemd command that probes a Node executable.
 * @method forwardProxyNodeProbeCommandFactory
 * @param {string} nodePath - Candidate Node executable path.
 * @param {string} [user] - User that will own the service.
 * @returns {string} systemd-run command.
 * @memberof ForwardProxy
 */
const forwardProxyNodeProbeCommandFactory = (nodePath, user = os.userInfo().username) =>
  nodeProbeCommandFactory(nodePath, user);

/**
 * Builds a transient systemd command that probes the proxy entry script.
 * @method forwardProxyStartProbeCommandFactory
 * @param {{nodePath: string, scriptPath?: string, user?: string, workingDirectory?: string}} options - Probe inputs.
 * @returns {string} systemd-run command.
 * @memberof ForwardProxy
 */
const forwardProxyStartProbeCommandFactory = ({
  nodePath,
  scriptPath = process.argv[1],
  user = os.userInfo().username,
  workingDirectory = process.cwd(),
}) => scriptProbeCommandFactory({ nodePath, scriptPath, user, workingDirectory });

/**
 * Renders the systemd unit used to supervise the forward proxy.
 * @method forwardProxyUnitFactory
 * @param {{host?: string, port?: string|number, apiKey?: string, interfaceName?: string, workingDirectory?: string, user?: string, command?: string}} [options={}] - Unit inputs.
 * @returns {string} Rendered systemd unit file.
 * @memberof ForwardProxy
 */
const forwardProxyUnitFactory = ({
  host,
  port,
  apiKey,
  interfaceName = 'wg0',
  workingDirectory = process.cwd(),
  user = os.userInfo().username,
  command,
} = {}) => {
  const tunnelUnit = `wg-quick@${interfaceName}.service`;
  return systemdUnitFactory({
    header:
      '# Generated by `underpost wireguard --forward-proxy-server`. Do not edit by\n' +
      '# hand: the next run rewrites the file and restarts the service.',
    sections: {
      Unit: {
        Description: `Underpost edge forward proxy on ${host}:${port}`,
        Documentation: 'https://www.nexodev.org/docs',
        After: `network-online.target ${tunnelUnit}`,
        Wants: 'network-online.target',
        Requires: tunnelUnit,
        PartOf: tunnelUnit,
        StartLimitIntervalSec: 0,
      },
      Service: {
        Type: 'simple',
        User: user,
        WorkingDirectory: workingDirectory,
        Environment: [`${FORWARD_PROXY.supervisedEnv}=1`, `${FORWARD_PROXY.env.apiKey}=${apiKey}`],
        ExecStart: command || forwardProxyCommandFactory({ host, port }),
        Restart: 'always',
        RestartSec: FORWARD_PROXY.restartSeconds,
      },
      Install: { WantedBy: `multi-user.target ${tunnelUnit}` },
    },
  });
};

/**
 * Builds lifecycle commands for the forward-proxy systemd service.
 * @method forwardProxyServiceCommandsFactory
 * @param {{changed?: boolean, name?: string, unitPath?: string}} [options={}] - Service state inputs.
 * @returns {{ensure: string[], remove: string[]}} Commands grouped by lifecycle operation.
 * @memberof ForwardProxy
 */
const forwardProxyServiceCommandsFactory = ({
  changed = false,
  name = FORWARD_PROXY.serviceName,
  unitPath = FORWARD_PROXY.unitPath,
} = {}) => systemdServiceCommandsFactory({ changed, name, unitPath });

/**
 * Sends a plain-text proxy refusal response.
 * @method forwardProxyRefuse
 * @param {import('node:http').ServerResponse} res - Response to close.
 * @param {number} status - HTTP status code.
 * @param {string} message - Response body message.
 * @returns {void}
 * @private
 * @memberof ForwardProxy
 */
const forwardProxyRefuse = (res, status, message) => {
  res.writeHead(status, {
    'content-type': 'text/plain',
    ...(status === 407 ? { 'proxy-authenticate': 'Bearer realm="underpost-forward-proxy"' } : {}),
  });
  res.end(`${message}\n`);
};

/**
 * Creates an HTTP request handler that relays authenticated proxy traffic.
 * @method forwardProxyRequestHandlerFactory
 * @param {{apiKey: string, timeoutMs?: number}} options - Authentication and timeout settings.
 * @returns {Function} Node HTTP request handler.
 * @memberof ForwardProxy
 */
const forwardProxyRequestHandlerFactory = ({ apiKey, timeoutMs = FORWARD_PROXY.timeoutMs }) =>
  function forwardProxyRequestHandler(req, res) {
    if (!forwardProxyAuthorizedFactory({ header: req.headers['proxy-authorization'], apiKey }))
      return void forwardProxyRefuse(res, 407, 'proxy authentication required');
    const target = forwardProxyTargetFactory(req.url);
    if (!target)
      return void forwardProxyRefuse(res, 400, 'an absolute http:// request-URI is required; use CONNECT for https');

    const upstream = http.request(
      {
        host: target.hostname,
        port: target.port,
        method: req.method,
        path: target.path,
        headers: { ...forwardProxyHeadersFactory(req.headers), host: target.host },
        timeout: timeoutMs,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode, forwardProxyHeadersFactory(upstreamRes.headers));
        upstreamRes.pipe(res);
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('upstream timed out')));
    upstream.on('error', (error) => {
      logger.warn('Forward proxy upstream failed', { target: `${target.host}${target.path}`, message: error.message });
      if (res.headersSent) res.destroy();
      else forwardProxyRefuse(res, 502, 'upstream request failed');
    });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  };

/**
 * Creates a CONNECT handler that relays authenticated TLS tunnels.
 * @method forwardProxyConnectHandlerFactory
 * @param {{apiKey: string, timeoutMs?: number}} options - Authentication and timeout settings.
 * @returns {Function} Node HTTP CONNECT handler.
 * @memberof ForwardProxy
 */
const forwardProxyConnectHandlerFactory = ({ apiKey, timeoutMs = FORWARD_PROXY.timeoutMs }) =>
  function forwardProxyConnectHandler(req, clientSocket, head) {
    const startedAt = Date.now();
    const log = (status, bytes = '-') =>
      proxyLogger.http(
        `${clientSocket.remoteAddress || '-'} CONNECT ${req.url} ${status} ${bytes} - ${Date.now() - startedAt} ms`,
      );
    const reject = (status, reason) => {
      log(status);
      clientSocket.end(`HTTP/1.1 ${status} ${reason}\r\n\r\n`);
    };
    if (!forwardProxyAuthorizedFactory({ header: req.headers['proxy-authorization'], apiKey }))
      return void reject(407, 'Proxy Authentication Required');
    const target = forwardProxyTunnelTargetFactory(req.url);
    if (!target) return void reject(400, 'Bad Request');

    let established = false;
    const upstream = net.connect(target.port, target.hostname, () => {
      established = true;
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.setTimeout(timeoutMs, () => upstream.destroy());
    upstream.on('error', (error) => {
      logger.warn('Forward proxy tunnel failed', {
        target: `${target.hostname}:${target.port}`,
        message: error.message,
      });
      if (established || clientSocket.writableEnded || clientSocket.destroyed) clientSocket.destroy();
      else reject(502, 'Bad Gateway');
    });
    upstream.on('close', () => {
      if (established) log(200, upstream.bytesRead + upstream.bytesWritten);
    });
    clientSocket.on('error', () => upstream.destroy());
    clientSocket.on('close', () => upstream.destroy());
  };

/**
 * Resolves a completed client request to its buffered proxy response.
 * @method forwardProxyResponseFactory
 * @param {{request: import('node:http').ClientRequest, body?: string|null, timeoutMs: number}} options - Request inputs.
 * @returns {Promise<{status: number|undefined, headers: object, body: string}>} Buffered response.
 * @private
 * @memberof ForwardProxy
 */
const forwardProxyResponseFactory = ({ request, body = null, timeoutMs }) =>
  new Promise((resolve, reject) => {
    request.once('response', (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.once('error', reject);
      res.once('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    request.once('error', reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`request timed out after ${timeoutMs}ms`)));
    if (body !== null) request.write(body);
    request.end();
  });

/**
 * Opens an authenticated CONNECT tunnel through the configured proxy.
 * @method forwardProxyTunnelFactory
 * @param {{proxy: {host: string, port: number, apiKey: string}, authority: string, timeoutMs: number}} options - Tunnel inputs.
 * @returns {Promise<import('node:net').Socket>} Connected tunnel socket.
 * @private
 * @memberof ForwardProxy
 */
const forwardProxyTunnelFactory = ({ proxy, authority, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const request = http.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: authority,
      headers: { host: authority, 'proxy-authorization': `Bearer ${proxy.apiKey}` },
      agent: false,
    });
    const refused = (status) => reject(new Error(`[forward-proxy] proxy refused CONNECT ${authority} (${status})`));
    request.once('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        refused(res.statusCode);
        return;
      }
      socket.setTimeout(0);
      resolve(socket);
    });
    request.once('response', (res) => {
      res.resume();
      refused(res.statusCode);
    });
    request.once('error', reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error('[forward-proxy] CONNECT timed out')));
    request.end();
  });

/**
 * Starts an authenticated HTTP forward-proxy server.
 * @method forwardProxyServerFactory
 * @param {{config: {host: string, port: number, apiKey: string, timeoutMs?: number}, requestMiddleware?: Function, onError?: Function, onListen?: Function}} [options={}] - Server configuration and hooks.
 * @returns {import('node:http').Server} Listening proxy server.
 * @memberof ForwardProxy
 */
const forwardProxyServerFactory = ({ config, requestMiddleware, onError, onListen } = {}) => {
  const server = http.createServer();
  const relay = forwardProxyRequestHandlerFactory(config);
  const middleware = requestMiddleware || loggerMiddleware(import.meta, 'debug', () => false);
  server.on('request', (req, res) => middleware(req, res, () => relay(req, res)));
  server.on('connect', forwardProxyConnectHandlerFactory(config));
  server.on('clientError', (_error, socket) => {
    if (!socket.destroyed) socket.destroy();
  });
  if (onError) server.on('error', onError);
  server.listen(config.port, config.host, onListen);
  return server;
};

/**
 * Fetches an HTTP or HTTPS resource through the authenticated forward proxy.
 * @async
 * @method fetchViaForwardProxy
 * @param {string|URL} url - Target resource URL.
 * @param {{proxy?: {host?: string, port?: string|number, apiKey?: string}, method?: string, timeout?: number, body?: *, headers?: object}} [options={}] - Request options.
 * @returns {Promise<{status: number|undefined, headers: object, body: string}>} Buffered upstream response.
 * @memberof ForwardProxy
 */
const fetchViaForwardProxy = async (url, options = {}) => {
  const target = new URL(url);
  const proxy = forwardProxyConfigFactory(options.proxy);
  if (!proxy.apiKey)
    throw new Error(`[forward-proxy] ${FORWARD_PROXY.env.apiKey} is not set; the proxy cannot be used without it`);
  const method = `${options.method || 'GET'}`.toUpperCase();
  const timeoutMs = Number(options.timeout) > 0 ? Number(options.timeout) : FORWARD_PROXY.timeoutMs;
  const body =
    options.body === undefined || options.body === null
      ? null
      : typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body);
  const headers = {
    host: target.host,
    ...(body === null ? {} : { 'content-length': `${Buffer.byteLength(body)}` }),
    ...(options.headers || {}),
  };

  if (target.protocol === 'http:')
    return await forwardProxyResponseFactory({
      request: http.request({
        host: proxy.host,
        port: proxy.port,
        method,
        path: target.href,
        headers: { ...headers, 'proxy-authorization': `Bearer ${proxy.apiKey}` },
        agent: false,
      }),
      body,
      timeoutMs,
    });
  if (target.protocol !== 'https:')
    throw new Error(`[forward-proxy] fetch supports http: and https: targets only, not ${target.protocol}`);

  const port = Number(target.port) || 443;
  const socket = await forwardProxyTunnelFactory({ proxy, authority: `${target.hostname}:${port}`, timeoutMs });
  const agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
  const createConnection = agent.createConnection.bind(agent);
  agent.createConnection = (connectOptions, callback) =>
    createConnection({ ...connectOptions, socket, servername: target.hostname }, callback);
  try {
    return await forwardProxyResponseFactory({
      request: https.request({
        host: target.hostname,
        port,
        method,
        path: `${target.pathname}${target.search}`,
        headers,
        agent,
      }),
      body,
      timeoutMs,
    });
  } finally {
    socket.destroy();
  }
};

export {
  FORWARD_PROXY,
  fetchViaForwardProxy,
  forwardProxyAuthorizedFactory,
  forwardProxyCommandFactory,
  forwardProxyConfigFactory,
  forwardProxyConnectHandlerFactory,
  forwardProxyHeadersFactory,
  forwardProxyNodeCandidatesFactory,
  forwardProxyNodeProbeCommandFactory,
  forwardProxyRequestHandlerFactory,
  forwardProxyServerFactory,
  forwardProxyServiceCommandsFactory,
  forwardProxyStartProbeCommandFactory,
  forwardProxyTargetFactory,
  forwardProxyTunnelTargetFactory,
  forwardProxyUnitFactory,
};
