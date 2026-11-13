import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import { pathRoutePlan } from '../../../../src/server/network/path-routes.js';
import { pathRouteForwarderFactory } from '../../../../src/server/network/proxy.js';

const SITE = 'www.example.test';
const APP = 'app.example.test';
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));

const conf = {
  confServer: {
    [SITE]: {
      '/': {
        client: 'site',
        pathRoutes: [
          { id: 'views', match: { kind: 'client-views', exclude: ['/'] }, destination: { host: APP } },
          { id: 'apis', match: { kind: 'client-apis' }, destination: { host: APP } },
          { id: 'socket', match: { kind: 'ws' }, destination: { host: APP } },
        ],
      },
    },
    [APP]: { '/': { client: 'app', apis: ['user'], ws: 'core' } },
  },
  confClient: {
    site: { publicCopyNonExistingFiles: 'app', views: [{ path: '/', client: 'Site' }] },
    app: {
      services: ['user'],
      views: [
        { path: '/', client: 'App' },
        { path: '/log-in', client: 'App' },
      ],
    },
  },
  confSSR: {},
};

let destination;
let source;
let sourcePort;
const seen = [];
const upgraded = [];

const request = (path, init = {}) => fetch(`http://127.0.0.1:${sourcePort}${path}`, { redirect: 'manual', ...init });

beforeAll(async () => {
  const app = express();
  app.use(express.raw({ type: '*/*' }));
  app.all(/.*/, (req, res) => {
    seen.push({ method: req.method, url: req.url, host: req.headers.host, proto: req.headers['x-forwarded-proto'] });
    if (req.path === '/api/v1/user/redirect') return res.redirect(302, '/log-in/?from=api');
    res.json({ method: req.method, url: req.url, body: req.body?.length ? req.body.toString('utf8') : '' });
  });
  destination = createServer(app);
  destination.on('upgrade', (req, socket) => {
    upgraded.push(socket);
    seen.push({ upgrade: req.url, host: req.headers.host });
    const accept = crypto
      .createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}${WEBSOCKET_GUID}`)
      .digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
  });
  const destinationPort = await listen(destination);

  const plan = pathRoutePlan({ ...conf, host: SITE, path: '/', ports: { [`${APP}/`]: destinationPort } });
  const forwarder = pathRouteForwarderFactory(plan);
  const site = express();
  site.use(forwarder.middleware);
  site.use(express.json());
  site.get('/', (req, res) => res.send('landing'));
  source = createServer(site);
  forwarder.attach(source);
  sourcePort = await listen(source);
});

afterAll(async () => {
  for (const socket of upgraded) socket.destroy();
  source.closeAllConnections();
  destination.closeAllConnections();
  await Promise.all([close(source), close(destination)]);
});

describe('path route forwarder', () => {
  it('forwards a document route with its path, query and the host the visitor asked', async () => {
    const response = await request('/log-in/?play=violet');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ method: 'GET', url: '/log-in/?play=violet' });
    expect(seen.at(-1)).toMatchObject({ host: `127.0.0.1:${sourcePort}`, proto: 'http' });
  });

  it('forwards an API write with its method and body before any parser reads it', async () => {
    const body = JSON.stringify({ email: 'a@example.test', password: 'x' });
    const response = await request('/api/v1/user/auth', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(await response.json()).toEqual({ method: 'POST', url: '/api/v1/user/auth', body });
  });

  it('keeps a relative redirect of the destination on the public host', async () => {
    const response = await request('/api/v1/user/redirect');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/log-in/?from=api');
  });

  it('leaves every other path to the host itself', async () => {
    expect(await (await request('/')).text()).toBe('landing');
    expect((await request('/log-inx')).status).toBe(404);
  });

  it('forwards a WebSocket upgrade of the socket route', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${sourcePort}/socket.io/?EIO=4&transport=websocket`);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    socket.close();
    expect(seen.find((entry) => entry.upgrade)).toEqual({
      upgrade: '/socket.io/?EIO=4&transport=websocket',
      host: `127.0.0.1:${sourcePort}`,
    });
  });

  it('answers an unreachable destination with a gateway status, in JSON for a service route', async () => {
    const plan = pathRoutePlan({ ...conf, host: SITE, path: '/', ports: { [`${APP}/`]: 1 } });
    const forwarder = pathRouteForwarderFactory(plan);
    const site = express();
    site.use(forwarder.middleware);
    const server = createServer(site);
    const port = await listen(server);
    try {
      const api = await fetch(`http://127.0.0.1:${port}/api/v1/user`);
      expect(api.status).toBe(504);
      expect(await api.json()).toMatchObject({ status: 'error' });
      const view = await fetch(`http://127.0.0.1:${port}/log-in/`);
      expect(view.status).toBe(504);
      expect(view.headers.get('content-type')).toMatch(/text\/plain/);
    } finally {
      await close(server);
    }
  });

  describe('redirect route', () => {
    const redirectConf = {
      ...conf,
      confServer: {
        ...conf.confServer,
        [SITE]: {
          '/': {
            client: 'site',
            pathRoutes: [
              {
                id: 'views',
                match: { kind: 'client-views', exclude: ['/'] },
                destination: { host: APP },
                redirect: true,
              },
            ],
          },
        },
      },
    };
    const redirectSite = async (development) => {
      const plan = pathRoutePlan({ ...redirectConf, host: SITE, path: '/', ports: { [`${APP}/`]: 4004 } });
      const site = express();
      site.use(pathRouteForwarderFactory(plan, { development }).middleware);
      site.get('/', (req, res) => res.send('landing'));
      const server = createServer(site);
      return { server, port: await listen(server) };
    };

    it('answers 308 with the path and query on the destination host, whatever Host the request names', async () => {
      const { server, port } = await redirectSite(false);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/log-in/?play=violet`, {
          redirect: 'manual',
          headers: { Host: 'attacker.example' },
        });
        expect(response.status).toBe(308);
        expect(response.headers.get('location')).toBe(`https://${APP}/log-in/?play=violet`);
        expect(response.headers.get('cache-control')).toBe('no-cache');
        expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('landing');
      } finally {
        await close(server);
      }
    });

    it('keeps a POST on its method through the 308', async () => {
      const { server, port } = await redirectSite(false);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/log-in`, { method: 'POST', redirect: 'manual' });
        expect(response.status).toBe(308);
        expect(response.headers.get('location')).toBe(`https://${APP}/log-in`);
      } finally {
        await close(server);
      }
    });

    it('redirects to the local port of the destination in development', async () => {
      const { server, port } = await redirectSite(true);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/log-in/`, { redirect: 'manual' });
        expect(response.headers.get('location')).toBe('http://localhost:4004/log-in/');
      } finally {
        await close(server);
      }
    });
  });
});
