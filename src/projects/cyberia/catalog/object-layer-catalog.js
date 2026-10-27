/**
 * Cyberia item catalog over the Object Layer store.
 *
 * Cyberia content names items by item id (`data.item.id`), which the protocol never keeps
 * unique. The `CyberiaItemCatalog` collection binds each item id to the one `objectLayerCid` the
 * runtime runs. This module resolves item ids, publishes definitions, and holds {@link bindItem},
 * the one write of a binding: publishing a definition never binds it.
 *
 * @module src/projects/cyberia/catalog/object-layer-catalog.js
 * @namespace CyberiaObjectLayerCatalog
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { profileRef } from '../../../client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { CyberiaObjectLayerProfile } from '../../../client/components/cyberia/ObjectLayerProfileCyberia.js';
import {
  cacheCanonical,
  isObjectLayerAuthority,
  objectLayerCache,
  publishDefinition,
  storeDraft,
} from '../../../api/object-layer/object-layer.publication.js';
import { objectLayerIdentity } from '../../../api/object-layer/object-layer.identity.js';
import { publishObjectLayerBundle } from '../../../api/object-layer/object-layer.ipfs.js';
import { AtlasSpriteSheetStore } from '../../../api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { resolveObjectLayer } from '../../../server/domain/object-layer-resolver.js';
import { CacheService } from '../../../server/storage/cache.js';
import { DataQuery } from '../../../server/storage/data-query.js';

/** Definitions the runtime may serve: published ones, never a draft. */
const PUBLISHED = Object.freeze({ origin: { $ne: 'draft' } });

/**
 * The APIs a writer of item definitions loads: the store and the catalog, the materializations
 * {@link publishItemDefinition} stores under every written cid, and the Files and pins they hold.
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
 * The cids among some definitions that have stored render frames: the only definitions a view
 * draws and a frame operation takes.
 * @param {{ObjectLayerRenderFrames:Object}} models
 * @param {string[]} cids
 * @returns {Promise<Set<string>>}
 * @memberof CyberiaObjectLayerCatalog
 */
export const renderedCids = async ({ ObjectLayerRenderFrames }, cids) => {
  const unique = [...new Set(cids.filter(Boolean))];
  if (unique.length === 0) return new Set();
  return new Set(await ObjectLayerRenderFrames.distinct('objectLayerCid', { objectLayerCid: { $in: unique } }));
};

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
 * The state of a binding: `bound` when the item runs a published definition with a render,
 * `unrendered` without a render, `draft` or `archived` when the definition cannot run, and
 * `missing` when this host does not store it.
 * @memberof CyberiaObjectLayerCatalog
 */
export const BINDING_STATUSES = Object.freeze(['bound', 'unrendered', 'draft', 'archived', 'missing']);

/**
 * A page of bindings, each with what its definition says about it: `itemType`, `render` (the
 * render CID, empty without one), `atlas` (whether this host holds the atlas of the render),
 * `bindingStatus` (one of {@link BINDING_STATUSES}) and the `source`, `by` and `at` of its last
 * change. The filter and the sort apply to every field of a row.
 * @param {CatalogModels & {AtlasSpriteSheet: import('mongoose').Model}} models
 * @param {{query:Object,sort:Object,skip:number,limit:number}} page - A parsed data query.
 * @returns {Promise<{data:Object[],total:number}>}
 * @memberof CyberiaObjectLayerCatalog
 */
export async function listBindings({ CyberiaItemCatalog, ObjectLayer, AtlasSpriteSheet }, page) {
  const { query, sort, skip, limit } = page;
  const first = (path) => ({ $arrayElemAt: [path, 0] });
  const [{ data, total }] = await CyberiaItemCatalog.aggregate([
    {
      $lookup: {
        from: ObjectLayer.collection.name,
        localField: 'objectLayerCid',
        foreignField: 'cid',
        pipeline: [{ $project: { 'data.item.type': 1, 'data.render.cid': 1, origin: 1, archivedAt: 1 } }],
        as: 'definition',
      },
    },
    {
      $lookup: {
        from: AtlasSpriteSheet.collection.name,
        localField: 'objectLayerCid',
        foreignField: 'objectLayerCid',
        pipeline: [{ $limit: 1 }, { $project: { _id: 1 } }],
        as: 'atlas',
      },
    },
    { $set: { definition: first('$definition'), last: { $arrayElemAt: ['$history', -1] } } },
    {
      $project: {
        _id: 0,
        itemId: 1,
        objectLayerCid: 1,
        updatedAt: 1,
        itemType: { $ifNull: ['$definition.data.item.type', ''] },
        render: { $ifNull: ['$definition.data.render.cid', ''] },
        atlas: { $gt: [{ $size: '$atlas' }, 0] },
        source: { $ifNull: ['$last.source', ''] },
        by: { $ifNull: ['$last.by', ''] },
        bindingStatus: {
          $switch: {
            branches: [
              { case: { $eq: [{ $type: '$definition' }, 'missing'] }, then: 'missing' },
              { case: { $eq: ['$definition.origin', 'draft'] }, then: 'draft' },
              { case: { $gt: ['$definition.archivedAt', null] }, then: 'archived' },
              { case: { $not: ['$definition.data.render.cid'] }, then: 'unrendered' },
            ],
            default: 'bound',
          },
        },
      },
    },
    { $match: query },
    {
      $facet: {
        data: [{ $sort: Object.keys(sort).length > 0 ? sort : { itemId: 1 } }, { $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
    { $project: { data: 1, total: { $ifNull: [{ $arrayElemAt: ['$total.count', 0] }, 0] } } },
  ]);
  return { data, total };
}

/**
 * The binding history of an item and every definition it could run: the definitions stored under
 * its item id and every definition it ran, newest first.
 * @param {CatalogModels} models
 * @param {string} itemId
 * @returns {Promise<{itemId:string,objectLayerCid:string,history:Object[],definitions:Object[]}>}
 *   `objectLayerCid` is empty for an unbound item.
 * @memberof CyberiaObjectLayerCatalog
 */
export async function itemBindingHistory({ CyberiaItemCatalog, ObjectLayer }, itemId) {
  const entry = await CyberiaItemCatalog.findOne({ itemId }, { objectLayerCid: 1, history: 1 }).lean();
  const ran = (entry?.history ?? []).map(({ objectLayerCid }) => objectLayerCid);
  const definitions = await ObjectLayer.find(
    { $or: [{ 'data.item.id': itemId }, { cid: { $in: ran } }] },
    { cid: 1, origin: 1, archivedAt: 1, createdAt: 1, 'data.render.cid': 1 },
  )
    .sort({ createdAt: -1 })
    .lean();
  return {
    itemId,
    objectLayerCid: entry?.objectLayerCid ?? '',
    history: [...(entry?.history ?? [])].reverse(),
    definitions: definitions.map(({ cid, origin, archivedAt, createdAt, data }) => ({
      cid,
      origin,
      archived: !!archivedAt,
      createdAt,
      render: data?.render?.cid ?? '',
    })),
  };
}

/**
 * The items a bind can add to the catalog: each has a published definition that is not archived,
 * and no binding. `q` matches a part of the item id, case-insensitive.
 * @param {CatalogModels} models
 * @param {{q?:string,limit?:number}} [params]
 * @returns {Promise<Array<{itemId:string,itemType:string,definitions:number}>>} By item id.
 * @memberof CyberiaObjectLayerCatalog
 */
export async function unboundItems({ ObjectLayer, CyberiaItemCatalog }, { q = '', limit = 20 } = {}) {
  const { query } = DataQuery.parse({
    filterModel: q ? { 'data.item.id': { filterType: 'text', type: 'contains', filter: q } } : null,
  });
  const bound = await CyberiaItemCatalog.distinct('itemId');
  const groups = await ObjectLayer.aggregate([
    { $match: { $and: [query, PUBLISHED, { archivedAt: null }, { 'data.item.id': { $nin: [...bound, '', null] } }] } },
    { $group: { _id: '$data.item.id', itemType: { $first: '$data.item.type' }, definitions: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $limit: limit },
  ]);
  return groups.map(({ _id, itemType, definitions }) => ({ itemId: _id, itemType: itemType ?? '', definitions }));
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

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

/**
 * Makes sure a definition can run: stored here and published, or held by the Object Layer
 * authority, in which case a consumer keeps a copy to serve.
 * @throws {Error} 400 for a draft, an archived or an unknown definition.
 */
async function assertRunnable({ ObjectLayer }, cid, options) {
  const stored = await ObjectLayer.findOne({ cid }, { origin: 1, archivedAt: 1 }).lean();
  if (stored?.origin === 'draft') throw invalid(`Object Layer ${cid} is a draft; publish it first`);
  if (stored?.archivedAt) throw invalid(`Object Layer ${cid} is archived`);
  if (stored) return;
  const definition = isObjectLayerAuthority(options) ? null : await resolveObjectLayer(cid, options);
  if (!definition) throw invalid(`No Object Layer definition with cid ${cid}`);
  if (definition.archivedAt) throw invalid(`Object Layer ${cid} is archived at the authority`);
  await cacheCanonical({ ObjectLayer, cid, definition, options });
}

/**
 * Binds an item id to a definition: the one write of the active runtime binding. The item must
 * still run `expectedCid`, so a concurrent binding is never overwritten, and the change joins the
 * binding history in the same write.
 * @param {Object} params
 * @param {CatalogModels} params.models
 * @param {string} params.itemId
 * @param {string} params.objectLayerCid
 * @param {string|null} params.expectedCid - The definition the caller saw the item run; empty when unbound.
 * @param {string} params.source - What binds: see `BINDING_SOURCES` of the catalog model.
 * @param {string} [params.by=''] - The actor.
 * @param {Object} [params.provenance] - Where an imported definition came from.
 * @param {import('mongoose').ClientSession} [params.session] - The transaction the binding joins.
 * @param {Object} [params.options] - Router options of this host.
 * @returns {Promise<Object>} The catalog entry.
 * @throws {Error} 400 when the definition cannot run; 409 when the item runs another definition.
 * @memberof CyberiaObjectLayerCatalog
 */
export async function bindItem({
  models,
  itemId,
  objectLayerCid,
  expectedCid,
  source,
  by = '',
  provenance,
  session,
  options,
}) {
  if (!itemId) throw invalid('An item id is required');
  await assertRunnable(models, objectLayerCid, options);
  const entry = await models.CyberiaItemCatalog.bind(itemId, objectLayerCid, {
    expectedCid,
    source,
    by,
    provenance,
    session,
  });
  await CacheService.invalidate(objectLayerCache(options));
  return entry;
}

/**
 * Stores the materializations of a written definition under its cid: the editor source the writer
 * gave, and the atlas of the render it built. A definition that names the render its bound
 * predecessor named takes the predecessor's materializations for what the writer did not give.
 * @param {Object} params
 * @param {Object} params.definition - The written definition.
 * @param {Object|null} params.bound - The definition the label was bound to before the write.
 * @param {Object} [params.renderFrames] - Editor source: a render source (`RenderSource.js`).
 * @param {{render: Object, atlas: Object}} [params.rendered] - Output of {@link AtlasSpriteSheetStore.build}.
 * @param {Object} [params.options] - Router options of this host.
 * @returns {Promise<void>}
 */
async function materializeDefinition({ definition, bound, renderFrames, rendered, options }) {
  const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
  const AtlasSpriteSheet = DataBaseProviderService.getModel('AtlasSpriteSheet', options);
  const predecessor =
    bound && bound.cid !== definition.cid && sameRender(bound.data.render, definition.data.render) ? bound.cid : null;

  const inherited = predecessor && (await ObjectLayerRenderFrames.findOne({ objectLayerCid: predecessor }).lean());
  const source = renderFrames ?? (inherited && ObjectLayerRenderFrames.sourceOf(inherited));
  if (source) await ObjectLayerRenderFrames.materialize(definition.cid, source);

  const atlas =
    rendered?.atlas ?? (predecessor && (await AtlasSpriteSheet.findOne({ objectLayerCid: predecessor }).lean()));
  if (atlas) await AtlasSpriteSheetStore.materialize({ objectLayerCid: definition.cid, atlas, options });
}

/**
 * The definition a write produces: the payload merged over the bound data with
 * {@link mergeObjectLayerData}, or over `setOnInsert` when the label has none, under the
 * Cyberia profile. Its identity decides whether a write changes the binding.
 *
 * @param {Object} params
 * @param {Object|null} params.boundData - `data` of the definition the label is bound to.
 * @param {Object} params.payload - `{ data }`; `data.item.id` required.
 * @param {Object} [params.setOnInsert=null] - Partial payload applied only when nothing is bound.
 * @returns {{profile:Object,data:Object}}
 * @memberof CyberiaObjectLayerCatalog
 */
export function composeItemDefinition({ boundData, payload, setOnInsert = null }) {
  const next = boundData
    ? { data: mergeObjectLayerData(boundData, payload.data) }
    : setOnInsert
      ? mergeObjectLayerData(setOnInsert, payload)
      : { ...payload };
  next.profile = profileRef(CyberiaObjectLayerProfile);
  next.data.stats = CyberiaObjectLayerProfile.validateStats(next.data.stats);
  return next;
}

/**
 * The cid an exact publication of a stored definition gives: its content composed alone, with the
 * render it names. A revision stored under the current profile gives its own cid.
 * @param {{data:Object}} definition - A stored definition, lean.
 * @returns {string}
 * @memberof CyberiaObjectLayerCatalog
 */
export const exactDefinitionCid = (definition) =>
  objectLayerIdentity(composeItemDefinition({ boundData: null, payload: { data: structuredClone(definition.data) } }))
    .cid;

/**
 * Publishes a definition of a Cyberia item under the Cyberia profile. The item keeps its binding:
 * {@link bindItem} moves it.
 *
 * The payload is composed by {@link composeItemDefinition} over the definition the item runs, so a
 * degraded writer keeps what an earlier one stored; `exact` composes it alone, as a snapshot
 * restore reproduces its definition. Changed content becomes a new immutable definition; identical
 * content resolves to the stored one. A definition the Object Layer authority did not store stays
 * a draft. The materializations of the written definition are stored under its cid by
 * {@link materializeDefinition}, and its render on IPFS under the same cid.
 *
 * @param {Object} params
 * @param {CatalogModels} params.models
 * @param {Object} params.payload - `{ data, createdBy?, _id? }`; `data.item.id` required.
 * @param {Object} [params.setOnInsert=null] - Partial payload applied only when the label has no definition yet.
 * @param {Object} [params.renderFrames] - Editor source of the written definition.
 * @param {{render: Object, atlas: Object}} [params.rendered] - Render built for it: it sets `data.render`.
 * @param {boolean} [params.exact=false] - Compose the payload alone, never over the bound definition.
 * @param {Object} [params.options] - Router options of this host; they say whether it is the Object Layer authority.
 * @returns {Promise<Object>} The published document.
 * @throws {import('../../../api/object-layer/object-layer.publication.js').PublicationError} When the authority did not store it.
 * @memberof CyberiaObjectLayerCatalog
 */
export async function publishItemDefinition({
  models,
  payload,
  setOnInsert = null,
  renderFrames,
  rendered,
  exact = false,
  options,
}) {
  const itemId = payload?.data?.item?.id;
  if (!itemId) throw new Error('publishItemDefinition requires data.item.id');

  const bound = await findBoundDefinition(models, itemId);
  const next = composeItemDefinition({
    boundData: bound && !exact ? bound.toObject({ virtuals: false }).data : null,
    payload,
    setOnInsert,
  });
  if (rendered) next.data.render = rendered.render;
  if (payload.createdBy) next.createdBy = payload.createdBy;

  const definition = await publishDefinition({ ObjectLayer: models.ObjectLayer, payload: next, options });
  await materializeDefinition({ definition, bound, renderFrames, rendered, options });
  await publishObjectLayerBundle({ definition, options });
  return definition;
}

/**
 * Stores a definition as a draft: composed under the Cyberia profile and written with its
 * materializations and its render on IPFS under its cid, bound to no item, published nowhere and
 * served to no one. Identical content resolves to the stored document.
 * {@link publishItemDefinition} publishes it later.
 *
 * @param {Object} params
 * @param {CatalogModels} params.models
 * @param {Object} params.payload - `{ data, createdBy? }`; `data.item.id` required.
 * @param {Object} [params.renderFrames] - Editor source of the written definition.
 * @param {{render: Object, atlas: Object}} [params.rendered] - Render built for it: it sets `data.render`.
 * @param {Object} [params.options] - Router options of this host.
 * @returns {Promise<Object>} The stored document.
 * @memberof CyberiaObjectLayerCatalog
 */
export async function writeDraftDefinition({ models, payload, renderFrames, rendered, options }) {
  if (!payload?.data?.item?.id) throw new Error('writeDraftDefinition requires data.item.id');
  const next = composeItemDefinition({ boundData: null, payload });
  if (rendered) next.data.render = rendered.render;
  if (payload.createdBy) next.createdBy = payload.createdBy;
  const definition = await storeDraft({ ObjectLayer: models.ObjectLayer, payload: next, options });
  await materializeDefinition({ definition, bound: null, renderFrames, rendered, options });
  await publishObjectLayerBundle({ definition, options });
  return definition;
}

/**
 * Brings the definition a label runs on in line with the current Cyberia profile: its profile
 * and stats are composed again, and `revise` may change its data first. Only a definition whose
 * identity changes is written, through {@link publishItemDefinition}; the label then rebinds to it
 * and keeps its materializations.
 * @param {Object} params
 * @param {CatalogModels} params.models
 * @param {string} params.itemId - The label.
 * @param {(payload:{data:Object})=>void} [params.revise] - Changes the payload in place.
 * @param {Object} [params.options] - Router options of this host.
 * @returns {Promise<{definition:Object|null,written:boolean}>} The definition the label runs on
 *   now; null when the label is unbound.
 * @memberof CyberiaObjectLayerCatalog
 */
export async function reviseItemDefinition({ models, itemId, revise = () => {}, options }) {
  const bound = await findBoundDefinition(models, itemId);
  if (!bound) return { definition: null, written: false };
  const boundData = bound.toObject({ virtuals: false }).data;
  const payload = { data: structuredClone(boundData) };
  revise(payload);
  if (objectLayerIdentity(composeItemDefinition({ boundData, payload })).cid === bound.cid)
    return { definition: bound, written: false };
  const definition = await publishItemDefinition({ models, payload, options });
  await bindItem({ models, itemId, objectLayerCid: definition.cid, expectedCid: bound.cid, source: 'revise', options });
  return { definition, written: true };
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
      await CyberiaItemCatalog.bind(itemId, cids[0], { expectedCid: null, source: 'seed' });
      result.bound++;
    } else result.ambiguous.push({ itemId, cids });
  }
  return result;
}
