/**
 * Mongoose model for the CyberiaItemCatalog API: the Object Layer definition Cyberia binds to
 * each item label. Cyberia content names items by label; this catalog is the one place a label
 * resolves to a canonical `objectLayerCid`.
 *
 * @module src/api/cyberia-item-catalog/cyberia-item-catalog.model.js
 * @namespace CyberiaItemCatalogModel
 */
import { Schema, model } from 'mongoose';
import { OBJECT_LAYER_CID_PATTERN } from '../object-layer/object-layer.identity.js';

/**
 * @typedef {Object} CyberiaItemCatalogEntry
 * @property {string} itemId - Item label, one entry per label
 * @property {string} objectLayerCid - Canonical CID of the definition the label runs on
 * @property {Date} createdAt - When the label was first bound
 * @property {Date} updatedAt - When the binding last changed
 * @memberof CyberiaItemCatalogModel
 */
const CyberiaItemCatalogSchema = new Schema(
  {
    itemId: { type: String, required: true, unique: true, trim: true },
    objectLayerCid: { type: String, required: true, trim: true, match: OBJECT_LAYER_CID_PATTERN },
  },
  { timestamps: true },
);

CyberiaItemCatalogSchema.index({ objectLayerCid: 1 });

/**
 * Binds a label to a definition, replacing any earlier binding.
 * @param {string} itemId
 * @param {string} objectLayerCid
 * @returns {Promise<Object>} The stored entry.
 * @memberof CyberiaItemCatalogModel
 */
CyberiaItemCatalogSchema.statics.bind = async function (itemId, objectLayerCid) {
  return await this.findOneAndUpdate(
    { itemId },
    { $set: { objectLayerCid }, $setOnInsert: { itemId } },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
};

/**
 * The cid bound to each of the given labels. Unbound labels are absent.
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

const CyberiaItemCatalogModel = model('CyberiaItemCatalog', CyberiaItemCatalogSchema);
const ProviderSchema = CyberiaItemCatalogSchema;

class CyberiaItemCatalogDto {
  static select = {
    get: () => ({ _id: 1, itemId: 1, objectLayerCid: 1, createdAt: 1, updatedAt: 1 }),
  };
}

export { CyberiaItemCatalogSchema, CyberiaItemCatalogModel, ProviderSchema, CyberiaItemCatalogDto };
