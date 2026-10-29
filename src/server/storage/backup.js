/**
 * Backups of deployment data in the object store. No Git operation takes part.
 *
 * A backup is a set of named streams: a database dump, a projection, a file tree. Each stream is
 * cut into fixed parts, each part sealed with AES-256-GCM and stored as one object. The manifest
 * is stored last and is the commit point: a backup without a manifest is never available. A backup
 * that fails stores `failure.json` and removes its parts, so it reads as failed, never as partial.
 *
 * Layout under {@link BACKUP_ROOT}:
 *
 *     <deploy-id>/<profile>/<backup-id>/manifest.json
 *     <deploy-id>/<profile>/<backup-id>/failure.json
 *     <deploy-id>/<profile>/<backup-id>/verifications/<checked-at>.json
 *     <deploy-id>/<profile>/<backup-id>/parts/<stream>/<sequence>
 *
 * The manifest names every part with its size and SHA-256, and every stream with the SHA-256 of its
 * plaintext, so a light verification reads only the object listing and a deep one proves every byte.
 * `UNDERPOST_BACKUP_KEY` holds the 32-byte key, base64 or hex. The manifest records its key id,
 * never the key.
 *
 * @module src/server/storage/backup.js
 * @namespace UnderpostBackup
 */

import crypto from 'node:crypto';
import nodePath from 'node:path';
import { Readable } from 'node:stream';
import fs from 'fs-extra';
import { loggerFactory } from '../ops/logger.js';
import Underpost from '../../index.js';
import { loadCronDeployEnv } from '../ops/cron.js';
import { UNDERPOST_MONITORING } from '../ops/monitoring.js';
import { readDeployRoutes } from '../network/router.js';
import { objectStore } from './object-store.js';

const logger = loggerFactory(import.meta);

/** The key prefix of every backup. */
export const BACKUP_ROOT = 'underpost/backups';

/** The manifest schema this engine writes and reads. */
export const BACKUP_SCHEMA_VERSION = 1;

/** Plaintext bytes per part: under the 10 MB raw file limit of the smallest Cloudinary plan. */
export const BACKUP_PART_BYTES = Number(process.env.UNDERPOST_BACKUP_PART_BYTES || 8 * 1024 * 1024);

/** Parts in flight to the store at once, per stream. */
const UPLOAD_CONCURRENCY = Math.max(1, Number(process.env.UNDERPOST_BACKUP_UPLOAD_CONCURRENCY || 2));

/** The retention a backup profile takes unless its caller names one. */
export const BACKUP_RETENTION = Object.freeze({
  keep: Number(process.env.UNDERPOST_BACKUP_KEEP || 7),
  maxAgeDays: Number(process.env.UNDERPOST_BACKUP_MAX_AGE_DAYS || 30),
  graceHours: Number(process.env.UNDERPOST_BACKUP_GRACE_HOURS || 24),
});

const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;
const BACKUP_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{6}$/;
const CIPHER = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const segment = (name, value) => {
  if (typeof value !== 'string' || !SEGMENT_PATTERN.test(value))
    throw new Error(`Invalid backup ${name}: ${JSON.stringify(value)}`);
  return value;
};

/**
 * A new backup id: the UTC second it starts and six random hex digits. Ids sort by time.
 * @param {Date} [now=new Date()]
 * @returns {string} Such as `20261029T101500Z-a1b2c3`.
 * @memberof UnderpostBackup
 */
export const backupIdFactory = (now = new Date()) =>
  `${now
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '')}-${crypto.randomBytes(3).toString('hex')}`;

/**
 * Checks a backup id.
 * @param {string} backupId
 * @returns {string}
 * @memberof UnderpostBackup
 */
export const assertBackupId = (backupId) => {
  if (!BACKUP_ID_PATTERN.test(backupId ?? '')) throw new Error(`Invalid backup id: ${JSON.stringify(backupId)}`);
  return backupId;
};

/**
 * The key prefix of a profile of a deployment, or of one backup in it.
 * @param {{deployId:string, profile:string, backupId?:string}} params
 * @returns {string} Ends with `/`.
 * @memberof UnderpostBackup
 */
export const backupPrefix = ({ deployId, profile, backupId }) =>
  `${BACKUP_ROOT}/${segment('deploy id', deployId)}/${segment('profile', profile)}/${backupId ? `${assertBackupId(backupId)}/` : ''}`;

/**
 * The backup key and its id.
 * @param {string} [value=process.env.UNDERPOST_BACKUP_KEY] - 32 bytes, base64 or hex.
 * @returns {{key:Buffer, keyId:string}}
 * @throws {Error} When the key is missing or not 32 bytes.
 * @memberof UnderpostBackup
 */
export function backupKeyMaterial(value = process.env.UNDERPOST_BACKUP_KEY) {
  if (!value)
    throw new Error('Set UNDERPOST_BACKUP_KEY to a 32-byte key, base64 or hex: a backup leaves this host sealed');
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('UNDERPOST_BACKUP_KEY must decode to 32 bytes');
  return { key, keyId: sha256(Buffer.concat([Buffer.from('underpost-backup-key:'), key])).slice(0, 16) };
}

/**
 * Seals one part: `iv | ciphertext | tag`. The additional data binds the part to its place.
 * @param {{key:Buffer, aad:string, bytes:Buffer}} params
 * @returns {Buffer}
 * @memberof UnderpostBackup
 */
export function sealPart({ key, aad, bytes }) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(CIPHER, key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
}

/**
 * Opens one sealed part.
 * @param {{key:Buffer, aad:string, sealed:Buffer}} params
 * @returns {Buffer}
 * @throws {Error} When the part, its place or the key is not the one it was sealed with.
 * @memberof UnderpostBackup
 */
export function openPart({ key, aad, sealed }) {
  if (sealed.length < IV_BYTES + TAG_BYTES) throw new Error(`Sealed part ${aad} is truncated`);
  const decipher = crypto.createDecipheriv(CIPHER, key, sealed.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES)), decipher.final()]);
  } catch {
    throw new Error(`Sealed part ${aad} does not open with this key: altered, moved or sealed with another key`);
  }
}

/**
 * Cuts a byte stream into parts of `size` bytes; the last part may be shorter.
 * @param {AsyncIterable<Buffer|string>} source
 * @param {number} size
 * @returns {AsyncGenerator<Buffer>}
 * @memberof UnderpostBackup
 */
export async function* fixedParts(source, size) {
  let pending = [];
  let length = 0;
  for await (const chunk of source) {
    let buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    while (length + buffer.length >= size) {
      const take = size - length;
      pending.push(buffer.subarray(0, take));
      yield Buffer.concat(pending);
      buffer = buffer.subarray(take);
      pending = [];
      length = 0;
    }
    if (buffer.length) {
      pending.push(buffer);
      length += buffer.length;
    }
  }
  if (length) yield Buffer.concat(pending);
}

const partKey = (prefix, stream, sequence) => `${prefix}parts/${stream}/${String(sequence).padStart(6, '0')}`;
const partAad = (backupId, stream, sequence) => `${backupId}/${stream}/${sequence}`;

/**
 * Writes one stream as sealed parts, with bounded uploads in flight.
 * @returns {Promise<Object>} The stream entry of the manifest.
 */
async function writeStream({ store, prefix, backupId, keyMaterial, stream, uploaded }) {
  const startedAt = new Date();
  const hash = crypto.createHash('sha256');
  const tap = stream.tap?.() ?? null;
  const parts = [];
  const inFlight = new Set();
  let bytes = 0;
  let sequence = 0;
  const source = await stream.open();
  try {
    for await (const plain of fixedParts(source, BACKUP_PART_BYTES)) {
      sequence++;
      hash.update(plain);
      bytes += plain.length;
      await tap?.write(plain);
      const sealed = sealPart({ key: keyMaterial.key, aad: partAad(backupId, stream.name, sequence), bytes: plain });
      const part = {
        sequence,
        key: partKey(prefix, stream.name, sequence),
        bytes: sealed.length,
        sha256: sha256(sealed),
      };
      parts.push({ ...part, plainBytes: plain.length });
      const upload = store.put(part.key, sealed).then(() => uploaded.push(part.key));
      inFlight.add(upload);
      upload.then(
        () => inFlight.delete(upload),
        () => inFlight.delete(upload),
      );
      if (inFlight.size >= UPLOAD_CONCURRENCY) await Promise.race(inFlight);
    }
    await Promise.all(inFlight);
    await source.done?.();
  } catch (error) {
    await Promise.allSettled(inFlight);
    source.destroy?.(error);
    throw error;
  }
  const inventory = (await tap?.end()) ?? null;
  return {
    name: stream.name,
    kind: stream.kind,
    ...(stream.describe ?? {}),
    plain: { bytes, sha256: hash.digest('hex') },
    parts,
    ...(inventory ? { inventory } : {}),
    startedAt,
    completedAt: new Date(),
  };
}

/**
 * Writes one backup: every stream, then the manifest. A failure stores `failure.json` and removes
 * the parts already stored.
 * @param {Object} params
 * @param {Object} [params.store] - {@link objectStore}.
 * @param {string} params.deployId
 * @param {string} params.profile - Such as `dr` or `content-baseline`.
 * @param {Object} [params.source] - Where the data comes from: environment, topology, tool versions.
 * @param {Array<{name:string, kind:string, describe?:Object, open:() => Promise<AsyncIterable<Buffer>>,
 *   tap?:() => {write:(chunk:Buffer) => void, end:() => Promise<Object>}}>} params.streams
 *   One entry per stream. `open` returns the plaintext; an optional `done()` on it resolves when the
 *   producer exited cleanly. `tap` observes the plaintext and returns the stream inventory.
 * @param {Object} [params.meta] - What the profile records beside the streams.
 * @param {{key:Buffer, keyId:string}} [params.keyMaterial] - {@link backupKeyMaterial}.
 * @param {number} [params.maxAgeDays] - Retention; the manifest records the expiry.
 * @param {() => Promise<Object>} [params.beforeCommit] - Runs after every stream is stored, before the
 *   manifest: what it returns joins `meta`, and a throw fails the backup.
 * @returns {Promise<Object>} The manifest.
 * @memberof UnderpostBackup
 */
export async function writeBackup({
  store = objectStore(),
  deployId,
  profile,
  source = {},
  streams,
  meta = {},
  keyMaterial = backupKeyMaterial(),
  maxAgeDays = BACKUP_RETENTION.maxAgeDays,
  beforeCommit,
}) {
  const backupId = backupIdFactory();
  const prefix = backupPrefix({ deployId, profile, backupId });
  const names = streams.map(({ name }) => segment('stream name', name));
  if (new Set(names).size !== names.length) throw new Error(`Stream names repeat in backup ${backupId}`);
  const createdAt = new Date();
  const uploaded = [];
  const written = [];
  logger.info('Backup started', { deployId, profile, backupId, streams: names, store: store.location });
  let stage = 'stream';
  try {
    for (const stream of streams) {
      const entry = await writeStream({ store, prefix, backupId, keyMaterial, stream, uploaded });
      written.push(entry);
      logger.info('Backup stream stored', {
        backupId,
        stream: entry.name,
        parts: entry.parts.length,
        bytes: entry.plain.bytes,
      });
    }
    stage = 'listing';
    const listed = new Map((await store.list(`${prefix}parts/`)).map(({ key, bytes }) => [key, bytes]));
    for (const part of written.flatMap(({ parts }) => parts))
      if (listed.get(part.key) !== part.bytes)
        throw new Error(`The store lists ${part.key} with ${listed.get(part.key) ?? 'no'} bytes, ${part.bytes} stored`);
    stage = 'consistency';
    const committed = { ...meta, ...((await beforeCommit?.()) ?? {}) };
    stage = 'manifest';
    const completedAt = new Date();
    const manifest = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      backupId,
      deployId,
      profile,
      status: 'available',
      source,
      store: { driver: store.driver, location: store.location },
      encryption: { algorithm: CIPHER, keyId: keyMaterial.keyId, partBytes: BACKUP_PART_BYTES },
      streams: written,
      totals: {
        streams: written.length,
        parts: written.reduce((sum, { parts }) => sum + parts.length, 0),
        bytes: written.reduce((sum, { parts }) => sum + parts.reduce((total, part) => total + part.bytes, 0), 0),
        plainBytes: written.reduce((sum, { plain }) => sum + plain.bytes, 0),
      },
      createdAt,
      completedAt,
      durationMs: completedAt - createdAt,
      retention: { maxAgeDays, expiresAt: new Date(createdAt.getTime() + maxAgeDays * 86400000) },
      meta: committed,
    };
    await store.put(`${prefix}manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)));
    logger.info('Backup available', {
      deployId,
      profile,
      backupId,
      ...manifest.totals,
      durationMs: manifest.durationMs,
    });
    return manifest;
  } catch (error) {
    logger.error('Backup failed', { deployId, profile, backupId, stage, error: error.message });
    const failure = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      backupId,
      deployId,
      profile,
      status: 'failed',
      stage,
      error: String(error.message).slice(0, 2000),
      streams: written.map(({ name }) => name),
      createdAt,
      failedAt: new Date(),
    };
    await store
      .put(`${prefix}failure.json`, Buffer.from(JSON.stringify(failure, null, 2)))
      .catch((markError) => logger.error('Backup failure not recorded', { backupId, error: markError.message }));
    await store
      .remove(uploaded)
      .catch((removeError) =>
        logger.error('Parts of a failed backup remain', { backupId, error: removeError.message }),
      );
    throw error;
  }
}

/**
 * The backups of a profile, newest first, from one object listing.
 * @param {{store?:Object, deployId:string, profile:string}} params
 * @returns {Promise<Array<{backupId:string, status:'available'|'failed'|'incomplete', bytes:number,
 *   objects:number, createdAt:string, verified:boolean, keys:string[]}>>}
 * @memberof UnderpostBackup
 */
export async function listBackups({ store = objectStore(), deployId, profile }) {
  const prefix = backupPrefix({ deployId, profile });
  const backups = new Map();
  for (const object of await store.list(prefix)) {
    const [backupId, ...rest] = object.key.slice(prefix.length).split('/');
    if (!BACKUP_ID_PATTERN.test(backupId)) continue;
    const entry = backups.get(backupId) ?? {
      backupId,
      bytes: 0,
      objects: 0,
      keys: [],
      files: new Set(),
      createdAt: '',
    };
    entry.bytes += object.bytes ?? 0;
    entry.objects++;
    entry.keys.push(object.key);
    entry.files.add(rest[0]);
    if (!entry.createdAt || (object.createdAt && object.createdAt < entry.createdAt))
      entry.createdAt = object.createdAt;
    backups.set(backupId, entry);
  }
  return [...backups.values()]
    .map(({ files, ...entry }) => ({
      ...entry,
      status: files.has('manifest.json') ? 'available' : files.has('failure.json') ? 'failed' : 'incomplete',
      verified: files.has('verifications'),
    }))
    .sort((a, b) => b.backupId.localeCompare(a.backupId));
}

const readJson = async (store, key) => {
  const bytes = await store.get(key);
  return bytes ? JSON.parse(bytes.toString('utf8')) : null;
};

/**
 * The manifest of one backup.
 * @param {{store?:Object, deployId:string, profile:string, backupId:string}} params
 * @returns {Promise<Object>}
 * @throws {Error} When the backup is not available, or its manifest is not this one.
 * @memberof UnderpostBackup
 */
export async function readBackupManifest({ store = objectStore(), deployId, profile, backupId }) {
  const prefix = backupPrefix({ deployId, profile, backupId });
  const manifest = await readJson(store, `${prefix}manifest.json`);
  if (!manifest) {
    const failure = await readJson(store, `${prefix}failure.json`);
    throw new Error(
      failure
        ? `Backup ${backupId} failed at ${failure.stage}: ${failure.error}`
        : `Backup ${backupId} of ${deployId}/${profile} is not available`,
    );
  }
  if (manifest.schemaVersion !== BACKUP_SCHEMA_VERSION)
    throw new Error(
      `Backup ${backupId} has schema ${manifest.schemaVersion}; this engine reads ${BACKUP_SCHEMA_VERSION}`,
    );
  if (manifest.backupId !== backupId || manifest.deployId !== deployId || manifest.profile !== profile)
    throw new Error(`The manifest under ${prefix} names another backup`);
  return manifest;
}

/**
 * The manifest of the newest available backup of a profile, or null.
 * @param {{store?:Object, deployId:string, profile:string}} params
 * @returns {Promise<Object|null>}
 * @memberof UnderpostBackup
 */
export async function latestBackup({ store = objectStore(), deployId, profile }) {
  const available = (await listBackups({ store, deployId, profile })).find(({ status }) => status === 'available');
  return available ? await readBackupManifest({ store, deployId, profile, backupId: available.backupId }) : null;
}

/**
 * The verification records of one backup, oldest first.
 * @param {{store?:Object, manifest:Object}} params
 * @returns {Promise<Object[]>}
 * @memberof UnderpostBackup
 */
export async function readVerifications({ store = objectStore(), manifest }) {
  const prefix = `${backupPrefix(manifest)}verifications/`;
  const records = [];
  for (const { key } of await store.list(prefix)) records.push(await readJson(store, key));
  return records.filter(Boolean);
}

/**
 * The plaintext of one stream, part by part. Each part is checked against the manifest, opened,
 * and the whole stream against its SHA-256. One part is fetched ahead.
 * @param {{store?:Object, manifest:Object, name:string, keyMaterial?:{key:Buffer,keyId:string}}} params
 * @returns {AsyncGenerator<Buffer>}
 * @throws {Error} On a missing, altered or foreign part, or another key.
 * @memberof UnderpostBackup
 */
export async function* readBackupStream({ store = objectStore(), manifest, name, keyMaterial = backupKeyMaterial() }) {
  const entry = manifest.streams.find((stream) => stream.name === name);
  if (!entry) throw new Error(`Backup ${manifest.backupId} holds no stream ${name}`);
  if (keyMaterial.keyId !== manifest.encryption.keyId)
    throw new Error(
      `Backup ${manifest.backupId} is sealed with key ${manifest.encryption.keyId}, not ${keyMaterial.keyId}`,
    );
  const fetchPart = async (part) => {
    const sealed = await store.get(part.key, { maxBytes: part.bytes });
    if (!sealed) throw new Error(`Part ${part.key} is missing`);
    if (sealed.length !== part.bytes || sha256(sealed) !== part.sha256) throw new Error(`Part ${part.key} is altered`);
    return sealed;
  };
  const hash = crypto.createHash('sha256');
  let next = entry.parts.length ? fetchPart(entry.parts[0]) : null;
  for (let index = 0; index < entry.parts.length; index++) {
    const part = entry.parts[index];
    const sealed = await next;
    next = index + 1 < entry.parts.length ? fetchPart(entry.parts[index + 1]) : null;
    next?.catch(() => {});
    const plain = openPart({ key: keyMaterial.key, aad: partAad(manifest.backupId, name, part.sequence), sealed });
    if (plain.length !== part.plainBytes) throw new Error(`Part ${part.key} opens to ${plain.length} bytes`);
    hash.update(plain);
    yield plain;
  }
  if (hash.digest('hex') !== entry.plain.sha256) throw new Error(`Stream ${name} of ${manifest.backupId} is altered`);
}

/**
 * {@link readBackupStream} as a Node stream, to pipe into a restore.
 * @param {Object} params - As {@link readBackupStream}.
 * @returns {Readable}
 * @memberof UnderpostBackup
 */
export const backupStreamReadable = (params) => Readable.from(readBackupStream(params), { objectMode: false });

/**
 * Verifies a backup. Light: the store lists every part with its size. Deep: every part is read,
 * checked, opened, and every stream matches its SHA-256; `inspect` may compare its inventory.
 * @param {Object} params
 * @param {Object} [params.store]
 * @param {Object} params.manifest
 * @param {boolean} [params.deep=false]
 * @param {{key:Buffer,keyId:string}} [params.keyMaterial]
 * @param {(entry:Object, plaintext:AsyncIterable<Buffer>) => Promise<string[]>} [params.inspect] -
 *   Reads one stream and returns its defects.
 * @returns {Promise<{backupId:string, ok:boolean, deep:boolean, checkedAt:Date, durationMs:number,
 *   checks:Array<{name:string, ok:boolean, detail:string}>}>}
 * @memberof UnderpostBackup
 */
export async function verifyBackup({ store = objectStore(), manifest, deep = false, keyMaterial, inspect }) {
  const started = Date.now();
  const checks = [];
  const listed = new Map((await store.list(`${backupPrefix(manifest)}parts/`)).map(({ key, bytes }) => [key, bytes]));
  for (const entry of manifest.streams) {
    const missing = entry.parts.filter((part) => listed.get(part.key) !== part.bytes);
    checks.push({
      name: `${entry.name}: parts`,
      ok: missing.length === 0,
      detail: missing.length
        ? `${missing.length} of ${entry.parts.length} part(s) missing or resized`
        : `${entry.parts.length} part(s)`,
    });
  }
  if (deep) {
    const material = keyMaterial ?? backupKeyMaterial();
    for (const entry of manifest.streams) {
      try {
        const plaintext = readBackupStream({ store, manifest, name: entry.name, keyMaterial: material });
        const defects = inspect ? await inspect(entry, plaintext) : await drain(plaintext);
        checks.push({
          name: `${entry.name}: content`,
          ok: defects.length === 0,
          detail: defects.join('; ') || 'intact',
        });
      } catch (error) {
        checks.push({ name: `${entry.name}: content`, ok: false, detail: error.message });
      }
    }
  }
  return {
    backupId: manifest.backupId,
    ok: checks.every(({ ok }) => ok),
    deep,
    checkedAt: new Date(),
    durationMs: Date.now() - started,
    checks,
  };
}

const drain = async (plaintext) => {
  for await (const _ of plaintext);
  return [];
};

/**
 * Stores a verification report beside the manifest, which stays as it was written.
 * @param {{store?:Object, manifest:Object, report:Object}} params
 * @returns {Promise<string>} The key of the record.
 * @memberof UnderpostBackup
 */
export async function recordVerification({ store = objectStore(), manifest, report }) {
  const key = `${backupPrefix(manifest)}verifications/${new Date(report.checkedAt).toISOString().replace(/[-:.]/g, '')}.json`;
  await store.put(key, Buffer.from(JSON.stringify(report, null, 2)));
  return key;
}

/**
 * Removes the backups of a profile that retention no longer keeps. The newest `keep` available
 * backups stay; an older one goes once it is older than `maxAgeDays`. A failed or incomplete backup
 * goes once it is older than `graceHours`: a younger incomplete one may still be writing. The
 * manifest goes first, so an interrupted prune leaves an incomplete backup the next prune removes.
 * @param {Object} params
 * @param {Object} [params.store]
 * @param {string} params.deployId
 * @param {string} params.profile
 * @param {number} [params.keep]
 * @param {number} [params.maxAgeDays]
 * @param {number} [params.graceHours]
 * @param {boolean} [params.dryRun=false]
 * @param {Set<string>} [params.protect] - Backup ids no prune removes.
 * @param {number} [params.now=Date.now()]
 * @returns {Promise<{removed:Object[], kept:Object[], dryRun:boolean}>}
 * @memberof UnderpostBackup
 */
export async function pruneBackups({
  store = objectStore(),
  deployId,
  profile,
  keep = BACKUP_RETENTION.keep,
  maxAgeDays = BACKUP_RETENTION.maxAgeDays,
  graceHours = BACKUP_RETENTION.graceHours,
  dryRun = false,
  protect = new Set(),
  now = Date.now(),
}) {
  const backups = await listBackups({ store, deployId, profile });
  const age = ({ backupId }) =>
    now - Date.parse(backupId.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z.*$/, '$1-$2-$3T$4:$5:$6Z'));
  const available = backups.filter(({ status }) => status === 'available');
  const kept = new Set([...available.slice(0, keep).map(({ backupId }) => backupId), ...protect]);
  const removed = backups.filter((backup) => {
    if (kept.has(backup.backupId)) return false;
    if (backup.status === 'available') return age(backup) > maxAgeDays * 86400000;
    return age(backup) > graceHours * 3600000;
  });
  if (!dryRun)
    for (const backup of removed) {
      const manifest = backup.keys.filter((key) => key.endsWith('/manifest.json'));
      await store.remove(manifest);
      await store.remove(backup.keys.filter((key) => !manifest.includes(key)));
      logger.info('Backup pruned', { deployId, profile, backupId: backup.backupId, status: backup.status });
    }
  const strip = ({ keys, ...backup }) => backup;
  return {
    removed: removed.map(strip),
    kept: backups.filter((backup) => !removed.includes(backup)).map(strip),
    dryRun,
  };
}

/**
 * Publishes the outcome of a backup operation as node-exporter textfile gauges. Each kind has a
 * file of its own, so a failure never erases the time of the last success. An alert reads
 * `time() - underpost_backup_last_success_timestamp_seconds`.
 * @param {Object} params
 * @param {string} params.deployId
 * @param {string} params.profile
 * @param {'export'|'failure'|'verify'} params.kind
 * @param {Object} [params.manifest]
 * @param {Object} [params.report] - {@link verifyBackup} output, for `verify`.
 * @param {string} [params.directory] - The textfile directory.
 * @returns {boolean} True when the file was written.
 * @memberof UnderpostBackup
 */
export function publishBackupMetrics({
  deployId,
  profile,
  kind,
  manifest,
  report,
  directory = UNDERPOST_MONITORING.nodeExporter.textfileDirectory,
}) {
  const labels = `{deploy_id="${deployId}",profile="${profile}"}`;
  const now = Math.floor(Date.now() / 1000);
  const gauges = {
    export: () => ({
      underpost_backup_last_success_timestamp_seconds: now,
      underpost_backup_last_bytes: manifest.totals.bytes,
      underpost_backup_last_plain_bytes: manifest.totals.plainBytes,
      underpost_backup_last_parts: manifest.totals.parts,
      underpost_backup_last_duration_seconds: Math.round(manifest.durationMs / 1000),
    }),
    failure: () => ({ underpost_backup_last_failure_timestamp_seconds: now }),
    verify: () => ({
      underpost_backup_last_verification_timestamp_seconds: now,
      underpost_backup_last_verification_ok: report.ok ? 1 : 0,
      underpost_backup_last_verification_duration_seconds: Math.round(report.durationMs / 1000),
      ...(report.restoreTest
        ? {
            underpost_backup_last_restore_test_ok: report.restoreTest.ok ? 1 : 0,
            underpost_backup_last_restore_test_duration_seconds: Math.round(report.restoreTest.restoreMs / 1000),
          }
        : {}),
    }),
  }[kind]();
  const target = nodePath.join(directory, `underpost_backup_${deployId}_${profile}_${kind}.prom`.replace(/-/g, '_'));
  const content = Object.entries(gauges)
    .map(([name, value]) => `# TYPE ${name} gauge\n${name}${labels} ${value}\n`)
    .join('');
  try {
    fs.mkdirpSync(directory);
    fs.writeFileSync(`${target}.tmp`, content, 'utf8');
    fs.renameSync(`${target}.tmp`, target);
    return true;
  } catch (error) {
    logger.warn('Backup metrics not published to the host collector', { target, error: error.message });
    return false;
  }
}

/**
 * The scheduled backup job: one `node bin db <deploy-id> --export --prune` per deployment, on the
 * host node. The CronJob container has no cluster access, so the command runs over SSH. The host
 * reads the object store credentials and the backup key from its own configuration: no credential
 * travels in the command.
 * @memberof UnderpostBackup
 */
class BackUp {
  /**
   * @param {string} deployList - Comma-separated deployment ids; `dd` or empty selects every routed one.
   * @param {Object} [options]
   * @param {boolean} [options.k3s] - Use the k3s cluster context.
   * @param {boolean} [options.kind] - Use the kind cluster context.
   * @param {boolean} [options.kubeadm] - Use the kubeadm cluster context.
   * @returns {Promise<void>}
   * @memberof UnderpostBackup
   */
  static callback = async function (deployList, options = {}) {
    loadCronDeployEnv();
    if (!deployList || deployList === 'dd') deployList = readDeployRoutes().join(',');

    logger.info('init backups callback', deployList);
    await logger.setUpInfo();

    const clusterFlag = options.k3s ? ' --k3s' : options.kind ? ' --kind' : options.kubeadm ? ' --kubeadm' : '';
    const failures = [];

    for (const _deployId of deployList.split(',')) {
      const deployId = _deployId.trim();
      if (!deployId) continue;
      try {
        logger.info('Executing database backup via SSH for', deployId);
        await Underpost.ssh.sshRemoteRunner(`node bin db ${deployId} --export --prune${clusterFlag}`, {
          remote: true,
          useSudo: true,
          cd: '/home/dd/engine',
        });
      } catch (err) {
        failures.push({ deployId, error: err.message });
        logger.error(`Error during database backup for ${deployId}`, { error: err.message });
      }
    }

    // One deployment failing must not stop the others; this summary is the outcome of the run.
    if (failures.length > 0) logger.error('Backup completed with failures', { count: failures.length, failures });
    else logger.info('Backup completed for all deploy-ids', { deployList });
  };
}

/**
 * Backup API: the scheduled job and the engine.
 * @memberof UnderpostBackup
 */
class UnderpostBackup {
  static API = Object.assign(BackUp, {
    writeBackup,
    listBackups,
    readBackupManifest,
    latestBackup,
    readBackupStream,
    backupStreamReadable,
    verifyBackup,
    recordVerification,
    readVerifications,
    pruneBackups,
    publishBackupMetrics,
  });
}

export default UnderpostBackup;

export { BackUp, UnderpostBackup };
