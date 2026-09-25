/**
 * Purge of Object Layer definitions: the one path that removes a definition and everything
 * stored under it.
 *
 * A delete removes this host's copy of a definition ({@link ObjectLayerService.delete}); a purge
 * removes the whole record of it on this host: the definition, its render frames, its atlas and
 * every render File the atlas owns, the IPFS pin records, the pinned content and its MFS paths,
 * and whatever the host's Studio extension keeps for it. It never touches another host: each one
 * purges what it stores.
 *
 * A definition registered in ItemLedger is never purged: a token type names content that must
 * stay resolvable.
 *
 * @module src/api/object-layer/object-layer.purge.js
 * @namespace ObjectLayerPurge
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { CacheService } from '../../server/storage/cache.js';
import { AtlasSpriteSheetStore } from '../atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { IpfsClient } from '../ipfs/ipfs.client.js';
import { resolveRegisteredCids } from '../../server/domain/object-layer-resolver.js';
import { objectLayerCache } from './object-layer.publication.js';

const logger = loggerFactory(import.meta);

/** The MFS directory an item label owns: its canonical bytes and its atlas content. */
const itemMfsPath = (itemId) => `/object-layer/${itemId}`;

/**
 * The values of a field some remaining definition still carries. Two definitions share a render or
 * a label whenever they carry the same content, so a purge removes only what no remaining
 * definition names.
 * @param {import('mongoose').Model} ObjectLayer - Bound ObjectLayer model.
 * @param {string} field - Definition field.
 * @param {Array<*>} values - Values the purged definitions carried.
 * @returns {Promise<Set<string>>}
 */
const stillNamed = async (ObjectLayer, field, values) =>
  values.length === 0
    ? new Set()
    : new Set((await ObjectLayer.distinct(field, { [field]: { $in: values } })).map(String));

/** What a purge reads off each definition. */
const PURGE_PROJECTION = { cid: 1, 'data.item': 1, 'data.render': 1 };

/**
 * @typedef {Object} PurgeReport
 * @property {number} objectLayers - Definitions removed.
 * @property {number} renderFrames - Render frame documents removed.
 * @property {number} atlases - Atlas documents removed.
 * @property {number} files - Render File documents removed.
 * @property {number} pinRecords - IPFS registry records removed.
 * @property {number} unpinned - CIDs the node unpinned.
 * @property {number} mfsPaths - MFS directories removed.
 * @property {string[]} itemIds - Labels the purge covered.
 * @property {Array<{cid:string,itemId:string}>} kept - Definitions kept because ItemLedger registers them.
 * @memberof ObjectLayerPurge
 */

/**
 * The definitions a filter names that may be purged. A definition ItemLedger registers is
 * reported instead, never removed.
 * @param {Object} params
 * @param {import('mongoose').Model} params.ObjectLayer - Bound ObjectLayer model.
 * @param {Object} [params.options] - Router options of this host.
 * @param {Object} [filter={}] - ObjectLayer selector.
 * @returns {Promise<{purgeable:Object[],kept:Array<{cid:string,itemId:string}>}>}
 * @memberof ObjectLayerPurge
 */
export async function findPurgeableDefinitions({ ObjectLayer, options }, filter = {}) {
  const documents = await ObjectLayer.find(filter, PURGE_PROJECTION).lean();
  const registered = await resolveRegisteredCids(
    documents.map((doc) => doc.cid),
    options,
  );
  const purgeable = [];
  const kept = [];
  for (const doc of documents) {
    if (registered.has(doc.cid)) kept.push({ cid: doc.cid, itemId: doc.data?.item?.id ?? '' });
    else purgeable.push(doc);
  }
  return { purgeable, kept };
}

/**
 * Removes every record of the definitions a filter names. Rerunnable: a second call finds
 * nothing and reports zeros.
 *
 * @param {Object} params
 * @param {Object} params.options - Router options of this host; `options.extension.beforeDelete`
 *   removes what the host's Studio keeps for a definition.
 * @param {Object} [params.filter={}] - ObjectLayer selector. `{}` purges every definition.
 * @param {boolean} [params.pruneOrphans=false] - Also remove atlas renders no atlas points at.
 * @param {boolean} [params.assets=true] - False keeps the asset tree a re-import reads.
 * @returns {Promise<PurgeReport>}
 * @memberof ObjectLayerPurge
 */
export async function purgeObjectLayers({ options, filter = {}, pruneOrphans = false, assets = true }) {
  const model = (name) => DataBaseProviderService.getModel(name, options);
  const ObjectLayer = model('ObjectLayer');
  const { purgeable, kept } = await findPurgeableDefinitions({ ObjectLayer, options }, filter);
  const report = {
    objectLayers: 0,
    renderFrames: 0,
    atlases: 0,
    files: 0,
    pinRecords: 0,
    unpinned: 0,
    mfsPaths: 0,
    itemIds: [],
    kept,
  };
  if (purgeable.length === 0) {
    if (pruneOrphans) report.files += await AtlasSpriteSheetStore.pruneOrphanRenders({ options });
    return report;
  }

  const collect = (read) => [...new Set(purgeable.map(read).filter(Boolean).map(String))];
  const itemIds = collect((doc) => doc.data?.item?.id);
  const renderCids = collect((doc) => doc.data?.render?.cid);
  const metadataCids = collect((doc) => doc.data?.render?.metadataCid);
  const definitionCids = collect((doc) => doc.cid);
  report.itemIds = itemIds;

  report.objectLayers =
    (await ObjectLayer.deleteMany({ _id: { $in: purgeable.map((doc) => doc._id) } })).deletedCount ?? 0;
  // Deleted first: the extension's asset cleanup asks which definitions still carry the label.
  for (const doc of purgeable) await options?.extension?.beforeDelete?.(doc, options, { assets });

  const without = async (field, values) => {
    const kept = await stillNamed(ObjectLayer, field, values);
    return values.filter((value) => !kept.has(value));
  };
  // A definition's materializations are its own: they go with it.
  const purgedAtlas = await AtlasSpriteSheetStore.purge({ objectLayerCids: definitionCids, options });
  report.atlases = purgedAtlas.atlases;
  report.files = purgedAtlas.files;
  if (pruneOrphans) report.files += await AtlasSpriteSheetStore.pruneOrphanRenders({ options });
  report.renderFrames =
    (await model('ObjectLayerRenderFrames').deleteMany({ objectLayerCid: { $in: definitionCids } })).deletedCount ?? 0;

  // A definition's own cid is its identity, so it is never shared; a render may be.
  const cids = [
    ...definitionCids,
    ...(await without('data.render.cid', renderCids)),
    ...(await without('data.render.metadataCid', metadataCids)),
  ];
  if (cids.length > 0) report.pinRecords = (await model('Ipfs').deleteMany({ cid: { $in: cids } })).deletedCount ?? 0;
  for (const cid of cids) if (await IpfsClient.unpinCid(cid)) report.unpinned++;
  for (const itemId of await without('data.item.id', itemIds))
    if (await IpfsClient.removeMfsPath(itemMfsPath(itemId))) report.mfsPaths++;

  await CacheService.invalidate(objectLayerCache(options));
  logger.info(`Purged ${report.objectLayers} object layer(s)`, report);
  return report;
}
