/**
 * One Object Layer inside an instance backup, in both directions.
 *
 * A backup holds, per item: the definition (`object-layers/`), its render frames
 * (`render-frames/`), its atlas (`atlas-sprite-sheets/`) and the atlas render Files (`files/`).
 * Nothing else: the IPFS payloads are derived. The canonical render CID addresses the atlas
 * `fileId` File; the canonical metadata CID addresses the canonical bytes of the atlas metadata; the
 * definition's `_data.json` is its canonical bytes, which only the Object Layer authority pins.
 *
 * @module src/projects/cyberia/instance-backup.js
 * @namespace CyberiaInstanceBackup
 */
import fs from 'fs-extra';
import path from 'node:path';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { documentFileIds } from '../../api/file/file.ref.js';
import {
  ATLAS_FILE_FIELDS,
  AtlasSpriteSheetStore,
  pinRender,
} from '../../api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import sharp from 'sharp';
import { DEFAULT_ATLAS_UPSCALE_FACTOR } from '../../api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
import { parseIdentityJson, renderContractOf } from '../../api/object-layer/object-layer.identity.js';
import { repinCanonical } from '../../api/object-layer/object-layer.publication.js';
import { ObjectLayerEngine } from './object-layer.js';
import { catalogModels, findBoundDefinition } from './object-layer-catalog.js';

const logger = loggerFactory(import.meta);

/* The `files/` name each atlas render is exported under; one per registered File field, so an
 * export overwrites its own previous copy instead of leaving one behind. */
const ATLAS_BACKUP_FILE_PREFIX = {
  fileId: 'render',
  upscaleFileId: 'render-upscale',
  idlePreviewFileId: 'render-idle',
};
export const atlasBackupFileKey = (field, itemKey) => `${ATLAS_BACKUP_FILE_PREFIX[field]}-${itemKey}`;

/** Storage state of one host, never content: a backup carries none of it. */
const HOST_STATE_FIELDS = ['origin', 'published'];

/* A stored document as its model declares it: a field the schema no longer holds stays behind. */
const declared = (Model, doc) =>
  doc &&
  Object.fromEntries(Object.entries(doc).filter(([field]) => Model.schema.pathType(field) !== 'adhocOrUndefined'));

/* A File's bytes as the export wrote them: base64, or a serialised Buffer. */
const decodeFileData = (data) => {
  if (!data) return data;
  if (data.$base64) return Buffer.from(data.$base64, 'base64');
  if (data.type === 'Buffer' && Array.isArray(data.data)) return Buffer.from(data.data);
  return data;
};

/**
 * A File document as a backup stores it, bytes as base64.
 * @param {Object} file - Lean File document.
 * @returns {Object}
 * @memberof CyberiaInstanceBackup
 */
export const fileBackup = (file) => {
  if (!file.data) return { ...file };
  const bytes = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data.buffer || file.data);
  return { ...file, data: { $base64: bytes.toString('base64') } };
};

/**
 * A File document read back from a backup, bytes as a Buffer.
 * @param {Object} backup - File document as {@link fileBackup} wrote it.
 * @returns {Object}
 * @memberof CyberiaInstanceBackup
 */
export const fileFromBackup = (backup) => ({ ...backup, data: decodeFileData(backup.data) });

/* A definition, its render frames or its atlas: JSON that feeds an identity. */
const readIdentityDocument = (file) => (fs.existsSync(file) ? parseIdentityJson(fs.readFileSync(file, 'utf8')) : null);

/**
 * Reads everything an instance backup holds for one object layer.
 *
 * The render frames and atlas of an item sit under its item id; the atlas names its render Files
 * by `_id`. Files are matched on that `_id`, never on file name, so a backup that renamed its
 * renders still resolves.
 *
 * @param {{backupDir: string, itemId: string}} params
 * @returns {{objectLayer: object, renderFrames: object|null, atlas: object|null, files: object[]}}
 * @throws {Error} When the backup has no object layer for the item.
 * @memberof CyberiaInstanceBackup
 */
export function readObjectLayerBackup({ backupDir, itemId }) {
  const objectLayer = readIdentityDocument(path.join(backupDir, 'object-layers', `${itemId}.json`));
  if (!objectLayer) throw new Error(`Backup at ${backupDir} has no object layer '${itemId}'`);

  const renderFrames = readIdentityDocument(path.join(backupDir, 'render-frames', `${itemId}.json`));
  const atlas = readIdentityDocument(path.join(backupDir, 'atlas-sprite-sheets', `${itemId}.json`));

  const wanted = new Set(documentFileIds(atlas ? [atlas] : [], ATLAS_FILE_FIELDS));
  const filesDir = path.join(backupDir, 'files');
  const files = [];
  if (wanted.size > 0 && fs.existsSync(filesDir)) {
    for (const name of fs.readdirSync(filesDir)) {
      if (!name.endsWith('.json')) continue;
      const doc = fs.readJsonSync(path.join(filesDir, name));
      if (wanted.has(String(doc._id))) files.push(fileFromBackup(doc));
    }
  }
  return { objectLayer, renderFrames, atlas, files };
}

/** An atlas field that names a File: `fileId` and every `…FileId`. */
const ATLAS_FILE_FIELD_PATTERN = /fileId$/i;

/**
 * The File `_id`s the atlases of a backup own, under every field that names a File, so a backup
 * of another atlas shape keeps its renders too. They travel with their object layer, so an
 * instance import leaves them to {@link restoreObjectLayerBackup}.
 * @param {string} backupDir
 * @returns {Set<string>}
 * @memberof CyberiaInstanceBackup
 */
export function atlasFileIdsOf(backupDir) {
  const dir = path.join(backupDir, 'atlas-sprite-sheets');
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .flatMap((name) =>
        Object.entries(readIdentityDocument(path.join(dir, name)))
          .filter(([field, id]) => ATLAS_FILE_FIELD_PATTERN.test(field) && id)
          .map(([, id]) => String(id)),
      ),
  );
}

/**
 * Writes one object layer into an instance backup: the definition without host state, its render
 * frames, its atlas and the atlas render Files, each with the fields its schema declares. A
 * projection of the database: no IPFS call.
 * @param {Object} params
 * @param {string} params.backupDir
 * @param {Object} params.definition - Lean bound definition.
 * @param {{host: string, path: string}} params.options
 * @returns {Promise<{itemId: string, renderFrames: boolean, atlas: boolean, files: number}>}
 * @memberof CyberiaInstanceBackup
 */
export async function exportObjectLayerBackup({ backupDir, definition, options }) {
  const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
  const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
  const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
  const File = DataBaseProviderService.getModel('File', options);
  const itemId = definition.data.item.id;
  const write = (dir, value) => fs.outputJsonSync(path.join(backupDir, dir, `${itemId}.json`), value, { spaces: 2 });

  const renderFrames = declared(
    ObjectLayerRenderFrames,
    await ObjectLayerRenderFrames.findOne({ objectLayerCid: definition.cid }).lean(),
  );
  if (renderFrames) write('render-frames', renderFrames);

  const atlas = declared(AtlasSpriteSheet, await AtlasSpriteSheet.findOne({ objectLayerCid: definition.cid }).lean());
  let files = 0;
  if (atlas) {
    write('atlas-sprite-sheets', atlas);
    for (const field of ATLAS_FILE_FIELDS) {
      const file = atlas[field] ? await File.findById(atlas[field]).lean() : null;
      if (!file) continue;
      fs.outputJsonSync(path.join(backupDir, 'files', `${atlasBackupFileKey(field, itemId)}.json`), fileBackup(file), {
        spaces: 2,
      });
      files++;
    }
  }

  const stored = declared(ObjectLayer, definition);
  for (const field of HOST_STATE_FIELDS) delete stored[field];
  write('object-layers', stored);
  return { itemId, renderFrames: !!renderFrames, atlas: !!atlas, files };
}

/**
 * The primary render of the backup atlas, when that atlas is the render the definition names:
 * bytes at the density its metadata describes, whose contract is `data.render`.
 * @returns {Promise<Buffer|null>} Null when the atlas is missing or is another render.
 */
const backedRender = async ({ objectLayer, atlas, files }) => {
  const primary = atlas && files.find((file) => String(file._id) === String(atlas.fileId))?.data;
  if (!primary || !atlas.metadata) return null;
  const { width } = await sharp(primary).metadata();
  if (width !== Number(atlas.metadata.atlasWidth) * Number(atlas.metadata.cellPixelDim)) return null;
  const render = renderContractOf({ primary, metadata: atlas.metadata });
  const { cid, metadataCid } = objectLayer.data.render;
  return render.cid === cid && render.metadataCid === metadataCid ? primary : null;
};

/**
 * Restores one object layer from an instance backup, making the backup the authority for that
 * item id: its render frames, atlas, atlas render Files, render payloads on IPFS, and the static
 * frame PNGs, replacing whatever the database holds under that id. Idempotent: every write is an
 * upsert on the backup's File `_id`s, the restored definition's cid and content-addressed CIDs.
 *
 * A backup atlas that is not the render the definition names is not restored: the render is
 * rebuilt from the backup's render frames, and the definition that names it replaces the
 * backup's. The caller moves the content that pins `replaced` onto `cid`.
 *
 * The definition's canonical bytes are the authority's: they are pinned again through
 * {@link repinCanonical}, which also repairs an MFS path an older restore overwrote.
 * Orphaned atlas renders are left for the caller to prune once, after its last item.
 *
 * @param {{backupDir: string, itemId: string, options: {host: string, path: string}}} params
 * @returns {Promise<{itemId: string, cid: string, replaced: string|null, rebuilt: boolean, files: number, renderFrames: boolean, atlas: boolean, pins: number, staticFiles: number}>}
 *   `replaced` is the backup cid the restored definition replaces, null when it is the same.
 * @throws {Error} When the backup holds neither the named render nor the frames to rebuild it,
 *   or the definition cannot be published.
 * @memberof CyberiaInstanceBackup
 */
export async function restoreObjectLayerBackup({ backupDir, itemId, options }) {
  const { objectLayer, renderFrames, atlas, files } = readObjectLayerBackup({ backupDir, itemId });
  const models = catalogModels(options);
  const File = DataBaseProviderService.getModel('File', options);

  const named = objectLayer.data?.render ?? {};
  const primary = named.cid ? await backedRender({ objectLayer, atlas, files }) : null;
  const rebuilt = !!named.cid && !primary;
  if (rebuilt && !renderFrames)
    throw new Error(`'${itemId}' names render ${named.cid}; the backup holds neither it nor the frames to rebuild it`);

  // 1. The render payloads, so the definition names CIDs the node serves.
  let pins = 0;
  if (primary) {
    const { pinned } = await pinRender({ itemKey: itemId, primary, metadata: atlas.metadata, options });
    if (pinned) pins = 2;
    else logger.warn(`IPFS did not pin the render of '${itemId}'; the next import pins it`);
  }

  // 2. The render: rebuilt from the frames, or the backup atlas with the Files it points at.
  let rendered;
  if (rebuilt) {
    rendered = await AtlasSpriteSheetStore.build({
      itemKey: itemId,
      objectLayerRenderFrames: renderFrames,
      upscaleFactor: atlas?.metadata?.upscaleFactor,
      options,
    });
    logger.info(`Rebuilt the render of '${itemId}': the backup atlas is not render ${named.cid}`);
  } else if (primary) {
    for (const file of files) {
      await File.deleteOne({ _id: file._id });
      await File.create(file);
    }
    rendered = { render: named, atlas };
  }

  // 3. The definition the label runs on, its render frames and atlas stored under its cid. Its
  //    _id is kept when the content is new here.
  const bound = await findBoundDefinition(models, itemId);
  if (!bound && objectLayer._id) await models.ObjectLayer.deleteOne({ _id: objectLayer._id });
  const restored = await ObjectLayerEngine.publishItemDefinition({
    models,
    payload: objectLayer,
    renderFrames: renderFrames ?? undefined,
    rendered,
    options,
  });
  // The derived renders are exact derivations of the primary one: cut any the backup lacks.
  if (primary) await AtlasSpriteSheetStore.syncDerivedRenders({ objectLayerCid: restored.cid, options });

  // 4. The canonical bytes under the item's MFS path, pinned by the authority.
  try {
    await repinCanonical({ ObjectLayer: models.ObjectLayer, definition: restored, options });
  } catch (error) {
    logger.warn(`Canonical bytes of '${itemId}' not pinned again: ${error.message}`);
  }

  // 5. The static frame PNGs the web client serves, from the same render frames.
  let staticFiles = 0;
  const itemType = objectLayer.data?.item?.type;
  if (renderFrames && itemType) {
    const written = await ObjectLayerEngine.writeStaticFrameAssets({
      basePaths: ['./src/client/public/cyberia/', `./public/${options.host}${options.path}`],
      itemType,
      itemId,
      objectLayerRenderFramesData: {
        frames: renderFrames.frames || {},
        colors: renderFrames.colors || [],
        frame_duration: renderFrames.frame_duration ?? 100,
      },
      objectLayerData: objectLayer,
      cellPixelDim: DEFAULT_ATLAS_UPSCALE_FACTOR,
    });
    staticFiles = written.length;
  }

  return {
    itemId,
    cid: restored.cid,
    replaced: objectLayer.cid && objectLayer.cid !== restored.cid ? objectLayer.cid : null,
    rebuilt,
    files: rebuilt ? 0 : files.length,
    renderFrames: !!renderFrames,
    atlas: rebuilt || !!atlas,
    pins,
    staticFiles,
  };
}
