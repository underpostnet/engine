import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import * as dir from 'node:path';
import fs from 'fs-extra';
import { loggerFactory } from '../server/ops/logger.js';
import { readZipEntry } from '../server/storage/zip.js';
import Downloader from '../server/storage/downloader.js';
import * as selection from './fs-selection.js';

const logger = loggerFactory(import.meta);
const CLOUDINARY_DELIVERY_TYPE = 'private';
const CLOUDINARY_ACCESS_CONTROL = [{ access_type: 'token' }];
const DELIVERY_TYPES = ['private', 'upload', 'authenticated'];

/**
 * What a pull reports when the local file is already there and no overwrite was asked for.
 * Distinct from a delivery type, which is what a pull that actually transferred returns.
 */
const PULL_SKIPPED = 'skipped';
const manifestIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

class UnderpostFileStorage {
  static API = {
    ...selection,

    cloudinaryConfig() {
      const config = {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      };
      if (Object.values(config).some((value) => !value))
        throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in the environment.');
      cloudinary.config(config);
    },

    resolveManifest(options = {}) {
      if (options.storageFilePath !== undefined)
        throw new Error('Use --storage-id with a sub-id, not a manifest path.');
      if (typeof options.deployId !== 'string' || !manifestIdPattern.test(options.deployId))
        throw new Error('Provide a valid --deploy-id using letters, digits, hyphens, or underscores.');
      if (
        options.storageId !== undefined &&
        (typeof options.storageId !== 'string' || !manifestIdPattern.test(options.storageId))
      )
        throw new Error('Use a --storage-id sub-id with letters, digits, hyphens, or underscores.');
      const name = options.storageId === undefined ? 'storage.json' : `storage.${options.storageId}.json`;
      return `engine-private/conf/${options.deployId}/${name}`;
    },

    readManifest(options = {}) {
      const storageConf = UnderpostFileStorage.API.resolveManifest(options);
      const storage = fs.existsSync(storageConf) ? JSON.parse(fs.readFileSync(storageConf, 'utf8')) : {};
      if (!storage || typeof storage !== 'object' || Array.isArray(storage))
        throw new Error(`Manifest must contain an object: ${storageConf}`);
      const paths = new Set();
      for (const [key, entry] of Object.entries(storage)) {
        const normalized = selection.normalizeStoragePath(key);
        if (!key || !entry || typeof entry !== 'object' || Array.isArray(entry) || paths.has(normalized))
          throw new Error(`Invalid or duplicate manifest entry: ${key}`);
        if (entry.type !== undefined && !DELIVERY_TYPES.includes(entry.type))
          throw new Error(`Invalid manifest delivery type: ${key}`);
        if (entry.bytes !== undefined && (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0))
          throw new Error(`Invalid manifest byte count: ${key}`);
        paths.add(normalized);
      }
      return { storage, storageConf };
    },

    writeManifest(storage, storageConf) {
      fs.ensureDirSync(dir.dirname(storageConf));
      const temporary = `${storageConf}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporary, JSON.stringify(storage, null, 4), { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(temporary, storageConf);
      } finally {
        fs.removeSync(temporary);
      }
    },

    updateManifest(manifest, path, entry) {
      const next = { ...manifest.storage };
      if (entry === undefined) delete next[path];
      else Object.defineProperty(next, path, { value: entry, enumerable: true, configurable: true, writable: true });
      UnderpostFileStorage.API.writeManifest(next, manifest.storageConf);
      manifest.storage = next;
    },

    deliveryTypeCandidates(storage, path) {
      const recorded = storage[path]?.type ?? 'upload';
      return [...new Set([recorded, CLOUDINARY_DELIVERY_TYPE, 'upload'])];
    },

    async callback(path, options = {}) {
      const api = UnderpostFileStorage.API;
      const manifest = api.readManifest(options);
      const paths = api.resolveSelection(path, manifest.storage, options);
      const operation = options.rm ? 'delete' : options.pull ? 'pull' : 'upload';
      if (paths.length === 0) logger.warn('No storage paths selected.');
      // A skip is the absence of work, and one line per file buries the transfers that did happen
      // under hundreds that did not. The count carries the same information: which files were
      // skipped is exactly which files were already there.
      let skipped = 0;
      for (const selected of paths) {
        if ((await api[operation](selected, options, manifest)) === PULL_SKIPPED) skipped++;
      }
      if (skipped > 0) logger.info('Pull skipped files that already exist', { skipped, selected: paths.length });
    },

    async upload(path, options = {}, manifest = UnderpostFileStorage.API.readManifest(options)) {
      const api = UnderpostFileStorage.API;
      if (!fs.statSync(path).isFile()) throw new Error(`Upload requires a regular file: ${path}`);
      api.cloudinaryConfig();
      const result = await cloudinary.uploader.upload(path, {
        public_id: path,
        resource_type: 'raw',
        type: CLOUDINARY_DELIVERY_TYPE,
        access_control: CLOUDINARY_ACCESS_CONTROL,
        overwrite: options.force === true,
      });
      const remote = result?.existing
        ? await cloudinary.api.resource(path, { resource_type: 'raw', type: CLOUDINARY_DELIVERY_TYPE })
        : result;
      if (
        remote?.error ||
        remote?.public_id !== path ||
        remote?.type !== CLOUDINARY_DELIVERY_TYPE ||
        !Number.isSafeInteger(remote?.bytes) ||
        remote.bytes < 0
      )
        throw new Error(`Invalid Cloudinary upload response: ${path}`);
      api.updateManifest(manifest, path, { ...manifest.storage[path], type: remote.type, bytes: remote.bytes });
      logger.info(result.existing ? 'Remote asset already exists' : 'Uploaded asset', { path });
      return result;
    },

    async pull(path, options = {}, manifest = UnderpostFileStorage.API.readManifest(options)) {
      const api = UnderpostFileStorage.API;
      if (!Object.hasOwn(manifest.storage, path)) throw new Error(`Asset is not in the selected manifest: ${path}`);
      const target = options.omitUnzip ? `${path}.zip` : path;
      if (fs.existsSync(target) && !fs.statSync(target).isFile())
        throw new Error(`Pull target must be a regular file: ${target}`);
      if (fs.existsSync(target) && !options.force) return PULL_SKIPPED;
      api.cloudinaryConfig();
      fs.ensureDirSync(dir.dirname(target));
      const temporary = fs.mkdtempSync(dir.join(dir.dirname(target), '.underpost-fs-'));
      const archive = dir.join(temporary, 'download.zip');
      try {
        let resolvedType;
        let downloadError;
        for (const type of api.deliveryTypeCandidates(manifest.storage, path)) {
          try {
            const url = cloudinary.utils.download_archive_url({ public_ids: [path], resource_type: 'raw', type });
            await Downloader.downloadFile(url, archive);
            resolvedType = type;
            break;
          } catch (error) {
            downloadError = error;
          }
        }
        if (resolvedType === undefined) throw downloadError;
        const content = await readZipEntry(archive, dir.basename(path));
        if (!content) throw new Error(`Downloaded archive has no asset: ${path}`);
        let downloaded = archive;
        if (!options.omitUnzip) {
          downloaded = dir.join(temporary, 'asset');
          fs.writeFileSync(downloaded, content);
        }
        fs.renameSync(downloaded, target);
        api.updateManifest(manifest, path, { ...manifest.storage[path], type: resolvedType, bytes: content.length });
        logger.info('Pulled asset', { path: target });
        return resolvedType;
      } finally {
        fs.removeSync(temporary);
      }
    },

    async delete(path, options = {}, manifest = UnderpostFileStorage.API.readManifest(options)) {
      const api = UnderpostFileStorage.API;
      api.cloudinaryConfig();
      const results = {};
      for (const type of api.deliveryTypeCandidates(manifest.storage, path)) {
        const result = await cloudinary.api.delete_resources([path], { type, resource_type: 'raw' });
        const status = result?.deleted?.[path];
        if (result?.error || !['deleted', 'not_found'].includes(status))
          throw new Error(`Cloudinary delete failed for ${path} (${type}): ${status ?? 'missing status'}`);
        results[type] = result;
      }
      api.updateManifest(manifest, path, undefined);
      logger.info('Deleted remote asset', { path });
      return results;
    },
  };
}

export default UnderpostFileStorage;
