import { afterAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import {
  debugCommand,
  debugInstance,
  debugTopology,
  startDebugGateway,
} from '../../../src/projects/cyberia/stack/debug-stack.js';

const ORIGINS = { portal: 'http://localhost:4008', server: 'http://localhost:8083', client: 'http://localhost:8082' };
const SERVER_ENV = {
  INSTANCE_CODE: 'test',
  CYBERIA_BASE_PATH: '/test',
  CYBERIA_DATA_SERVER_URL: 'http://dd-cyberia-development-traffic-service:4008',
  CONTAINER_DEPLOY_ID: 'dd-cyberia-mmo-server-test-development',
};
const CLIENT_ENV = {
  CYBERIA_BASE_PATH: '/test',
  CYBERIA_WS_ORIGIN: 'ws://localhost:8083',
  CYBERIA_DATA_SERVER_URL: 'http://localhost:4008',
  CONTAINER_DEPLOY_ID: 'dd-cyberia-mmo-client-test-development',
};
const topology = debugTopology({
  origins: ORIGINS,
  grpcPort: 50051,
  instances: [
    { id: 'mmo-server', runtime: 'cyberia-server', path: '/', env: { ...SERVER_ENV, CYBERIA_BASE_PATH: '/' } },
    { id: 'mmo-server-test', runtime: 'cyberia-server', path: '/test', env: SERVER_ENV },
    { id: 'mmo-client', runtime: 'cyberia-client', path: '/', env: { ...CLIENT_ENV, CYBERIA_BASE_PATH: '/' } },
    { id: 'mmo-client-test', runtime: 'cyberia-client', path: '/test', env: CLIENT_ENV },
  ],
});

describe('debug topology', () => {
  it('puts each world on its own port behind the origin of its runtime', () => {
    expect(topology.engine).toEqual({ url: 'http://localhost:4008', grpc: 'localhost:50051' });
    expect(topology.instances.map(({ id, origin, port }) => [id, origin, port])).toEqual([
      ['mmo-server', 'http://localhost:8083', 8093],
      ['mmo-server-test', 'http://localhost:8083', 8103],
      ['mmo-client', 'http://localhost:8082', 8092],
      ['mmo-client-test', 'http://localhost:8082', 8102],
    ]);
  });

  it('selects the instance of a runtime by world path, and names the paths it runs otherwise', () => {
    expect(debugInstance(topology, 'cyberia-client', '/test').id).toBe('mmo-client-test');
    expect(debugInstance(topology, 'cyberia-server').id).toBe('mmo-server');
    expect(() => debugInstance(topology, 'cyberia-server', '/nope')).toThrow('cyberia-server runs /, /test, not /nope');
  });
});

describe('debug commands', () => {
  it('runs a world server on its port against the local engine, without container status', () => {
    const root = debugCommand({ topology, instance: topology.instances[0], checkout: '/w/cyberia-server' });
    expect(root.cwd).toBe('/w/cyberia-server/cmd/cyberia-server');
    expect(root.command).toBe('go run . --data-server-url http://localhost:4008 --data-server-grpc localhost:50051');
    expect(root.env).toMatchObject({ SERVER_PORT: '8093', CYBERIA_BASE_PATH: '/', CONTAINER_DEPLOY_ID: '' });
    expect(root.env).not.toHaveProperty('CYBERIA_HOT_RELOAD_GRPC_ADDRESS');

    const test = debugCommand({ topology, instance: topology.instances[1], checkout: '/w/cyberia-server' });
    expect(test.env).toMatchObject({
      SERVER_PORT: '8103',
      INSTANCE_CODE: 'test',
      CYBERIA_BASE_PATH: '/test',
      CYBERIA_HOT_RELOAD_GRPC_ADDRESS: 'localhost:0',
    });
  });

  it('serves a world client on its port, and builds the bundle first with the SDK its env names', () => {
    const instance = topology.instances[3];
    expect(debugCommand({ topology, instance, checkout: '/w/cyberia-client' })).toEqual({
      cwd: '/w/cyberia-client',
      command: 'python3 wasm-driver.py --port=8102 --directory=bin --data-server-url=http://localhost:4008',
      env: { ...CLIENT_ENV, CONTAINER_DEPLOY_ID: '' },
    });
    expect(() => debugCommand({ topology, instance, checkout: '/w/cyberia-client', build: true })).toThrow(
      '--build needs EMSDK, the Emscripten SDK root, in the development env of mmo-client-test',
    );
    const sdk = { ...instance, env: { ...CLIENT_ENV, EMSDK: '/opt/emsdk', EMSDK_PYTHON: '/usr/bin/python3.11' } };
    const built = debugCommand({ topology, instance: sdk, checkout: '/w/cyberia-client', build: true });
    expect(built.command).toMatch(
      /^PATH="\$EMSDK:\$EMSDK\/upstream\/emscripten:\$PATH" make -f Web\.mk clean all && python3 wasm-driver\.py /,
    );
    expect(built.env).toMatchObject({ EMSDK: '/opt/emsdk', EMSDK_PYTHON: '/usr/bin/python3.11' });
  });
});

describe('debug gateway', () => {
  const servers = [];
  afterAll(() => Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))));

  const freePort = () =>
    new Promise((resolve) => {
      const probe = net.createServer().listen(0, () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
      });
    });
  /** A world that answers its name and the URL it got, over HTTP and WebSocket. */
  const world = async (name) => {
    const server = http.createServer((req, res) => res.end(`${name} ${req.url}`));
    new WebSocketServer({ server }).on('connection', (socket, req) => socket.send(`${name} ${req.url}`));
    await new Promise((resolve) => server.listen(0, resolve));
    servers.push(server);
    return server.address().port;
  };
  const socketReply = (url) =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.on('message', (data) => {
        resolve(String(data));
        socket.close();
      });
      socket.on('error', reject);
    });

  it('routes each world path of an origin to its world, and names the command of a world that does not listen', async () => {
    const origin = `http://localhost:${await freePort()}`;
    const routes = {
      root: await world('root'),
      test: await world('test'),
      down: await freePort(),
    };
    const listeners = await startDebugGateway({
      engine: topology.engine,
      instances: [
        { runtime: 'cyberia-server', path: '/', origin, port: routes.root },
        { runtime: 'cyberia-server', path: '/test', origin, port: routes.test },
        { runtime: 'cyberia-server', path: '/down', origin, port: routes.down },
      ],
    });
    servers.push(...listeners.map(({ server }) => server));
    expect(Object.keys(listeners[0].router)).toEqual(['/test', '/down', '/']);

    const get = async (path) => {
      const response = await fetch(`${origin}${path}`);
      return [response.status, await response.text()];
    };
    expect(await get('/api/v1/health')).toEqual([200, 'root /api/v1/health']);
    expect(await get('/test/api/v1/hot-reload')).toEqual([200, 'test /test/api/v1/hot-reload']);
    expect(await get('/down')).toEqual([
      504,
      'No cyberia-server listens for /down: run node bin/cyberia debug cyberia-server /down',
    ]);
    const ws = origin.replace(/^http/, 'ws');
    expect(await socketReply(`${ws}/ws`)).toBe('root /ws');
    expect(await socketReply(`${ws}/test/ws`)).toBe('test /test/ws');
  });
});
