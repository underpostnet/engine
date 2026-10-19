/**
 * Identity previews: one PNG of the visual layers an entity wears. It overlays the idle preview the
 * host stores for each layer (`AtlasSpriteSheet.idlePreviewFileId`, the first down-idle frame of its
 * render) in draw order. A reference names a preview by the ordered Object Layer CIDs of the layers,
 * so it never names another image. The render cache keeps the PNG under the fingerprint of the idle
 * previews it overlays; Valkey drops the least recently used one, and the next request draws it again.
 *
 * @module src/projects/cyberia/player/appearance-preview.js
 * @namespace CyberiaAppearancePreview
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { CACHE_POLICY, CacheService } from '../../../server/storage/cache.js';
import { apiPathOf } from '../../../server/domain/api-contract.js';
import { renderFileBytes } from '../../../api/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { IDLE_PREVIEW_SIZE } from '../../../api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
import { OBJECT_LAYER_CID_PATTERN } from '../../../api/object-layer/object-layer.identity.js';
import { catalogMounted } from '../catalog/object-layer-catalog.js';
import { IDENTITY_PREVIEW, visualLayerPriority } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';

const failure = (status, message) => Object.assign(new Error(message), { status });

const model = (name, options) => DataBaseProviderService.getModel(name, options);

const previewCache = (options) => CacheService.namespace(options, 'cyberia-identity-preview', CACHE_POLICY.immutable);

/**
 * The ordered CIDs a reference names.
 * @param {string} value - The CIDs, joined by commas.
 * @returns {string[]}
 * @throws {Error} `status` 400 for no CID, too many, or one that is not a canonical Object Layer CID.
 * @memberof CyberiaAppearancePreview
 */
export function appearanceCids(value) {
  const cids = String(value ?? '').split(',');
  if (cids.length > IDENTITY_PREVIEW.maxLayers || cids.some((cid) => !OBJECT_LAYER_CID_PATTERN.test(cid)))
    throw failure(400, 'Invalid appearance');
  return cids;
}

/**
 * The reference of the preview of some layers, or '' without a layer.
 * @param {string[]} cids - The Object Layer CIDs of the visual layers, in layer order.
 * @returns {string}
 * @memberof CyberiaAppearancePreview
 */
export const appearanceReference = (cids) =>
  cids.length ? `${apiPathOf()}/${IDENTITY_PREVIEW.route}/${cids.join(',')}` : '';

/**
 * The layers of an appearance that draw, in draw order: each with its draw priority and the File of
 * its stored idle preview. A layer whose atlas holds no idle preview on this host draws nothing.
 * @param {string[]} cids - Object Layer CIDs, in layer order.
 * @param {Object} options - Router options.
 * @returns {Promise<Array<{cid: string, priority: number, still: string}>>}
 * @memberof CyberiaAppearancePreview
 */
export async function appearanceLayers(cids, options) {
  const [definitions, atlases] = await Promise.all([
    model('ObjectLayer', options)
      .find({ cid: { $in: cids } }, { cid: 1, 'data.item.type': 1 })
      .lean(),
    model('AtlasSpriteSheet', options)
      .find(
        { objectLayerCid: { $in: cids }, idlePreviewFileId: { $ne: null } },
        { objectLayerCid: 1, idlePreviewFileId: 1 },
      )
      .lean(),
  ]);
  const types = new Map(definitions.map(({ cid, data }) => [cid, data?.item?.type]));
  const stills = new Map(
    atlases.map(({ objectLayerCid, idlePreviewFileId }) => [objectLayerCid, String(idlePreviewFileId)]),
  );
  return cids
    .map((cid, index) => ({ cid, index, priority: visualLayerPriority(types.get(cid)), still: stills.get(cid) }))
    .filter(({ still }) => still)
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(({ index, ...layer }) => layer);
}

/**
 * The fingerprint of what a preview draws: the idle previews it overlays, in draw order. A File id
 * derives from its bytes, so stats, labels, position and combat state are no input.
 * @param {Array<{still: string}>} layers - In draw order.
 * @returns {string}
 * @memberof CyberiaAppearancePreview
 */
export const appearanceFingerprint = (layers) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify([IDENTITY_PREVIEW.version, layers.map(({ still }) => still)]))
    .digest('hex');

/**
 * Overlays idle previews in draw order, each centred on one transparent square of the idle preview size.
 * @param {Buffer[]} stills - PNG bytes, in draw order.
 * @returns {Promise<Buffer>} PNG.
 * @memberof CyberiaAppearancePreview
 */
export async function composeAppearance(stills) {
  const composites = await Promise.all(
    stills.map(async (input) => {
      const { width, height } = await sharp(input).metadata();
      return {
        input,
        left: Math.floor((IDLE_PREVIEW_SIZE - width) / 2),
        top: Math.floor((IDLE_PREVIEW_SIZE - height) / 2),
      };
    }),
  );
  return await sharp({
    create: {
      width: IDLE_PREVIEW_SIZE,
      height: IDLE_PREVIEW_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/**
 * A bound on the work of this process: at most `concurrency` jobs run and `capacity` wait. A job
 * past that is refused at once, so a burst never queues without end.
 * @param {{concurrency?: number, capacity?: number}} [bounds]
 * @returns {(job: () => Promise<*>) => Promise<*>}
 * @memberof CyberiaAppearancePreview
 */
export function previewQueue({ concurrency = 2, capacity = 32 } = {}) {
  const waiting = [];
  let running = 0;
  const next = () => {
    if (running >= concurrency || !waiting.length) return;
    const { job, resolve, reject } = waiting.shift();
    running++;
    Promise.resolve()
      .then(job)
      .then(resolve, reject)
      .finally(() => {
        running--;
        next();
      });
  };
  return (job) => {
    if (waiting.length >= capacity) return Promise.reject(failure(503, 'Identity previews are busy'));
    const result = new Promise((resolve, reject) => waiting.push({ job, resolve, reject }));
    next();
    return result;
  };
}

const drawing = previewQueue();

/**
 * The preview a reference names. A preview the cache holds is served as is; concurrent requests of
 * one fingerprint share one drawing; a failed drawing is never cached, so the next request draws again.
 * @param {string[]} cids - Object Layer CIDs, in layer order.
 * @param {Object} options - Router options.
 * @returns {Promise<{fingerprint: string, png: Buffer}>}
 * @throws {Error} `status` 404 when no layer draws, 503 while an idle preview cannot be read.
 * @memberof CyberiaAppearancePreview
 */
export async function appearancePreview(cids, options) {
  const layers = await appearanceLayers(cids, options);
  if (!layers.length) throw failure(404, 'The appearance has no idle preview');
  const fingerprint = appearanceFingerprint(layers);
  const png = await CacheService.getOrLoad(previewCache(options), {
    identifier: fingerprint,
    binary: true,
    load: () =>
      drawing(async () => {
        const stills = await Promise.all(layers.map(({ still }) => renderFileBytes(still, options)));
        if (stills.some((still) => !still)) throw failure(503, 'An idle preview is unavailable');
        return await composeAppearance(stills);
      }),
  });
  return { fingerprint, png };
}

/**
 * The preview reference of each account: the visual layers its last played profile wears, each
 * stack on the definition the served catalog binds to its label. An account without a profile, or
 * with no visual layer, has none.
 * @param {Array<string|import('mongoose').Types.ObjectId>} accounts - Account IDs.
 * @param {Object} options - Router options.
 * @returns {Promise<Map<string, string>>} Account ID → reference.
 * @memberof CyberiaAppearancePreview
 */
export async function accountAppearances(accounts, options) {
  const ids = [...new Set(accounts.map(String))].filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return new Map();
  const profiles = await model('CyberiaPlayer', options).aggregate([
    { $match: { user: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $sort: { lastPlayedAt: -1, _id: 1 } },
    { $group: { _id: '$user', bag: { $first: '$bag' } } },
    { $project: { worn: { $filter: { input: { $ifNull: ['$bag', []] }, cond: '$$this.active' } } } },
  ]);
  const labels = [...new Set(profiles.flatMap(({ worn }) => worn.map(({ itemId }) => itemId)))];
  const bound = catalogMounted(options) ? await model('CyberiaItemCatalog', options).resolve(labels) : new Map();
  const cidOf = ({ itemId, olCid }) => bound.get(itemId) || olCid;
  const worn = profiles.flatMap(({ worn }) => worn.map(cidOf)).filter(Boolean);
  const visual = new Set(
    (
      await model('ObjectLayer', options)
        .find({ cid: { $in: worn }, 'data.render.cid': { $nin: ['', null] } }, { cid: 1 })
        .lean()
    ).map(({ cid }) => cid),
  );
  return new Map(
    profiles.map(({ _id, worn }) => {
      const cids = worn.map(cidOf).filter((cid) => visual.has(cid));
      return [String(_id), cids.length <= IDENTITY_PREVIEW.maxLayers ? appearanceReference(cids) : ''];
    }),
  );
}
