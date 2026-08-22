/**
 * The deploy route registry, and the routers built from it.
 *
 * Two levels of "route" meet here, which is why they share a module:
 *
 *   - `engine-private/deploy/dd.routes` lists the deploy ids this engine serves.
 *     It is the cluster's route table at the deploy level, and every command that
 *     accepts the `dd` meta id expands it through this file.
 *   - The proxy routers map `<host><path>` to the local port a runtime bound, and
 *     are derived from each deploy's `conf.server.json`.
 *
 * Keeping both here means the file path is written once and the port arithmetic
 * lives beside the list it is computed for.
 *
 * @module src/server/router.js
 * @namespace ServerRouter
 */

import fs from 'fs-extra';
import { newInstance, orderArrayFromAttrInt, range } from '../client/components/core/CommonJs.js';
import { loggerFactory } from './logger.js';
import { Config, DEFAULT_DEPLOY_ID, isDevProxyContext, isTlsDevProxy, loadConfServerJson } from './conf.js';

const logger = loggerFactory(import.meta);

/**
 * @constant DEPLOY_ROUTES_PATH
 * @description The deploy route table: a comma separated list of the deploy ids
 * this engine serves.
 * @memberof ServerRouter
 */
const DEPLOY_ROUTES_PATH = './engine-private/deploy/dd.routes';

/**
 * @method deployRoutesExists
 * @description Whether the route table is present.
 * @returns {boolean} True when the engine has a route table.
 * @memberof ServerRouter
 */
const deployRoutesExists = () => fs.existsSync(DEPLOY_ROUTES_PATH);

/**
 * @method readDeployRoutes
 * @description The deploy ids in the route table, trimmed and without empties.
 * @returns {string[]} Deploy ids, empty when no table exists.
 * @memberof ServerRouter
 */
const readDeployRoutes = () =>
  deployRoutesExists() ? parseDeployRoutes(fs.readFileSync(DEPLOY_ROUTES_PATH, 'utf8')) : [];

/**
 * @method parseDeployRoutes
 * @description Parses route table contents. Kept separate from the read so the
 * parsing is testable without a checkout.
 * @param {string} [contents] - Raw route table contents.
 * @returns {string[]} Deploy ids, trimmed, empties dropped.
 * @memberof ServerRouter
 */
const parseDeployRoutes = (contents = '') =>
  `${contents || ''}`
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

/**
 * @method registerDeployRoute
 * @description Appends a deploy id to the route table, creating it when absent.
 *
 * Idempotent: a deploy already routed is left alone rather than listed twice,
 * which would make every `dd` fan-out build and deploy it twice.
 * @param {string} deployId - Deploy id to route.
 * @returns {string[]} The resulting route table.
 * @memberof ServerRouter
 */
const registerDeployRoute = (deployId) => {
  const id = `${deployId || ''}`.trim();
  if (!id) return readDeployRoutes();
  const routes = readDeployRoutes();
  if (routes.includes(id)) return routes;
  routes.push(id);
  fs.outputFileSync(DEPLOY_ROUTES_PATH, routes.join(','), 'utf8');
  return routes;
};

/**
 * @method resolveDeployList
 * @description Resolves the concrete deploy ids a run should iterate over.
 *
 * The meta deploy id `dd` fans out to the route table; when no table exists
 * (e.g. the private repository is not checked out) it falls back to
 * {@link ServerConfBuilder.DEFAULT_DEPLOY_ID}. Any other value is parsed as a
 * comma separated list.
 * @param {string} deployId - A deploy id, a comma separated list, or the `dd` meta id.
 * @returns {string[]} Ordered list of concrete deploy ids.
 * @memberof ServerRouter
 */
const resolveDeployList = (deployId) => {
  if (deployId !== 'dd') return parseDeployRoutes(deployId);
  const routes = readDeployRoutes();
  return routes.length > 0 ? routes : parseDeployRoutes(DEFAULT_DEPLOY_ID);
};

/**
 * @method buildProxyRouter
 * @description Builds the proxy router.
 * @memberof ServerRouter
 */
const buildProxyRouter = () => {
  const confServer = newInstance(Config.default.server);
  let currentPort = parseInt(process.env.PORT) + 1;
  const proxyRouter = {};
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      if (confServer[host][path].singleReplica) continue;

      if (isDevProxyContext()) confServer[host][path].proxy = [isTlsDevProxy() ? 443 : 80];

      confServer[host][path].port = newInstance(currentPort);
      for (const port of confServer[host][path].proxy) {
        if (!(port in proxyRouter)) proxyRouter[port] = {};
        proxyRouter[port][`${host}${path}`] = {
          // target: `http://${host}:${confServer[host][path].port}${path}`,
          target: `http://localhost:${confServer[host][path].port}`,
          // target: `http://127.0.0.1:${confServer[host][path].port}`,
          proxy: confServer[host][path].proxy,
          redirect: confServer[host][path].redirect,
          host,
          path,
        };
      }
      currentPort++;
      if (confServer[host][path].peer) {
        const peerPath = path === '/' ? `/peer` : `${path}/peer`;
        confServer[host][peerPath] = newInstance(confServer[host][path]);
        confServer[host][peerPath].port = newInstance(currentPort);
        for (const port of confServer[host][path].proxy) {
          if (!(port in proxyRouter)) proxyRouter[port] = {};
          proxyRouter[port][`${host}${peerPath}`] = {
            // target: `http://${host}:${confServer[host][peerPath].port}${peerPath}`,
            target: `http://localhost:${confServer[host][peerPath].port}`,
            // target: `http://127.0.0.1:${confServer[host][peerPath].port}`,
            proxy: confServer[host][peerPath].proxy,
            host,
            path: peerPath,
          };
        }
        currentPort++;
      }
    }
  }

  return proxyRouter;
};

/**
 * @method pathPortAssignmentFactory
 * @description Creates the path port assignment.
 * @param {string} deployId - The deploy ID.
 * @param {object} router - The router.
 * @param {object} confServer - The server configuration.
 * @memberof ServerRouter
 */
const pathPortAssignmentFactory = async (deployId, router, confServer) => {
  const pathPortAssignmentData = {};
  for (const host of Object.keys(confServer)) {
    const pathPortAssignment = [];
    for (const path of Object.keys(confServer[host])) {
      const { peer } = confServer[host][path];
      if (!router[`${host}${path === '/' ? '' : path}`]) continue;
      const port = parseInt(router[`${host}${path === '/' ? '' : path}`].split(':')[2]);
      // logger.info('', { host, port, path });
      pathPortAssignment.push({
        port,
        path,
      });

      if (peer) {
        //  logger.info('', { host, port: port + 1, path: '/peer' });
        pathPortAssignment.push({
          port: port + 1,
          path: `${path === '/' ? '' : path}/peer`,
        });
      }
    }
    pathPortAssignmentData[host] = pathPortAssignment;
  }
  if (fs.existsSync(`./engine-private/replica`)) {
    const singleReplicas = await fs.readdir(`./engine-private/replica`);
    for (let replica of singleReplicas) {
      if (replica.startsWith(deployId)) {
        const replicaServerConf = loadConfServerJson(`./engine-private/replica/${replica}/conf.server.json`);
        for (const host of Object.keys(replicaServerConf)) {
          const pathPortAssignment = [];
          for (const path of Object.keys(replicaServerConf[host])) {
            const { peer } = replicaServerConf[host][path];
            if (!router[`${host}${path === '/' ? '' : path}`]) continue;
            const port = parseInt(router[`${host}${path === '/' ? '' : path}`].split(':')[2]);
            // logger.info('', { host, port, path });
            pathPortAssignment.push({
              port,
              path,
            });

            if (peer) {
              //  logger.info('', { host, port: port + 1, path: '/peer' });
              pathPortAssignment.push({
                port: port + 1,
                path: `${path === '/' ? '' : path}/peer`,
              });
            }
          }
          pathPortAssignmentData[host] = pathPortAssignmentData[host].concat(pathPortAssignment);
        }
      }
    }
  }
  return pathPortAssignmentData;
};

/**
 * @method deployRangePortFactory
 * @description Creates the deploy range port factory.
 * @param {object} router - The router.
 * @returns {object} - The deploy range port factory.
 * @memberof ServerRouter
 */
const deployRangePortFactory = (router) => {
  const ports = Object.values(router).map((p) => parseInt(p.split(':')[2]));
  const fromPort = Math.min(...ports);
  const toPort = Math.max(...ports);
  return { ports, fromPort, toPort };
};

/**
 * @method buildKindPorts
 * @description Builds the kind ports.
 * @param {number} from - The from port.
 * @param {number} to - The to port.
 * @returns {string} - The kind ports.
 * @memberof ServerRouter
 */
const buildKindPorts = (from, to) =>
  range(parseInt(from), parseInt(to))
    .map(
      (port) => `    - name: 'tcp-${port}'
      protocol: TCP
      port: ${port}
      targetPort: ${port}
    - name: 'udp-${port}'
      protocol: UDP
      port: ${port}
      targetPort: ${port}
`,
    )
    .join('\n');

/**
 * @method buildPortProxyRouter
 * @description Builds the port proxy router.
 * @param {object} options - The options.
 * @param {number} [options.port=4000] - The port.
 * @param {object} options.proxyRouter - The proxy router.
 * @param {object} [options.hosts] - The hosts.
 * @param {boolean} [options.orderByPathLength=false] - Whether to order by path length.
 * @param {boolean} [options.devProxyContext=false] - Whether to use dev proxy context.
 * @returns {object} - The port proxy router.
 * @memberof ServerRouter
 */
const buildPortProxyRouter = (
  options = { port: 4000, proxyRouter, hosts, orderByPathLength: false, devProxyContext: false },
) => {
  let { port, proxyRouter, hosts, orderByPathLength } = options;
  hosts = hosts || proxyRouter[port] || {};

  const router = {};
  // build router
  Object.keys(hosts).map((hostKey) => {
    let { host, path, target, proxy, peer } = hosts[hostKey];

    if (!proxy.includes(port)) {
      logger.warn('Proxy port not set on conf', { port, host, path, proxy, target });
      if (process.env.NODE_ENV === 'production') {
        logger.warn('Omitting host', { host, path, target });
        return;
      }
    }
    // ${process.env.NODE_ENV === 'development' && !isDevProxyContext() ? `:${port}` : ''}
    const absoluteHost = [80, 443].includes(port)
      ? `${host}${path === '/' ? '' : path}`
      : `${host}:${port}${path === '/' ? '' : path}`;

    if (absoluteHost in router)
      logger.warn('Overwrite: Absolute host already exists on router', { absoluteHost, target });

    if (options.devProxyContext === true) {
      const appDevPort = parseInt(target.split(':')[2]) - process.env.DEV_PROXY_PORT_OFFSET;
      router[absoluteHost] = `http://localhost:${appDevPort}`;
    } else router[absoluteHost] = target;
  }); // order router

  if (Object.keys(router).length === 0) return router;

  const devApiConfPath = `./engine-private/conf/${process.argv[3]}/conf.server.dev.${process.argv[4]}-dev-api.json`;
  if (options.devProxyContext === true && process.env.NODE_ENV === 'development' && fs.existsSync(devApiConfPath)) {
    const confDevApiServer = JSON.parse(fs.readFileSync(devApiConfPath, 'utf8'));
    let devApiHosts = [];
    let origins = [];
    for (const _host of Object.keys(confDevApiServer))
      for (const _path of Object.keys(confDevApiServer[_host])) {
        if (confDevApiServer[_host][_path].origins && confDevApiServer[_host][_path].origins.length) {
          origins.push(...confDevApiServer[_host][_path].origins);
          if (_path !== 'peer' && devApiHosts.length === 0)
            devApiHosts.push(
              `${_host}${[80, 443].includes(port) && isDevProxyContext() ? '' : `:${port}`}${_path == '/' ? '' : _path}`,
            );
        }
      }
    origins = Array.from(new Set(origins));
    console.log({
      origins,
      devApiHosts,
    });
    for (const devApiHost of devApiHosts) {
      if (devApiHost in router) {
        const target = router[devApiHost];
        delete router[devApiHost];
        router[`${devApiHost}/${process.env.BASE_API}`] = target;
        router[`${devApiHost}/socket.io`] = target;
        for (const origin of origins) router[devApiHost] = origin;
      }
    }
  }

  if (orderByPathLength === true) {
    const reOrderRouter = {};
    for (const absoluteHostKey of orderArrayFromAttrInt(Object.keys(router), 'length'))
      reOrderRouter[absoluteHostKey] = router[absoluteHostKey];
    return reOrderRouter;
  }

  return router;
};

export {
  DEPLOY_ROUTES_PATH,
  buildKindPorts,
  buildPortProxyRouter,
  buildProxyRouter,
  deployRangePortFactory,
  deployRoutesExists,
  parseDeployRoutes,
  pathPortAssignmentFactory,
  readDeployRoutes,
  registerDeployRoute,
  resolveDeployList,
};
