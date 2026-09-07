import crypto from 'crypto';
import fs from 'fs-extra';
import nodePath from 'path';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { FileCleanup } from '../file/file.service.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';

const logger = loggerFactory(import.meta);

const AUDIO_MIMETYPE = 'audio/wav';

/** The File-referencing fields of this model, as `file.ref.json` registers them. */
const FILE_FIELDS = ['fileId'];

/**
 * The generic File `_id` an asset's bytes resolve through, derived from the asset code and the
 * bytes themselves.
 *
 * Content-addressed on purpose. The client fetches a WAV as `/api/file/blob/<fileId>` and caches
 * it, so re-recording an asset under a stable id would serve the old sound from that cache
 * forever. A changed render therefore lands on a new id — and the import deletes the one it
 * replaced, so the change costs nothing. Identical bytes re-derive the same id, which is what
 * makes re-importing an unchanged bank a no-op rather than a churn of File documents.
 *
 * The code is folded in so two assets that happen to render identical bytes still own separate
 * File documents; sharing one would make deleting either orphan the other.
 *
 * @param {string} code - Asset code.
 * @param {string} md5 - Hex MD5 of the WAV bytes.
 * @returns {import('mongoose').Types.ObjectId}
 */
const audioFileId = (code, md5) =>
  new Types.ObjectId(crypto.createHash('sha256').update(`cyberia-audio:${code}:${md5}`).digest('hex').slice(0, 24));

/**
 * Validates a `<name>.json` sidecar written by the cyberia-audio package, and reads it into the
 * shape this platform stores.
 *
 * Identity is all the import requires: `id` becomes the asset's code, and the rest is the
 * recorder's own metadata — including `bus`, the `src/audio-module/<bus-id>/` directory the
 * module was authored on, which is the same bus vocabulary a map binding routes through.
 *
 * @param {object} manifest - Parsed manifest.
 * @param {string} manifestPath - Source path, for error messages.
 * @returns {object} The manifest as stored.
 * @throws {Error} When the manifest carries no usable asset identity.
 */
const readManifest = (manifest, manifestPath) => {
  if (!manifest || typeof manifest !== 'object') throw new Error(`Invalid audio manifest: ${manifestPath}`);
  if (!manifest.id) throw new Error(`Audio manifest has no id: ${manifestPath}`);
  const { bus = '', ...rest } = manifest;
  return { ...rest, bus };
};

class CyberiaAudioService {
  /**
   * Imports one recorded `<name>.wav` + `<name>.json` pair, upserting both the backing
   * File document and the CyberiaAudio document keyed by the asset's code.
   *
   * @param {{wavPath: string, manifestPath: string}} record - Absolute or cwd-relative artifact pair.
   * @param {{host: string, path: string}} options - Provider context.
   * @returns {Promise<object>} The upserted CyberiaAudio document.
   */
  static importRecord = async ({ wavPath, manifestPath }, options) => {
    const CyberiaAudio = DataBaseProviderService.getModel('CyberiaAudio', options);
    const File = DataBaseProviderService.getModel('file', options);

    const manifest = readManifest(JSON.parse(await fs.readFile(manifestPath, 'utf8')), manifestPath);
    const data = await fs.readFile(wavPath);
    const md5 = crypto.createHash('md5').update(data).digest('hex');
    const fileData = { name: `${manifest.id}.wav`, data, size: data.length, mimetype: AUDIO_MIMETYPE, md5 };

    await new CyberiaAudio({ code: manifest.id, manifest }).validate();
    if (44 > data.length || data.length > 8 * 1024 * 1024 ||
        data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE' ||
        data.readUInt32LE(4) !== data.length - 8) throw new Error(`Invalid WAV: ${wavPath}`);

    const existing = await CyberiaAudio.findOne({ code: manifest.id });
    // Derived from the bytes, so it is the same id on an unchanged re-import and a new one the
    // moment the render changes. Writing the File first leaves the bytes reachable if the run is
    // interrupted before the metadata upsert; the stale document is then dropped on the next run.
    const fileId = audioFileId(manifest.id, md5);
    await File.findOneAndUpdate(
      { _id: fileId }, { $set: fileData }, { upsert: true, returnDocument: 'after', runValidators: true },
    );

    const doc = await CyberiaAudio.findOneAndUpdate(
      { code: manifest.id },
      { $set: { code: manifest.id, fileId, manifest } },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );

    // Only once the asset points at the new bytes: the superseded blob is unreferenced from here
    // on, and leaving it behind is what orphans a File document.
    if (existing) {
      await FileCleanup.cleanupReplacedFiles({
        oldDoc: existing, newData: { fileId }, fileFields: FILE_FIELDS, File,
      });
    }
    return doc;
  };

  /**
   * Deletes an asset and the File document holding its bytes.
   *
   * The asset is the only reference to that blob, so dropping one without the other is exactly
   * what `underpost db clean-fs` would later have to sweep up.
   *
   * @param {Array<object>} assets - CyberiaAudio documents about to be removed.
   * @param {{host: string, path: string}} options - Provider context.
   * @returns {Promise<number>} Count of File documents deleted.
   */
  static deleteBackingFiles = async (assets, options) => {
    const File = DataBaseProviderService.getModel('file', options);
    let deleted = 0;
    for (const asset of assets) {
      const ids = await FileCleanup.deleteDocumentFiles({ doc: asset, fileFields: FILE_FIELDS, File });
      deleted += ids.length;
    }
    return deleted;
  };

  /**
   * Imports every valid `<name>.wav` + `<name>.json` pair found in a records directory.
   * A WAV with no manifest beside it is skipped with a warning: the pair is the unit of import.
   *
   * @param {{recordsPath: string, codes?: Array<string>|null}} params - Source directory and optional code filter.
   * @param {{host: string, path: string}} options - Provider context.
   * @returns {Promise<Array<object>>} The upserted CyberiaAudio documents.
   */
  static importRecords = async ({ recordsPath, codes = null }, options) => {
    if (!(await fs.pathExists(recordsPath))) throw new Error(`Records directory not found: ${recordsPath}`);

    const stems = (await fs.readdir(recordsPath))
      .filter((name) => name.toLowerCase().endsWith('.wav'))
      .map((name) => nodePath.basename(name, nodePath.extname(name)))
      .filter((stem) => !codes || codes.includes(stem))
      .sort();

    if (codes) {
      for (const code of codes) if (!stems.includes(code)) throw new Error(`No ${code}.wav found in ${recordsPath}`);
    }

    const imported = [];
    for (const stem of stems) {
      const wavPath = nodePath.join(recordsPath, `${stem}.wav`);
      const manifestPath = nodePath.join(recordsPath, `${stem}.json`);
      if (!(await fs.pathExists(manifestPath))) {
        logger.warn(`Skipping ${stem}.wav: no ${stem}.json manifest beside it`);
        continue;
      }
      const doc = await CyberiaAudioService.importRecord({ wavPath, manifestPath }, options);
      logger.info(`Imported ${doc.code}`, { _id: doc._id.toString(), fileId: doc.fileId.toString() });
      imported.push(doc);
    }
    return imported;
  };

  static post = async (req, res, options) => {
    /** @type {import('./cyberia-audio.model.js').CyberiaAudioModel} */
    const CyberiaAudio = DataBaseProviderService.getModel('CyberiaAudio', options);
    return await new CyberiaAudio(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-audio.model.js').CyberiaAudioModel} */
    const CyberiaAudio = DataBaseProviderService.getModel('CyberiaAudio', options);
    if (req.params.id) return await CyberiaAudio.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaAudio.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaAudio.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-audio.model.js').CyberiaAudioModel} */
    const CyberiaAudio = DataBaseProviderService.getModel('CyberiaAudio', options);
    const File = DataBaseProviderService.getModel('file', options);
    const existing = await CyberiaAudio.findById(req.params.id);
    const updated = await CyberiaAudio.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    // Repointing an asset at other bytes leaves the previous blob referenced by nothing.
    if (existing) {
      await FileCleanup.cleanupReplacedFiles({
        oldDoc: existing, newData: req.body, fileFields: FILE_FIELDS, File,
      });
    }
    return updated;
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-audio.model.js').CyberiaAudioModel} */
    const CyberiaAudio = DataBaseProviderService.getModel('CyberiaAudio', options);
    const assets = req.params.id ? await CyberiaAudio.find({ _id: req.params.id }) : await CyberiaAudio.find();
    await CyberiaAudioService.deleteBackingFiles(assets, options);
    if (req.params.id) return await CyberiaAudio.findByIdAndDelete(req.params.id);
    return await CyberiaAudio.deleteMany();
  };
}

export { CyberiaAudioService, audioFileId, readManifest };
