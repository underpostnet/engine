/**
 * The dd-cyberia Docker Compose stack: MongoDB, Valkey and IPFS, the engine and its content release,
 * and one game server and one game client per release instance, behind one nginx gateway.
 * `node bin docker-compose --generate --deploy-id dd-cyberia --docker-compose-id cyberia` renders it.
 * @module src/projects/cyberia/compose-stack.js
 * @namespace CyberiaComposeStack
 */

import Underpost from '../../index.js';
import { getConfFolder, loadConfServerJson, normalizeInstanceTopology } from '../../server/runtime/conf.js';
import { hostPortsFactory } from '../../server/network/router.js';
import { RELEASE_CONTENT, buildCyberiaMmoInstanceEnv } from './release-content.js';

/** The API whose host is the Cyberia data plane: the WASM client's `/api/` and the game servers' engine. */
const DATA_PLANE_API = 'cyberia-instance';

const ENGINE_SERVICE = 'engine-cyberia-runtime';

/** The port every game server and client listens on inside the network. */
const GAME_PORT = 8081;

/** The path under a world's prefix where its game server answers once the world is loaded. */
const SERVER_READY_PATH = '/api/v1/health/ready';

/** The names the gateway answers beside the deploy's domains, inside the network and on the host. */
const GATEWAY_ALIASES = Object.freeze(['cyberia-client', 'cyberia-server', 'engine-cyberia']);

/**
 * The compose variable prefix of each image: `<PREFIX>_IMAGE` and `<PREFIX>_TAG` select it.
 * @memberof CyberiaComposeStack
 */
const STACK_IMAGES = Object.freeze({
  'engine-cyberia': 'ENGINE_CYBERIA',
  'cyberia-server': 'CYBERIA_SERVER',
  'cyberia-client': 'CYBERIA_CLIENT',
});

/** The tuning variables a game server reads, passed through unset. */
const SERVER_PASSTHROUGH = [
  'CYBERIA_DISABLE_CONNECTION_LIMITS',
  'CYBERIA_MAX_CONNECTIONS',
  'CYBERIA_MAX_CONNECTIONS_PER_IP',
  'CYBERIA_CONNECT_RATE_PER_IP',
  'CYBERIA_CONNECT_BURST_PER_IP',
  'CYBERIA_MESSAGE_RATE',
  'CYBERIA_MESSAGE_BURST',
  'CYBERIA_MAX_STRIKES',
];

const healthy = { condition: 'service_healthy' };

const healthcheck = (test, startPeriod, retries = 5) => ({
  test,
  interval: '15s',
  timeout: '5s',
  retries,
  start_period: startPeriod,
});

const imageReference = (id, env) =>
  `\${${STACK_IMAGES[id]}_IMAGE:-underpost/${id}${env === 'development' ? '-dev' : ''}}:\${${STACK_IMAGES[id]}_TAG:-${Underpost.version}}`;

const confServerOf = (deployId) => loadConfServerJson(`${getConfFolder(deployId)}/conf.server.json`);

/** The domains the engine answers at `/`, each on its own port. */
const servedDomains = (confServer) =>
  Object.keys(hostPortsFactory(confServer, 0))
    .filter((key) => key.endsWith('/'))
    .map((key) => key.slice(0, -1));

/**
 * The names a host resolves to the gateway: the gateway aliases and every domain the engine serves.
 * @param {string} deployId
 * @returns {string[]}
 * @memberof CyberiaComposeStack
 */
const gatewayHostAliases = (deployId) => [...GATEWAY_ALIASES, ...servedDomains(confServerOf(deployId))];

/**
 * The locations that serve one release path: `/` itself, or a redirect to `<path>/` and its prefix.
 * @param {string} prefix - The release path, empty for `/`.
 * @param {string} target - The `host:port` that serves it.
 */
const pathLocations = (prefix, target) =>
  prefix
    ? [
        { match: `= ${prefix}`, redirect: `${prefix}/` },
        { match: `^~ ${prefix}/`, proxy: target },
      ]
    : [{ match: '/', proxy: target }];

/**
 * Declares the dd-cyberia gateway on `nginx` and returns the compose document.
 * @param {object} context
 * @param {string} context.deployId
 * @param {string} context.env - `development` or `production`: the default images and environments.
 * @param {Object<string,string>} context.composeEnv - The operator-owned compose.env.
 * @param {import('../../runtime/nginx/Nginx.js').NginxService} context.nginx
 * @returns {object} The compose document.
 * @memberof CyberiaComposeStack
 */
const cyberiaComposeStack = ({ deployId, env, composeEnv, nginx }) => {
  const confServer = confServerOf(deployId);
  const ports = hostPortsFactory(confServer, Number(composeEnv.PORT) + 1);
  const domains = servedDomains(confServer);
  const dataPlaneHost = domains.find((host) => confServer[host]['/'].apis?.includes(DATA_PLANE_API));
  if (!dataPlaneHost) throw new Error(`${deployId}: no domain serves the ${DATA_PLANE_API} API at /`);
  const restPort = ports[`${dataPlaneHost}/`];
  const portRange = `${Math.min(...Object.values(ports))}-${Math.max(...Object.values(ports))}`;
  const engine = `${ENGINE_SERVICE}:${restPort}`;
  const network = `${deployId}-internal`;
  const engineImage = imageReference('engine-cyberia', env);

  const { variants } = normalizeInstanceTopology({ variants: RELEASE_CONTENT.instances.map(({ path }) => path) });
  const worlds = variants.map(({ path, slug }) => ({
    path,
    prefix: path === '/' ? '' : path,
    server: `cyberia-server-${slug.slice(1) || 'runtime'}`,
    client: `cyberia-client-${slug.slice(1) || 'runtime'}`,
    container: slug ? `-${slug.slice(1)}` : '',
  }));

  nginx.useResolver();
  nginx.addMap({
    source: '$host',
    variable: '$engine_upstream',
    entries: {
      default: engine,
      ...Object.fromEntries(domains.map((host) => [host, `${ENGINE_SERVICE}:${ports[`${host}/`]}`])),
    },
  });
  nginx.addServer({
    listen: ['80 default_server'],
    names: ['localhost', '127.0.0.1', 'cyberia-client', 'cyberia.localhost', 'client.cyberia.localhost', '_'],
    health: true,
    locations: [
      { match: '/api/', proxy: engine },
      { match: '/assets/', proxy: engine },
      ...worlds.map(({ prefix, server }) => ({ match: `= ${prefix}/ws`, proxy: `${server}:${GAME_PORT}` })),
      ...worlds.flatMap(({ prefix, client }) => pathLocations(prefix, `${client}:${GAME_PORT}`)),
    ],
  });
  nginx.addServer({
    listen: [80, `${GAME_PORT} default_server`],
    names: ['cyberia-server', 'server.cyberia.localhost'],
    health: true,
    locations: worlds.flatMap(({ prefix, server }) => pathLocations(prefix, `${server}:${GAME_PORT}`)),
  });
  nginx.addServer({ names: domains, locations: [{ match: '/', proxy: '$engine_upstream' }] });
  nginx.addServer({
    names: ['engine-cyberia', 'engine.cyberia.localhost'],
    locations: [{ match: '/', proxy: engine }],
  });

  const engineEnv = {
    NODE_ENV: `\${NODE_ENV:-${env}}`,
    DB_PROVIDER: '${DB_PROVIDER:-mongoose}',
    DB_HOST: '${DB_HOST:-mongodb://mongodb:27017}',
    DB_REPLICA_SET: '${DB_REPLICA_SET:-rs0}',
    DB_AUTH_SOURCE: '${DB_AUTH_SOURCE:-admin}',
    DB_USER: '${MONGO_INITDB_ROOT_USERNAME:?}',
    DB_PASSWORD: '${MONGO_INITDB_ROOT_PASSWORD:?}',
    VALKEY_HOST: '${VALKEY_HOST:-valkey-service}',
    VALKEY_PORT: '${VALKEY_PORT:-6379}',
  };

  const gameServers = Object.fromEntries(
    worlds.map(({ path, prefix, server, container }) => [
      server,
      {
        image: imageReference('cyberia-server', env),
        container_name: `${deployId}-server${container}`,
        environment: {
          ...buildCyberiaMmoInstanceEnv({ instance: { runtime: 'cyberia-server', path } }),
          CYBERIA_PUBLIC_URL: `\${CYBERIA_SERVER_PUBLIC_ORIGIN:-http://localhost:${GAME_PORT}}${prefix}`,
          CYBERIA_SERVER_API_KEY: '${CYBERIA_SERVER_API_KEY:-}',
          CYBERIA_DATA_SERVER_URL: '${CYBERIA_DATA_SERVER_URL:-http://engine-cyberia}',
          ENGINE_PUBLIC_URL: `\${ENGINE_PUBLIC_URL:-http://localhost:${restPort}}`,
          CYBERIA_DATA_SERVER_GRPC: `\${CYBERIA_DATA_SERVER_GRPC:-${ENGINE_SERVICE}:50051}`,
          ENGINE_GRPC_RELOAD_INTERVAL_SEC: '${ENGINE_GRPC_RELOAD_INTERVAL_SEC:-300}',
          STATIC_DIR: '${CYBERIA_SERVER_STATIC_DIR:-/home/dd/engine/cyberia-server/public}',
          APP_ENV: `\${CYBERIA_SERVER_APP_ENV:-${env}}`,
          LOG_LEVEL: '${CYBERIA_SERVER_LOG_LEVEL:-}',
          ...Object.fromEntries(SERVER_PASSTHROUGH.map((name) => [name, `\${${name}:-}`])),
        },
        networks: [network],
        expose: [`${GAME_PORT}`],
        healthcheck: healthcheck(
          ['CMD-SHELL', `curl -fsS http://127.0.0.1:${GAME_PORT}${prefix}${SERVER_READY_PATH} >/dev/null || exit 1`],
          '30s',
        ),
        depends_on: { proxy: healthy, 'engine-cyberia-content': { condition: 'service_completed_successfully' } },
        restart: 'unless-stopped',
      },
    ]),
  );

  // Each client waits for its own server only, so the server-client pairs start in parallel.
  const gameClients = Object.fromEntries(
    worlds.map(({ path, prefix, server, client, container }) => [
      client,
      {
        image: imageReference('cyberia-client', env),
        container_name: `${deployId}-client${container}`,
        environment: {
          CYBERIA_PORT: `${GAME_PORT}`,
          ...buildCyberiaMmoInstanceEnv({ instance: { runtime: 'cyberia-client', path } }),
          CYBERIA_WS_ORIGIN: `\${CYBERIA_WS_ORIGIN:-ws://localhost:${GAME_PORT}}`,
          CYBERIA_DATA_SERVER_URL: '${CYBERIA_CLIENT_DATA_SERVER_URL:-http://localhost}',
        },
        networks: [network],
        expose: [`${GAME_PORT}`],
        healthcheck: healthcheck(
          ['CMD-SHELL', `curl -fsS http://127.0.0.1:${GAME_PORT}${prefix}/ >/dev/null || exit 1`],
          '20s',
        ),
        depends_on: { [server]: healthy },
        restart: 'unless-stopped',
      },
    ]),
  );

  return {
    name: deployId,
    services: {
      mongodb: {
        image: '${MONGO_IMAGE:-mongo:latest}',
        container_name: `${deployId}-mongodb`,
        entrypoint: ['bash', '/docker-init/entrypoint.sh'],
        environment: {
          MONGO_INITDB_ROOT_USERNAME: '${MONGO_INITDB_ROOT_USERNAME:?set MONGO_INITDB_ROOT_USERNAME in compose.env}',
          MONGO_INITDB_ROOT_PASSWORD: '${MONGO_INITDB_ROOT_PASSWORD:?set MONGO_INITDB_ROOT_PASSWORD in compose.env}',
          DB_REPLICA_SET: '${DB_REPLICA_SET:-rs0}',
        },
        volumes: ['./mongodb:/docker-init:ro', 'mongodb-keyfile:/opt/keyfile', 'mongodb-data:/data/db'],
        networks: [network],
        expose: ['27017'],
        ports: ['${MONGO_HOST_PORT:-27017}:27017'],
        healthcheck: {
          ...healthcheck(
            [
              'CMD-SHELL',
              'mongosh --quiet -u "$$MONGO_INITDB_ROOT_USERNAME" -p "$$MONGO_INITDB_ROOT_PASSWORD" ' +
                '--authenticationDatabase admin --eval "db.hello().isWritablePrimary" | grep -q true',
            ],
            '60s',
            20,
          ),
          interval: '10s',
        },
        restart: 'unless-stopped',
      },
      // Bounded memory with LRU eviction: every key is a cache entry or a TTL-bound session.
      'valkey-service': {
        image: '${VALKEY_IMAGE:-valkey/valkey:latest}',
        container_name: `${deployId}-valkey`,
        command: [
          'valkey-server',
          '--port',
          '6379',
          '--bind',
          '0.0.0.0',
          '--protected-mode',
          'no',
          '--maxmemory',
          '256mb',
          '--maxmemory-policy',
          'allkeys-lru',
        ],
        volumes: ['valkey-data:/data'],
        networks: [network],
        expose: ['6379'],
        ports: ['${VALKEY_NODEPORT:-32079}:6379'],
        healthcheck: { ...healthcheck(['CMD', 'valkey-cli', '-p', '6379', 'ping'], '10s', 10), interval: '10s' },
        restart: 'unless-stopped',
      },
      ipfs: {
        image: '${IPFS_IMAGE:-ipfs/kubo:latest}',
        container_name: `${deployId}-ipfs`,
        volumes: ['./ipfs/configure-ipfs.sh:/container-init.d/001-configure-ipfs.sh:ro', 'ipfs-data:/data/ipfs'],
        networks: [network],
        expose: ['5001', '8080', '4001'],
        ports: ['${IPFS_API_PORT:-5001}:5001', '${IPFS_GATEWAY_PORT:-8080}:8080'],
        healthcheck: healthcheck(
          ['CMD-SHELL', 'ipfs --api=/ip4/127.0.0.1/tcp/5001 id >/dev/null 2>&1 || exit 1'],
          '40s',
        ),
        restart: 'unless-stopped',
      },
      'ipfs-cluster': {
        image: '${IPFS_CLUSTER_IMAGE:-ipfs/ipfs-cluster:latest}',
        container_name: `${deployId}-ipfs-cluster`,
        depends_on: { ipfs: healthy },
        environment: {
          CLUSTER_PEERNAME: `${deployId}-cluster`,
          CLUSTER_SECRET: '${CLUSTER_SECRET:-0e1d2c3b4a59687778695a4b3c2d1e0f0e1d2c3b4a59687778695a4b3c2d1e0f}',
          CLUSTER_IPFSHTTP_NODEMULTIADDRESS: '/dns4/ipfs/tcp/5001',
          CLUSTER_RESTAPI_HTTPLISTENMULTIADDRESS: '/ip4/0.0.0.0/tcp/9094',
          CLUSTER_CRDT_TRUSTEDPEERS: '*',
        },
        volumes: ['ipfs-cluster-data:/data/ipfs-cluster'],
        networks: [network],
        expose: ['9094', '9096'],
        ports: ['${IPFS_CLUSTER_API_PORT:-9094}:9094'],
        healthcheck: healthcheck(
          ['CMD-SHELL', 'ipfs-cluster-ctl --host /ip4/127.0.0.1/tcp/9094 id >/dev/null 2>&1 || exit 1'],
          '40s',
        ),
        restart: 'unless-stopped',
      },
      // One engine serves every domain of the deploy, one port each in conf.server.json order.
      [ENGINE_SERVICE]: {
        image: engineImage,
        container_name: `${deployId}-engine`,
        env_file: ['./compose.env'],
        environment: engineEnv,
        networks: [network],
        expose: [portRange, '50051'],
        ports: [`${portRange}:${portRange}`, '${ENGINE_CYBERIA_GRPC_PORT:-50051}:50051'],
        healthcheck: healthcheck(
          ['CMD-SHELL', `timeout 2 bash -c '</dev/tcp/127.0.0.1/${restPort}' || exit 1`],
          '180s',
        ),
        depends_on: { mongodb: healthy, 'valkey-service': healthy, ipfs: healthy, 'ipfs-cluster': healthy },
        restart: 'unless-stopped',
      },
      // Imports the artifact the image carries into the workspace the engine serves: a development
      // bootstrap, not a release. Every import is idempotent, so a rerun is safe.
      'engine-cyberia-content': {
        image: engineImage,
        container_name: `${deployId}-content`,
        network_mode: `service:${ENGINE_SERVICE}`,
        command: ['node', 'bin/cyberia', 'run-workflow', 'import-content'],
        env_file: ['./compose.env'],
        environment: engineEnv,
        depends_on: { [ENGINE_SERVICE]: healthy },
        restart: 'no',
      },
      ...gameServers,
      ...gameClients,
      proxy: {
        image: '${PROXY_IMAGE:-nginx:stable-alpine}',
        container_name: `${deployId}-proxy`,
        volumes: ['./nginx.conf:/etc/nginx/conf.d/default.conf:ro'],
        networks: { [network]: { aliases: [...GATEWAY_ALIASES, ...domains] } },
        ports: [
          '${PROXY_HTTP_PORT:-80}:80',
          `\${CYBERIA_SERVER_PORT:-${GAME_PORT}}:${GAME_PORT}`,
          '${CYBERIA_CLIENT_PORT:-8082}:80',
        ],
        healthcheck: healthcheck(
          [
            'CMD-SHELL',
            `wget -q -O /dev/null http://127.0.0.1/healthz && wget -q -O /dev/null http://127.0.0.1:${GAME_PORT}/healthz`,
          ],
          '10s',
        ),
        depends_on: { [ENGINE_SERVICE]: healthy },
        restart: 'unless-stopped',
      },
    },
    networks: { [network]: { name: network, driver: 'bridge' } },
    volumes: Object.fromEntries(
      ['mongodb-data', 'mongodb-keyfile', 'valkey-data', 'ipfs-data', 'ipfs-cluster-data'].map((volume) => [
        volume,
        { name: `${deployId}-${volume}` },
      ]),
    ),
  };
};

/** The stacks of this project, by docker-compose id. */
const composeStacks = Object.freeze({ cyberia: cyberiaComposeStack });

export { SERVER_READY_PATH, STACK_IMAGES, composeStacks, cyberiaComposeStack, gatewayHostAliases };
