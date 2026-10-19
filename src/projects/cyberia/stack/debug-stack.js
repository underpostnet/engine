/**
 * The dd-cyberia debug run: each process of the development topology in its own terminal on this
 * host. Each game instance runs its development env on a local port; the gateway answers the
 * development origin of each runtime and routes every world path to its instance, as the cluster
 * gateway does.
 *
 * @module src/projects/cyberia/stack/debug-stack.js
 * @namespace CyberiaDebugStack
 */

import http from 'node:http';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import { createProxyServer } from 'httpxy';
import {
  instanceEnvFilePath,
  loadConfInstances,
  readConfJson,
  sortInstancesByPath,
} from '../../../server/runtime/conf.js';
import { proxyErrorStatusFactory, proxyTargetFactory } from '../../../server/network/proxy.js';
import { loggerFactory } from '../../../server/ops/logger.js';
import { gameOrigins } from '../runtime/game-origins.js';

const logger = loggerFactory(import.meta);

/**
 * The processes of a debug run, one per terminal.
 * @memberof CyberiaDebugStack
 */
const DEBUG_TARGETS = Object.freeze(['engine-cyberia', 'gateway', 'cyberia-server', 'cyberia-client']);

/** Each game runtime and the development origin it answers on. */
const GAME_ORIGINS = Object.freeze({ 'cyberia-server': 'server', 'cyberia-client': 'client' });

/** The instance of rank `n` of a runtime listens on the port of its origin plus `n * DEBUG_PORT_STEP`. */
const DEBUG_PORT_STEP = 10;

const originPort = (origin) => Number(new URL(origin).port);

/**
 * The debug topology: the local engine, and each game instance with the origin its gateway answers
 * and its local port.
 * @param {object} params
 * @param {{portal: string, client: string, server: string}} params.origins - The development origins.
 * @param {number} params.grpcPort - The engine gRPC port.
 * @param {Array<{id: string, runtime: string, path: string, env: Object<string,string>}>} params.instances -
 *   The game instances, in conf order.
 * @returns {{engine: {url: string, grpc: string}, instances: Array<Object>}}
 * @memberof CyberiaDebugStack
 */
const debugTopology = ({ origins, grpcPort, instances }) => ({
  engine: { url: origins.portal, grpc: `localhost:${grpcPort}` },
  instances: instances.map((instance) => {
    const origin = origins[GAME_ORIGINS[instance.runtime]];
    const rank = instances.filter(({ runtime }) => runtime === instance.runtime).indexOf(instance) + 1;
    return { ...instance, origin, port: originPort(origin) + rank * DEBUG_PORT_STEP };
  }),
});

/**
 * Reads the debug topology of a deploy: its conf, and the development env `instance-build-manifest`
 * writes for each game instance.
 * @param {string} deployId
 * @returns {ReturnType<typeof debugTopology>}
 * @throws {Error} When no host runs the gRPC server, or an instance has no development env.
 * @memberof CyberiaDebugStack
 */
const loadDebugTopology = (deployId) => {
  const grpcPort = Object.values(readConfJson(deployId, 'server'))
    .map((paths) => paths['/']?.grpc?.port)
    .find(Boolean);
  if (!grpcPort) throw new Error(`No host of ${deployId} runs the gRPC server`);
  const instances = loadConfInstances(deployId)
    .filter(({ runtime }) => GAME_ORIGINS[runtime])
    .map((instance) => {
      const envPath = instanceEnvFilePath(deployId, instance.id, 'development');
      if (!fs.existsSync(envPath))
        throw new Error(
          `${envPath} is missing: build the manifests of ${instance.templateId} with instance-build-manifest`,
        );
      return { ...instance, env: dotenv.parse(fs.readFileSync(envPath, 'utf8')) };
    });
  return debugTopology({ origins: gameOrigins(deployId, 'development'), grpcPort, instances });
};

/**
 * The game instance a target runs at a world path.
 * @param {ReturnType<typeof debugTopology>} topology
 * @param {string} target - `cyberia-server` or `cyberia-client`.
 * @param {string} [path='/']
 * @returns {Object}
 * @throws {Error} When the target runs no instance at the path.
 * @memberof CyberiaDebugStack
 */
const debugInstance = (topology, target, path = '/') => {
  const instances = topology.instances.filter(({ runtime }) => runtime === target);
  const instance = instances.find((entry) => entry.path === path);
  if (!instance)
    throw new Error(`${target} runs ${instances.map((entry) => entry.path).join(', ') || 'nothing'}, not ${path}`);
  return instance;
};

/**
 * The command of one game instance and its env: the development env of the instance on its local
 * port, against the local engine, with no container status reports.
 * @param {object} params
 * @param {ReturnType<typeof debugTopology>} params.topology
 * @param {Object} params.instance - From {@link debugInstance}.
 * @param {string} params.checkout - The checkout of its runtime.
 * @param {boolean} [params.build=false] - Build the client bundle before serving it, with the
 *   Emscripten SDK that `EMSDK` of its env names (and `EMSDK_PYTHON`, when the host needs one).
 * @returns {{cwd: string, command: string, env: Object<string,string>}}
 * @throws {Error} When a build has no `EMSDK`.
 * @memberof CyberiaDebugStack
 */
const debugCommand = ({ topology, instance, checkout, build = false }) => {
  const env = { ...instance.env, CONTAINER_DEPLOY_ID: '' };
  if (build && !env.EMSDK)
    throw new Error(`--build needs EMSDK, the Emscripten SDK root, in the development env of ${instance.id}`);
  if (instance.runtime === 'cyberia-server')
    return {
      cwd: `${checkout}/cmd/cyberia-server`,
      command: `go run . --data-server-url ${topology.engine.url} --data-server-grpc ${topology.engine.grpc}`,
      env: {
        ...env,
        SERVER_PORT: `${instance.port}`,
        // The engine sends control gRPC to the root world only; a world under a path takes the REST trigger.
        ...(instance.path === '/' ? {} : { CYBERIA_HOT_RELOAD_GRPC_ADDRESS: 'localhost:0' }),
      },
    };
  // The SDK goes on PATH as in the client Dockerfile.dev.
  const buildStep = build ? 'PATH="$EMSDK:$EMSDK/upstream/emscripten:$PATH" make -f Web.mk clean all && ' : '';
  return {
    cwd: checkout,
    command:
      `${buildStep}python3 wasm-driver.py` +
      ` --port=${instance.port} --directory=bin --data-server-url=${env.CYBERIA_DATA_SERVER_URL}`,
    env,
  };
};

/**
 * Starts the gateway: one listener on each runtime origin, which sends each request and WebSocket
 * upgrade to the instance whose world path the URL starts with.
 * @param {ReturnType<typeof debugTopology>} topology
 * @returns {Promise<Array<{origin: string, router: Object<string,string>, server: http.Server}>>}
 * @memberof CyberiaDebugStack
 */
const startDebugGateway = async (topology) => {
  const proxy = createProxyServer({});
  const origins = [...new Set(topology.instances.map(({ origin }) => origin))];
  return await Promise.all(
    origins.map((origin) => {
      const instances = sortInstancesByPath(topology.instances.filter((instance) => instance.origin === origin));
      const router = Object.fromEntries(instances.map(({ path, port }) => [path, `http://localhost:${port}`]));
      const route = (req) => {
        const target = proxyTargetFactory(router, { url: req.url });
        return { target, instance: instances[Object.values(router).indexOf(target)] };
      };
      /** Names the command of a world process that does not listen; other failures get no hint. */
      const hint = (error, { runtime, path }) => {
        if (error.code !== 'ECONNREFUSED') return '';
        const message = `No ${runtime} listens for ${path}: run node bin/cyberia debug ${runtime} ${path}`;
        logger.warn(message);
        return message;
      };
      const server = http.createServer((req, res) => {
        const { target, instance } = route(req);
        proxy.web(req, res, { target }).catch((error) => {
          const message = hint(error, instance);
          if (!res.headersSent)
            res.writeHead(proxyErrorStatusFactory(error.code), { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(message);
        });
      });
      server.on('upgrade', (req, socket, head) => {
        const { target, instance } = route(req);
        proxy.ws(req, socket, { target, ws: true }, head).catch((error) => {
          hint(error, instance);
          socket.destroy();
        });
      });
      return new Promise((resolve, reject) =>
        server.once('error', reject).listen(originPort(origin), () => resolve({ origin, router, server })),
      );
    }),
  );
};

export { DEBUG_TARGETS, debugCommand, debugInstance, debugTopology, loadDebugTopology, startDebugGateway };
