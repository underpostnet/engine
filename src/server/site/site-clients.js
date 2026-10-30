/**
 * Client cloning: the configuration entries and the source tree of a client, copied under a new
 * client id.
 *
 * A client name appears in two forms. The capitalized form (`Default`) is renamed only as a segment
 * of a PascalCase identifier, so `AppShellDefault` becomes `AppShellShop` while `offlineDefault` and
 * `defaultUrl` stay. The id form (`default`) is renamed only as a path segment or a whole string
 * literal, so `export default` stays. API ids under `services` and the `metadata` of a client never
 * change. Binary assets are copied byte for byte.
 * @module src/server/site/site-clients.js
 * @namespace SiteClients
 */
import fs from 'fs-extra';
import nodePath from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { getCapVariableName } from '../../client/components/core/CommonJs.js';
import { fileChange } from '../storage/file-change-set.js';
import { deployConfFolder, serverConfFiles } from './site-conf.js';
import { dbNameEnvChanges, routeEntryFactory } from './site-routes.js';

const CLIENT_ROOT = './src/client';
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.md',
  '.txt',
  '.svg',
  '.xml',
  '.yml',
]);
const UNRENAMED_KEYS = new Set(['services', 'metadata']);
const PASCAL_IDENTIFIER = /(?<![\w$])[A-Z][\w$]*/g;
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/**
 * The renaming rules from one client id to another.
 * @param {string} fromId - Source client id.
 * @param {string} toId - Target client id.
 * @returns {object} The rules.
 * @memberof SiteClients
 */
const clientRenameFactory = (fromId, toId) => {
  const fromCap = getCapVariableName(fromId);
  const toCap = getCapVariableName(toId);
  if (fromId === toId || fromCap === toCap) throw new Error(`Client ids "${fromId}" and "${toId}" are not distinct`);
  const capSegment = new RegExp(`${fromCap}(?![a-z])`, 'g');
  const idReference = new RegExp(
    `(?<=[/'"\`])${escapeRegExp(fromId)}(?=[/'"\`])|(?<=/)${escapeRegExp(fromId)}(?=\\.)`,
    'g',
  );
  const pascal = (identifier) => identifier.replace(capSegment, toCap);
  const token = (value) => (value === fromId ? toId : /^[A-Z]/.test(value) ? pascal(value) : value);
  const json = (value) => {
    if (Array.isArray(value)) return value.map(json);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          token(key),
          UNRENAMED_KEYS.has(key) ? structuredClone(item) : json(item),
        ]),
      );
    return typeof value === 'string' ? token(value) : value;
  };
  return {
    fromId,
    toId,
    fromCap,
    toCap,
    /** Renames a configuration value. */
    json,
    /** Renames one SSR component name. */
    token,
    /** Renames source text. */
    text: (source) => source.replace(PASCAL_IDENTIFIER, pascal).replace(idReference, toId),
    /** Renames each segment of a relative path. */
    path: (relative) =>
      relative
        .split('/')
        .map((segment) =>
          segment === fromId
            ? toId
            : segment.startsWith(`${fromId}.`)
              ? `${toId}${segment.slice(fromId.length)}`
              : token(segment),
        )
        .join('/'),
  };
};

const filesOf = (directory) =>
  fs.existsSync(directory)
    ? fs
        .readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) =>
          nodePath.relative(directory, nodePath.join(entry.parentPath, entry.name)).split(nodePath.sep).join('/'),
        )
        .sort()
    : [];

const sourceChange = (from, to, rename, summary) => {
  const content = fs.readFileSync(from);
  return TEXT_EXTENSIONS.has(nodePath.extname(from))
    ? fileChange(to, rename.text(content.toString('utf8')), summary)
    : fileChange(to, content, summary);
};

const ssrReferences = (entry = {}) => [
  ...(entry.head ?? []).map((name) => ['head', name]),
  ...(entry.body ?? []).map((name) => ['body', name]),
  ...Object.values(entry.mailer ?? {}).map((name) => ['mailer', name]),
  ...(entry.views ?? []).flatMap((view) => [
    ...(view.head ?? []).map((name) => ['head', name]),
    ...(view.body ?? []).map((name) => ['body', name]),
  ]),
];

const ssrPath = ([kind, name]) => nodePath.normalize(`${CLIENT_ROOT}/ssr/${kind}/${name}.js`);

/**
 * Plans a client clone: its `conf.client.json` and `conf.ssr.json` entries in the target deployment,
 * and its components, services, SSR components, index module and public assets under the new id.
 * A target that already holds different content is a conflict. Every SSR component and relative
 * import of the clone must resolve.
 * @param {object} params
 * @param {object} params.draft - Configuration draft.
 * @param {{clientId: string, client: object, ssr: (object|undefined)}} params.from - Source client and its entries.
 * @param {{clientId: string, deployId: string}} params.to - Target client and deployment.
 * @returns {Array<object>} The source file changes; the configuration edits stay in the draft.
 * @memberof SiteClients
 */
const cloneClientPlan = ({ draft, from, to }) => {
  const rename = clientRenameFactory(from.clientId, to.clientId);
  const folder = deployConfFolder(to.deployId);

  const setEntry = (file, key, value) => {
    const conf = draft.read(file);
    if (conf[key] && isDeepStrictEqual(conf[key], value)) return;
    if (conf[key]) throw new Error(`Client conflict: "${key}" already exists in ${file}`);
    conf[key] = value;
    draft.note(file, `add ${key}`);
  };
  setEntry(`${folder}/conf.client.json`, to.clientId, rename.json(from.client));
  const ssr = from.ssr ? rename.json(from.ssr) : undefined;
  if (ssr) setEntry(`${folder}/conf.ssr.json`, rename.toCap, ssr);

  const changes = [];
  for (const tree of ['components', 'services', 'public']) {
    const source = `${CLIENT_ROOT}/${tree}/${from.clientId}`;
    for (const relative of filesOf(source)) {
      const target = `${CLIENT_ROOT}/${tree}/${to.clientId}/${tree === 'public' ? relative : rename.path(relative)}`;
      changes.push(
        tree === 'public'
          ? fileChange(target, fs.readFileSync(`${source}/${relative}`), 'copy public asset')
          : sourceChange(`${source}/${relative}`, target, rename, `clone ${tree}`),
      );
    }
  }
  const index = `${CLIENT_ROOT}/${rename.fromCap}.index.js`;
  if (fs.existsSync(index))
    changes.push(sourceChange(index, `${CLIENT_ROOT}/${rename.toCap}.index.js`, rename, 'clone index module'));
  for (const reference of ssrReferences(from.ssr)) {
    const renamed = rename.token(reference[1]);
    if (renamed !== reference[1] && fs.existsSync(ssrPath(reference)))
      changes.push(sourceChange(ssrPath(reference), ssrPath([reference[0], renamed]), rename, 'clone SSR component'));
  }

  const staged = new Set(changes.map(({ path }) => path));
  const resolves = (path) => staged.has(path) || fs.existsSync(path);
  const unresolved = ssrReferences(ssr)
    .map(ssrPath)
    .filter((path) => !resolves(path));
  for (const { path, content } of changes.filter((change) => change.path.endsWith('.js')))
    for (const [, , specifier] of `${content}`.matchAll(RELATIVE_IMPORT)) {
      const target = nodePath.normalize(nodePath.join(nodePath.dirname(path), specifier));
      if (!resolves(target)) unresolved.push(`${target} (imported by ${path})`);
    }
  if (unresolved.length) throw new Error(`Unresolved client references:\n  ${[...new Set(unresolved)].join('\n  ')}`);

  const conflicts = changes.filter(
    ({ path, content }) => fs.existsSync(path) && !fs.readFileSync(path).equals(Buffer.from(content)),
  );
  if (conflicts.length)
    throw new Error(
      `Client conflict: these files already exist with other content:\n  ${conflicts.map(({ path }) => path).join('\n  ')}`,
    );
  return changes;
};

/**
 * Plans the routes of a clone inside its deployment: every route that serves the source client gets
 * a sibling route that serves the clone, at the path with the source id segment renamed, or one
 * segment deeper when the path has none.
 * @param {object} params
 * @param {object} params.draft - Configuration draft.
 * @param {string} params.deployId - Deploy id.
 * @param {string} params.fromClientId - Source client id.
 * @param {string} params.toClientId - Clone client id.
 * @param {boolean} [params.replace] - Replaces a different entry at a clone route.
 * @returns {Array<object>} The environment changes of the clone routes.
 * @memberof SiteClients
 */
const clientRoutesPlan = ({ draft, deployId, fromClientId, toClientId, replace = false }) => {
  let entry;
  for (const file of serverConfFiles(deployConfFolder(deployId)))
    for (const [host, routes] of Object.entries(draft.read(file)))
      for (const [path, route] of Object.entries(routes)) {
        if (route.client !== fromClientId) continue;
        const segments = path.split('/').filter(Boolean);
        const renamed = segments.map((segment) => (segment === fromClientId ? toClientId : segment));
        const clonePath = `/${(isDeepStrictEqual(renamed, segments) ? [...segments, toClientId] : renamed).join('/')}`;
        entry = routeEntryFactory(route, toClientId);
        draft.setRoute({ file, host, path: clonePath, entry, replace });
      }
  return entry ? dbNameEnvChanges(deployId, entry) : [];
};

export { clientRenameFactory, clientRoutesPlan, cloneClientPlan };
