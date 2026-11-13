/**
 * Path routes: one host of a deploy sends chosen paths to the workload of another host of the
 * same deploy. A host declares them in `pathRoutes` of its `conf.server.json` entry. The path is
 * preserved, so the destination serves the request at the URL the visitor asked for. A redirect
 * route answers its matches with a `308` to the same path and query on the destination host
 * instead, so the visitor's browser runs the destination on its own origin.
 *
 * A destination is a workload, never a public host. A routed request never passes through the
 * routes of its destination again, so path routes cannot form a loop.
 *
 * This module validates the declaration and resolves it to one route plan: each match with its
 * destination port and precedence. The gateway compiles the plan, and the runtime forwards by it
 * where no gateway routes first. It is pure: it reads only the configuration it is given.
 *
 * @module src/server/network/path-routes.js
 * @namespace PathRoutes
 */

import { getCapVariableName } from '../../client/components/core/CommonJs.js';
import { apiPathOf } from '../domain/api-contract.js';
import { socketPathOf } from '../../ws/io-server.js';
import { staticContextRoutesFactory, statusPageRoutesFactory } from '../../client-builder/client-build.js';
import { clientPublicTreesFactory, publicClientIdFactory } from '../runtime/conf.js';

/**
 * The match kinds of a path route. `Exact` and `PathPrefix` take a `path`; the other kinds derive
 * their paths from the destination configuration.
 * - `client-views`: every document route of the destination client, status pages and edge contexts left out.
 * - `client-assets`: the directories the client build writes the destination modules and libraries to.
 * - `client-apis`: the APIs of the destination that its client calls, and the ones `include` names.
 * - `api`: the API path of the destination.
 * - `ws`: the Socket.IO path of the destination.
 * @memberof PathRoutes
 */
const PATH_ROUTE_KINDS = Object.freeze([
  'Exact',
  'PathPrefix',
  'client-views',
  'client-assets',
  'client-apis',
  'api',
  'ws',
]);

/**
 * The most matches one route resolves to: Gateway API admits 64 matches in one HTTPRoute rule.
 * @memberof PathRoutes
 */
const MAX_ROUTE_MATCHES = 64;

const ROUTE_KEYS = ['id', 'match', 'destination', 'redirect'];
const MATCH_KEYS = {
  Exact: ['kind', 'path'],
  PathPrefix: ['kind', 'path'],
  'client-views': ['kind', 'exclude'],
  'client-assets': ['kind', 'exclude'],
  'client-apis': ['kind', 'exclude', 'include'],
  api: ['kind'],
  ws: ['kind'],
};
const DESTINATION_KEYS = ['host', 'path'];
const ID_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const PATH_PATTERN = /^\/([A-Za-z0-9._~!$&'()*+,;=:@%-]+(\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)*)?$/;

const joinPath = (base, path) => (base === '/' ? path : path === '/' ? base : `${base}${path}`);
const unknownKeys = (value, keys) => Object.keys(value).filter((key) => !keys.includes(key));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Whether a match captures a path, by Gateway API rules: an exact match is one path, a prefix
 * match is that path and every path below it, element by element.
 * @param {{type: string, path: string}} match
 * @param {string} path
 * @returns {boolean}
 * @memberof PathRoutes
 */
const capturesPath = ({ type, path: value }, path) =>
  type === 'Exact' ? path === value : value === '/' || path === value || path.startsWith(`${value}/`);

/** Why a path is not a path route value, or an empty string. */
const pathDefect = (path) => {
  if (typeof path !== 'string' || !PATH_PATTERN.test(path)) return `"${path}" is not an absolute path`;
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return `"${path}" has a dot segment`;
  return '';
};

/** The SSR views of a client: those of its own conf and those of its SSR profile. */
const viewsOf = ({ confClient, confSSR, client }) => ({
  views: confClient?.[client]?.views ?? [],
  ssrViews: confSSR?.[getCapVariableName(client)]?.views ?? [],
});

/**
 * The document routes of a client: its views and its SSR profile views, without the status
 * pages and the edge contexts, which each host serves from its own documents.
 * @returns {string[]}
 */
const clientViewPaths = ({ confClient, confSSR, client, path }) => {
  const { views, ssrViews } = viewsOf({ confClient, confSSR, client });
  const edge = new Set(
    [...statusPageRoutesFactory({ views: ssrViews }), ...staticContextRoutesFactory({ views: ssrViews })].map(
      (route) => route.routePath,
    ),
  );
  return [...new Set([...views, ...ssrViews].map((view) => view.path))]
    .filter((view) => typeof view === 'string' && !edge.has(view))
    .map((view) => joinPath(path, view));
};

/**
 * The directories the client build writes a client's modules and libraries to: `components`,
 * `services`, and the public folders of its dists.
 * @returns {string[]}
 */
const clientAssetPaths = ({ confClient, client, path }) => {
  const conf = confClient?.[client] ?? {};
  const roots = [
    ...(conf.components ? ['/components'] : []),
    ...(conf.services ? ['/services'] : []),
    ...(conf.dists ?? [])
      .flatMap((dist) => [dist.public_folder, dist.public_styles_folder])
      .filter(Boolean)
      .map((folder) => `/${folder.split('/').filter(Boolean)[0]}`),
  ];
  return [...new Set(roots)].map((root) => joinPath(path, root));
};

/**
 * Every path a host path serves itself: its documents, its edge contexts and status pages, its
 * client directories, its API and its socket. A path route must not capture one of them.
 * @returns {string[]}
 */
const ownedPaths = ({ confServer, confClient, confSSR, host, path }) => {
  const entry = confServer[host][path];
  const owned = [];
  if (entry.client) {
    const { views, ssrViews } = viewsOf({ confClient, confSSR, client: entry.client });
    owned.push(...[...views, ...ssrViews].map((view) => joinPath(path, view.path)));
    owned.push(...clientAssetPaths({ confClient, client: entry.client, path }));
  }
  if (entry.apis?.length) owned.push(apiPathOf(path));
  if (entry.ws) owned.push(socketPathOf(path).replace(/\/$/, ''));
  return [...new Set(owned)];
};

/** The service paths of a destination: answered by the workload itself, never by an edge document. */
const servicePaths = (entry, path) => [
  ...(entry.apis?.length ? [apiPathOf(path)] : []),
  ...(entry.ws ? [socketPathOf(path).replace(/\/$/, '')] : []),
];

/**
 * The paths one selector kind resolves to on a destination, or a defect.
 * @returns {{paths?: string[], defect?: string}}
 */
const selectorPaths = ({ kind, include = [], confClient, confSSR, entry, path }) => {
  switch (kind) {
    case 'client-views':
      if (!entry.client) return { defect: 'the destination serves no client' };
      return { paths: clientViewPaths({ confClient, confSSR, client: entry.client, path }) };
    case 'client-assets':
      if (!entry.client) return { defect: 'the destination serves no client' };
      return { paths: clientAssetPaths({ confClient, client: entry.client, path }) };
    case 'client-apis': {
      if (!entry.client) return { defect: 'the destination serves no client' };
      const called = (confClient?.[entry.client]?.services ?? []).filter((api) => (entry.apis ?? []).includes(api));
      const unknown = include.filter((api) => !(entry.apis ?? []).includes(api));
      if (unknown.length) return { defect: `include names APIs the destination does not mount: ${unknown.join(', ')}` };
      const repeated = include.filter((api) => called.includes(api));
      if (repeated.length) return { defect: `include names APIs the client already calls: ${repeated.join(', ')}` };
      return { paths: [...called, ...include].map((api) => `${apiPathOf(path)}/${api}`) };
    }
    case 'api':
      if (!entry.apis?.length) return { defect: 'the destination serves no API' };
      return { paths: [apiPathOf(path)] };
    case 'ws':
      if (!entry.ws) return { defect: 'the destination serves no socket' };
      return { paths: [socketPathOf(path).replace(/\/$/, '')] };
  }
};

/**
 * Checks the `pathRoutes` of one host path and resolves each route to its matches.
 *
 * Checks: known keys and kinds; unique ids; absolute paths below the host path; a destination
 * that is another host path of the same deploy, serves requests (no redirect, not a single
 * replica) and has what the kind needs; a host client that builds the public tree the forwarded
 * views read; a redirect route that matches documents only; exclusions the selector generates; no
 * route that captures a path the host serves itself; no match that two routes declare.
 *
 * A match under the API or socket path of the destination is a service match: the workload
 * answers it with its own status and body, and no edge document replaces an error. A redirect
 * never takes one: an API request or a credential must not change origin on its way.
 *
 * @param {Object} params
 * @param {Object} params.confServer - Resolved `conf.server.json` of the deploy.
 * @param {Object} params.confClient - `conf.client.json` of the deploy.
 * @param {Object} params.confSSR - `conf.ssr.json` of the deploy.
 * @param {string} params.host - Source host.
 * @param {string} params.path - Source host path.
 * @returns {Array<{id: string, kind: string, redirect: boolean, destination: {host: string, path: string},
 *   matches: Array<{type: 'Exact'|'PathPrefix', path: string, service: boolean}>}>} One entry per route,
 *   in declaration order; matches sorted by path.
 * @throws {Error} With every defect, one per line.
 * @memberof PathRoutes
 */
const resolvePathRoutes = ({ confServer, confClient = {}, confSSR = {}, host, path }) => {
  const declared = confServer?.[host]?.[path]?.pathRoutes;
  if (declared === undefined) return [];
  const where = `pathRoutes of ${host}${path}`;
  if (!Array.isArray(declared)) throw new Error(`${where}: must be an array`);
  if (confServer[host][path].redirect) throw new Error(`${where}: a host path that only redirects routes no path`);

  const defects = [];
  const routes = [];
  const ids = new Set();
  for (const [index, route] of declared.entries()) {
    const name = `${where}: route ${typeof route?.id === 'string' ? `"${route.id}"` : `#${index}`}`;
    const fail = (reason) => defects.push(`${name}: ${reason}`);
    if (!isObject(route)) {
      fail('must be an object');
      continue;
    }
    if (unknownKeys(route, ROUTE_KEYS).length) fail(`has unknown keys ${unknownKeys(route, ROUTE_KEYS)}`);
    if (!ID_PATTERN.test(route.id ?? '')) fail('needs an id of lowercase letters, digits and hyphens');
    else if (ids.has(route.id)) fail('repeats an id');
    else ids.add(route.id);
    const redirect = route.redirect ?? false;
    if (typeof redirect !== 'boolean') fail('redirect must be true or false');

    const { match, destination } = route;
    if (!isObject(match) || !PATH_ROUTE_KINDS.includes(match.kind)) {
      fail(`needs a match of kind ${PATH_ROUTE_KINDS.join(', ')}`);
      continue;
    }
    if (unknownKeys(match, MATCH_KEYS[match.kind]).length)
      fail(`match ${match.kind} has unknown keys ${unknownKeys(match, MATCH_KEYS[match.kind])}`);
    const include = match.include ?? [];
    if (!Array.isArray(include) || include.some((api) => typeof api !== 'string'))
      fail('include must be an array of API ids');

    if (!isObject(destination) || typeof destination.host !== 'string') {
      fail('needs a destination host');
      continue;
    }
    if (unknownKeys(destination, DESTINATION_KEYS).length)
      fail(`destination has unknown keys ${unknownKeys(destination, DESTINATION_KEYS)}`);
    const target = { host: destination.host, path: destination.path ?? '/' };
    const entry = confServer[target.host]?.[target.path];
    if (!entry) {
      fail(`destination ${target.host}${target.path} is no host path of this deploy`);
      continue;
    }
    if (target.host === host && target.path === path) fail('routes to its own host path');
    if (entry.redirect) fail(`destination ${target.host}${target.path} only redirects`);
    if (entry.singleReplica) fail(`destination ${target.host}${target.path} runs as its own deploy`);

    let paths;
    if (match.kind === 'Exact' || match.kind === 'PathPrefix') {
      const defect = pathDefect(match.path);
      if (defect) fail(defect);
      else paths = [match.path];
    } else {
      const selected = selectorPaths({
        kind: match.kind,
        include: Array.isArray(include) ? include : [],
        confClient,
        confSSR,
        entry,
        path: target.path,
      });
      if (match.kind === 'client-views' && entry.client && !redirect) {
        const source = confServer[host][path].client;
        const tree = publicClientIdFactory(entry.client, confClient[entry.client]);
        if (!(source ? clientPublicTreesFactory({ [source]: confClient[source] ?? {} }) : []).includes(tree))
          fail(
            `the views need the public tree ${tree}: set publicRef or publicCopyNonExistingFiles of the host client`,
          );
      }
      if (selected.defect) fail(selected.defect);
      else {
        const exclude = match.exclude ?? [];
        if (!Array.isArray(exclude)) fail('exclude must be an array of paths');
        else {
          const stale = exclude.filter((excluded) => !selected.paths.includes(excluded));
          if (stale.length) fail(`exclude names paths the selector does not generate: ${stale.join(', ')}`);
          paths = selected.paths.filter((generated) => !exclude.includes(generated));
        }
      }
    }
    if (!paths) continue;
    if (paths.length === 0) fail('resolves to no path');
    if (paths.length > MAX_ROUTE_MATCHES) fail(`resolves to ${paths.length} paths, more than ${MAX_ROUTE_MATCHES}`);

    const type = match.kind === 'Exact' ? 'Exact' : 'PathPrefix';
    const services = servicePaths(entry, target.path).map((value) => ({ type: 'PathPrefix', path: value }));
    const matches = [...new Set(paths)].sort().map((value) => ({
      type,
      path: value,
      service: services.some((service) => capturesPath(service, value)),
    }));
    const outside = matches.filter((m) => path !== '/' && !capturesPath({ type: 'PathPrefix', path }, m.path));
    if (outside.length) fail(`routes paths outside ${path}: ${outside.map((m) => m.path).join(', ')}`);
    const redirectedServices = redirect ? matches.filter((m) => m.service) : [];
    if (redirectedServices.length)
      fail(
        `redirects ${redirectedServices.map((m) => m.path).join(', ')}, under the API or socket path of ` +
          `${target.host}${target.path}: a redirect takes documents only`,
      );
    routes.push({ id: route.id, kind: match.kind, redirect: redirect === true, destination: target, matches });
  }

  const owned = ownedPaths({ confServer, confClient, confSSR, host, path });
  const claimed = new Map();
  for (const route of routes)
    for (const match of route.matches) {
      const captured = owned.filter((ownPath) => capturesPath(match, ownPath));
      if (captured.length)
        defects.push(
          `${where}: route "${route.id}" captures ${captured.join(', ')}, which ${host}${path} serves itself; exclude it`,
        );
      const key = `${match.type} ${match.path}`;
      if (claimed.has(key) && claimed.get(key) !== route.id)
        defects.push(`${where}: routes "${claimed.get(key)}" and "${route.id}" both match ${key}`);
      claimed.set(key, route.id);
    }

  if (defects.length) throw new Error(defects.join('\n'));
  return routes;
};

/** The order Gateway API matches in: an exact match first, then the longest prefix. */
const precedence = (a, b) =>
  (a.match.type === 'Exact' ? 0 : 1) - (b.match.type === 'Exact' ? 0 : 1) ||
  b.match.path.length - a.match.path.length ||
  a.match.path.localeCompare(b.match.path);

/**
 * The route plan of one host path: every match of its routes, with its destination port, in the
 * order a request is matched. The gateway and the runtime both route by it.
 * @param {Object} params - {@link PathRoutes.resolvePathRoutes} parameters, and:
 * @param {Object<string, number>} params.ports - `${host}${path}` → the port its workload listens on.
 * @returns {Array<{route: string, kind: string, match: {type: 'Exact'|'PathPrefix', path: string}, service: boolean,
 *   redirect: boolean, protocol: 'http'|'websocket', destination: {host: string, path: string, port: number}}>}
 * @throws {Error} When a route is invalid, or its destination has no port.
 * @memberof PathRoutes
 */
const pathRoutePlan = ({ ports, ...conf }) =>
  resolvePathRoutes(conf)
    .flatMap(({ id, kind, redirect, destination, matches }) => {
      const port = ports[`${destination.host}${destination.path}`];
      if (!port)
        throw new Error(
          `pathRoutes of ${conf.host}${conf.path}: route "${id}" finds no port of ${destination.host}${destination.path}`,
        );
      return matches.map(({ type, path, service }) => ({
        route: id,
        kind,
        match: { type, path },
        service,
        redirect,
        protocol: kind === 'ws' ? 'websocket' : 'http',
        destination: { ...destination, port },
      }));
    })
    .sort(precedence);

/**
 * The plan entry a request URL matches: the path of the URL, its dot segments resolved and its
 * query left out, compared case by case and element by element.
 * @param {ReturnType<typeof pathRoutePlan>} plan
 * @param {string} url - Request URL, absolute or relative to its host.
 * @returns {ReturnType<typeof pathRoutePlan>[number]|undefined}
 * @memberof PathRoutes
 */
const matchPathRoute = (plan, url) => {
  const { pathname } = new URL(url, 'http://route.invalid');
  return plan.find((entry) => capturesPath(entry.match, pathname));
};

/**
 * One line per route of a plan: its selector, its destination with port, or `308` and the host it
 * redirects to, and its matches.
 * @param {ReturnType<typeof pathRoutePlan>} plan
 * @returns {Object<string, string>} Route id → `<kind> → <host><path>:<port> <matches>`, or
 *   `<kind> → 308 <host> <matches>`.
 * @memberof PathRoutes
 */
const pathRouteSummary = (plan) =>
  Object.fromEntries(
    [...new Set(plan.map((entry) => entry.route))].map((route) => {
      const entries = plan.filter((entry) => entry.route === route);
      const { kind, redirect, destination } = entries[0];
      const matches = entries.map(({ match }) => `${match.type === 'Exact' ? '=' : ''}${match.path}`);
      const target = redirect
        ? `308 ${destination.host}`
        : `${destination.host}${destination.path}:${destination.port}`;
      return [route, `${kind} → ${target} ${matches.join(' ')}`];
    }),
  );

/**
 * The hosts whose path routes forward to a host path. A request through one of them reaches the
 * workload with that host as its public host; a redirect route never does.
 * @param {Object} params
 * @param {Object} params.confServer - Resolved `conf.server.json` of the deploy.
 * @param {Object} [params.confClient] - `conf.client.json` of the deploy.
 * @param {Object} [params.confSSR] - `conf.ssr.json` of the deploy.
 * @param {string} params.host - Destination host.
 * @param {string} [params.path='/'] - Destination host path.
 * @returns {string[]} Source hosts, once each.
 * @memberof PathRoutes
 */
const routingHostsOf = ({ confServer, confClient, confSSR, host, path = '/' }) =>
  Object.keys(confServer).filter((source) =>
    Object.keys(confServer[source]).some((sourcePath) =>
      resolvePathRoutes({ confServer, confClient, confSSR, host: source, path: sourcePath }).some(
        (route) => !route.redirect && route.destination.host === host && route.destination.path === path,
      ),
    ),
  );

export {
  MAX_ROUTE_MATCHES,
  PATH_ROUTE_KINDS,
  capturesPath,
  matchPathRoute,
  pathRoutePlan,
  pathRouteSummary,
  resolvePathRoutes,
  routingHostsOf,
};
