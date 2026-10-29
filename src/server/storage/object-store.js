/**
 * Durable object storage: one key space for backups and data artifacts, outside the failure domain
 * of every database volume. Git never holds these objects.
 *
 * `UNDERPOST_OBJECT_STORE` selects the driver:
 * - unset or `cloudinary`: Cloudinary private raw assets, read through signed archive URLs. The
 *   credentials are `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`.
 * - `file:<absolute directory>`: a local directory, for tests and isolated restore drills. A local
 *   disk is never the only durable copy of a production backup.
 *
 * Every driver writes an object whole or not at all, checks the bytes it stored against the bytes
 * it sent, refuses to replace an object with other bytes unless asked, and answers a missing object
 * with null. Transient failures are retried by the platform retry policy.
 *
 * @module src/server/storage/object-store.js
 * @namespace ObjectStore
 */
import crypto from 'node:crypto';
import os from 'node:os';
import nodePath from 'node:path';
import fs from 'fs-extra';
import { v2 as cloudinary } from 'cloudinary';
import Downloader from './downloader.js';
import { readZipEntry } from './zip.js';
import { errorStatus, withRetry } from '../runtime/retry.js';

/** The Cloudinary delivery type of every object: delivered only through a signed URL. */
export const CLOUDINARY_DELIVERY_TYPE = 'private';
/** The Cloudinary access control of every object: no public delivery URL works. */
export const CLOUDINARY_ACCESS_CONTROL = Object.freeze([Object.freeze({ access_type: 'token' })]);
const CLOUDINARY_RESOURCE_TYPE = 'raw';
/** The Admin API deletes at most this many resources per call. */
const CLOUDINARY_DELETE_BATCH = 100;

/** The largest object a read accepts unless the caller names a limit. */
export const DEFAULT_MAX_OBJECT_BYTES = Number(process.env.UNDERPOST_OBJECT_MAX_BYTES || 64 * 1024 * 1024);

const RETRY_POLICY = Object.freeze({
  attempts: Number(process.env.UNDERPOST_OBJECT_STORE_ATTEMPTS || 5),
  baseDelayMs: 1000,
  maxDelayMs: 30000,
});

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/**
 * Checks an object key: segments of letters, digits, dots, hyphens and underscores, no empty or
 * relative segment.
 * @param {string} key
 * @returns {string} The key.
 * @throws {Error} On an invalid key.
 * @memberof ObjectStore
 */
export const assertObjectKey = (key) => {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key) || key.split('/').some((part) => /^\.+$/.test(part)))
    throw new Error(`Invalid object key: ${JSON.stringify(key)}`);
  return key;
};

const md5 = (bytes) => crypto.createHash('md5').update(bytes).digest('hex');

/** An object whose stored bytes are not the bytes sent: the store must never report it written. */
const conflict = (key, detail) =>
  Object.assign(new Error(`The object store holds other bytes under ${key}: ${detail}`), {
    status: 409,
    retryable: false,
  });

/**
 * Configures the Cloudinary client from the environment.
 * @returns {typeof cloudinary}
 * @throws {Error} When a credential is missing.
 * @memberof ObjectStore
 */
export function cloudinaryClient() {
  const config = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  };
  if (Object.values(config).some((value) => !value))
    throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in the environment.');
  cloudinary.config(config);
  return cloudinary;
}

/**
 * Downloads one raw Cloudinary asset of a delivery type through a signed archive URL.
 * @param {Object} params
 * @param {string} params.key - The public id.
 * @param {string} [params.type] - The delivery type.
 * @param {string} params.archive - Local path the archive downloads to.
 * @returns {Promise<Buffer>} The asset bytes.
 * @throws {Error} When the archive holds no such asset.
 * @memberof ObjectStore
 */
export async function downloadCloudinaryAsset({ key, type = CLOUDINARY_DELIVERY_TYPE, archive }) {
  const url = cloudinary.utils.download_archive_url({
    public_ids: [key],
    resource_type: CLOUDINARY_RESOURCE_TYPE,
    type,
  });
  await Downloader.downloadFile(url, archive);
  const content = await readZipEntry(archive, nodePath.basename(key));
  if (!content) throw new Error(`Downloaded archive has no asset: ${key}`);
  return content;
}

/** A Cloudinary callback error as an Error with the status the retry policy reads. */
const cloudinaryError = (error) =>
  error instanceof Error
    ? error
    : Object.assign(new Error(error?.message ?? 'Cloudinary request failed'), { http_code: error?.http_code });

/**
 * The Cloudinary driver.
 * @returns {Object} An object store.
 * @memberof ObjectStore
 */
function cloudinaryStore() {
  const client = cloudinaryClient();
  const scope = { resource_type: CLOUDINARY_RESOURCE_TYPE, type: CLOUDINARY_DELIVERY_TYPE };
  const retry = (fn) => withRetry(fn, RETRY_POLICY);

  const upload = (key, bytes, overwrite) =>
    new Promise((resolve, reject) => {
      const stream = client.uploader.upload_stream(
        { public_id: key, ...scope, access_control: CLOUDINARY_ACCESS_CONTROL, overwrite },
        (error, result) => (error ? reject(cloudinaryError(error)) : resolve(result)),
      );
      stream.on('error', (error) => reject(cloudinaryError(error)));
      stream.end(bytes);
    });

  const head = async (key) => {
    assertObjectKey(key);
    try {
      const resource = await retry(() => client.api.resource(key, scope));
      return { key, bytes: resource.bytes, md5: resource.etag ?? '', createdAt: resource.created_at };
    } catch (error) {
      if (errorStatus(cloudinaryError(error)) === 404) return null;
      throw cloudinaryError(error);
    }
  };

  return {
    driver: 'cloudinary',
    location: `cloudinary://${process.env.CLOUDINARY_CLOUD_NAME}`,
    head,
    async put(key, bytes, { overwrite = false } = {}) {
      assertObjectKey(key);
      const sent = md5(bytes);
      const result = await retry(() => upload(key, bytes, overwrite));
      const stored = result?.existing ? await head(key) : { bytes: result?.bytes, md5: result?.etag ?? '' };
      if (!stored || stored.bytes !== bytes.length) throw conflict(key, `${stored?.bytes} bytes, ${bytes.length} sent`);
      if (stored.md5 && stored.md5 !== sent) throw conflict(key, `md5 ${stored.md5}, ${sent} sent`);
      return { key, bytes: bytes.length, md5: sent };
    },
    async get(key, { maxBytes = DEFAULT_MAX_OBJECT_BYTES } = {}) {
      assertObjectKey(key);
      const temporary = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-object-'));
      try {
        const bytes = await retry(async () => {
          try {
            return await downloadCloudinaryAsset({ key, archive: nodePath.join(temporary, 'object.zip') });
          } catch (error) {
            if ([400, 404].includes(errorStatus(error))) return null;
            throw error;
          }
        });
        if (bytes && bytes.length > maxBytes) throw new Error(`${key} holds ${bytes.length} bytes, over ${maxBytes}`);
        return bytes;
      } finally {
        fs.removeSync(temporary);
      }
    },
    async list(prefix) {
      const objects = [];
      let cursor;
      do {
        const page = await retry(() =>
          client.api.resources({ ...scope, prefix, max_results: 500, ...(cursor ? { next_cursor: cursor } : {}) }),
        );
        for (const resource of page?.resources ?? [])
          objects.push({ key: resource.public_id, bytes: resource.bytes, createdAt: resource.created_at });
        cursor = page?.next_cursor;
      } while (cursor);
      return objects.sort((a, b) => a.key.localeCompare(b.key));
    },
    async remove(keys) {
      let removed = 0;
      for (let index = 0; index < keys.length; index += CLOUDINARY_DELETE_BATCH) {
        const batch = keys.slice(index, index + CLOUDINARY_DELETE_BATCH).map(assertObjectKey);
        const result = await retry(() => client.api.delete_resources(batch, scope));
        for (const key of batch) {
          const status = result?.deleted?.[key];
          if (status === 'deleted') removed++;
          else if (status !== 'not_found')
            throw new Error(`Cloudinary did not delete ${key}: ${status ?? 'no status'}`);
        }
      }
      return { removed };
    },
  };
}

/**
 * The local directory driver.
 * @param {string} root - Absolute directory.
 * @returns {Object} An object store.
 * @memberof ObjectStore
 */
function fileStore(root) {
  if (!nodePath.isAbsolute(root)) throw new Error(`A file object store needs an absolute directory, not ${root}`);
  const target = (key) => nodePath.join(root, assertObjectKey(key));
  const head = async (key) => {
    const file = target(key);
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    return { key, bytes: stat.size, md5: md5(fs.readFileSync(file)), createdAt: stat.mtime.toISOString() };
  };
  return {
    driver: 'file',
    location: `file:${root}`,
    head,
    async put(key, bytes, { overwrite = false } = {}) {
      const file = target(key);
      const sent = md5(bytes);
      if (fs.existsSync(file) && !overwrite) {
        const stored = await head(key);
        if (stored.bytes !== bytes.length || stored.md5 !== sent)
          throw conflict(key, `md5 ${stored.md5}, ${sent} sent`);
        return { key, bytes: bytes.length, md5: sent };
      }
      fs.ensureDirSync(nodePath.dirname(file));
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporary, bytes, { flag: 'wx' });
        fs.renameSync(temporary, file);
      } finally {
        fs.removeSync(temporary);
      }
      return { key, bytes: bytes.length, md5: sent };
    },
    async get(key, { maxBytes = DEFAULT_MAX_OBJECT_BYTES } = {}) {
      const file = target(key);
      if (!fs.existsSync(file)) return null;
      const { size } = fs.statSync(file);
      if (size > maxBytes) throw new Error(`${key} holds ${size} bytes, over ${maxBytes}`);
      return fs.readFileSync(file);
    },
    async list(prefix) {
      if (!fs.existsSync(root)) return [];
      return fs
        .readdirSync(root, { recursive: true })
        .map((name) => name.split(nodePath.sep).join('/'))
        .filter(
          (key) => key.startsWith(prefix) && !key.endsWith('.tmp') && fs.statSync(nodePath.join(root, key)).isFile(),
        )
        .sort()
        .map((key) => {
          const stat = fs.statSync(nodePath.join(root, key));
          return { key, bytes: stat.size, createdAt: stat.mtime.toISOString() };
        });
    },
    async remove(keys) {
      let removed = 0;
      for (const key of keys) {
        const file = target(key);
        if (!fs.existsSync(file)) continue;
        fs.removeSync(file);
        removed++;
      }
      return { removed };
    },
  };
}

/**
 * The object store the environment selects.
 * @param {string} [url=process.env.UNDERPOST_OBJECT_STORE] - `cloudinary`, or `file:<absolute directory>`.
 * @returns {{driver:string, location:string,
 *   put:(key:string, bytes:Buffer, options?:{overwrite?:boolean}) => Promise<{key:string,bytes:number,md5:string}>,
 *   get:(key:string, options?:{maxBytes?:number}) => Promise<Buffer|null>,
 *   head:(key:string) => Promise<{key:string,bytes:number,md5:string,createdAt:string}|null>,
 *   list:(prefix:string) => Promise<Array<{key:string,bytes:number,createdAt:string}>>,
 *   remove:(keys:string[]) => Promise<{removed:number}>}}
 * @throws {Error} On an unknown store or missing credentials.
 * @memberof ObjectStore
 */
export function objectStore(url = process.env.UNDERPOST_OBJECT_STORE) {
  if (!url || url === 'cloudinary') return cloudinaryStore();
  if (url.startsWith('file:')) return fileStore(url.slice('file:'.length));
  throw new Error(`Unknown object store "${url}": use cloudinary or file:<absolute directory>`);
}
