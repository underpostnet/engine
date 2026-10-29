/**
 * UnderpostDB CLI module
 * @module src/cli/db.js
 * @namespace UnderpostDB
 * @description Manages database operations, backups, and cluster metadata for Kubernetes deployments.
 * Supports MariaDB and MongoDB. A backup goes to the object store through the backup engine
 * (`src/server/storage/backup.js`); no Git operation takes part. A MongoDB dump runs in a dedicated
 * client pod, never in the `mongod` container, and streams to the store without touching a disk.
 */

import zlib from 'node:zlib';
import nodePath from 'node:path';
import { pipeline } from 'node:stream/promises';
import { loadConfInstances, loadConfServerJson, loadReplicas } from '../server/runtime/conf.js';
import { DEPLOY_ROUTES_PATH, pathPortAssignmentFactory, readDeployRoutes } from '../server/network/router.js';
import { loggerFactory } from '../server/ops/logger.js';
import { shellArgumentFactory, shellExec } from '../server/runtime/process.js';
import fs from 'fs-extra';
import { DataBaseProviderService } from '../db/DataBaseProvider.js';
import { loadCronDeployEnv } from '../server/ops/cron.js';
import { MongoBootstrap } from '../db/mongo/MongoBootstrap.js';
import {
  MONGODB_DEFAULT_AUTH_SOURCE,
  MONGODB_DEFAULT_PORT,
  MONGODB_DEFAULT_REPLICA_SET,
  MONGODB_SERVICE_NAME,
  MONGODB_STATEFULSET_NAME,
  resolveMongoReplicaHosts,
} from '../db/mongo/MongooseDB.js';
import {
  BACKUP_RETENTION,
  backupKeyMaterial,
  backupStreamReadable,
  latestBackup,
  listBackups,
  publishBackupMetrics,
  pruneBackups,
  readBackupManifest,
  recordVerification,
  verifyBackup,
  writeBackup,
} from '../server/storage/backup.js';
import { objectStore } from '../server/storage/object-store.js';
import { inspectMongoArchive, mongoArchiveTap } from '../server/storage/mongo-archive.js';
import Underpost from '../index.js';
import { timer } from '../client/components/core/CommonJs.js';
const logger = loggerFactory(import.meta);

/** The backup profile of `db --export`: disaster recovery. */
export const DR_BACKUP_PROFILE = 'dr';

/** Resource limits of the client pod that runs the dump and restore tools. */
const CLIENT_LIMITS = Object.freeze({
  cpu: process.env.UNDERPOST_DB_CLIENT_CPU || '1',
  memory: process.env.UNDERPOST_DB_CLIENT_MEMORY || '1Gi',
});

/** Resource limits of the restore drill pod, which also runs a scratch `mongod`. */
const DRILL_LIMITS = Object.freeze({
  cpu: process.env.UNDERPOST_DB_DRILL_CPU || '1',
  memory: process.env.UNDERPOST_DB_DRILL_MEMORY || '1536Mi',
});

/** The port of the scratch `mongod` of a restore drill, inside its pod. */
const DRILL_PORT = 27018;

/**
 * What a `db --export` dump of a replica set guarantees: each collection is read at its own time.
 * There is no cross-collection point in time without `--oplog`, which dumps a whole instance.
 * @memberof UnderpostDB
 */
export const DR_CONSISTENCY = Object.freeze({
  pointInTime: false,
  scope: 'collection',
  description: 'Each collection is read at its own time from one replica set member; no cross-collection point in time',
});

/**
 * The auth flags of a tool in the client pod: the credentials are variables of its Secret, so no
 * command line holds them.
 * @param {number|null} principal - Index of the principal in the Secret; null without credentials.
 * @returns {string}
 * @memberof UnderpostDB
 */
const clientAuthFlags = (principal) =>
  principal === null
    ? ''
    : ` --username "$MONGO_USER_${principal}" --password "$MONGO_PASSWORD_${principal}" --authenticationDatabase ${MONGODB_DEFAULT_AUTH_SOURCE}`;

/**
 * The members of the MongoDB replica set, by the names of its StatefulSet pods.
 * @param {Array<{NAME:string}>} pods
 * @returns {string[]} `host:port` of each member.
 * @memberof UnderpostDB
 */
export const mongoReplicaHostsFactory = (pods) => {
  const members = pods
    .map(({ NAME }) => NAME)
    .filter((name) => new RegExp(`^${MONGODB_STATEFULSET_NAME}-\\d+$`).test(name ?? ''))
    .sort();
  return members.length
    ? members.map((name) => `${name}.${MONGODB_SERVICE_NAME}:${MONGODB_DEFAULT_PORT}`)
    : resolveMongoReplicaHosts({});
};

/**
 * The `mongodump` command of one database, or one collection, as a gzip archive on stdout.
 * @param {Object} params
 * @param {string[]} params.hosts - Replica set members.
 * @param {number|null} params.principal - {@link clientAuthFlags}.
 * @param {string} params.database
 * @param {string} [params.collection]
 * @param {string} [params.readPreference='secondaryPreferred']
 * @returns {string}
 * @memberof UnderpostDB
 */
export const mongoDumpCommandFactory = ({
  hosts,
  principal,
  database,
  collection = '',
  readPreference = 'secondaryPreferred',
}) =>
  `mongodump --host ${shellArgumentFactory(`${MONGODB_DEFAULT_REPLICA_SET}/${hosts.join(',')}`)} ` +
  `--readPreference=${readPreference}${clientAuthFlags(principal)} --db=${shellArgumentFactory(database)}` +
  `${collection ? ` --collection=${shellArgumentFactory(collection)}` : ''} --archive --gzip --numParallelCollections=1`;

/**
 * The `mongorestore` command that reads a gzip archive on stdin.
 * @param {Object} params
 * @param {string[]} [params.hosts] - Replica set members; the drill's scratch `mongod` without them.
 * @param {number|null} [params.principal=null]
 * @param {string[]} params.namespaces - `--nsInclude` patterns.
 * @param {boolean} [params.drop=false]
 * @param {boolean} [params.preserveUUID=false]
 * @returns {string}
 * @memberof UnderpostDB
 */
export const mongoRestoreCommandFactory = ({
  hosts,
  principal = null,
  namespaces,
  drop = false,
  preserveUUID = false,
}) =>
  `mongorestore --host ${shellArgumentFactory(
    hosts ? `${MONGODB_DEFAULT_REPLICA_SET}/${hosts.join(',')}` : `127.0.0.1:${DRILL_PORT}`,
  )}${clientAuthFlags(principal)} --archive --gzip ${namespaces
    .map((namespace) => `--nsInclude=${shellArgumentFactory(namespace)}`)
    .join(' ')} --numParallelCollections=1 --numInsertionWorkersPerCollection=1 --stopOnError` +
  `${drop ? ' --drop' : ''}${preserveUUID ? ' --preserveUUID' : ''}`;

/**
 * A `mongosh` command that prints what `script` prints.
 * @param {Object} params
 * @param {string[]} [params.hosts] - Replica set members; the drill's scratch `mongod` without them.
 * @param {number|null} [params.principal=null]
 * @param {string} params.script
 * @returns {string}
 * @memberof UnderpostDB
 */
export const mongoShellCommandFactory = ({ hosts, principal = null, script }) =>
  `mongosh ${shellArgumentFactory(
    hosts
      ? `mongodb://${hosts.join(',')}/?replicaSet=${MONGODB_DEFAULT_REPLICA_SET}`
      : `mongodb://127.0.0.1:${DRILL_PORT}/?directConnection=true`,
  )}${clientAuthFlags(principal)} --quiet --eval ${shellArgumentFactory(script)}`;

/**
 * The command that starts the scratch `mongod` of a restore drill. Its TTL monitor is off: a drill
 * counts what the archive holds, and an expired document of a TTL collection is still restored.
 * @returns {string}
 * @memberof UnderpostDB
 */
export const drillMongodCommandFactory = () =>
  `mkdir -p /scratch/db && mongod --dbpath /scratch/db --port ${DRILL_PORT} --bind_ip 127.0.0.1 ` +
  '--wiredTigerCacheSizeGB 0.25 --setParameter ttlMonitorEnabled=false --fork --logpath /scratch/mongod.log';

/**
 * The name of a backup stream: kind and identity, in the characters an object key takes.
 * @param {string} kind
 * @param {...string} parts
 * @returns {string}
 * @memberof UnderpostDB
 */
export const backupStreamName = (kind, ...parts) =>
  `${kind}-${parts.filter(Boolean).join('--')}`.replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * A backup source over a command's stdout. `done()` resolves when the command exited cleanly, so
 * a dump that fails half way never becomes an available backup.
 * @param {ReturnType<typeof Underpost.kubectl.execStream>} child
 * @param {{gzip?:boolean}} [options] - Compress on this host, outside the database pod.
 * @returns {AsyncIterable<Buffer> & {done:() => Promise<void>, destroy:() => void}}
 * @memberof UnderpostDB
 */
const commandSource = (child, { gzip = false } = {}) => {
  child.stdin.end();
  const output = gzip ? child.stdout.pipe(zlib.createGzip()) : child.stdout;
  return {
    [Symbol.asyncIterator]: () => output[Symbol.asyncIterator](),
    done: async () => {
      await child.exited;
    },
    destroy: () => child.child.kill('SIGTERM'),
  };
};

/**
 * Pipes a plaintext stream into a command's stdin and waits for the command.
 * @param {AsyncIterable<Buffer>|import('node:stream').Readable} source
 * @param {ReturnType<typeof Underpost.kubectl.execStream>} child
 * @param {{gunzip?:boolean}} [options] - Decompress on this host first.
 * @returns {Promise<void>}
 * @memberof UnderpostDB
 */
const feedCommand = async (source, child, { gunzip = false } = {}) => {
  try {
    await pipeline(source, ...(gunzip ? [zlib.createGunzip()] : []), child.stdin);
  } catch (error) {
    child.child.kill('SIGTERM');
    await child.exited.catch(() => {});
    throw error;
  }
  await child.exited;
};

/**
 * Compares the inventory a restore or a read found with the one the manifest records.
 * @param {{namespaces:Object<string,{documents:number,indexes:number}>}} expected
 * @param {{namespaces:Object<string,{documents:number,indexes:number}>}} found
 * @returns {string[]} The defects; none when they match.
 * @memberof UnderpostDB
 */
export const inventoryDefects = (expected, found) => {
  const defects = [];
  for (const [namespace, entry] of Object.entries(expected?.namespaces ?? {})) {
    const actual = found?.namespaces?.[namespace];
    if (!actual) defects.push(`${namespace}: missing`);
    else if (actual.documents !== entry.documents)
      defects.push(`${namespace}: ${actual.documents} document(s), ${entry.documents} recorded`);
    else if (actual.indexes !== entry.indexes)
      defects.push(`${namespace}: ${actual.indexes} index(es), ${entry.indexes} recorded`);
  }
  for (const namespace of Object.keys(found?.namespaces ?? {}))
    if (!expected?.namespaces?.[namespace]) defects.push(`${namespace}: not recorded`);
  return defects;
};

/** The script a restore drill runs in its scratch `mongod`: per namespace, documents, indexes and validity. */
const DRILL_INVENTORY_SCRIPT = `
const namespaces = {};
for (const { name } of db.adminCommand({ listDatabases: 1, nameOnly: true }).databases) {
  if (['admin', 'local', 'config'].includes(name)) continue;
  const target = db.getSiblingDB(name);
  for (const info of target.getCollectionInfos({ type: 'collection' })) {
    const collection = target.getCollection(info.name);
    namespaces[name + '.' + info.name] = {
      documents: collection.countDocuments({}),
      indexes: collection.getIndexes().length,
      valid: target.runCommand({ validate: info.name, full: false }).valid === true,
    };
  }
}
print(JSON.stringify({ namespaces }));
`;

/**
 * @typedef {Object} DatabaseOptions
 * @memberof UnderpostDB
 * @property {boolean} [import=false] - Restore the selected backup.
 * @property {boolean} [export=false] - Back up every database of the deployment.
 * @property {string} [backup=''] - Backup id for `import` and `verify`; the newest available without it.
 * @property {boolean} [list=false] - List the backups.
 * @property {boolean} [verify=false] - Deep-verify a backup.
 * @property {boolean} [restoreTest=false] - With `verify`, restore into an isolated `mongod`.
 * @property {boolean} [prune=false] - Remove the backups retention no longer keeps.
 * @property {number} [keep] - Available backups a prune keeps.
 * @property {boolean} [dryRun=false] - With `prune`, report only.
 * @property {boolean} [trees=false] - With `import`, also restore the site file trees.
 * @property {string} [podName=''] - Comma-separated list of pod names or patterns.
 * @property {string} [ns='default'] - Kubernetes namespace.
 * @property {string} [collections=''] - Comma-separated list of collections to include.
 * @property {string} [outPath=''] - Local directory of plain archives instead of the object store.
 * @property {boolean} [drop=false] - Drop each collection before restoring it.
 * @property {boolean} [preserveUUID=false] - Preserve collection UUIDs on restore.
 * @property {string} [hosts=''] - Comma-separated list of hosts to include.
 * @property {string} [paths=''] - Comma-separated list of paths to include.
 * @property {boolean} [allPods=false] - Show statistics of every matching pod.
 * @property {boolean} [primaryPod=false] - Read dumps from the MongoDB primary.
 * @property {boolean} [stats=false] - Display collection/table statistics.
 */

/**
 * @typedef {Object} PodInfo
 * @memberof UnderpostDB
 * @property {string} NAME - Pod name
 * @property {string} NAMESPACE - Pod namespace
 * @property {string} NODE - Node where pod is running
 * @property {string} STATUS - Pod status
 * @property {string} [IP] - Pod IP address
 */

/**
 * @typedef {Object} DatabasePlanEntry
 * @memberof UnderpostDB
 * @property {string} provider - Database provider (mariadb, mongoose)
 * @property {string} name - Database name
 * @property {string} user - Database user
 * @property {string} password - Database password
 * @property {string} host - Host identifier
 * @property {string} path - Path identifier
 * @property {string[]} partitions - Partition database names the host declares
 */

/**
 * UnderpostDB class for managing database operations and backups.
 * @class UnderpostDB
 * @memberof UnderpostDB
 */
class UnderpostDB {
  /**
   * Static API object containing all database operation methods.
   * @static
   * @memberof UnderpostDB
   */
  static API = {
    /**
     * The databases of a deployment, one entry per provider and name, filtered by host and path.
     * @method databasePlan
     * @memberof UnderpostDB
     * @param {string} deployId
     * @param {{hosts?:string, paths?:string}} [filters]
     * @return {DatabasePlanEntry[]}
     * @throws {Error} When the deployment has no server configuration.
     */
    databasePlan(deployId, { hosts = '', paths = '' } = {}) {
      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      if (!fs.existsSync(confServerPath)) throw new Error(`Configuration file not found: ${confServerPath}`);
      const confServer = loadConfServerJson(confServerPath, { resolve: true });
      const hostFilter = `${hosts || ''}`
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
      const pathFilter = `${paths || ''}`
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const seen = new Set();
      const plan = [];
      for (const host of Object.keys(confServer)) {
        if (hostFilter.length && !hostFilter.includes(host)) continue;
        for (const path of Object.keys(confServer[host])) {
          if (pathFilter.length && !pathFilter.includes(path)) continue;
          const { db } = confServer[host][path];
          if (!db?.provider || !db?.name || seen.has(`${db.provider}:${db.name}`)) continue;
          seen.add(`${db.provider}:${db.name}`);
          plan.push({
            provider: db.provider,
            name: db.name,
            user: db.user,
            password: db.password,
            host,
            path,
            partitions: Object.values(db.partitions ?? {}).map((partition) => partition.name),
          });
        }
      }
      return plan;
    },

    /**
     * The pods of a provider in a namespace: the named patterns, or every pod of the provider.
     * @method providerPods
     * @memberof UnderpostDB
     * @param {'mongoose'|'mariadb'} provider
     * @param {string} namespace
     * @param {string} [podName] - Comma-separated patterns.
     * @return {PodInfo[]}
     */
    providerPods(provider, namespace, podName = '') {
      const deployId = provider === 'mariadb' ? 'mariadb' : 'mongo';
      const pods = Underpost.kubectl.getFilteredPods({ podNames: podName, namespace, deployId });
      return pods.length || podName ? pods : Underpost.kubectl.get(deployId, 'pods', namespace);
    },

    /**
     * Starts the MongoDB client pod of a deployment: the image the replica set runs, its
     * credentials in a Secret, its own resource limits.
     * @method openMongoClient
     * @memberof UnderpostDB
     * @param {Object} params
     * @param {string} params.deployId
     * @param {string} params.namespace
     * @param {DatabasePlanEntry[]} params.databases - MongoDB entries of the plan.
     * @param {string} [params.podName] - Pod patterns.
     * @param {string} [params.name] - Pod name; the deployment's client by default.
     * @return {Promise<{pod:Object, hosts:string[], image:string, principal:(entry:DatabasePlanEntry) => number|null}>}
     * @throws {Error} When no MongoDB pod runs.
     */
    async openMongoClient({ deployId, namespace, databases, podName = '', name }) {
      const pods = Underpost.db.providerPods('mongoose', namespace, podName);
      if (!pods.length) throw new Error(`No MongoDB pod runs in namespace ${namespace}`);
      const principals = [];
      for (const { user, password } of databases)
        if (user && password && !principals.some((p) => p.user === user && p.password === password))
          principals.push({ user, password });
      const secretEnv = Object.fromEntries(
        principals.flatMap(({ user, password }, index) => [
          [`MONGO_USER_${index}`, user],
          [`MONGO_PASSWORD_${index}`, password],
        ]),
      );
      const image = Underpost.kubectl.podImage(pods[0].NAME, namespace);
      if (!image) throw new Error(`The image of ${pods[0].NAME} is unknown`);
      const pod = await Underpost.kubectl.startClientPod({
        name: name ?? `underpost-db-client-${deployId}`,
        namespace,
        image,
        secretEnv,
        labels: { 'underpost-deploy-id': deployId, 'underpost-role': 'db-client' },
        limits: CLIENT_LIMITS,
      });
      return {
        pod,
        hosts: mongoReplicaHostsFactory(pods),
        image,
        principal: ({ user, password }) => {
          const index = principals.findIndex((p) => p.user === user && p.password === password);
          return index < 0 ? null : index;
        },
      };
    },

    /**
     * The databases a MongoDB server holds, listed from the client pod.
     * @method listMongoDatabases
     * @memberof UnderpostDB
     * @param {Object} client - {@link UnderpostDB.API.openMongoClient} output.
     * @param {number|null} principal
     * @return {string[]}
     */
    listMongoDatabases(client, principal) {
      const listed = Underpost.kubectl.exec({
        podName: client.pod.name,
        namespace: client.pod.namespace,
        command: mongoShellCommandFactory({
          hosts: client.hosts,
          principal,
          script: 'print(db.adminCommand({ listDatabases: 1, nameOnly: true }).databases.map((d) => d.name).join(" "))',
        }),
      });
      return `${listed}`.split(/\s+/).filter(Boolean).sort();
    },

    /**
     * The databases the partitions of a host serve: each partition's own, and every
     * `<partition>-<id>` database it may be rebound to.
     * @method partitionDatabases
     * @memberof UnderpostDB
     * @param {string[]} listed - Every database of the server.
     * @param {string[]} partitions - The partition database names the host declares.
     * @return {string[]}
     */
    partitionDatabases(listed, partitions) {
      return listed
        .filter((name) => partitions.some((partition) => name === partition || name.startsWith(`${partition}-`)))
        .sort();
    },

    /**
     * The replica set identity of the server, which no other replica set shares.
     * @method mongoReplicaSetId
     * @memberof UnderpostDB
     * @param {Object} client - {@link UnderpostDB.API.openMongoClient} output.
     * @param {number|null} principal
     * @return {string} Empty when the server does not report it.
     */
    mongoReplicaSetId(client, principal) {
      try {
        return `${Underpost.kubectl.exec({
          podName: client.pod.name,
          namespace: client.pod.namespace,
          command: mongoShellCommandFactory({
            hosts: client.hosts,
            principal,
            script: 'print(rs.conf().settings.replicaSetId.toHexString())',
          }),
          retries: 0,
        })}`.trim();
      } catch {
        return '';
      }
    },

    /**
     * The archive of one MongoDB database as a backup source, read by the client pod.
     * @method mongoDumpSource
     * @memberof UnderpostDB
     * @param {Object} params
     * @param {Object} params.client - {@link UnderpostDB.API.openMongoClient} output.
     * @param {number|null} params.principal
     * @param {string} params.database
     * @param {string} [params.readPreference='secondaryPreferred']
     * @return {AsyncIterable<Buffer> & {done:() => Promise<void>, destroy:() => void}}
     */
    mongoDumpSource({ client, principal, database, readPreference = 'secondaryPreferred' }) {
      return commandSource(
        Underpost.kubectl.execStream({
          podName: client.pod.name,
          namespace: client.pod.namespace,
          command: mongoDumpCommandFactory({ hosts: client.hosts, principal, database, readPreference }),
        }),
      );
    },

    /**
     * The `dbHash` of one MongoDB database on the primary: equal hashes before and after a read
     * prove that no write landed in between.
     * @method mongoDbHash
     * @memberof UnderpostDB
     * @param {Object} params
     * @param {Object} params.client - {@link UnderpostDB.API.openMongoClient} output.
     * @param {number|null} params.principal
     * @param {string} params.database
     * @return {string} The md5 of the database.
     */
    mongoDbHash({ client, principal, database }) {
      const output = Underpost.kubectl.exec({
        podName: client.pod.name,
        namespace: client.pod.namespace,
        command: mongoShellCommandFactory({
          hosts: client.hosts,
          principal,
          script: `print(db.getSiblingDB(${JSON.stringify(database)}).runCommand({ dbHash: 1 }).md5)`,
        }),
      });
      const md5 = `${output}`.trim();
      if (!/^[0-9a-f]{32}$/.test(md5)) throw new Error(`dbHash of ${database} answered ${md5.slice(0, 120)}`);
      return md5;
    },

    /**
     * The backup streams of a deployment: every MongoDB database of its hosts and their
     * partitions (or the named collections of the host databases), every MariaDB database, and
     * the site file tree of every repository entry.
     * @method backupStreams
     * @memberof UnderpostDB
     * @param {Object} params
     * @param {string} params.deployId
     * @param {DatabasePlanEntry[]} params.plan
     * @param {string} params.namespace
     * @param {DatabaseOptions} params.options
     * @param {Object|null} params.client - {@link UnderpostDB.API.openMongoClient} output.
     * @return {Array<Object>} Streams for {@link writeBackup}.
     */
    backupStreams({ deployId, plan, namespace, options, client }) {
      const streams = [];
      const collections = `${options.collections || ''}`
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const readPreference = options.primaryPod ? 'primary' : 'secondaryPreferred';
      const mongo = plan.filter(({ provider }) => provider === 'mongoose');
      const listed = mongo.length ? Underpost.db.listMongoDatabases(client, client.principal(mongo[0])) : [];
      const dumped = new Set();
      for (const entry of mongo) {
        const principal = client.principal(entry);
        const databases = collections.length
          ? [entry.name]
          : [entry.name, ...Underpost.db.partitionDatabases(listed, entry.partitions)];
        for (const database of databases) {
          for (const collection of collections.length ? collections : ['']) {
            const name = backupStreamName('mongodb', database, collection);
            if (dumped.has(name)) continue;
            dumped.add(name);
            const command = mongoDumpCommandFactory({
              hosts: client.hosts,
              principal,
              database,
              collection,
              readPreference,
            });
            streams.push({
              name,
              kind: 'mongodb',
              describe: {
                provider: 'mongoose',
                database,
                ...(collection ? { collection } : {}),
                host: entry.host,
                path: entry.path,
                partition: database !== entry.name,
                tool: 'mongodump',
                format: 'mongodump-archive+gzip',
                readPreference,
              },
              open: async () =>
                commandSource(Underpost.kubectl.execStream({ podName: client.pod.name, namespace, command })),
              tap: mongoArchiveTap,
            });
          }
        }
      }
      for (const entry of plan.filter(({ provider }) => provider === 'mariadb')) {
        const [pod] = Underpost.db.providerPods('mariadb', namespace, options.podName);
        if (!pod) throw new Error(`No MariaDB pod runs in namespace ${namespace}`);
        const command = `mariadb-dump --user=${shellArgumentFactory(entry.user)} --password=${shellArgumentFactory(entry.password)} --single-transaction --quick --routines --triggers ${shellArgumentFactory(entry.name)}`;
        streams.push({
          name: backupStreamName('mariadb', entry.name),
          kind: 'mariadb',
          describe: {
            provider: 'mariadb',
            database: entry.name,
            host: entry.host,
            path: entry.path,
            tool: 'mariadb-dump',
            format: 'sql+gzip',
            pod: pod.NAME,
          },
          open: async () =>
            commandSource(Underpost.kubectl.execStream({ podName: pod.NAME, namespace, command }), { gzip: true }),
        });
      }
      if (!collections.length)
        for (const root of Underpost.repo.podSiteRoots({
          deployId,
          namespace,
          env: options.dev ? 'development' : 'production',
        })) {
          const command = `tar -czf - -C ${shellArgumentFactory(root.siteRoot)} .`;
          streams.push({
            name: backupStreamName('tree', root.host, root.path),
            kind: 'tree',
            describe: { host: root.host, path: root.path, siteRoot: root.siteRoot, tool: 'tar', format: 'tar+gzip' },
            open: async () =>
              commandSource(Underpost.kubectl.execStream({ podName: root.podName, namespace, command })),
          });
        }
      return streams;
    },

    /**
     * Backs up a deployment: to the object store, or as plain archives in `outPath`.
     * @method exportDeploy
     * @memberof UnderpostDB
     * @param {string} deployId
     * @param {DatabasePlanEntry[]} plan
     * @param {string} namespace
     * @param {DatabaseOptions} options
     * @return {Promise<Object|null>} The manifest; null for a local export.
     */
    async exportDeploy(deployId, plan, namespace, options) {
      const local = !!options.outPath;
      // Credentials and the key are checked before any pod starts.
      const store = local ? null : objectStore();
      const keyMaterial = local ? null : backupKeyMaterial();
      const mongo = plan.filter(({ provider }) => provider === 'mongoose');
      const client = mongo.length
        ? await Underpost.db.openMongoClient({ deployId, namespace, databases: mongo, podName: options.podName })
        : null;
      try {
        const streams = Underpost.db.backupStreams({ deployId, plan, namespace, options, client });
        if (!streams.length) {
          logger.warn('Nothing to back up', { deployId });
          return null;
        }
        if (local) {
          fs.ensureDirSync(options.outPath);
          for (const stream of streams) {
            const extension = { mongodb: 'archive.gz', mariadb: 'sql.gz', tree: 'tar.gz' }[stream.kind];
            const target = nodePath.join(options.outPath, `${stream.name}.${extension}`);
            const source = await stream.open();
            await pipeline(source, fs.createWriteStream(`${target}.tmp`));
            await source.done();
            fs.renameSync(`${target}.tmp`, target);
            logger.info('Exported', { target });
          }
          return null;
        }
        const principal = client ? client.principal(mongo[0]) : null;
        const manifest = await writeBackup({
          store,
          deployId,
          profile: DR_BACKUP_PROFILE,
          keyMaterial,
          streams,
          source: {
            environment: options.dev ? 'development' : 'production',
            namespace,
            ...(client
              ? {
                  mongodb: {
                    replicaSet: MONGODB_DEFAULT_REPLICA_SET,
                    replicaSetId: Underpost.db.mongoReplicaSetId(client, principal),
                    members: client.hosts,
                    clientImage: client.image,
                  },
                }
              : {}),
            engineVersion: Underpost.version,
          },
          meta: { consistency: DR_CONSISTENCY },
        });
        publishBackupMetrics({ deployId, profile: DR_BACKUP_PROFILE, kind: 'export', manifest });
        return manifest;
      } catch (error) {
        if (!local) publishBackupMetrics({ deployId, profile: DR_BACKUP_PROFILE, kind: 'failure' });
        throw error;
      } finally {
        client?.pod.remove();
      }
    },

    /**
     * Restores a deployment from a backup: every database stream of its hosts, and the site file
     * trees with `trees`. A local import reads the plain archives of `outPath`.
     * @method importDeploy
     * @memberof UnderpostDB
     * @param {string} deployId
     * @param {DatabasePlanEntry[]} plan
     * @param {string} namespace
     * @param {DatabaseOptions} options
     * @return {Promise<number>} Streams restored.
     */
    async importDeploy(deployId, plan, namespace, options) {
      const local = !!options.outPath;
      const store = local ? null : objectStore();
      const manifest = local
        ? null
        : options.backup
          ? await readBackupManifest({ store, deployId, profile: DR_BACKUP_PROFILE, backupId: options.backup })
          : await latestBackup({ store, deployId, profile: DR_BACKUP_PROFILE });
      if (!local && !manifest) {
        logger.warn('No backup of this deployment in the object store: its databases stay as they are', {
          deployId,
          store: store.location,
        });
        return 0;
      }
      // Only a backup that exists needs the key that opens it.
      const keyMaterial = local ? null : backupKeyMaterial();
      const hosts = new Set(plan.map(({ host, path }) => `${host}${path}`));
      const collections = `${options.collections || ''}`
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const extension = { mongodb: 'archive.gz', mariadb: 'sql.gz', tree: 'tar.gz' };
      // A local directory holds one archive per database, or per collection: `<database>--<collection>`.
      const localFiles = local && fs.existsSync(options.outPath) ? fs.readdirSync(options.outPath) : [];
      const streams = local
        ? plan.flatMap((entry) => {
            const kind = entry.provider === 'mariadb' ? 'mariadb' : 'mongodb';
            const base = backupStreamName(kind, entry.name);
            return localFiles
              .filter(
                (file) =>
                  file === `${base}.${extension[kind]}` ||
                  (file.startsWith(`${base}--`) && file.endsWith(`.${extension[kind]}`)),
              )
              .map((file) => ({
                name: file,
                kind,
                database: entry.name,
                collection: '',
                file: nodePath.join(options.outPath, file),
              }));
          })
        : manifest.streams
            .filter((stream) => hosts.has(`${stream.host}${stream.path}`))
            .filter((stream) => stream.kind !== 'tree' || options.trees)
            .map((stream) => ({ ...stream, database: stream.database ?? '', collection: stream.collection ?? '' }));
      if (!streams.length) {
        logger.warn('The backup holds no stream for the selected hosts', { deployId, backup: manifest?.backupId });
        return 0;
      }
      const source = (stream) =>
        local
          ? fs.createReadStream(stream.file)
          : backupStreamReadable({ store, manifest, name: stream.name, keyMaterial });
      const mongo = plan.filter(({ provider }) => provider === 'mongoose');
      const client = streams.some(({ kind }) => kind === 'mongodb')
        ? await Underpost.db.openMongoClient({ deployId, namespace, databases: mongo, podName: options.podName })
        : null;
      try {
        for (const stream of streams) {
          logger.info('Restoring', { deployId, stream: stream.name, backup: manifest?.backupId ?? options.outPath });
          if (stream.kind === 'mongodb') {
            const entry =
              mongo.find(
                ({ name, partitions }) =>
                  name === stream.database || partitions.some((p) => stream.database.startsWith(p)),
              ) ?? mongo[0];
            const namespaces = stream.collection
              ? [`${stream.database}.${stream.collection}`]
              : collections.length
                ? collections.map((collection) => `${stream.database}.${collection}`)
                : [`${stream.database}.*`];
            const command = mongoRestoreCommandFactory({
              hosts: client.hosts,
              principal: client.principal(entry),
              namespaces,
              drop: !!options.drop,
              preserveUUID: !!options.preserveUUID,
            });
            await feedCommand(
              source(stream),
              Underpost.kubectl.execStream({ podName: client.pod.name, namespace, command }),
            );
          } else if (stream.kind === 'mariadb') {
            const entry = plan.find(({ provider, name }) => provider === 'mariadb' && name === stream.database);
            const [pod] = Underpost.db.providerPods('mariadb', namespace, options.podName);
            if (!entry || !pod) throw new Error(`No MariaDB pod or configuration for ${stream.database}`);
            const auth = `-u ${shellArgumentFactory(entry.user)} -p${shellArgumentFactory(entry.password)}`;
            Underpost.kubectl.exec({
              podName: pod.NAME,
              namespace,
              command: `mariadb ${auth} -e ${shellArgumentFactory(`CREATE DATABASE IF NOT EXISTS \`${entry.name}\`;`)}`,
            });
            await feedCommand(
              source(stream),
              Underpost.kubectl.execStream({
                podName: pod.NAME,
                namespace,
                command: `mariadb ${auth} ${shellArgumentFactory(entry.name)}`,
              }),
              { gunzip: true },
            );
          } else {
            const [root] = Underpost.repo
              .podSiteRoots({ deployId, namespace, env: options.dev ? 'development' : 'production' })
              .filter(({ host, path }) => host === stream.host && path === stream.path);
            if (!root) throw new Error(`No live site root for ${stream.host}${stream.path}`);
            await feedCommand(
              source(stream),
              Underpost.kubectl.execStream({
                podName: root.podName,
                namespace,
                command: `tar -xzf - -C ${shellArgumentFactory(root.siteRoot)}`,
              }),
            );
          }
          logger.info('Restored', { deployId, stream: stream.name });
        }
        return streams.length;
      } finally {
        client?.pod.remove();
      }
    },

    /**
     * Restores a backup into a scratch `mongod` in a pod of its own, then compares every
     * namespace with the manifest and validates every collection. Production is never a target.
     * @method restoreDrill
     * @memberof UnderpostDB
     * @param {Object} params
     * @param {string} params.deployId
     * @param {string} params.namespace
     * @param {Object} params.store
     * @param {Object} params.manifest
     * @param {{key:Buffer,keyId:string}} params.keyMaterial
     * @return {Promise<{ok:boolean, durationMs:number, restoreMs:number, namespaces:number, defects:string[]}>}
     */
    async restoreDrill({ deployId, namespace, store, manifest, keyMaterial }) {
      const streams = manifest.streams.filter(({ kind }) => kind === 'mongodb');
      if (!streams.length)
        return { ok: true, durationMs: 0, restoreMs: 0, namespaces: 0, defects: ['no MongoDB stream to drill'] };
      const started = Date.now();
      const plainBytes = streams.reduce((sum, { plain }) => sum + plain.bytes, 0);
      const image =
        manifest.source?.mongodb?.clientImage ||
        Underpost.kubectl.podImage(Underpost.db.providerPods('mongoose', namespace)[0]?.NAME, namespace);
      const pod = await Underpost.kubectl.startClientPod({
        name: `underpost-db-drill-${deployId}`,
        namespace,
        image,
        labels: { 'underpost-deploy-id': deployId, 'underpost-role': 'db-drill' },
        limits: DRILL_LIMITS,
        scratchSize: `${Math.max(2, Math.ceil((plainBytes * 10) / 2 ** 30))}Gi`,
      });
      try {
        Underpost.kubectl.exec({
          podName: pod.name,
          namespace,
          command: drillMongodCommandFactory(),
        });
        const restoreStarted = Date.now();
        for (const stream of streams)
          await feedCommand(
            backupStreamReadable({ store, manifest, name: stream.name, keyMaterial }),
            Underpost.kubectl.execStream({
              podName: pod.name,
              namespace,
              command: mongoRestoreCommandFactory({ namespaces: ['*.*'] }),
            }),
          );
        const restoreMs = Date.now() - restoreStarted;
        const found = JSON.parse(
          `${Underpost.kubectl.exec({ podName: pod.name, namespace, command: mongoShellCommandFactory({ script: DRILL_INVENTORY_SCRIPT }) })}`.trim(),
        );
        const expected = { namespaces: {} };
        for (const { inventory } of streams)
          for (const [name, entry] of Object.entries(inventory?.namespaces ?? {}))
            if (entry.kind === 'collection' && !/^(admin|local|config)\./.test(name) && name !== 'oplog')
              expected.namespaces[name] = entry;
        const defects = inventoryDefects(expected, found);
        for (const [name, entry] of Object.entries(found.namespaces))
          if (!entry.valid) defects.push(`${name}: validate failed`);
        return {
          ok: defects.length === 0,
          durationMs: Date.now() - started,
          restoreMs,
          namespaces: Object.keys(found.namespaces).length,
          defects,
        };
      } finally {
        pod.remove();
      }
    },

    /**
     * Verifies a backup of a deployment and records the report beside its manifest: every part
     * read, checked and opened, every MongoDB archive inventory compared with the manifest, and
     * with `restoreTest` a restore drill.
     * @method verifyDeploy
     * @memberof UnderpostDB
     * @param {string} deployId
     * @param {string} namespace
     * @param {DatabaseOptions} options
     * @return {Promise<Object>} The report.
     */
    async verifyDeploy(deployId, namespace, options) {
      const store = objectStore();
      const keyMaterial = backupKeyMaterial();
      const manifest = options.backup
        ? await readBackupManifest({ store, deployId, profile: DR_BACKUP_PROFILE, backupId: options.backup })
        : await latestBackup({ store, deployId, profile: DR_BACKUP_PROFILE });
      if (!manifest) throw new Error(`No available backup of ${deployId} in ${store.location}`);
      const report = await verifyBackup({
        store,
        manifest,
        deep: true,
        keyMaterial,
        inspect: async (entry, plaintext) => {
          if (entry.kind !== 'mongodb') {
            for await (const _ of plaintext);
            return [];
          }
          return inventoryDefects(entry.inventory, await inspectMongoArchive(plaintext));
        },
      });
      if (options.restoreTest) {
        report.restoreTest = await Underpost.db.restoreDrill({ deployId, namespace, store, manifest, keyMaterial });
        report.ok = report.ok && report.restoreTest.ok;
      }
      await recordVerification({ store, manifest, report });
      publishBackupMetrics({ deployId, profile: DR_BACKUP_PROFILE, kind: 'verify', manifest, report });
      for (const check of report.checks)
        (check.ok ? logger.info : logger.error)(`${check.ok ? 'ok  ' : 'FAIL'} ${check.name}: ${check.detail}`);
      if (report.restoreTest)
        (report.restoreTest.ok ? logger.info : logger.error)(
          `${report.restoreTest.ok ? 'ok  ' : 'FAIL'} restore drill: ${report.restoreTest.namespaces} namespace(s) in ${Math.round(report.restoreTest.restoreMs / 1000)}s${report.restoreTest.defects.length ? `: ${report.restoreTest.defects.join('; ')}` : ''}`,
        );
      logger.info(`Backup ${manifest.backupId} is ${report.ok ? 'verified' : 'NOT verified'}`);
      return report;
    },

    /**
     * Prints the backups of a deployment, newest first. Rows are data: they go to stdout.
     * @method listDeploy
     * @memberof UnderpostDB
     * @param {string} deployId
     * @return {Promise<Object[]>}
     */
    async listDeploy(deployId) {
      const backups = await listBackups({ store: objectStore(), deployId, profile: DR_BACKUP_PROFILE });
      if (!backups.length) logger.info('No backup', { deployId });
      for (const { backupId, status, bytes, verified } of backups)
        console.log(
          `${status.padEnd(10)} ${backupId}  ${(bytes / 2 ** 20).toFixed(1).padStart(9)} MiB  ${verified ? 'verified' : '-'}`,
        );
      return backups;
    },

    /**
     * Removes the backups of a deployment retention no longer keeps.
     * @method pruneDeploy
     * @memberof UnderpostDB
     * @param {string} deployId
     * @param {DatabaseOptions} options
     * @return {Promise<Object>}
     */
    async pruneDeploy(deployId, options) {
      const result = await pruneBackups({
        store: objectStore(),
        deployId,
        profile: DR_BACKUP_PROFILE,
        keep: Number.isInteger(options.keep) ? options.keep : BACKUP_RETENTION.keep,
        dryRun: !!options.dryRun,
      });
      for (const { backupId, status } of result.removed)
        console.log(`${result.dryRun ? 'would remove' : 'removed'} ${status} ${backupId}`);
      logger.info(
        `${result.removed.length} backup(s) ${result.dryRun ? 'to remove' : 'removed'}, ${result.kept.length} kept`,
        { deployId },
      );
      return result;
    },

    /**
     * Helper: Gets MongoDB collection statistics.
     * @method _getMongoStats
     * @memberof UnderpostDB
     * @param {Object} params - Parameters.
     * @param {string} params.podName - Pod name.
     * @param {string} params.namespace - Namespace.
     * @param {string} params.dbName - Database name.
     * @param {string} [params.user=''] - MongoDB username for authenticated stats query.
     * @param {string} [params.password=''] - MongoDB password for authenticated stats query.
     * @param {string} [params.authDatabase='admin'] - Auth database for stats query.
     * @return {Object|null} Collection statistics or null on error.
     */
    _getMongoStats({ podName, namespace, dbName, user = '', password = '', authDatabase = 'admin' }) {
      try {
        logger.info('Getting MongoDB collection statistics', { podName, dbName });

        // Use db.getSiblingDB() instead of 'use' command
        const script = `db.getSiblingDB(${JSON.stringify(dbName)}).getCollectionNames().map(function(c) { return { collection: c, count: db.getSiblingDB(${JSON.stringify(dbName)})[c].countDocuments() }; })`;

        // Execute the script
        const authFlags =
          user && password
            ? ` --authenticationDatabase ${shellArgumentFactory(authDatabase)} -u ${shellArgumentFactory(user)} -p ${shellArgumentFactory(password)}`
            : '';
        const command = `sudo kubectl exec -n ${shellArgumentFactory(namespace)} -i ${shellArgumentFactory(podName)} -- mongosh --quiet${authFlags} --eval ${shellArgumentFactory(script)}`;
        const output = shellExec(command, { stdout: true, silent: true, silentOnError: true });

        if (!output || output.trim() === '') {
          logger.warn('No collections found or empty output');
          return null;
        }

        // Clean the output: remove newlines, handle EJSON format, replace single quotes with double quotes
        let cleanedOutput = output
          .trim()
          .replace(/\n/g, '')
          .replace(/\s+/g, ' ')
          .replace(/NumberLong\("(\d+)"\)/g, '$1')
          .replace(/NumberLong\((\d+)\)/g, '$1')
          .replace(/NumberInt\("(\d+)"\)/g, '$1')
          .replace(/NumberInt\((\d+)\)/g, '$1')
          .replace(/ISODate\("([^"]+)"\)/g, '"$1"')
          .replace(/'/g, '"')
          .replace(/(\w+):/g, '"$1":');

        try {
          const stats = JSON.parse(cleanedOutput);
          logger.info('MongoDB statistics retrieved', { dbName, collections: stats.length });
          return stats;
        } catch (parseError) {
          logger.error('Failed to parse MongoDB output', {
            podName,
            dbName,
            error: parseError.message,
            rawOutput: output.substring(0, 200),
            cleanedOutput: cleanedOutput.substring(0, 200),
          });
          return null;
        }
      } catch (error) {
        logger.error('Failed to get MongoDB statistics', { podName, dbName, error: error.message });
        return null;
      }
    },

    /**
     * Helper: Gets MariaDB table statistics.
     * @method _getMariaDBStats
     * @memberof UnderpostDB
     * @param {Object} params - Parameters.
     * @param {string} params.podName - Pod name.
     * @param {string} params.namespace - Namespace.
     * @param {string} params.dbName - Database name.
     * @param {string} params.user - Database user.
     * @param {string} params.password - Database password.
     * @return {Object|null} Table statistics or null on error.
     */
    _getMariaDBStats({ podName, namespace, dbName, user, password }) {
      try {
        logger.info('Getting MariaDB table statistics', { podName, dbName });

        const query = `SELECT TABLE_NAME as 'table', TABLE_ROWS as 'count' FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${`${dbName}`.replaceAll("'", "''")}' ORDER BY TABLE_NAME;`;
        const command = `sudo kubectl exec -n ${shellArgumentFactory(namespace)} -i ${shellArgumentFactory(podName)} -- mariadb -u ${shellArgumentFactory(user)} -p${shellArgumentFactory(password)} ${shellArgumentFactory(dbName)} -e ${shellArgumentFactory(query)} --skip-column-names --batch`;
        const output = shellExec(command, { stdout: true, silent: true, disableLog: true, silentOnError: true });

        if (!output || output.trim() === '') {
          logger.warn('No tables found or empty output');
          return null;
        }

        // Parse the output (tab-separated values)
        const lines = output.trim().split('\n');
        const stats = lines.map((line) => {
          const [table, count] = line.split('\t');
          return { table, count: parseInt(count) || 0 };
        });

        logger.info('MariaDB statistics retrieved', { dbName, tables: stats.length });
        return stats;
      } catch (error) {
        logger.error('Failed to get MariaDB statistics', { podName, dbName, error: error.message });
        return null;
      }
    },

    /**
     * Helper: Displays database statistics in table format.
     * @method _displayStats
     * @memberof UnderpostDB
     * @param {Object} params - Parameters.
     * @param {string} params.provider - Database provider.
     * @param {string} params.dbName - Database name.
     * @param {Array<Object>} params.stats - Statistics array.
     * @return {void}
     */
    _displayStats({ provider, dbName, stats }) {
      if (!stats || stats.length === 0) {
        logger.warn('No statistics to display', { provider, dbName });
        return;
      }

      const title = provider === 'mongoose' ? 'Collections' : 'Tables';
      const itemKey = provider === 'mongoose' ? 'collection' : 'table';

      console.log('\n' + '='.repeat(70));
      console.log(`DATABASE: ${dbName} (${provider.toUpperCase()})`);
      console.log('='.repeat(70));
      console.log(`${title.padEnd(50)} ${'Documents/Rows'.padStart(18)}`);
      console.log('-'.repeat(70));

      let totalCount = 0;
      stats.forEach((item) => {
        const name = item[itemKey] || 'Unknown';
        const count = item.count || 0;
        totalCount += count;
        console.log(`${name.padEnd(50)} ${count.toString().padStart(18)}`);
      });

      console.log('-'.repeat(70));
      console.log(`${'TOTAL'.padEnd(50)} ${totalCount.toString().padStart(18)}`);
      console.log('='.repeat(70) + '\n');
    },

    /**
     * Displays the statistics of each database of a plan, read in its pod: the MongoDB primary,
     * or every matching pod with `allPods`.
     * @method statsDeploy
     * @memberof UnderpostDB
     * @param {DatabasePlanEntry[]} plan
     * @param {string} namespace
     * @param {DatabaseOptions} options
     * @return {void}
     */
    statsDeploy(plan, namespace, options) {
      for (const entry of plan) {
        const pods = Underpost.db.providerPods(entry.provider, namespace, options.podName);
        if (!pods.length) {
          logger.warn('No pods found matching criteria', { provider: entry.provider, namespace });
          continue;
        }
        let targets = options.allPods ? pods : [pods[0]];
        if (entry.provider === 'mongoose' && !options.allPods) {
          const primary = MongoBootstrap.getPrimaryPodName({
            namespace,
            podName: pods[0].NAME,
            username: entry.user,
            password: entry.password,
            authDatabase: 'admin',
          });
          targets = [pods.find((pod) => pod.NAME === primary) ?? pods[0]];
        }
        for (const pod of targets) {
          const params = {
            podName: pod.NAME,
            namespace,
            dbName: entry.name,
            user: entry.user,
            password: entry.password,
          };
          const stats =
            entry.provider === 'mariadb'
              ? Underpost.db._getMariaDBStats(params)
              : Underpost.db._getMongoStats({ ...params, authDatabase: 'admin' });
          if (stats) Underpost.db._displayStats({ provider: entry.provider, dbName: entry.name, stats });
        }
      }
    },

    /**
     * Main callback: database backups, restores, verification and statistics of each deployment.
     * One deployment failing does not stop the others; the run fails when any did.
     * @method callback
     * @memberof UnderpostDB
     * @param {string} [deployList='default'] - Comma-separated list of deployment IDs; `dd` selects every routed one.
     * @param {DatabaseOptions & {cleanFsCollection?:boolean, cleanFsDryRun?:boolean, migrateStableSlugs?:boolean, dev?:boolean}} [options={}]
     * @return {Promise<void>} Resolves when every operation succeeded.
     */
    async callback(deployList = 'default', options = {}) {
      try {
        loadCronDeployEnv();
        const namespace = options.ns && typeof options.ns === 'string' ? options.ns : 'default';

        if (deployList === 'dd') deployList = readDeployRoutes().join(',');

        if (options.migrateStableSlugs) {
          await Underpost.db.migrateStableSlugs(deployList, {
            hosts: options.hosts,
            paths: options.paths,
            dev: options.dev,
          });
          return;
        }

        if (options.cleanFsCollection || options.cleanFsDryRun) {
          logger.info('Starting File collection cleanup operation', { deployList });
          await Underpost.db.cleanFsCollection(deployList, {
            hosts: options.hosts,
            paths: options.paths,
            dryRun: options.cleanFsDryRun,
          });
          return;
        }

        logger.info('Starting database operation', {
          deployList,
          namespace,
          import: options.import,
          export: options.export,
          verify: options.verify,
          prune: options.prune,
        });

        const failed = [];
        for (const _deployId of deployList.split(',')) {
          const deployId = _deployId.trim();
          if (!deployId) continue;
          let op = 'plan';
          try {
            if (options.list) {
              op = 'list';
              await Underpost.db.listDeploy(deployId);
            }
            const plan =
              options.stats || options.export || options.import ? Underpost.db.databasePlan(deployId, options) : [];
            if (options.stats) {
              op = 'stats';
              Underpost.db.statsDeploy(plan, namespace, options);
            }
            if (options.export) {
              op = 'export';
              await Underpost.db.exportDeploy(deployId, plan, namespace, options);
            }
            if (options.import) {
              op = 'import';
              await Underpost.db.importDeploy(deployId, plan, namespace, options);
            }
            if (options.verify) {
              op = 'verify';
              const report = await Underpost.db.verifyDeploy(deployId, namespace, options);
              if (!report.ok) throw new Error(`backup ${report.backupId} is not verified`);
            }
            if (options.prune) {
              op = 'prune';
              await Underpost.db.pruneDeploy(deployId, options);
            }
          } catch (error) {
            failed.push({ deployId, op, error: error.message });
            logger.error(`Database ${op} failed`, { deployId, error: error.message });
          }
        }

        // A partial run must never read as a success.
        if (failed.length > 0)
          throw new Error(
            `Database operation failed for ${failed.length} deployment(s): ` +
              failed.map(({ deployId, op, error }) => `${deployId} (${op}): ${error}`).join('; '),
          );

        logger.info('Database operation completed successfully');
      } catch (error) {
        logger.error('Database operation failed', { error: error.message });
        throw error;
      }
    },

    /**
     * Creates cluster metadata for the specified deployment.
     * Loads database configuration and initializes cluster metadata including
     * instances and cron jobs. This method populates the database with deployment information.
     * @method clusterMetadataFactory
     * @memberof UnderpostDB
     * @param {string} [deployId=process.env.DEFAULT_DEPLOY_ID] - The deployment ID.
     * @param {string} [host=process.env.DEFAULT_DEPLOY_HOST] - The host identifier.
     * @param {string} [path=process.env.DEFAULT_DEPLOY_PATH] - The path identifier.
     * @param {object} [options] - Options.
     * @param {boolean} [options.dev=false] - Development mode flag.
     * @return {Promise<void>} Resolves when metadata creation is complete.
     * @throws {Error} If database configuration is invalid or connection fails.
     */
    async clusterMetadataFactory(
      deployId = process.env.DEFAULT_DEPLOY_ID,
      host = process.env.DEFAULT_DEPLOY_HOST,
      path = process.env.DEFAULT_DEPLOY_PATH,
      options = { dev: false },
    ) {
      try {
        loadCronDeployEnv();
        deployId = deployId ? deployId : process.env.DEFAULT_DEPLOY_ID;
        host = host ? host : process.env.DEFAULT_DEPLOY_HOST;
        path = path ? path : process.env.DEFAULT_DEPLOY_PATH;

        logger.info('Creating cluster metadata', { deployId, host, path });

        const env = 'production';
        const deployList = readDeployRoutes();

        if (deployList.length === 0) {
          logger.error('Deploy route table not found', { path: DEPLOY_ROUTES_PATH });
          throw new Error(`Deploy route table not found: ${DEPLOY_ROUTES_PATH}`);
        }

        const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
        if (!fs.existsSync(confServerPath)) {
          logger.error('Server configuration not found', { path: confServerPath });
          throw new Error(`Server configuration not found: ${confServerPath}`);
        }

        const { db } = loadConfServerJson(confServerPath, { resolve: true })[host][path];

        const maxRetries = 5;
        const retryDelay = 3000;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await DataBaseProviderService.load({ apis: ['instance', 'cron'], host, path, db });
            break;
          } catch (err) {
            if (attempt === maxRetries) {
              logger.error('Failed to connect to database after retries', { attempts: maxRetries, error: err.message });
              throw err;
            }
            logger.warn('Database connection failed, retrying...', { attempt, maxRetries, error: err.message });
            await timer(retryDelay);
          }
        }

        try {
          /** @type {import('../api/instance/instance.model.js').InstanceModel} */
          const Instance = DataBaseProviderService.getModel('instance', { host, path });

          await Instance.deleteMany();
          logger.info('Cleared existing instance metadata');

          for (const _deployId of deployList) {
            const deployId = _deployId.trim();
            if (!deployId) continue;

            logger.info('Processing deployment for metadata', { deployId });

            const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
            if (!fs.existsSync(confServerPath)) {
              logger.warn('Configuration not found for deployment', { deployId, path: confServerPath });
              continue;
            }

            const confServer = loadReplicas(deployId, loadConfServerJson(confServerPath, { resolve: true }));
            const router = await Underpost.deploy.routerFactory(deployId, env);
            const pathPortAssignmentData = await pathPortAssignmentFactory(deployId, router, confServer);

            for (const host of Object.keys(confServer)) {
              for (const { path, port } of pathPortAssignmentData[host]) {
                if (!confServer[host][path]) continue;

                const { client, runtime, apis, peer } = confServer[host][path];

                // Save main instance
                {
                  const body = {
                    deployId,
                    host,
                    path,
                    port,
                    client,
                    runtime,
                    apis,
                  };

                  logger.info('Saving instance metadata', body);
                  await new Instance(body).save();
                }

                // Save peer instance if exists
                if (peer) {
                  const body = {
                    deployId,
                    host,
                    path: path === '/' ? '/peer' : `${path}/peer`,
                    port: port + 1,
                    runtime: 'nodejs',
                  };

                  logger.info('Saving peer instance metadata', body);
                  await new Instance(body).save();
                }
              }
            }

            // Process additional instances
            const confInstancesPath = `./engine-private/conf/${deployId}/conf.instances.json`;
            if (fs.existsSync(confInstancesPath)) {
              // Expands multiInstance variants so each deployed instance is
              // registered (handles both the bare-array and { instances } shapes).
              const confInstances = loadConfInstances(deployId);
              for (const instance of confInstances) {
                const { id, host, path, fromPort, metadata } = instance;
                const { runtime } = metadata;
                const body = {
                  deployId,
                  host,
                  path,
                  port: fromPort,
                  client: id,
                  runtime,
                };
                logger.info('Saving additional instance metadata', body);
                await new Instance(body).save();
              }
            }
          }
        } catch (error) {
          logger.error('Failed to create instance metadata', { error: error.message });
          throw error;
        }

        try {
          const cronDeployPath = './engine-private/deploy/dd.cron';
          if (!fs.existsSync(cronDeployPath)) {
            logger.warn('Cron deploy file not found', { path: cronDeployPath });
            return;
          }

          const cronDeployId = fs.readFileSync(cronDeployPath, 'utf8').trim();
          const confCronPath = `./engine-private/conf/${cronDeployId}/conf.cron.json`;

          if (!fs.existsSync(confCronPath)) {
            logger.warn('Cron configuration not found', { path: confCronPath });
            return;
          }

          const confCron = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

          await DataBaseProviderService.load({ apis: ['cron'], host, path, db });

          /** @type {import('../api/cron/cron.model.js').CronModel} */
          const Cron = DataBaseProviderService.getModel('cron', { host, path });

          await Cron.deleteMany();
          logger.info('Cleared existing cron metadata');

          for (const jobId of Object.keys(confCron.jobs)) {
            const body = {
              jobId,
              deployId: Underpost.cron.getRelatedDeployIdList(jobId),
              expression: confCron.jobs[jobId].expression,
              enabled: confCron.jobs[jobId].enabled,
            };
            logger.info('Saving cron metadata', body);
            await new Cron(body).save();
          }
        } catch (error) {
          logger.error('Failed to create cron metadata', { error: error.message });
        }

        await DataBaseProviderService.getProvider({ host, path }, 'mongoose').close();
        logger.info('Cluster metadata creation completed');
      } catch (error) {
        logger.error('Cluster metadata creation failed', { error: error.message });
        throw error;
      }
    },

    /**
     * Cleans orphaned File references from database collections.
     * Iterates over all deploy-ids and checks if File documents are actually referenced
     * by other collections. Removes File documents that are not referenced anywhere.
     * @method cleanFsCollection
     * @memberof UnderpostDB
     * @param {string} [deployList='dd'] - Comma-separated list of deployment IDs.
     * @param {Object} [options={}] - Clean operation options.
     * @param {string} [options.hosts=''] - Comma-separated list of hosts to filter.
     * @param {string} [options.paths=''] - Comma-separated list of paths to filter.
     * @param {boolean} [options.dryRun=false] - If true, only reports what would be deleted.
     * @param {boolean} [options.dev=false] - Development mode flag.
     * @return {Promise<void>} Resolves when clean operation is complete.
     */
    async cleanFsCollection(
      deployList = 'dd',
      options = {
        hosts: '',
        paths: '',
        dryRun: false,
        dev: false,
      },
    ) {
      const firstDeployId = deployList !== 'dd' ? deployList.split(',')[0].trim() : '';
      try {
        loadCronDeployEnv();
        if (deployList === 'dd') deployList = readDeployRoutes().join(',');

        logger.info('Starting File collection cleanup', { deployList, options });

        // Load file.ref.json to know which models reference File
        const fileRefPath = './src/api/file/file.ref.json';
        if (!fs.existsSync(fileRefPath)) {
          logger.error('file.ref.json not found', { path: fileRefPath });
          return;
        }

        const fileRefData = JSON.parse(fs.readFileSync(fileRefPath, 'utf8'));
        logger.info('Loaded file reference configuration', { apis: fileRefData.length });

        // Filter hosts and paths if specified
        const filterHosts = options.hosts ? options.hosts.split(',').map((h) => h.trim()) : [];
        const filterPaths = options.paths ? options.paths.split(',').map((p) => p.trim()) : [];

        // Track all connections to close them at the end
        const connectionsToClose = [];

        for (const _deployId of deployList.split(',')) {
          const deployId = _deployId.trim();
          if (!deployId) continue;

          logger.info('Processing deployment for File cleanup', { deployId });

          // Load server configuration
          const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
          if (!fs.existsSync(confServerPath)) {
            logger.error('Configuration file not found', { path: confServerPath });
            continue;
          }

          const confServer = loadConfServerJson(confServerPath, { resolve: true });

          // Process each host+path combination
          for (const host of Object.keys(confServer)) {
            if (filterHosts.length > 0 && !filterHosts.includes(host)) continue;

            for (const path of Object.keys(confServer[host])) {
              if (filterPaths.length > 0 && !filterPaths.includes(path)) continue;

              const { db, apis } = confServer[host][path];
              if (!db || !apis) continue;

              // Check if 'file' api is in the apis list
              if (!apis.includes('file')) {
                logger.info('Skipping - no file api in configuration', { host, path });
                continue;
              }

              // logger.info('Processing host+path with file api', { host, path, db: db.name });

              try {
                // Connect to database with retry
                let dbProvider;
                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    dbProvider = await DataBaseProviderService.load({ apis, host, path, db });
                    break;
                  } catch (err) {
                    if (attempt === 3) throw err;
                    logger.warn('Database connection failed, retrying...', { attempt, host, path, error: err.message });
                    await timer(3000);
                  }
                }
                if (!dbProvider || !dbProvider.models) {
                  logger.error('Failed to load database provider', { host, path });
                  continue;
                }

                const { models } = dbProvider;

                // Track this connection for cleanup
                connectionsToClose.push({ host, path, dbProvider });

                // Check if File model exists
                if (!models.File) {
                  logger.warn('File model not loaded', { host, path });
                  continue;
                }

                // Get all File documents
                const allFiles = await models.File.find({}, '_id').lean();
                logger.info('Found File documents', { count: allFiles.length, host, path });

                if (allFiles.length === 0) continue;

                // Track which File IDs are referenced
                const referencedFileIds = new Set();

                // Check each API from file.ref.json
                for (const refConfig of fileRefData) {
                  const { api, model: modelFields } = refConfig;

                  // Check if this API is loaded in current context
                  const modelName = api
                    .split('-')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join('');
                  const Model = models[modelName];

                  if (!Model) {
                    logger.debug('Model not loaded in current context', { api, modelName, host, path });
                    continue;
                  }

                  logger.info('Checking references in model', { api, modelName });

                  // Helper function to recursively check field references
                  const checkFieldReferences = async (fieldPath, fieldConfig) => {
                    for (const [fieldName, fieldValue] of Object.entries(fieldConfig)) {
                      const currentPath = fieldPath ? `${fieldPath}.${fieldName}` : fieldName;

                      if (fieldValue === true) {
                        // This is a File reference field
                        const query = {};
                        query[currentPath] = { $exists: true, $ne: null };

                        const docs = await Model.find(query, currentPath).lean();

                        for (const doc of docs) {
                          // Navigate to the nested field
                          const parts = currentPath.split('.');
                          let value = doc;
                          for (const part of parts) {
                            value = value?.[part];
                          }

                          if (value) {
                            if (Array.isArray(value)) {
                              value.forEach((id) => id && referencedFileIds.add(id.toString()));
                            } else {
                              referencedFileIds.add(value.toString());
                            }
                          }
                        }

                        logger.info('Found references', {
                          model: modelName,
                          field: currentPath,
                          count: docs.length,
                        });
                      } else if (typeof fieldValue === 'object') {
                        // Nested object, recurse
                        await checkFieldReferences(currentPath, fieldValue);
                      }
                    }
                  };

                  await checkFieldReferences('', modelFields);
                }

                logger.info('Total referenced File IDs', { count: referencedFileIds.size, host, path });

                // Find orphaned files
                const orphanedFiles = allFiles.filter((file) => !referencedFileIds.has(file._id.toString()));

                if (orphanedFiles.length === 0) {
                  logger.info('No orphaned files found', { host, path });
                } else {
                  logger.info('Found orphaned files', { count: orphanedFiles.length, host, path });

                  if (options.dryRun) {
                    logger.info('Dry run - would delete files', {
                      count: orphanedFiles.length,
                      ids: orphanedFiles.map((f) => f._id.toString()),
                    });
                  } else {
                    const orphanedIds = orphanedFiles.map((f) => f._id);
                    const deleteResult = await models.File.deleteMany({ _id: { $in: orphanedIds } });
                    logger.info('Deleted orphaned files', {
                      deletedCount: deleteResult.deletedCount,
                      host,
                      path,
                    });
                  }
                }
              } catch (error) {
                logger.error('Error processing host+path', {
                  host,
                  path,
                  error: error.message,
                });
              }
            }
          }
        }

        // Close all connections
        logger.info('Closing all database connections', { count: connectionsToClose.length });
        for (const { host, path, dbProvider } of connectionsToClose) {
          try {
            if (dbProvider && dbProvider.close) {
              await dbProvider.close();
              logger.info('Connection closed', { host, path });
            }
          } catch (error) {
            logger.error('Error closing connection', { host, path, error: error.message });
          }
        }

        logger.info('File collection cleanup completed');
      } catch (error) {
        logger.error('File collection cleanup failed', { error: error.message });
        throw error;
      }
    },

    /**
     * Gives every Document a unique `stableSlug` — its `/entry` and `/content` URL identity — on
     * each deployment that serves the document api. One-shot and idempotent: a document that has
     * a slug keeps it, so the command can be re-run after an interruption or on a replica that
     * already ran it. Runs outside the application so a large collection never gates startup.
     * @method migrateStableSlugs
     * @memberof UnderpostDB
     * @param {string} [deployList='dd'] - Comma-separated list of deployment IDs.
     * @param {Object} [options={}] - Migration options.
     * @param {string} [options.hosts=''] - Comma-separated list of hosts to filter.
     * @param {string} [options.paths=''] - Comma-separated list of paths to filter.
     * @param {boolean} [options.dev=false] - Read the development environment files.
     * @return {Promise<void>} Resolves when every selected deployment has been migrated.
     */
    async migrateStableSlugs(deployList = 'dd', options = { hosts: '', paths: '', dev: false }) {
      if (options.dev) process.env.NODE_ENV = 'development';
      loadCronDeployEnv();
      if (deployList === 'dd') deployList = readDeployRoutes().join(',');
      const filterHosts = options.hosts ? options.hosts.split(',').map((h) => h.trim()) : [];
      const filterPaths = options.paths ? options.paths.split(',').map((p) => p.trim()) : [];
      const connectionsToClose = [];
      try {
        for (const _deployId of deployList.split(',')) {
          const deployId = _deployId.trim();
          if (!deployId) continue;
          const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
          if (!fs.existsSync(confServerPath)) {
            logger.error('Configuration file not found', { path: confServerPath });
            continue;
          }
          const confServer = loadConfServerJson(confServerPath, { resolve: true });
          for (const host of Object.keys(confServer)) {
            if (filterHosts.length > 0 && !filterHosts.includes(host)) continue;
            for (const path of Object.keys(confServer[host])) {
              if (filterPaths.length > 0 && !filterPaths.includes(path)) continue;
              const { db, apis } = confServer[host][path];
              if (!db || !apis || !apis.includes('document')) continue;
              const dbProvider = await DataBaseProviderService.load({ apis, host, path, db });
              connectionsToClose.push({ host, path, dbProvider });
              const result = await dbProvider.models.Document.ensureStableSlugs();
              logger.info('Document stable slugs migrated', { deployId, host, path, ...result });
              if (result.remaining) logger.error('Documents still missing a stable slug', { host, path, ...result });
            }
          }
        }
      } finally {
        for (const { host, path, dbProvider } of connectionsToClose) {
          try {
            await dbProvider.close();
          } catch (error) {
            logger.error('Error closing connection', { host, path, error: error.message });
          }
        }
      }
    },

    /**
     * Handles backup of cluster metadata.
     * Orchestrates backup and restore operations for cluster metadata including
     * instances and cron jobs. Supports import/export and metadata generation.
     * @method clusterMetadataBackupCallback
     * @memberof UnderpostDB
     * @param {string} [deployId=process.env.DEFAULT_DEPLOY_ID] - The deployment ID.
     * @param {string} [host=process.env.DEFAULT_DEPLOY_HOST] - The host identifier.
     * @param {string} [path=process.env.DEFAULT_DEPLOY_PATH] - The path identifier.
     * @param {Object} [options={}] - Backup operation options.
     * @param {boolean} [options.generate=false] - Generate cluster metadata.
     * @param {boolean} [options.itc=false] - Execute in container context.
     * @param {boolean} [options.import=false] - Import metadata from backup.
     * @param {boolean} [options.export=false] - Export metadata to backup.
     * @param {boolean} [options.instances=false] - Process instances collection.
     * @param {boolean} [options.crons=false] - Process crons collection.
     * @param {boolean} [options.dev=false] - Development mode flag.
     * @return {Promise<void>} Resolves when backup operation is complete.
     */
    async clusterMetadataBackupCallback(
      deployId = process.env.DEFAULT_DEPLOY_ID,
      host = process.env.DEFAULT_DEPLOY_HOST,
      path = process.env.DEFAULT_DEPLOY_PATH,
      options = {
        generate: false,
        itc: false,
        import: false,
        export: false,
        instances: false,
        crons: false,
        dev: false,
      },
    ) {
      try {
        loadCronDeployEnv();
        deployId = deployId ? deployId : process.env.DEFAULT_DEPLOY_ID;
        host = host ? host : process.env.DEFAULT_DEPLOY_HOST;
        path = path ? path : process.env.DEFAULT_DEPLOY_PATH;

        logger.info('Starting cluster metadata backup operation', {
          deployId,
          host,
          path,
          options,
        });

        if (options.generate === true) {
          logger.info('Generating cluster metadata');
          await Underpost.db.clusterMetadataFactory(deployId, host, path);
        }

        if (options.instances === true) {
          const outputPath = './engine-private/instances';
          if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
          }
          const collection = 'instances';

          if (options.export === true) {
            logger.info('Exporting instances collection', { outputPath });
            shellExec(
              `node bin db --export --primary-pod --collections ${collection} --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
            );
          }

          if (options.import === true) {
            logger.info('Importing instances collection', { outputPath });
            shellExec(
              `node bin db --import --primary-pod --drop --preserveUUID --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
            );
          }
        }

        if (options.crons === true) {
          const outputPath = './engine-private/crons';
          if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
          }
          const collection = 'crons';

          if (options.export === true) {
            logger.info('Exporting crons collection', { outputPath });
            shellExec(
              `node bin db --export --primary-pod --collections ${collection} --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
            );
          }

          if (options.import === true) {
            logger.info('Importing crons collection', { outputPath });
            shellExec(
              `node bin db --import --primary-pod --drop --preserveUUID --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
            );
          }
        }

        logger.info('Cluster metadata backup operation completed');
      } catch (error) {
        logger.error('Cluster metadata backup operation failed', { error: error.message });
        throw error;
      }
    },
  };
}

export default UnderpostDB;
