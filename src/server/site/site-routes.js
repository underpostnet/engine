/**
 * Host/path routes of a site: route entries derived for a client, route cloning, and the database
 * name variable each client route reads.
 * @module src/server/site/site-routes.js
 * @namespace SiteRoutes
 */
import dotenv from 'dotenv';
import fs from 'fs-extra';
import nodePath from 'node:path';
import { deployEnvFilePath, deployEnvNamesFactory } from '../runtime/conf.js';
import { fileChange } from '../storage/file-change-set.js';
import { deployConfFolder, serverConfFiles } from './site-conf.js';

/**
 * @param {string} clientId - Client id.
 * @returns {string} The environment variable that names the database of the client.
 * @memberof SiteRoutes
 */
const dbNameEnvKey = (clientId) => `DB_NAME_${clientId.replaceAll('-', '_').toUpperCase()}`;

/**
 * A route entry derived from a source entry: it serves `clientId` when the source serves a client,
 * and its database name reads the variable of the client it serves.
 * @param {object} source - Source route entry.
 * @param {string} [clientId] - Client the entry serves instead of the source client.
 * @returns {object} The route entry.
 * @memberof SiteRoutes
 */
const routeEntryFactory = (source, clientId = '') => {
  const entry = structuredClone(source);
  if (clientId && entry.client) entry.client = clientId;
  if (entry.client && entry.db?.name) entry.db.name = `env:${dbNameEnvKey(entry.client)}`;
  return entry;
};

/**
 * The entry of a secondary hostname that redirects to the primary one.
 * @param {object} primary - Route entry of the primary hostname.
 * @param {string} target - Redirect origin, e.g. `https://www.example.com`.
 * @returns {object} The redirect route entry.
 * @memberof SiteRoutes
 */
const redirectEntryFactory = (primary, target) => ({
  client: null,
  runtime: primary.runtime,
  apis: [],
  origins: [],
  proxy: primary.proxy,
  redirect: target,
});

/**
 * The changes that add the database name variable of a route client to every environment file of
 * the deployment that lacks it. Existing values are never changed.
 * @param {string} deployId - Deploy id.
 * @param {object} entry - Route entry.
 * @returns {Array<object>} File changes.
 * @memberof SiteRoutes
 */
const dbNameEnvChanges = (deployId, entry) => {
  if (!entry.client || !entry.db) return [];
  const key = dbNameEnvKey(entry.client);
  return deployEnvNamesFactory(deployId)
    .map((env) => deployEnvFilePath(deployId, env))
    .map((path) => ({ path, content: fs.readFileSync(path, 'utf8') }))
    .filter(({ content }) => !(key in dotenv.parse(content)))
    .map(({ path, content }) => fileChange(path, `${content.trimEnd()}\n${key}=${entry.client}\n`, `add ${key}`));
};

/**
 * Writes a route into the main server configuration and into the development variant of the client
 * it serves.
 * @param {object} params
 * @param {object} params.draft - Configuration draft.
 * @param {string} params.deployId - Target deploy id.
 * @param {string} params.host - Route hostname.
 * @param {string} params.path - Route path.
 * @param {object} params.entry - Route entry.
 * @param {boolean} [params.replace] - Replaces a different entry at this route.
 * @memberof SiteRoutes
 */
const setSiteRoute = ({ draft, deployId, host, path, entry, replace }) => {
  const folder = deployConfFolder(deployId);
  draft.setRoute({ file: `${folder}/conf.server.json`, host, path, entry, replace });
  if (entry.client)
    draft.setRoute({ file: `${folder}/conf.server.dev.${entry.client}.json`, host, path, entry, replace });
};

/**
 * Clones a route into a deployment: from the main server configuration and each development variant
 * of the source that carries it, into the file of the same name of the target. The development
 * variant of the client the route serves gets the main entry when no source variant targets it.
 * @param {object} params
 * @param {object} params.draft - Configuration draft.
 * @param {{deployId: string, host: string, path: string}} params.from - Source route.
 * @param {{deployId: string, host: string, path: string}} params.to - Target route.
 * @param {string} [params.clientId] - Client the cloned route serves instead of the source client.
 * @param {boolean} [params.replace] - Replaces a different entry at the target route.
 * @returns {{entry: object, envChanges: Array<object>}} The cloned main entry and its environment changes.
 * @memberof SiteRoutes
 */
const cloneRoutePlan = ({ draft, from, to, clientId = '', replace = false }) => {
  const sources = serverConfFiles(deployConfFolder(from.deployId)).filter(
    (file) => draft.read(file)[from.host]?.[from.path],
  );
  if (!sources[0]?.endsWith('/conf.server.json'))
    throw new Error(`Route not found: ${from.host}${from.path} in ${from.deployId}/conf.server.json`);
  const targets = sources.map((file) => `${deployConfFolder(to.deployId)}/${nodePath.basename(file)}`);
  sources.forEach((file, index) =>
    draft.setRoute({
      file: targets[index],
      host: to.host,
      path: to.path,
      entry: routeEntryFactory(draft.read(file)[from.host][from.path], clientId),
      replace,
    }),
  );
  const entry = routeEntryFactory(draft.read(sources[0])[from.host][from.path], clientId);
  const clientFile = `${deployConfFolder(to.deployId)}/conf.server.dev.${entry.client}.json`;
  if (entry.client && !targets.includes(clientFile))
    draft.setRoute({ file: clientFile, host: to.host, path: to.path, entry, replace });
  return { entry, envChanges: dbNameEnvChanges(to.deployId, entry) };
};

export { cloneRoutePlan, dbNameEnvChanges, dbNameEnvKey, redirectEntryFactory, routeEntryFactory, setSiteRoute };
