/**
 * UnderpostDbCollection CLI module
 * @module src/cli/db-collection.js
 * @namespace UnderpostDbCollection
 * @description `underpost db collection`: inspect, clone, move and rename one application
 * collection. This module resolves each target from the deployment configuration and hands the
 * operation to the provider of its database (`src/db/data-operations.js`). A plan is the default;
 * `--apply` writes.
 */

import fs from 'fs-extra';
import { loadConfServerJson } from '../server/runtime/conf.js';
import { loadCronDeployEnv } from '../server/ops/cron.js';
import { loggerFactory } from '../server/ops/logger.js';
import { isOciRuntime } from '../server/runtime/environment.js';
import { MONGODB_DATABASE_NAME, MongooseDB } from '../db/mongo/mongoose-db.js';
import { dataOperationsProvider } from '../db/data-operations.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @typedef {Object} CollectionSelector
 * @property {string} [deployId]
 * @property {string} [host]
 * @property {string} [path]
 * @property {string} [database] - Explicit database override.
 * @property {string} [backupId] - A backup to read instead of the live database.
 * @memberof UnderpostDbCollection
 */

/**
 * Resolves a selector against a server configuration: the declared host, its one path with a
 * database or the named path, and the database configuration. Never picks among several.
 * @param {Object} confServer - `conf.server.json`, secrets resolved.
 * @param {CollectionSelector} selector
 * @param {string} [flag=''] - The option prefix of the selector, such as `--source-`, for errors.
 * @returns {import('../db/data-operations.js').DataOperationTarget & {apis:string[]}}
 * @throws {Error} On an undeclared host or path, an ambiguous path, or an invalid override.
 * @memberof UnderpostDbCollection
 */
export const collectionTargetOf = (confServer, { deployId, host, path, database = '', backupId = '' }, flag = '--') => {
  if (!host) throw new Error(`Give the host with ${flag}host`);
  const paths = confServer[host];
  if (!paths)
    throw new Error(
      `Host ${host} is not declared in ${deployId}: declared hosts are ${Object.keys(confServer).join(', ')}`,
    );
  const withDatabase = Object.keys(paths).filter((candidate) => paths[candidate]?.db?.provider);
  if (path && !paths[path])
    throw new Error(`Path ${path} is not declared for ${host}: declared paths are ${Object.keys(paths).join(', ')}`);
  if (path && !withDatabase.includes(path)) throw new Error(`${host}${path} declares no database`);
  if (!path && withDatabase.length !== 1)
    throw new Error(
      withDatabase.length
        ? `${host} declares a database on several paths (${withDatabase.join(', ')}): give one with ${flag}path`
        : `${host} declares no database`,
    );
  const resolvedPath = path || withDatabase[0];
  if (database && !MONGODB_DATABASE_NAME.test(database))
    throw new Error(`${flag}database ${database} is not a database name`);
  const { db, apis = [] } = paths[resolvedPath];
  return { deployId, host, path: resolvedPath, db, apis, database, backupId };
};

/**
 * Resolves a selector of a deployment ({@link collectionTargetOf}).
 * @param {CollectionSelector} selector
 * @param {string} [flag='--']
 * @returns {ReturnType<typeof collectionTargetOf>}
 * @throws {Error} When the deployment has no server configuration.
 * @memberof UnderpostDbCollection
 */
const resolveTarget = (selector, flag = '--') => {
  if (!selector.deployId) throw new Error(`Give the deployment with ${flag}deploy-id`);
  const confPath = `./engine-private/conf/${selector.deployId}/conf.server.json`;
  if (!fs.existsSync(confPath)) throw new Error(`Configuration file not found: ${confPath}`);
  return collectionTargetOf(loadConfServerJson(confPath, { resolve: true }), selector, flag);
};

/**
 * The API whose model owns a collection, named by the API or by its collection.
 * @param {string} name
 * @returns {Promise<{owner:string, collection:string}>} `owner` is `''` for a collection no model owns.
 * @memberof UnderpostDbCollection
 */
export const collectionOwnerOf = async (name) => {
  const apis = MongooseDB.apis();
  if (apis.includes(name)) return { owner: name, collection: await MongooseDB.collectionName(name) };
  for (const api of apis) if ((await MongooseDB.collectionName(api)) === name) return { owner: api, collection: name };
  return { owner: '', collection: name };
};

/** The selector of one side from the parsed options: `source`, `target`, or the plain flags. */
const selectorOf = (options, side = '') => {
  const key = (name) => (side ? `${side}${name[0].toUpperCase()}${name.slice(1)}` : name);
  return {
    deployId: options[key('deployId')],
    host: options[key('host')],
    path: options[key('path')],
    database: options[key('database')],
    backupId: options[key('backupId')],
  };
};

const list = (value) =>
  `${value ?? ''}`
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/** Prints a report or a plan: rows are data, so they go to stdout. */
const print = (title, value) => console.log(`${title}\n${JSON.stringify(value, null, 2)}`);

/** A target as a plan names it, without credentials. */
const describeTarget = ({ deployId, host, path, db, database, backupId }) => ({
  deployId,
  host,
  path,
  provider: db.provider,
  database: database || db.name,
  ...(backupId ? { backupId } : {}),
});

/**
 * @class UnderpostDbCollection
 * @description Collection operations of `underpost db collection`.
 * @memberof UnderpostDbCollection
 */
class UnderpostDbCollection {
  static API = {
    /**
     * Runs one collection operation from the parsed options of its command.
     * @method run
     * @memberof UnderpostDbCollection
     * @param {import('../db/data-operations.js').CollectionOperation} operation
     * @param {string} name - The collection, or the API that owns it.
     * @param {Object} options - The command options, with the `db` command options.
     * @return {Promise<Object>} The report or `{plan, result}`.
     */
    async run(operation, name, options = {}) {
      if (options.dev) process.env.NODE_ENV = 'development';
      loadCronDeployEnv();
      const transfer = operation === 'clone' || operation === 'move';
      const source = resolveTarget(selectorOf(options, transfer ? 'source' : ''), transfer ? '--source-' : '--');
      const targetSelector = selectorOf(options, 'target');
      const target =
        transfer || targetSelector.host
          ? resolveTarget({ ...targetSelector, deployId: targetSelector.deployId || source.deployId }, '--target-')
          : null;
      const provider = dataOperationsProvider(source.db.provider, operation);
      if (target && target.db.provider !== source.db.provider)
        throw new Error(`The source is a ${source.db.provider} database and the target a ${target.db.provider} one`);
      const { owner, collection } = await collectionOwnerOf(name);
      const layout = await provider.layoutOf({ collection, owner, aggregates: list(options.aggregate) });
      logger.info(`Collection ${operation}`, {
        collection,
        owner: owner || 'none',
        source: describeTarget(source),
        ...(target ? { target: describeTarget(target) } : {}),
      });

      // A command on this host reaches MongoDB through a forward: the sandbox's with --dev, the primary's otherwise.
      const forward =
        options.dev || isOciRuntime()
          ? null
          : await Underpost.db.forwardPrimary({
              namespace: Underpost.namespace.of('mongodb', { options: { ...options, deployId: source.deployId } }),
              user: source.db.user,
              password: source.db.password,
            });
      const reach = (db) =>
        options.dev
          ? Underpost.sandbox.database(db)
          : forward
            ? { ...db, host: forward.host, directConnection: true }
            : db;
      const endpoints = [];
      const open = async (resolved) => {
        const endpoint = await provider.openEndpoint({ ...resolved, db: reach(resolved.db) });
        endpoints.push(endpoint);
        return endpoint;
      };
      try {
        const targetEndpoint = target ? await open(target) : null;
        const sourceEndpoint = source.backupId
          ? await UnderpostDbCollection.API.stageBackup({ provider, source, server: targetEndpoint, layout, endpoints })
          : await open(source);
        const batchSize = Number.isInteger(options.batchSize) ? options.batchSize : undefined;
        const log = (message, detail) => print(message, detail);
        if (operation === 'inspect') {
          const report = await provider.inspectCollection({
            source: sourceEndpoint,
            target: targetEndpoint,
            layout,
            batchSize,
          });
          print('Collection report', report);
          return report;
        }
        if (operation === 'rename') {
          const outcome = await provider.renameCollection({
            source: sourceEndpoint,
            layout,
            to: options.to,
            apply: !!options.apply,
            log,
          });
          if (!options.apply) print('Plan (add --apply to rename)', outcome.plan);
          else print('Renamed', outcome.result);
          return outcome;
        }
        if (options.disableFileSync)
          logger.warn('File synchronization is off (--disable-file-sync): the target must hold each referenced File');
        const outcome = await provider[`${operation}Collection`]({
          source: sourceEndpoint,
          target: targetEndpoint,
          layout,
          fileSync: !options.disableFileSync,
          allowMissingFiles: !!options.allowMissingFiles,
          batchSize,
          apply: !!options.apply,
          confirmSourceDelete: !!options.confirmSourceDelete,
          log,
        });
        if (!options.apply) print(`Plan (add --apply to ${operation})`, outcome.plan);
        else if (outcome.result.status === 'verified')
          print(
            'Verified; the source is unchanged. Stop writes to the source, then rerun with --confirm-source-delete',
            outcome.result,
          );
        else print(`Completed ${operation}`, outcome.result);
        return outcome;
      } catch (error) {
        if (error.operationId)
          logger.error(`Operation ${error.operationId} stopped: rerun the same command to resume it`, {
            error: error.message,
          });
        throw error;
      } finally {
        for (const endpoint of endpoints.reverse())
          await endpoint
            .close()
            .catch((error) => logger.error('Incomplete cleanup', { endpoint: endpoint.label, error: error.message }));
        forward?.close();
      }
    },

    /**
     * Reads a backup of the source into staging databases of the target server, as a source that
     * changes neither the backup nor the live source.
     * @method stageBackup
     * @memberof UnderpostDbCollection
     * @param {Object} params
     * @param {import('../db/data-operations.js').DataOperationsProvider} params.provider
     * @param {ReturnType<typeof collectionTargetOf>} params.source
     * @param {Object} params.server - The target endpoint.
     * @param {Object} params.layout
     * @param {Object[]} params.endpoints - Endpoints the caller closes; the staging joins them.
     * @return {Promise<Object>} The staged endpoint.
     */
    async stageBackup({ provider, source, server, layout, endpoints }) {
      const of = provider.databaseLayout(source);
      const needs = [
        { database: of.databaseOf(layout.owner), collection: layout.collection },
        { database: of.databaseOf('file'), collection: layout.files },
        ...layout.aggregates.map(({ api, collection }) => ({ database: of.databaseOf(api), collection })),
      ];
      const { manifest, archives } = await Underpost.db.backupArchives({
        deployId: source.deployId,
        backupId: source.backupId,
        needs,
      });
      const staged = await provider.stageArchives({
        server,
        of,
        label: `backup ${manifest.backupId} of ${source.deployId} ${source.host}${source.path}`,
        archives,
        collections: [...new Set(needs.map(({ collection }) => collection))],
      });
      endpoints.push(staged);
      logger.info('Backup staged', { backupId: manifest.backupId, staged: staged.staged });
      return staged;
    },
  };
}

export default UnderpostDbCollection;
