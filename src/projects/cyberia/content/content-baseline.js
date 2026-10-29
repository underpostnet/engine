/**
 * Production content baselines: what the active release served at one time, for review on a
 * development host. Git never carries them: a baseline is a backup of the `content-baseline`
 * profile in the object store (`src/server/storage/backup.js`).
 *
 * A baseline holds what `content-release export-live` reads, and no more:
 * - `release-db`: the archive of the active release database.
 * - `ledger`: the ledger row of the active release.
 * - `files`: the File documents of the runtime database the release content references.
 * - `owned`: the CIDs player stacks hold, and nothing else of a player.
 *
 * Consistency: the `dbHash` of the release database on the primary, read before and after every
 * stream. Equal hashes prove that no content write landed in the window; a capture that sees a
 * write fails and starts again.
 *
 * @module src/projects/cyberia/content/content-baseline.js
 * @namespace CyberiaContentBaseline
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import Underpost from '../../../index.js';
import { loggerFactory } from '../../../server/ops/logger.js';
import { MongooseDB } from '../../../db/mongo/MongooseDB.js';
import {
  backupKeyMaterial,
  listBackups,
  readBackupManifest,
  readBackupStream,
  writeBackup,
} from '../../../server/storage/backup.js';
import { mongoArchiveTap, restoreMongoArchive } from '../../../server/storage/mongo-archive.js';
import { ownedCids } from '../catalog/global-content.js';
import { liveChanges } from './content-release.js';

const logger = loggerFactory(import.meta);
const { BSON } = mongoose.mongo;

/** The backup profile of a content baseline. */
export const BASELINE_PROFILE = 'content-baseline';

/** The baseline schema this engine writes and reads, in `meta.schema`. */
export const BASELINE_SCHEMA_VERSION = 1;

/** The streams of a baseline. */
export const BASELINE_STREAMS = Object.freeze({
  release: 'release-db',
  ledger: 'ledger',
  files: 'files',
  owned: 'owned',
});

/** The file each stream takes in a downloaded baseline. */
const LOCAL_FILES = Object.freeze({
  [BASELINE_STREAMS.release]: 'release-db.archive.gz',
  [BASELINE_STREAMS.ledger]: 'ledger.bson.gz',
  [BASELINE_STREAMS.files]: 'files.bson.gz',
  [BASELINE_STREAMS.owned]: 'owned.json',
});

/** The fields through which each API references a File document. */
const FILE_REFERENCES = JSON.parse(
  fs.readFileSync(new URL('../../../api/file/file.ref.json', import.meta.url), 'utf8'),
);

/** The field paths of a `file.ref.json` model entry. */
const referencePaths = (model, prefix = '') =>
  Object.entries(model).flatMap(([name, value]) =>
    value === true ? [`${prefix}${name}`] : typeof value === 'object' ? referencePaths(value, `${prefix}${name}.`) : [],
  );

/**
 * The ids of the File documents the content of a database references, through the APIs of the
 * content partition that `file.ref.json` declares. A driver read: the database is never written.
 * @param {Object} params
 * @param {import('mongoose').Connection} params.connection
 * @param {string} params.database - The release database.
 * @param {string[]} params.apis - The APIs of the content partition.
 * @returns {Promise<import('mongodb').ObjectId[]>}
 * @memberof CyberiaContentBaseline
 */
export async function referencedFileIds({ connection, database, apis }) {
  const ids = new Map();
  const store = connection.getClient().db(database);
  for (const { api, model } of FILE_REFERENCES) {
    if (!apis.includes(api)) continue;
    const collection = store.collection(await MongooseDB.collectionName(api));
    for (const field of referencePaths(model))
      for (const id of await collection.distinct(field)) if (id instanceof BSON.ObjectId) ids.set(id.toHexString(), id);
  }
  return [...ids.values()];
}

/** The documents a filter selects, as raw BSON. */
async function* rawDocuments(collection, filter) {
  for await (const raw of collection.find(filter, { raw: true })) yield raw;
}

/** Concatenated BSON documents, from a gzip stream. */
export async function* bsonDocuments(source) {
  let buffer = Buffer.alloc(0);
  for await (const chunk of Readable.from(source).pipe(zlib.createGunzip())) {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    while (buffer.length >= 4 && buffer.length >= buffer.readInt32LE(0)) {
      const size = buffer.readInt32LE(0);
      yield buffer.subarray(0, size);
      buffer = buffer.subarray(size);
    }
  }
  if (buffer.length) throw new Error('A BSON stream ends inside a document');
}

const gzipOf = (iterable) => Readable.from(iterable).pipe(zlib.createGzip());

/**
 * Captures a baseline of the release the production host serves. Runs on the control host: the
 * dump runs in a client pod, the projections through this process's connection.
 * @param {Object} params
 * @param {string} params.deployId
 * @param {string} params.namespace
 * @param {Object} params.context - The release context of the host: `models`, `connection`, `host`,
 *   `path`, `consumes`, `db`.
 * @param {Object} params.entry - The host's database in {@link UnderpostDB.API.databasePlan}.
 * @param {string[]} params.apis - The APIs of the content partition.
 * @param {Object} [params.store] - The object store.
 * @param {number} [params.attempts=3] - Captures tried while content writes land in the window.
 * @returns {Promise<Object>} The manifest.
 * @throws {Error} When no release is active, or content keeps changing.
 * @memberof CyberiaContentBaseline
 */
export async function captureContentBaseline({ deployId, namespace, context, entry, apis, store, attempts = 3 }) {
  const { models, connection } = context;
  const release = await models.CyberiaContentRelease.active();
  if (!release) throw new Error('No release is active: production serves the workspace, which a baseline never reads');
  const live = await liveChanges({ CyberiaContentRelease: models.CyberiaContentRelease, connection });
  const keyMaterial = backupKeyMaterial();
  const client = await Underpost.db.openMongoClient({ deployId, namespace, databases: [entry] });
  const principal = client.principal(entry);
  const replicaSetId = Underpost.db.mongoReplicaSetId(client, principal);
  if (!replicaSetId) throw new Error('The replica set reports no identity: a restore could not tell production apart');
  try {
    for (let attempt = 1; ; attempt++) {
      const before = Underpost.db.mongoDbHash({ client, principal, database: release.database });
      const fileIds = await referencedFileIds({ connection, database: release.database, apis });
      const owned = (await ownedCids({ host: context.host, path: context.path })).sort();
      const capturedAt = new Date();
      try {
        return await writeBackup({
          store,
          deployId,
          profile: BASELINE_PROFILE,
          keyMaterial,
          source: {
            environment: 'production',
            namespace,
            mongodb: { replicaSetId, members: client.hosts, clientImage: client.image },
            engineVersion: Underpost.version,
          },
          meta: {
            schema: BASELINE_SCHEMA_VERSION,
            capturedAt,
            release: {
              releaseId: release.releaseId,
              database: release.database,
              source: release.source,
              sources: release.sources,
              content: release.content,
              provenance: release.provenance,
              fingerprint: release.fingerprint,
              generation: release.generation ?? 1,
              promotedAt: release.promotedAt,
            },
            liveChanges: { known: live.known, changed: live.changed },
            dependencies: release.dependencies ?? [],
            scope: {
              database: release.database,
              files: fileIds.length,
              owned: owned.length,
              collections: {
                ledger: models.CyberiaContentRelease.collection.collectionName,
                files: models.File.collection.collectionName,
              },
            },
          },
          streams: [
            {
              name: BASELINE_STREAMS.release,
              kind: 'mongodb',
              describe: {
                database: release.database,
                tool: 'mongodump',
                format: 'mongodump-archive+gzip',
                readPreference: 'primary',
              },
              open: async () =>
                Underpost.db.mongoDumpSource({
                  client,
                  principal,
                  database: release.database,
                  readPreference: 'primary',
                }),
              tap: mongoArchiveTap,
            },
            {
              name: BASELINE_STREAMS.ledger,
              kind: 'bson',
              describe: { format: 'bson+gzip' },
              open: async () =>
                gzipOf(rawDocuments(models.CyberiaContentRelease.collection, { releaseId: release.releaseId })),
            },
            {
              name: BASELINE_STREAMS.files,
              kind: 'bson',
              describe: { format: 'bson+gzip', documents: fileIds.length },
              open: async () => gzipOf(rawDocuments(models.File.collection, { _id: { $in: fileIds } })),
            },
            {
              name: BASELINE_STREAMS.owned,
              kind: 'json',
              describe: { format: 'json', cids: owned.length },
              open: async () => Readable.from([Buffer.from(JSON.stringify(owned))]),
            },
          ],
          beforeCommit: async () => {
            const after = Underpost.db.mongoDbHash({ client, principal, database: release.database });
            if (after !== before)
              throw Object.assign(new Error(`${release.database} changed while the baseline was captured`), {
                contentChanged: true,
              });
            return {
              consistency: {
                pointInTime: true,
                mechanism: 'dbHash',
                member: 'primary',
                scope: `${release.database}; the Files and the owned CIDs are read inside the same window`,
                before,
                after,
              },
            };
          },
        });
      } catch (error) {
        if (!error.contentChanged || attempt >= attempts) throw error;
        logger.warn(`Content changed during capture ${attempt} of ${attempts}; capturing again`);
      }
    }
  } finally {
    client.pod.remove();
  }
}

/**
 * The baselines of a deployment, newest first, with the release each one captured.
 * @param {{store?:Object, deployId:string}} params
 * @returns {Promise<Object[]>}
 * @memberof CyberiaContentBaseline
 */
export async function listContentBaselines({ store, deployId }) {
  return await listBackups({ store, deployId, profile: BASELINE_PROFILE });
}

/**
 * The manifest of one baseline, checked for the baseline schema.
 * @param {{store?:Object, deployId:string, backupId:string}} params
 * @returns {Promise<Object>}
 * @memberof CyberiaContentBaseline
 */
export async function readContentBaseline({ store, deployId, backupId }) {
  const manifest = await readBackupManifest({ store, deployId, profile: BASELINE_PROFILE, backupId });
  if (manifest.meta?.schema !== BASELINE_SCHEMA_VERSION)
    throw new Error(
      `Baseline ${backupId} has schema ${manifest.meta?.schema}; this engine reads ${BASELINE_SCHEMA_VERSION}`,
    );
  return manifest;
}

/**
 * Where a development host keeps the baselines it downloaded: plaintext, outside every repository.
 * @param {string} deployId
 * @param {string} backupId
 * @returns {string}
 * @memberof CyberiaContentBaseline
 */
export const baselineCacheDir = (deployId, backupId) =>
  path.join(
    process.env.UNDERPOST_BASELINE_CACHE || path.join(os.homedir(), '.cache', 'underpost', 'content-baselines'),
    deployId,
    backupId,
  );

const sha256File = async (file) => {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};

/**
 * A downloaded baseline: its manifest, every stream file checked against it.
 * @param {string} dir - {@link baselineCacheDir}.
 * @returns {Promise<{dir:string, manifest:Object, file:(stream:string) => string}>}
 * @throws {Error} When a file is missing or altered.
 * @memberof CyberiaContentBaseline
 */
export async function openLocalBaseline(dir) {
  const manifestFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`No downloaded baseline at ${dir}`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const file = (stream) => path.join(dir, LOCAL_FILES[stream]);
  for (const entry of manifest.streams) {
    if (!fs.existsSync(file(entry.name)) || (await sha256File(file(entry.name))) !== entry.plain.sha256)
      throw new Error(`${file(entry.name)} is missing or altered: download baseline ${manifest.backupId} again`);
  }
  return { dir, manifest, file };
}

/**
 * Downloads a baseline: every stream read, checked and opened, then written to the cache. The
 * manifest goes last, so an interrupted download reads as absent. A complete download is reused.
 * @param {{store?:Object, deployId:string, backupId:string, keyMaterial?:Object}} params
 * @returns {Promise<{dir:string, manifest:Object, file:(stream:string) => string, downloaded:boolean}>}
 * @memberof CyberiaContentBaseline
 */
export async function downloadContentBaseline({ store, deployId, backupId, keyMaterial = backupKeyMaterial() }) {
  const dir = baselineCacheDir(deployId, backupId);
  try {
    return { ...(await openLocalBaseline(dir)), downloaded: false };
  } catch {
    // Absent or altered: download it whole again.
  }
  const manifest = await readContentBaseline({ store, deployId, backupId });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const entry of manifest.streams) {
    const target = path.join(dir, LOCAL_FILES[entry.name]);
    await pipeline(
      Readable.from(readBackupStream({ store, manifest, name: entry.name, keyMaterial })),
      fs.createWriteStream(`${target}.part`, { mode: 0o600 }),
    );
    fs.renameSync(`${target}.part`, target);
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return { ...(await openLocalBaseline(dir)), downloaded: true };
}

/**
 * Refuses a restore target that is the replica set a baseline was captured from: a restore never
 * writes to production. A standalone server holds no replica set identity and can never be it.
 * @param {{client:import('mongodb').MongoClient, manifest:Object}} params
 * @returns {Promise<string>} The identity of the target replica set, or '' for a standalone server.
 * @throws {Error} When the target is the source, or the source recorded no identity.
 * @memberof CyberiaContentBaseline
 */
export async function assertDevelopmentTarget({ client, manifest }) {
  const source = manifest.source?.mongodb?.replicaSetId;
  if (!source) throw new Error(`Baseline ${manifest.backupId} records no replica set identity: capture it again`);
  let target = '';
  try {
    target =
      (await client.db('admin').command({ replSetGetConfig: 1 })).config?.settings?.replicaSetId?.toHexString() ?? '';
  } catch (error) {
    if (error?.codeName !== 'NoReplicationEnabled') throw error;
  }
  if (target === source)
    throw new Error(
      `Refused: the target is replica set ${source}, the one baseline ${manifest.backupId} was captured from`,
    );
  return target;
}

/**
 * Restores a downloaded baseline into a development host: the release database under its local
 * name, the referenced Files into the runtime database (by id, nothing else touched), and the
 * ledger row as a validated release of that local database when the ledger lacks it.
 * @param {Object} params
 * @param {import('mongodb').MongoClient} params.client - The development server.
 * @param {Awaited<ReturnType<typeof openLocalBaseline>>} params.baseline
 * @param {string} params.runtimeDatabase - The local runtime database.
 * @param {string} params.releaseDatabase - The local database of the release.
 * @returns {Promise<{collections:Object<string,number>, files:number, ledger:boolean}>}
 * @memberof CyberiaContentBaseline
 */
export async function restoreContentBaseline({ client, baseline, runtimeDatabase, releaseDatabase }) {
  const { manifest, file } = baseline;
  const { release, scope } = manifest.meta;
  // Only the database of this release is replaced: its name ends with the release id.
  if (!releaseDatabase.endsWith(`-${release.releaseId}`))
    throw new Error(`${releaseDatabase} is not the database of release ${release.releaseId}`);
  await client.db(releaseDatabase).dropDatabase();
  const { restored } = await restoreMongoArchive({
    client,
    source: fs.createReadStream(file(BASELINE_STREAMS.release)),
    target: (db) => (db === release.database ? releaseDatabase : null),
  });

  const files = client.db(runtimeDatabase).collection(scope.collections.files);
  let fileCount = 0;
  let batch = [];
  const flush = async () => {
    if (batch.length) await files.bulkWrite(batch, { ordered: false });
    fileCount += batch.length;
    batch = [];
  };
  for await (const raw of bsonDocuments(fs.createReadStream(file(BASELINE_STREAMS.files)))) {
    const doc = BSON.deserialize(raw, { promoteValues: false });
    batch.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
    if (batch.length >= 200) await flush();
  }
  await flush();

  const ledger = client.db(runtimeDatabase).collection(scope.collections.ledger);
  let inserted = false;
  for await (const raw of bsonDocuments(fs.createReadStream(file(BASELINE_STREAMS.ledger)))) {
    const { _id, lease, ...row } = BSON.deserialize(raw, { promoteValues: false });
    const result = await ledger.updateOne(
      { releaseId: row.releaseId },
      { $setOnInsert: { ...row, database: releaseDatabase, status: 'validated', promotedAt: null, retiredAt: null } },
      { upsert: true },
    );
    inserted = inserted || result.upsertedCount === 1;
  }
  fs.writeFileSync(
    path.join(baseline.dir, 'restored.json'),
    JSON.stringify(
      { at: new Date(), releaseDatabase, runtimeDatabase, files: fileCount, collections: restored },
      null,
      2,
    ),
  );
  return { collections: restored, files: fileCount, ledger: inserted };
}

/**
 * The CIDs player stacks held when the baseline was captured.
 * @param {Awaited<ReturnType<typeof openLocalBaseline>>} baseline
 * @returns {string[]}
 * @memberof CyberiaContentBaseline
 */
export const baselineOwnedCids = (baseline) =>
  JSON.parse(fs.readFileSync(baseline.file(BASELINE_STREAMS.owned), 'utf8'));

/**
 * The ids of the File documents a baseline carries.
 * @param {Awaited<ReturnType<typeof openLocalBaseline>>} baseline
 * @returns {Promise<import('mongodb').ObjectId[]>}
 * @memberof CyberiaContentBaseline
 */
export async function baselineFileIds(baseline) {
  const ids = [];
  for await (const raw of bsonDocuments(fs.createReadStream(baseline.file(BASELINE_STREAMS.files))))
    ids.push(BSON.deserialize(raw, { promoteValues: false })._id);
  return ids;
}
