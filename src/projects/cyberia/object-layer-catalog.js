/**
 * Cyberia item catalog over the Object Layer store.
 *
 * Cyberia content names items by label (`data.item.id`), a label the protocol never keeps
 * unique. The `CyberiaItemCatalog` collection binds each label to one canonical `objectLayerCid`;
 * this module is the one path that resolves labels and writes definitions Cyberia runs on.
 *
 * @module src/projects/cyberia/object-layer-catalog.js
 * @namespace CyberiaObjectLayerCatalog
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { profileRef } from '../../client/components/object-layer/ObjectLayerProtocol.js';
import { CyberiaObjectLayerProfile } from '../../client/components/cyberia/ObjectLayerProfileCyberia.js';
import { objectLayerCache, publishDefinition } from '../../api/object-layer/object-layer.publication.js';
import { AtlasSpriteSheetStore } from '../../api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { resolveObjectLayer } from '../../server/domain/object-layer-resolver.js';
import { CacheService } from '../../server/storage/cache.js';

/** Definitions the runtime may serve: published ones, never a draft. */
const PUBLISHED = Object.freeze({ origin: { $ne: 'draft' } });

/**
 * The APIs a writer of item definitions loads: the store and the catalog, the materializations
 * {@link writeItemDefinition} stores under every written cid, and the Files and pins they hold.
 * @memberof CyberiaObjectLayerCatalog
 */
export const ITEM_DEFINITION_APIS = Object.freeze([
  'object-layer',
  'cyberia-item-catalog',
  'object-layer-render-frames',
  'atlas-sprite-sheet',
  'file',
  'ipfs',
]);

/**
 * @typedef {Object} CatalogModels
 * @property {import('mongoose').Model} ObjectLayer
 * @property {import('mongoose').Model} CyberiaItemCatalog
 * @memberof CyberiaObjectLayerCatalog
 */

/**
 * The catalog models of a deployment context.
 * @param {{host:string,path:string}} options - Router options.
 * @returns {CatalogModels}
 * @memberof CyberiaObjectLayerCatalog
 */
export const catalogModels = (options) => ({
  ObjectLayer: DataBaseProviderService.getModel('ObjectLayer', options),
  CyberiaItemCatalog: DataBaseProviderService.getModel('CyberiaItemCatalog', options),
});

/**
 * Whether the deployment context serves the Cyberia item catalog. A host without it names
 * definitions by cid only.
 * @param {{host:string,path:string}} options - Router options.
 * @returns {boolean}
 * @memberof CyberiaObjectLayerCatalog
 */
export const catalogMounted = (options) =>
  Boolean(DataBaseProviderService.getProvider(options, 'mongoose')?.models?.CyberiaItemCatalog);

/**
 * The cid of the definition bound to a label, or null.
 * @param {CatalogModels} models
 * @param {string} itemId
 * @returns {Promise<string|null>}
 * @memberof CyberiaObjectLayerCatalog
 */
export async function findBoundCid({ CyberiaItemCatalog }, itemId) {
  return (await CyberiaItemCatalog.findOne({ itemId }, { objectLayerCid: 1 }).lean())?.objectLayerCid ?? null;
}

/**
 * The definition bound to a label, or null. A mongoose document.
 * @param {CatalogModels} models
 * @param {string} itemId
 * @returns {Promise<Object|null>}
 * @memberof CyberiaObjectLayerCatalog
 */
export async function findBoundDefinition(models, itemId) {
  const cid = await findBoundCid(models, itemId);
  return cid ? await models.ObjectLayer.findByCid(cid) : null;
}

/**
 * The bound definitions of several labels, as lean documents. Unbound labels are absent.
 * @param {CatalogModels} models
 * @param {string[]} itemIds
 * @param {Object} [filter={}] - Extra ObjectLayer query filter.
 * @returns {Promise<Object[]>}
 * @memberof CyberiaObjectLayerCatalog
 */
export async function findBoundDefinitions({ ObjectLayer, CyberiaItemCatalog }, itemIds, filter = {}) {
  const bindings = await CyberiaItemCatalog.resolve(itemIds);
  if (bindings.size === 0) return [];
  return await ObjectLayer.find({ ...filter, ...PUBLISHED, cid: { $in: [...bindings.values()] } }).lean();
}

/**
 * Every bound definition, as lean documents.
 * @param {CatalogModels} models
 * @param {Object} [filter={}] - Extra ObjectLayer query filter.
 * @returns {Promise<Object[]>}
 * @memberof CyberiaObjectLayerCatalog
 */
export async function findAllBoundDefinitions({ ObjectLayer, CyberiaItemCatalog }, filter = {}) {
  const cids = await CyberiaItemCatalog.distinct('objectLayerCid');
  if (cids.length === 0) return [];
  return await ObjectLayer.find({ ...filter, ...PUBLISHED, cid: { $in: cids } }).lean();
}

/**
 * Every bound label.
 * @param {CatalogModels} models
 * @returns {Promise<string[]>}
 * @memberof CyberiaObjectLayerCatalog
 */
export const boundItemIds = ({ CyberiaItemCatalog }) => CyberiaItemCatalog.distinct('itemId');

const isMergeableObject = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** A value a writer supplied: `null`, `undefined` and `''` mean "not provided". */
const hasValue = (value) => value !== null && value !== undefined && value !== '';

/**
 * Deep-merges `incoming` over `existing`, keeping the last attribute that carries a value.
 * Plain objects merge key by key; every other value is replaced whole.
 *
 * @param {*} existing - Currently bound value.
 * @param {*} incoming - Value received from the writer.
 * @returns {*} The merged value.
 * @memberof CyberiaObjectLayerCatalog
 */
export function mergeObjectLayerData(existing, incoming) {
  if (isMergeableObject(incoming)) {
    if (!isMergeableObject(existing)) return incoming;
    const merged = { ...existing };
    for (const key of Object.keys(incoming)) merged[key] = mergeObjectLayerData(existing[key], incoming[key]);
    return merged;
  }
  return hasValue(incoming) ? incoming : existing;
}

const sameRender = (a, b) => (a?.cid ?? '') === (b?.cid ?? '') && (a?.metadataCid ?? '') === (b?.metadataCid ?? '');

/**
 * Stores the materializations of a written definition under its cid: the editor source the writer
 * gave, and the atlas of the render it built. A definition that names the render its bound
 * predecessor named takes the predecessor's materializations for what the writer did not give.
 * @param {Object} params
 * @param {Object} params.definition - The written definition.
 * @param {Object|null} params.bound - The definition the label was bound to before the write.
 * @param {Object} [params.renderFrames] - Editor source: `{ frames, colors, frame_duration }`.
 * @param {{render: Object, atlas: Object}} [params.rendered] - Output of {@link AtlasSpriteSheetStore.build}.
 * @param {Object} [params.options] - Router options of this host.
 * @returns {Promise<void>}
 */
async function materializeDefinition({ definition, bound, renderFrames, rendered, options }) {
  const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
  const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
  const predecessor =
    bound && bound.cid !== definition.cid && sameRender(bound.data.render, definition.data.render) ? bound.cid : null;

  const source =
    renderFrames ?? (predecessor && (await ObjectLayerRenderFrames.findOne({ objectLayerCid: predecessor }).lean()));
  if (source) await ObjectLayerRenderFrames.materialize(definition.cid, source);

  const atlas =
    rendered?.atlas ?? (predecessor && (await AtlasSpriteSheet.findOne({ objectLayerCid: predecessor }).lean()));
  if (atlas) await AtlasSpriteSheetStore.materialize({ objectLayerCid: definition.cid, atlas, options });
}

/**
 * Publishes the definition a Cyberia item label runs on, under the Cyberia profile, and binds
 * the label to it.
 *
 * The payload is merged over the bound definition with {@link mergeObjectLayerData}, so a
 * degraded writer keeps what an earlier one stored. Changed content becomes a new immutable
 * definition and the label is rebound to it; identical content keeps the bound one. The label
 * binds only after {@link publishDefinition} succeeds: a definition the Object Layer authority
 * did not store stays a draft and the label keeps its binding. The materializations of the
 * written definition are stored under its cid by {@link materializeDefinition}.
 *
 * @param {Object} params
 * @param {CatalogModels} params.models
 * @param {Object} params.payload - `{ data, createdBy?, _id? }`; `data.item.id` required.
 * @param {Object} [params.setOnInsert=null] - Partial payload applied only when the label has no definition yet.
 * @param {Object} [params.renderFrames] - Editor source of the written definition.
 * @param {{render: Object, atlas: Object}} [params.rendered] - Render built for it: it sets `data.render`.
 * @param {Object} [params.options] - Router options of this host; they say whether it is the Object Layer authority.
 * @returns {Promise<Object>} The bound document.
 * @throws {import('../../api/object-layer/object-layer.publication.js').PublicationError} When the authority did not store it.
 * @memberof CyberiaObjectLayerCatalog
 */
export async function writeItemDefinition({ models, payload, setOnInsert = null, renderFrames, rendered, options }) {
  const itemId = payload?.data?.item?.id;
  if (!itemId) throw new Error('writeItemDefinition requires data.item.id');

  const bound = await findBoundDefinition(models, itemId);
  let next;
  if (bound) {
    next = { data: mergeObjectLayerData(bound.toObject({ virtuals: false }).data, payload.data) };
  } else {
    next = setOnInsert ? mergeObjectLayerData(setOnInsert, payload) : { ...payload };
  }
  next.profile = profileRef(CyberiaObjectLayerProfile);
  next.data.stats = CyberiaObjectLayerProfile.validateStats(next.data.stats);
  if (rendered) next.data.render = rendered.render;
  if (payload.createdBy) next.createdBy = payload.createdBy;

  const definition = await publishDefinition({ ObjectLayer: models.ObjectLayer, payload: next, options });
  if (!bound || bound.cid !== definition.cid) {
    await models.CyberiaItemCatalog.bind(itemId, definition.cid);
    await CacheService.invalidate(objectLayerCache(options));
  }
  await materializeDefinition({ definition, bound, renderFrames, rendered, options });
  return definition;
}

/**
 * Reconciles the catalog with the Object Layer authority: a label bound to a definition the
 * authority no longer offers (archived, a draft, or unknown) is unbound. Idempotent. An
 * authority that does not answer fails the run and changes nothing.
 * @param {CatalogModels} models
 * @param {Object} [options] - Router options of this host; they say where the authority is.
 * @returns {Promise<{checked:number,unbound:Array<{itemId:string,objectLayerCid:string,reason:string}>}>}
 * @memberof CyberiaObjectLayerCatalog
 */
export async function reconcileItemCatalog(models, options) {
  const bindings = await models.CyberiaItemCatalog.find({}, { itemId: 1, objectLayerCid: 1 }).lean();
  const result = { checked: bindings.length, unbound: [] };
  for (const { itemId, objectLayerCid } of bindings) {
    const definition = await resolveObjectLayer(objectLayerCid, options);
    const reason = !definition
      ? 'unknown'
      : definition.archivedAt
        ? 'archived'
        : definition.origin === 'draft'
          ? 'draft'
          : '';
    if (!reason) continue;
    await models.CyberiaItemCatalog.deleteOne({ itemId, objectLayerCid });
    result.unbound.push({ itemId, objectLayerCid, reason });
  }
  if (result.unbound.length > 0) await CacheService.invalidate(objectLayerCache(options));
  return result;
}

/**
 * Binds every label that has exactly one published definition and no binding yet. A draft is
 * never bound. A label with several definitions and no binding needs an explicit choice.
 * @param {CatalogModels} models
 * @returns {Promise<{bound:number,ambiguous:Array<{itemId:string,cids:string[]}>}>}
 * @memberof CyberiaObjectLayerCatalog
 */
export async function seedItemCatalog({ ObjectLayer, CyberiaItemCatalog }) {
  const result = { bound: 0, ambiguous: [] };
  const bound = new Set(await CyberiaItemCatalog.distinct('itemId'));
  const groups = await ObjectLayer.aggregate([
    { $match: PUBLISHED },
    { $group: { _id: '$data.item.id', cids: { $push: '$cid' } } },
  ]);
  for (const { _id: itemId, cids } of groups) {
    if (!itemId || bound.has(itemId)) continue;
    if (cids.length === 1) {
      await CyberiaItemCatalog.bind(itemId, cids[0]);
      result.bound++;
    } else result.ambiguous.push({ itemId, cids });
  }
  return result;
}
