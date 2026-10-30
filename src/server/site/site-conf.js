/**
 * The scope of a site operation: validated identifiers, hostnames and route paths, and the
 * configuration files a deployment carries.
 * @module src/server/site/site-conf.js
 * @namespace SiteConf
 */
import fs from 'fs-extra';
import { domainToASCII } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { buildReplicaId } from '../runtime/conf.js';
import { jsonFileChange } from '../storage/file-change-set.js';

const CONF_ROOT = './engine-private/conf';
const REPLICA_ROOT = './engine-private/replica';

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DEPLOY_ID_PATTERN = /^dd-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPONENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._~-]+$/;

/**
 * A kebab-case identifier: a client, API, WebSocket or submodule id.
 * @param {string} value - Raw identifier.
 * @param {string} label - What the identifier names, for the error.
 * @returns {string} The identifier.
 * @memberof SiteConf
 */
const siteIdFactory = (value, label) => {
  const id = `${value ?? ''}`.trim();
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid ${label} "${value}": use lowercase letters, digits and hyphens`);
  return id;
};

/**
 * A component id: the module name of a client component.
 * @param {string} value - Raw component id.
 * @returns {string} The component id.
 * @memberof SiteConf
 */
const componentIdFactory = (value) => {
  const id = `${value ?? ''}`.trim();
  if (!COMPONENT_ID_PATTERN.test(id)) throw new Error(`Invalid component id "${value}"`);
  return id;
};

/**
 * The configuration folder of a deployment that must already exist.
 * @param {string} value - Raw deploy id.
 * @returns {string} The deploy id.
 * @memberof SiteConf
 */
const siteDeployIdFactory = (value) => {
  const deployId = `${value ?? ''}`.trim();
  if (!DEPLOY_ID_PATTERN.test(deployId)) throw new Error(`Invalid deploy id "${value}": expected dd-<name>`);
  if (!fs.existsSync(deployConfFolder(deployId))) throw new Error(`Deploy configuration not found: ${deployId}`);
  return deployId;
};

/**
 * A hostname in its ASCII form: lowercase, without a trailing dot, internationalized labels in
 * Punycode.
 * @param {string} value - Raw hostname.
 * @returns {string} The hostname.
 * @memberof SiteConf
 */
const siteHostFactory = (value) => {
  const host = domainToASCII(`${value ?? ''}`.trim().toLowerCase().replace(/\.$/, ''));
  if (!host || host.length > 253 || !host.split('.').every((label) => HOST_LABEL_PATTERN.test(label)))
    throw new Error(`Invalid hostname "${value}"`);
  return host;
};

/**
 * A route path in its routing form: one leading slash, no trailing slash, no empty, `.` or `..`
 * segment.
 * @param {string} [value='/'] - Raw path.
 * @returns {string} The path.
 * @memberof SiteConf
 */
const sitePathFactory = (value = '/') => {
  const segments = `${value ?? ''}`.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..' || !PATH_SEGMENT_PATTERN.test(segment)))
    throw new Error(`Invalid route path "${value}"`);
  return `/${segments.join('/')}`;
};

/**
 * Splits a `<host><path>` route reference, such as `www.example.com/app`.
 * @param {string} value - Route reference.
 * @returns {{host: string, path: string}} The validated hostname and path.
 * @memberof SiteConf
 */
const siteRouteFactory = (value) => {
  const raw = `${value ?? ''}`.trim();
  const slash = raw.indexOf('/');
  return {
    host: siteHostFactory(slash === -1 ? raw : raw.slice(0, slash)),
    path: sitePathFactory(slash === -1 ? '/' : raw.slice(slash)),
  };
};

/**
 * @param {string} deployId - Deploy id.
 * @returns {string} The configuration folder of the deployment.
 * @memberof SiteConf
 */
const deployConfFolder = (deployId) => `${CONF_ROOT}/${deployId}`;

/**
 * The server configuration files of a configuration folder: the main file, then its development
 * variants in name order.
 * @param {string} folder - Configuration folder.
 * @returns {string[]} Existing file paths.
 * @memberof SiteConf
 */
const serverConfFiles = (folder) =>
  fs.existsSync(folder)
    ? [
        `${folder}/conf.server.json`,
        ...fs
          .readdirSync(folder)
          .filter((file) => /^conf\.server\.dev\..+\.json$/.test(file))
          .sort()
          .map((file) => `${folder}/${file}`),
      ].filter((file) => fs.existsSync(file))
    : [];

/**
 * The replica folders a deployment has built: one for each single-replica path its server
 * configuration declares.
 * @param {string} deployId - Deploy id.
 * @returns {string[]} Existing replica folders.
 * @memberof SiteConf
 */
const replicaFolders = (deployId) => {
  const confPath = `${deployConfFolder(deployId)}/conf.server.json`;
  if (!fs.existsSync(confPath)) return [];
  const replicas = Object.values(fs.readJsonSync(confPath)).flatMap((routes) =>
    Object.values(routes).flatMap((route) => (route.singleReplica && route.replicas) || []),
  );
  return [...new Set(replicas)]
    .map((replica) => `${REPLICA_ROOT}/${buildReplicaId({ deployId, replica })}`)
    .filter((folder) => fs.existsSync(folder));
};

/**
 * Configuration files read once and edited in memory. Each edited file becomes one change, so an
 * operation that edits a file twice still writes it once.
 * @returns {{read: Function, note: Function, setRoute: Function, changes: Function}} The draft.
 * @memberof SiteConf
 */
const confDraftFactory = () => {
  const files = new Map();
  const draft = {
    /**
     * @param {string} path - JSON file.
     * @param {object} [fallback] - Value of a file that does not exist yet; without it, a missing file throws.
     * @returns {object} The editable value.
     */
    read(path, fallback) {
      if (!files.has(path)) {
        if (!fs.existsSync(path) && fallback === undefined) throw new Error(`Configuration file not found: ${path}`);
        files.set(path, { value: fs.existsSync(path) ? fs.readJsonSync(path) : structuredClone(fallback), notes: [] });
      }
      return files.get(path).value;
    },
    note(path, summary) {
      files.get(path).notes.push(summary);
    },
    /**
     * Writes a route entry. An equal entry is left as it is; a different one is a conflict unless
     * `replace` names it.
     * @param {object} params
     * @param {string} params.file - Server configuration file.
     * @param {string} params.host - Route hostname.
     * @param {string} params.path - Route path.
     * @param {object} params.entry - Route entry.
     * @param {boolean} [params.replace] - Replaces a different entry at this route.
     */
    setRoute({ file, host, path, entry, replace = false }) {
      const conf = draft.read(file, {});
      const existing = conf[host]?.[path];
      if (existing && isDeepStrictEqual(existing, entry)) return;
      if (existing && !replace)
        throw new Error(`Route conflict: ${host}${path} already exists in ${file} (use --replace to replace it)`);
      conf[host] = { ...conf[host], [path]: entry };
      draft.note(file, `${existing ? 'replace' : 'add'} route ${host}${path}`);
    },
    changes() {
      return [...files]
        .filter(([, file]) => file.notes.length > 0)
        .map(([path, file]) => jsonFileChange(path, file.value, file.notes.join('; ')));
    },
  };
  return draft;
};

export {
  componentIdFactory,
  confDraftFactory,
  deployConfFolder,
  replicaFolders,
  serverConfFiles,
  siteDeployIdFactory,
  siteHostFactory,
  siteIdFactory,
  sitePathFactory,
  siteRouteFactory,
};
