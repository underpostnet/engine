/**
 * Global content: the Object Layer definitions Cyberia keeps available with no world.
 *
 * A definition is visual content. A world entity, an entity type default, a foundation, a saga or
 * an instance snapshot is not needed to keep it: an import, an item binding no world carries, or a
 * stack a player owns is enough. `CyberiaGlobalContent` names each such definition by its CID and
 * says why it stays. The definition, its render, its item bindings and the stacks that hold it stay
 * with their owners: the Object Layer store, the item catalog and the player profiles. The content
 * release carries every row (`../content/global-content-source.js`), and the release database holds
 * them, so a promotion and a rollback move them with the rest of the content.
 *
 * @module src/projects/cyberia/catalog/global-content.js
 * @namespace CyberiaGlobalContent
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';

const failure = (status, message) => Object.assign(new Error(message), { status, expected: true });
const model = (name, options) => DataBaseProviderService.getModel(name, options);

/**
 * Whether a definition is global content.
 * @param {Object} options - Router options.
 * @param {string} cid
 * @returns {Promise<boolean>}
 * @memberof CyberiaGlobalContent
 */
export const isGlobalContent = async (options, cid) =>
  Boolean(await model('CyberiaGlobalContent', options).exists({ objectLayerCid: cid }));

/**
 * Registers a definition as global content. A definition stays registered as it was first:
 * registering it again changes nothing.
 * @param {Object} options - Router options.
 * @param {Object} row
 * @param {string} row.cid
 * @param {string} row.reason - One of `GLOBAL_CONTENT_REASONS`.
 * @param {string} [row.by='']
 * @param {Date|string} [row.registeredAt] - Defaults to now.
 * @param {{domain?:string,createdBy?:string,createdAt?:Date|string|null}} [row.provenance]
 * @returns {Promise<void>}
 * @memberof CyberiaGlobalContent
 */
export async function registerGlobalContent(options, { cid, reason, by = '', registeredAt = new Date(), provenance }) {
  try {
    await model('CyberiaGlobalContent', options).updateOne(
      { objectLayerCid: cid },
      { $setOnInsert: { reason, by, registeredAt, provenance: provenance ?? {} } },
      { upsert: true, runValidators: true },
    );
  } catch (error) {
    // A concurrent registration of the same CID won the insert.
    if (error.code !== 11000) throw error;
  }
}

/**
 * Whether a definition is available here: `available` when this host stores it and the atlas of
 * the render it names, `unrendered` when it names no render, `incomplete` when the atlas is
 * missing, `missing` when this host stores no published copy.
 */
const availabilityOf = (definition, atlased) => {
  if (!definition || definition.origin === 'draft') return 'missing';
  if (!definition.data?.render?.cid) return 'unrendered';
  return atlased ? 'available' : 'incomplete';
};

/**
 * A page of global content, newest first unless the page names a sort, each row with its item, its
 * availability and the item ids the catalog binds to it.
 * @param {Object} options - Router options.
 * @param {{query:Object,sort:Object,skip:number,limit:number}} page - A parsed data query.
 * @returns {Promise<{data:Object[],total:number}>}
 * @memberof CyberiaGlobalContent
 */
export async function listGlobalContent(options, { query, sort, skip, limit }) {
  const Rows = model('CyberiaGlobalContent', options);
  const order = Object.keys(sort).length ? sort : { registeredAt: -1, objectLayerCid: 1 };
  const [rows, total] = await Promise.all([
    Rows.find(query).sort(order).skip(skip).limit(limit).lean(),
    Rows.countDocuments(query),
  ]);
  const cids = rows.map(({ objectLayerCid }) => objectLayerCid);
  const [definitions, atlased, bindings] = await Promise.all([
    model('ObjectLayer', options)
      .find({ cid: { $in: cids } }, { cid: 1, origin: 1, 'data.item': 1, 'data.render': 1 })
      .lean(),
    model('AtlasSpriteSheet', options).distinct('objectLayerCid', { objectLayerCid: { $in: cids } }),
    model('CyberiaItemCatalog', options)
      .find({ objectLayerCid: { $in: cids } }, { itemId: 1, objectLayerCid: 1 })
      .lean(),
  ]);
  const byCid = new Map(definitions.map((definition) => [definition.cid, definition]));
  const withAtlas = new Set(atlased);
  return {
    total,
    data: rows.map((row) => {
      const definition = byCid.get(row.objectLayerCid);
      return {
        ...row,
        item: { id: definition?.data?.item?.id ?? '', type: definition?.data?.item?.type ?? '' },
        availability: availabilityOf(definition, withAtlas.has(row.objectLayerCid)),
        itemIds: bindings.filter((entry) => entry.objectLayerCid === row.objectLayerCid).map(({ itemId }) => itemId),
      };
    }),
  };
}

/**
 * The CIDs of every stack a player owns, or none on a host that serves no player profile.
 * @param {Object} options - Router options.
 * @returns {Promise<string[]>}
 * @memberof CyberiaGlobalContent
 */
export const ownedCids = async (options) =>
  DataBaseProviderService.getProvider(options, 'mongoose')?.models?.CyberiaPlayer
    ? await model('CyberiaPlayer', options).ownedDefinitionCids()
    : [];

/**
 * Removes a definition from global content: the next release no longer carries it. The definition
 * stays stored. Refused while an item binding or a player stack names it.
 * @param {Object} options - Router options.
 * @param {string} cid
 * @returns {Promise<Object>} The removed row.
 * @throws {Error} 404 for a CID that is not global content; 409 while an item or a player holds it.
 * @memberof CyberiaGlobalContent
 */
export async function unregisterGlobalContent(options, cid) {
  const bound = await model('CyberiaItemCatalog', options).distinct('itemId', { objectLayerCid: cid });
  if (bound.length) throw failure(409, `${bound.join(', ')} run ${cid}: unbind them first`);
  if ((await ownedCids(options)).includes(cid)) throw failure(409, `Players own stacks of ${cid}`);
  const removed = await model('CyberiaGlobalContent', options).findOneAndDelete({ objectLayerCid: cid }).lean();
  if (!removed) throw failure(404, `${cid} is not global content`);
  return removed;
}
