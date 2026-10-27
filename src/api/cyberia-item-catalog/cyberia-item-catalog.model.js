/**
 * Mongoose model for the CyberiaItemCatalog API: the active runtime binding of each Cyberia item.
 * Content names items by `itemId`; this catalog is the one place an item id resolves to the
 * `objectLayerCid` the runtime runs. A binding changes only through {@link bind}, which checks the
 * definition the caller saw and records the change in the same write.
 *
 * @module src/api/cyberia-item-catalog/cyberia-item-catalog.model.js
 * @namespace CyberiaItemCatalogModel
 */
import { Schema, model } from 'mongoose';
import { OBJECT_LAYER_CID_PATTERN } from '../object-layer/object-layer.identity.js';

/**
 * What made a binding: an explicit Studio bind, a procedural promotion, a content import, a
 * snapshot restore, a profile revision, the first binding of a label with one definition, or an
 * import of a definition from the Object Layer authority.
 * @memberof CyberiaItemCatalogModel
 */
export const BINDING_SOURCES = Object.freeze([
  'studio',
  'procedural',
  'content',
  'snapshot',
  'revise',
  'seed',
  'import',
]);

/**
 * @typedef {Object} CyberiaItemCatalogEntry
 * @property {string} itemId - Item id, one entry per id
 * @property {string} objectLayerCid - CID of the definition the runtime runs for the item
 * @property {Array<{objectLayerCid:string,previousCid:string,source:string,by:string,at:Date,provenance:Object}>} history - Every binding, oldest first; an `import` holds its provenance
 * @property {Date} createdAt - When the item was first bound
 * @property {Date} updatedAt - When the binding last changed
 * @memberof CyberiaItemCatalogModel
 */
/** Where an imported definition came from, and what the moderator confirmed. */
const ProvenanceSchema = new Schema(
  {
    domain: { type: String, required: true },
    createdBy: { type: String, default: '' },
    createdAt: { type: Date, default: null },
    warnings: { type: [String], default: [] },
    acknowledged: { type: Boolean, default: false },
  },
  { _id: false },
);

const BindingSchema = new Schema(
  {
    objectLayerCid: { type: String, required: true, match: OBJECT_LAYER_CID_PATTERN },
    previousCid: { type: String, default: '' },
    source: { type: String, required: true, enum: BINDING_SOURCES },
    by: { type: String, default: '' },
    at: { type: Date, required: true },
    provenance: { type: ProvenanceSchema, default: undefined },
  },
  { _id: false },
);

const CyberiaItemCatalogSchema = new Schema(
  {
    itemId: { type: String, required: true, unique: true, trim: true },
    objectLayerCid: { type: String, required: true, trim: true, match: OBJECT_LAYER_CID_PATTERN },
    history: { type: [BindingSchema], default: [] },
  },
  { timestamps: true },
);

CyberiaItemCatalogSchema.index({ objectLayerCid: 1 });

const conflict = (message) => Object.assign(new Error(message), { status: 409 });

/**
 * Why a write refuses an item that runs another definition than the writer saw.
 * @param {string} itemId
 * @param {string|undefined} current - The definition it runs; empty when unbound.
 * @param {string|null} expected - The definition the writer saw; empty when unbound.
 * @returns {string}
 * @memberof CyberiaItemCatalogModel
 */
export const runsAnother = (itemId, current, expected) =>
  `'${itemId}' runs ${current || 'no definition'}, not ${expected || 'no definition'}`;

/**
 * Binds an item to a definition while the item still runs `expectedCid`, and appends the change to
 * its history in the same write. Binding the definition the item already runs changes nothing.
 * @param {string} itemId
 * @param {string} objectLayerCid
 * @param {Object} binding
 * @param {string|null} binding.expectedCid - The definition the caller saw; empty for an unbound item.
 * @param {string} binding.source - One of {@link BINDING_SOURCES}.
 * @param {string} [binding.by=''] - The actor.
 * @param {Object} [binding.provenance] - Where an imported definition came from.
 * @param {import('mongoose').ClientSession} [binding.session] - The transaction the write joins.
 * @returns {Promise<Object>} The stored entry, lean.
 * @throws {Error} 409 when the item runs another definition than `expectedCid`.
 * @memberof CyberiaItemCatalogModel
 */
CyberiaItemCatalogSchema.statics.bind = async function (
  itemId,
  objectLayerCid,
  { expectedCid, source, by = '', provenance, session = null },
) {
  const current = await this.findOne({ itemId }).session(session).lean();
  if (current?.objectLayerCid === objectLayerCid) return current;
  const entry = {
    objectLayerCid,
    previousCid: expectedCid || '',
    source,
    by,
    at: new Date(),
    ...(provenance && { provenance }),
  };
  const runs = runsAnother(itemId, current?.objectLayerCid, expectedCid);
  if (!expectedCid) {
    if (current) throw conflict(runs);
    try {
      const [created] = await this.create([{ itemId, objectLayerCid, history: [entry] }], { session });
      return created.toObject();
    } catch (error) {
      if (error?.code === 11000) throw conflict(`'${itemId}' was bound meanwhile`);
      throw error;
    }
  }
  const updated = await this.findOneAndUpdate(
    { itemId, objectLayerCid: expectedCid },
    { $set: { objectLayerCid }, $push: { history: entry } },
    { returnDocument: 'after', runValidators: true, session },
  ).lean();
  if (!updated) throw conflict(runs);
  return updated;
};

/**
 * The cid bound to each of the given items. Unbound items are absent.
 * @param {string[]} itemIds
 * @returns {Promise<Map<string,string>>} itemId → objectLayerCid.
 * @memberof CyberiaItemCatalogModel
 */
CyberiaItemCatalogSchema.statics.resolve = async function (itemIds = []) {
  const labels = [...new Set(itemIds.filter(Boolean))];
  if (labels.length === 0) return new Map();
  const entries = await this.find({ itemId: { $in: labels } }, { itemId: 1, objectLayerCid: 1 }).lean();
  return new Map(entries.map((entry) => [entry.itemId, entry.objectLayerCid]));
};

/**
 * The binding of each of the given items with its revision: how many bindings its history holds.
 * Unbound items are absent.
 * @param {string[]} itemIds
 * @param {import('mongoose').ClientSession} [session] - The transaction the read joins.
 * @returns {Promise<Map<string,{cid:string,revision:number}>>}
 * @memberof CyberiaItemCatalogModel
 */
CyberiaItemCatalogSchema.statics.bindingsOf = async function (itemIds = [], session = null) {
  const labels = [...new Set(itemIds.filter(Boolean))];
  if (labels.length === 0) return new Map();
  const entries = await this.find(
    { itemId: { $in: labels } },
    { itemId: 1, objectLayerCid: 1, revision: { $size: '$history' } },
  )
    .session(session)
    .lean();
  return new Map(entries.map(({ itemId, objectLayerCid, revision }) => [itemId, { cid: objectLayerCid, revision }]));
};

const CyberiaItemCatalogModel = model('CyberiaItemCatalog', CyberiaItemCatalogSchema);
const ProviderSchema = CyberiaItemCatalogSchema;

class CyberiaItemCatalogDto {
  static select = {
    get: () => ({ _id: 1, itemId: 1, objectLayerCid: 1, createdAt: 1, updatedAt: 1 }),
  };
}

export { CyberiaItemCatalogSchema, CyberiaItemCatalogModel, ProviderSchema, CyberiaItemCatalogDto };
