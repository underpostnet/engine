'use strict';

import { expect } from 'chai';
import express from 'express';
import http from 'node:http';
import {
  proxyErrorStatusFactory,
  proxyMiddlewareFactory,
  proxyTargetFactory,
} from '../../../../src/server/network/proxy.js';

// The router keys the proxy builds: `host`, `host:port`, `host/path` and `/path`, longest first.
const ROUTER = {
  'test.fixture.test/r12': 'http://localhost:5003',
  'test.fixture.test/r1': 'http://localhost:5002',
  'app.fixture.test:4001': 'http://localhost:5004',
  'test.fixture.test': 'http://localhost:5001',
  '/peer': 'http://localhost:5005',
};

describe('proxyTargetFactory', () => {
  const route = (host, url) => proxyTargetFactory(ROUTER, { host, url });

  it('selects by exact host, then by host and URL prefix, in table order', () => {
    expect(route('test.fixture.test', '/')).to.equal('http://localhost:5001');
    expect(route('test.fixture.test', '/r1/admin?x=1')).to.equal('http://localhost:5002');
    expect(route('test.fixture.test', '/r12')).to.equal('http://localhost:5003');
    expect(route('app.fixture.test:4001', '/api')).to.equal('http://localhost:5004');
  });

  // The prefix is a string prefix, not a path segment: `/r1` also owns `/r1x`.
  it('matches a path key as a plain prefix and a bare path key on any host', () => {
    expect(route('test.fixture.test', '/r1x')).to.equal('http://localhost:5002');
    expect(route('other.test', '/peer/socket')).to.equal('http://localhost:5005');
  });

  it('selects nothing for an unknown host, a host with another port, or a path elsewhere in the URL', () => {
    expect(route('unknown.test', '/')).to.equal(undefined);
    expect(route('app.fixture.test', '/')).to.equal(undefined);
    expect(route('other.test', '/x/peer')).to.equal(undefined);
    expect(proxyTargetFactory(undefined, {})).to.equal(undefined);
  });
});

describe('proxyErrorStatusFactory', () => {
  it('answers an unreachable target as a gateway timeout and a malformed answer as a bad gateway', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'])
      expect(proxyErrorStatusFactory(code)).to.equal(504);
    expect(proxyErrorStatusFactory('HPE_INVALID_CONSTANT')).to.equal(502);
    expect(proxyErrorStatusFactory('EPIPE')).to.equal(500);
    expect(proxyErrorStatusFactory()).to.equal(500);
  });
});

describe('proxyMiddlewareFactory', () => {
  const servers = [];
  const sockets = [];
  let logger;
  let proxyPort;
  let upstreams;

  const listen = (server) =>
    new Promise((resolve) => {
      servers.push(server);
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });

  // Each upstream answers with what it received, streams on /stream, and echoes an upgraded socket.
  const upstream = (name) => {
    const record = { name, closed: 0 };
    const server = http.createServer((req, res) => {
      if (req.url === '/stream') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        let sent = 0;
        const tick = setInterval(() => {
          res.write(`chunk-${sent++};`);
          if (sent === 5) {
            clearInterval(tick);
            res.end();
          }
        }, 10);
        return;
      }
      if (req.url === '/slow') {
        res.writeHead(200);
        res.write('start');
        res.on('close', () => record.closed++);
        return;
      }
      let bytes = 0;
      req.on('data', (chunk) => (bytes += chunk.length));
      req.on('end', () => {
        res.writeHead(req.url.startsWith('/created') ? 201 : 200, {
          'content-type': 'application/json',
          'x-upstream': name,
        });
        res.end(JSON.stringify({ name, method: req.method, url: req.url, headers: req.headers, bytes }));
      });
    });
    server.on('upgrade', (req, socket) => {
      sockets.push(socket);
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Upstream: ${name}\r\n\r\n`,
      );
      socket.on('data', (data) => socket.write(`${name}:${data}`));
    });
    return { record, server };
  };

  const request = ({ host, path = '/', method = 'GET', body, headers = {} }) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: proxyPort, path, method, headers: { host, ...headers }, agent: false },
        (res) => {
          let text = '';
          res.on('data', (chunk) => (text += chunk));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
        },
      );
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });

  const upgrade = ({ host, path = '/socket' }) =>
    new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: proxyPort,
        path,
        agent: false,
        headers: { host, connection: 'Upgrade', upgrade: 'websocket' },
      });
      let upgraded = false;
      req.on('upgrade', (res, socket) => {
        upgraded = true;
        socket.once('data', (data) => {
          socket.destroy();
          resolve({ upstream: res.headers['x-upstream'], echo: `${data}` });
        });
        socket.write('ping');
      });
      req.on('response', (res) => resolve({ status: res.statusCode }));
      req.on('error', (error) => (error.code === 'ECONNRESET' ? resolve({ closed: true }) : reject(error)));
      req.on('close', () => upgraded || resolve({ closed: true }));
      req.end();
    });

  beforeEach(async () => {
    const primary = upstream('primary');
    const routed = upstream('routed');
    upstreams = { primary: primary.record, routed: routed.record };
    const primaryPort = await listen(primary.server);
    const routedPort = await listen(routed.server);
    const closed = http.createServer();
    const closedPort = await listen(closed);
    await new Promise((resolve) => closed.close(resolve));
    servers.pop();

    logger = { info: vi.fn(), error: vi.fn() };
    const app = express();
    app.use(
      '/',
      proxyMiddlewareFactory({
        target: `http://127.0.0.1:${primaryPort}`,
        router: {
          'app.fixture.test/api': `http://127.0.0.1:${routedPort}`,
          'down.fixture.test': `http://127.0.0.1:${closedPort}`,
          'app.fixture.test': `http://127.0.0.1:${primaryPort}`,
          'routed.fixture.test': `http://127.0.0.1:${routedPort}`,
        },
        ws: true,
        xfwd: true,
        logger,
      }),
    );
    proxyPort = await listen(http.createServer(app));
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.destroy();
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise((resolve) => {
            server.closeAllConnections?.();
            server.close(resolve);
          }),
      ),
    );
    vi.restoreAllMocks();
  });

  it('routes by host and URL prefix and falls back to the default target', async () => {
    expect(JSON.parse((await request({ host: 'app.fixture.test', path: '/api/v1/x?y=1' })).text)).to.include({
      name: 'routed',
      url: '/api/v1/x?y=1',
    });
    expect(JSON.parse((await request({ host: 'app.fixture.test', path: '/home' })).text).name).to.equal('primary');
    expect(JSON.parse((await request({ host: 'routed.fixture.test' })).text).name).to.equal('routed');
    expect(JSON.parse((await request({ host: 'unknown.fixture.test' })).text).name).to.equal('primary');
  });

  it('keeps the Host header, adds the forwarded headers and passes status and headers back', async () => {
    const response = await request({ host: 'app.fixture.test', path: '/created', headers: { 'x-client': 'kept' } });
    const echoed = JSON.parse(response.text);
    expect(response.status).to.equal(201);
    expect(response.headers['x-upstream']).to.equal('primary');
    expect(echoed.headers).to.include({ host: 'app.fixture.test', 'x-client': 'kept', 'x-forwarded-proto': 'http' });
    expect(echoed.headers['x-forwarded-for']).to.include('127.0.0.1');
    expect(echoed.headers['x-forwarded-host']).to.equal('app.fixture.test');
  });

  it('streams a large request body and a chunked response', async () => {
    const body = Buffer.alloc(5 * 1024 * 1024, 'a');
    const posted = await request({ host: 'app.fixture.test', path: '/upload', method: 'POST', body });
    expect(JSON.parse(posted.text)).to.include({ method: 'POST', bytes: body.length });
    const streamed = await request({ host: 'app.fixture.test', path: '/stream' });
    expect(streamed.text).to.equal('chunk-0;chunk-1;chunk-2;chunk-3;chunk-4;');
    expect(streamed.headers['transfer-encoding']).to.equal('chunked');
  });

  it('closes the upstream response when the client goes away', async () => {
    await new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port: proxyPort, path: '/slow', headers: { host: 'app.fixture.test' }, agent: false },
        (res) => res.once('data', () => req.destroy()),
      );
      req.on('error', () => {});
      req.on('close', resolve);
      req.end();
    });
    await vi.waitFor(() => expect(upstreams.primary.closed).to.equal(1), { timeout: 3000 });
  });

  it('answers an unreachable target with a gateway timeout and logs it', async () => {
    const response = await request({ host: 'down.fixture.test', path: '/<script>' });
    expect(response.status).to.equal(504);
    expect(response.text).to.equal('Error occurred while trying to proxy: down.fixture.test/%3Cscript%3E');
    expect(logger.error.mock.calls[0][1]).to.include({ code: 'ECONNREFUSED', request: 'down.fixture.test/<script>' });
  });

  it('logs every proxied response with its target', async () => {
    await request({ host: 'routed.fixture.test', path: '/logged' });
    expect(logger.info.mock.calls.map(([line]) => line)).to.satisfy((lines) =>
      lines.some((line) => /^GET \/logged -> http:\/\/127\.0\.0\.1:\d+\/logged \[200\]$/.test(line)),
    );
  });

  // The upgrade listener is taken over from the server the first proxied request arrives on.
  it('proxies a WebSocket upgrade through the router once the server has carried a request', async () => {
    await request({ host: 'app.fixture.test' });
    expect(await upgrade({ host: 'routed.fixture.test' })).to.deep.equal({ upstream: 'routed', echo: 'routed:ping' });
    expect(await upgrade({ host: 'app.fixture.test' })).to.deep.equal({ upstream: 'primary', echo: 'primary:ping' });
  });

  it('closes the client socket when the upgrade target is unreachable', async () => {
    await request({ host: 'app.fixture.test' });
    expect(await upgrade({ host: 'down.fixture.test' })).to.deep.equal({ closed: true });
    expect(logger.error).toHaveBeenCalled();
  });
});
