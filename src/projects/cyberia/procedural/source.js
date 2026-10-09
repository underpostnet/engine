/**
 * The sources a generation reads: an existing Cyberia item (the definition its item id is bound to,
 * its render when it has one, and the art direction and biomes the content foundation gives it), or
 * the function a new item of a type starts from. A generation reads a source only through this
 * module.
 *
 * @module src/projects/cyberia/procedural/source.js
 * @namespace CyberiaProceduralSource
 */
import { contentArtifact } from '../content/content-artifact.js';
import { itemContext } from '../content/foundation-context.js';
import { findBoundCid } from '../catalog/object-layer-catalog.js';
import { extractArtDirection } from './context.js';
import { requestError } from './engine.js';

/**
 * The foundation context of an item label; null where the host holds no content artifact or the
 * foundation does not define the label.
 */
const contextOf = (itemId) => {
  try {
    return itemContext(itemId);
  } catch {
    return null;
  }
};

/**
 * A stored definition and its render when it has one.
 * @param {Object} models
 * @param {string} cid
 * @returns {Promise<{cid:string,data:{item:Object,stats:Object},renderSource:Object|null}>}
 * @throws {Error} 404 when no stored definition has the cid.
 * @memberof CyberiaProceduralSource
 */
export async function loadSource({ ObjectLayer, ObjectLayerRenderFrames }, cid) {
  const definition = await ObjectLayer.findByCid(cid).lean();
  if (!definition) throw requestError(`Object Layer ${cid} is not stored here`, 404);
  const frames = await ObjectLayerRenderFrames.findOne({ objectLayerCid: definition.cid }).lean();
  return {
    cid: definition.cid,
    data: { item: definition.data.item, stats: definition.data.stats },
    renderSource: frames ? ObjectLayerRenderFrames.sourceOf(frames) : null,
  };
}

/**
 * The definition an existing item runs on.
 * @param {Object} models
 * @param {string} itemId
 * @returns {Promise<{cid:string,data:Object,renderSource:Object|null,artDirection:Object|null}>} The source and the art direction of the item.
 * @throws {Error} 404 when the item is not bound to a definition.
 * @memberof CyberiaProceduralSource
 */
export async function loadItemSource(models, itemId) {
  const cid = await findBoundCid(models, itemId);
  if (!cid) throw requestError(`Item ${itemId} is not a Cyberia item here`, 404);
  return { ...(await loadSource(models, cid)), artDirection: extractArtDirection(contextOf(itemId)) };
}

/**
 * A page of the existing items: every item label bound to a definition. The filter and the sort
 * apply to `itemId`, `itemType`, `hasRender`, `currentCid` and `updatedAt`; the art direction,
 * biomes and the base colors of the foundation palettes come from the content foundation.
 * @param {Object} models
 * @param {{query:Object,sort:Object,skip:number,limit:number}} page - A parsed data query.
 * @returns {Promise<{data:Object[],total:number}>}
 * @memberof CyberiaProceduralSource
 */
export async function listSources({ CyberiaItemCatalog, ObjectLayer, ObjectLayerRenderFrames }, page) {
  const { query, sort, skip, limit } = page;
  const [{ data, total }] = await CyberiaItemCatalog.aggregate([
    {
      $lookup: {
        from: ObjectLayer.collection.name,
        localField: 'objectLayerCid',
        foreignField: 'cid',
        as: 'definition',
      },
    },
    {
      $lookup: {
        from: ObjectLayerRenderFrames.collection.name,
        let: { cid: '$objectLayerCid' },
        pipeline: [
          { $match: { $expr: { $eq: ['$objectLayerCid', '$$cid'] } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: 'frames',
      },
    },
    {
      $project: {
        _id: 0,
        itemId: 1,
        currentCid: '$objectLayerCid',
        updatedAt: 1,
        itemType: { $arrayElemAt: ['$definition.data.item.type', 0] },
        hasRender: { $gt: [{ $size: '$frames' }, 0] },
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
  return {
    data: data.map((row) => {
      const context = contextOf(row.itemId);
      const artDirection = extractArtDirection(context);
      return {
        ...row,
        artDirection: artDirection?.brief?.detail ?? '',
        biome: (context?.world.biomes ?? []).map(({ name }) => name),
        palette: (artDirection?.palettes ?? []).flatMap(({ roles }) => roles.base ?? []),
      };
    }),
    total,
  };
}

/**
 * The function a new item of a type starts from: the `activable` flag and the stats of the item the
 * content names as the baseline of the type.
 * @param {string} itemType
 * @returns {{itemId:string,activable:boolean,stats:Object}}
 * @throws {RangeError} When the content names no baseline item for the type.
 * @memberof CyberiaProceduralSource
 */
export function itemBaseline(itemType) {
  const { itemBaseline: labels, byItemId } = contentArtifact();
  const item = byItemId.get(labels[itemType]);
  if (!item) throw new RangeError(`The content names no baseline ${itemType} item`);
  return { itemId: item.itemId, activable: item.payload.data.item.activable, stats: { ...item.payload.data.stats } };
}

/**
 * The source of a new item: no definition and no render, the function of its baseline and an empty
 * description the moderator writes.
 * @param {string} itemType
 * @param {{activable:boolean,stats:Object}} baseline - {@link itemBaseline}.
 * @returns {{cid:string,data:{item:Object,stats:Object},renderSource:null}}
 * @memberof CyberiaProceduralSource
 */
export const baselineSource = (itemType, { activable, stats }) => ({
  cid: '',
  data: { item: { id: '', type: itemType, description: '', activable }, stats: { ...stats } },
  renderSource: null,
});
