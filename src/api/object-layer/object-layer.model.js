/**
 * Mongoose model for ObjectLayer API, defining schema, indexes, and data validation.
 * @module src/api/object-layer/object-layer.model.js
 * @namespace CyberiaObjectLayerModel
 */
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { Schema, model } from 'mongoose';
/**
 * @typedef {Object} Stats
 * @property {number} effect - The effect attribute value
 * @property {number} resistance - The resistance attribute value
 * @property {number} agility - The agility attribute value
 * @property {number} range - The range attribute value
 * @property {number} intelligence - The intelligence attribute value
 * @property {number} utility - The utility attribute value
 * @memberof CyberiaObjectLayerModel
 */
const StatsSchema = new Schema(
  {
    effect: { type: Number, required: true, min: 0 },
    resistance: { type: Number, required: true, min: 0 },
    agility: { type: Number, required: true, min: 0 },
    range: { type: Number, required: true, min: 0 },
    intelligence: { type: Number, required: true, min: 0 },
    utility: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);
/**
 * @typedef {Object} Item
 * @property {string} id - Unique identifier for the item
 * @property {string} type - Type of the item
 * @property {string} description - Description of the item
 * @property {boolean} activable - Whether the item can be activated
 * @memberof CyberiaObjectLayerModel
 */
const ItemSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    activable: { type: Boolean, default: false },
  },
  { _id: false },
);
/**
 * @typedef {Object} Ledger
 * Blockchain protocol metadata linking the visual object-layer prefab to its economic reality.
 * Uses ERC-1155 as the single multi-token standard for both fungible (CryptoKoyn) and
 * non-fungible / semi-fungible Object Layer items within one contract.
 * @property {string} type - The token standard or off-chain designation (ERC1155, OFF_CHAIN).
 * @property {string} address - The Solidity smart contract address (ObjectLayerToken).
 * @property {string} tokenId - The uint256 ERC-1155 token ID (derived from keccak256 of the item identifier).
 * @memberof CyberiaObjectLayerModel
 */
const LedgerSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['ERC1155', 'OFF_CHAIN'],
      required: true,
    },
    address: { type: String }, // ObjectLayerToken ERC-1155 contract address
    tokenId: { type: String, default: '' }, // uint256 ERC-1155 token ID (hex or decimal string)
  },
  { _id: false },
);
/**
 * @typedef {Object} Render
 * IPFS content identifiers for the consolidated atlas sprite sheet.
 * @property {string} cid - IPFS Content Identifier for the consolidated atlas sprite sheet PNG
 * @property {string} metadataCid - IPFS Content Identifier for the atlas sprite sheet metadata JSON (fast-json-stable-stringify)
 * @memberof CyberiaObjectLayerModel
 */
const RenderSchema = new Schema(
  {
    cid: { type: String, default: '', trim: true },
    metadataCid: { type: String, default: '', trim: true },
  },
  { _id: false },
);
/**
 * @typedef {Object} ObjectLayer
 * @property {Object} data - Object layer data
 * @property {Object} data.stats - Statistical or mechanical attributes for the object layer
 * @property {number} data.stats.effect - The effect attribute value
 * @property {number} data.stats.resistance - The resistance attribute value
 * @property {number} data.stats.agility - The agility attribute value
 * @property {number} data.stats.range - The range attribute value
 * @property {number} data.stats.intelligence - The intelligence attribute value
 * @property {number} data.stats.utility - The utility attribute value
 * @property {Object} data.item - Human-readable item information for the object layer
 * @property {string} data.item.id - Unique identifier for the item
 * @property {string} data.item.type - Type of the item
 * @property {string} data.item.description - Description of the item
 * @property {boolean} data.item.activable - Whether the item can be activated
 * @property {Object} data.ledger - Blockchain protocol metadata linking the visual object-layer prefab to its economic reality
 * @property {string} data.ledger.type - The token standard or off-chain designation (ERC1155, OFF_CHAIN).
 * @property {string} data.ledger.address - The ObjectLayerToken ERC-1155 smart contract address.
 * @property {string} data.ledger.tokenId - The uint256 ERC-1155 token ID (hex or decimal string).
 * @property {Object} data.render - IPFS content identifiers for the consolidated atlas sprite sheet
 * @property {string} data.render.cid - IPFS Content Identifier for the consolidated atlas sprite sheet PNG
 * @property {string} data.render.metadataCid - IPFS Content Identifier for the atlas sprite sheet metadata JSON (fast-json-stable-stringify)
 * @property {string} cid - IPFS Content Identifier for the object layer data JSON (fast-json-stable-stringify)
 * @property {Types.ObjectId} objectLayerRenderFramesId - Reference to ObjectLayerRenderFrames document
 * @property {Types.ObjectId} atlasSpriteSheetId - Reference to AtlasSpriteSheet document
 * @property {string} sha256 - SHA-256 hash of the object layer data
 * @property {Date} createdAt - When the document was created
 * @property {Date} updatedAt - When the document was last updated
 * @memberof CyberiaObjectLayerModel
 */
const ObjectLayerSchema = new Schema(
  {
    data: {
      stats: { type: StatsSchema, required: true },
      item: { type: ItemSchema, required: true },
      ledger: { type: LedgerSchema, required: true },
      render: { type: RenderSchema, default: () => ({}) },
    },
    cid: { type: String, default: '', trim: true },
    objectLayerRenderFramesId: { type: Schema.Types.ObjectId, ref: 'ObjectLayerRenderFrames' },
    atlasSpriteSheetId: { type: Schema.Types.ObjectId, ref: 'AtlasSpriteSheet' },
    sha256: {
      type: String,
      required: true,
      unique: true,
      match: [/^[a-f0-9]{64}$/, 'Please provide a valid SHA-256 hash'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);
/**
 * Name of the `data.item.id` index. Kept stable across the non-unique → unique
 * upgrade so {@link ObjectLayerModel.ensureUniqueItemIdIndex} can detect and
 * replace the legacy definition instead of leaving two overlapping indexes.
 * @memberof CyberiaObjectLayerModel
 */
const ITEM_ID_INDEX_NAME = 'data.item.id_1';
// `data.item.id` is the natural key: exactly one document per item id.
// autoIndex runs at model-compile time, so on a collection that still holds
// legacy duplicates (or a legacy non-unique index) this build fails and is
// logged by the model's `error` listener. ensureUniqueItemIdIndex() then
// dedupes and rebuilds it, after which autoIndex agrees and stays quiet.
ObjectLayerSchema.index({ 'data.item.id': 1 }, { name: ITEM_ID_INDEX_NAME, unique: true });
ObjectLayerSchema.index({ 'data.item.type': 1 });
// Add text index for searchable fields
ObjectLayerSchema.index(
  {
    'data.item.id': 'text',
    'data.item.type': 'text',
    'data.item.description': 'text',
  },
  {
    weights: {
      'data.item.id': 10,
      'data.item.type': 5,
      'data.item.description': 1,
    },
  },
);
// Pre-save hook to ensure data consistency
ObjectLayerSchema.pre('save', function () {
  // Ensure all required fields are present
  if (!this.data.stats || !this.data.item || !this.sha256) {
    throw new Error('Missing required fields');
  }
  // cid (object layer data JSON) and data.render.cid (atlas PNG) are optional – default to ''
});

/**
 * Computes the canonical SHA-256 of an object layer `data` sub-document using
 * deterministic JSON serialisation. Single source of truth for the hash;
 * `ObjectLayerEngine.computeSha256` delegates here.
 *
 * @param {Object} data - The `data` sub-document (item, stats, ledger, render).
 * @returns {string} Hex-encoded SHA-256 hash.
 * @memberof CyberiaObjectLayerModel
 */
const computeObjectLayerSha256 = (data) => crypto.createHash('sha256').update(stringify(data)).digest('hex');

const isMergeableObject = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * An incoming attribute only wins when it actually carries a value. `null`,
 * `undefined` and `''` mean "not provided by this writer" — importers emit them
 * whenever a stage is skipped or degraded (IPFS unreachable, atlas not
 * generated, saga metadata with no render yet), and they must never erase a
 * value another writer already persisted. `false` and `0` are real values.
 *
 * @param {*} value - Candidate attribute value.
 * @returns {boolean} Whether the value should override the stored one.
 * @memberof CyberiaObjectLayerModel
 */
const hasValue = (value) => value !== null && value !== undefined && value !== '';

/**
 * Deep-merges `incoming` over `existing`, keeping the last attribute that
 * actually carries a value. Plain objects merge key by key; every other value
 * (scalars, arrays, ObjectIds, Dates, Buffers) is replaced atomically.
 *
 * @param {*} existing - Currently persisted value.
 * @param {*} incoming - Value received from the writer.
 * @returns {*} The merged value.
 * @memberof CyberiaObjectLayerModel
 */
function mergeObjectLayerData(existing, incoming) {
  if (isMergeableObject(incoming)) {
    if (!isMergeableObject(existing)) return incoming;
    const merged = { ...existing };
    for (const key of Object.keys(incoming)) merged[key] = mergeObjectLayerData(existing[key], incoming[key]);
    return merged;
  }
  return hasValue(incoming) ? incoming : existing;
}

/**
 * Document fields an upsert may carry. `sha256` is excluded on purpose: it is
 * always recomputed from the merged `data`, so it can never drift from the
 * payload the writer hashed before merging.
 * @memberof CyberiaObjectLayerModel
 */
const UPSERTABLE_FIELDS = ['data', 'cid', 'objectLayerRenderFramesId', 'atlasSpriteSheetId'];

/**
 * Collapses any pre-existing duplicates of a given `data.item.id` down to a
 * single document, keeping the oldest one so `_id` references held elsewhere
 * (instances, inventories, atlas metadata) stay valid.
 *
 * @param {import('mongoose').Model} Model - The bound ObjectLayer model.
 * @param {string} itemId - The item id to collapse.
 * @returns {Promise<{ survivor: Object|null, removedIds: Array }>} Survivor and removed document ids.
 * @memberof CyberiaObjectLayerModel
 */
async function collapseItemIdDuplicates(Model, itemId) {
  const [survivor, ...duplicates] = await Model.find({ 'data.item.id': itemId }).sort({ createdAt: 1, _id: 1 });
  if (!survivor || duplicates.length === 0) return { survivor: survivor || null, removedIds: [] };

  const removedIds = duplicates.map((duplicate) => duplicate._id);
  await Model.deleteMany({ _id: { $in: removedIds } });

  // Orphaned render frames have no other cleanup path once their owner is gone.
  const renderFramesIds = duplicates.map((duplicate) => duplicate.objectLayerRenderFramesId).filter(Boolean);
  if (renderFramesIds.length > 0 && Model.db.models.ObjectLayerRenderFrames) {
    await Model.db.models.ObjectLayerRenderFrames.deleteMany({ _id: { $in: renderFramesIds } });
  }

  return { survivor, removedIds };
}

/**
 * Resolves the canonical document for an item id. While a legacy collection can
 * still hold duplicates, an unsorted `findOne` may hand back a document that the
 * next upsert collapses away, so readers and writers must agree on the same
 * survivor: the oldest one.
 *
 * @param {string} itemId - The `data.item.id` to look up.
 * @returns {import('mongoose').Query} Query resolving to the canonical document or `null`.
 * @memberof CyberiaObjectLayerModel
 */
ObjectLayerSchema.statics.findByItemId = function (itemId) {
  return this.findOne({ 'data.item.id': itemId }).sort({ createdAt: 1, _id: 1 });
};

/**
 * Dedupes the whole collection by `data.item.id`.
 *
 * @returns {Promise<Array>} Ids of the removed duplicate documents.
 * @memberof CyberiaObjectLayerModel
 */
ObjectLayerSchema.statics.dedupeByItemId = async function () {
  const duplicated = await this.aggregate([
    { $group: { _id: '$data.item.id', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  const removedIds = [];
  for (const { _id: itemId } of duplicated) {
    if (itemId === null || itemId === undefined) continue;
    const { removedIds: removed } = await collapseItemIdDuplicates(this, itemId);
    removedIds.push(...removed);
  }
  return removedIds;
};

/**
 * Idempotent migration that enforces the one-document-per-`data.item.id`
 * invariant at the storage layer: dedupes first, then upgrades the legacy
 * non-unique index to a unique one. Safe to rerun; a no-op once applied.
 *
 * @returns {Promise<{ removedIds: Array, indexUpgraded: boolean }>} Migration outcome.
 * @memberof CyberiaObjectLayerModel
 */
ObjectLayerSchema.statics.ensureUniqueItemIdIndex = async function () {
  const removedIds = await this.dedupeByItemId();

  const indexes = await this.collection.indexes().catch(() => []);
  const current = indexes.find((index) => index.name === ITEM_ID_INDEX_NAME);
  if (current?.unique) return { removedIds, indexUpgraded: false };

  if (current) await this.collection.dropIndex(ITEM_ID_INDEX_NAME);
  await this.collection.createIndex({ 'data.item.id': 1 }, { name: ITEM_ID_INDEX_NAME, unique: true });
  return { removedIds, indexUpgraded: true };
};

/**
 * The single write path for object layers keyed by item id.
 *
 * Guarantees that exactly one document exists per `data.item.id`: pre-existing
 * duplicates are collapsed onto the oldest document, which is then updated in
 * place. Attributes are merged with {@link mergeObjectLayerData}, so a writer
 * that omits a value (or sends `null` / `''` because a stage was skipped) keeps
 * whatever a previous writer stored instead of erasing it. `sha256` is always
 * recomputed from the merged result.
 *
 * @param {Object} payload - Document payload; `data.item.id` is required.
 * @param {Object} payload.data - Object layer data (item, stats, ledger, render).
 * @param {Object} [options] - Upsert options.
 * @param {Object} [options.setOnInsert=null] - Partial document applied only when the item is new,
 *   for fields a writer wants to seed but never refresh (mirrors Mongo's `$setOnInsert`).
 * @returns {Promise<Object>} The single surviving ObjectLayer document.
 * @memberof CyberiaObjectLayerModel
 */
ObjectLayerSchema.statics.upsertByItemId = async function (payload, { setOnInsert = null } = {}) {
  const itemId = payload?.data?.item?.id;
  if (!itemId) throw new Error('ObjectLayer.upsertByItemId requires data.item.id');

  const { survivor } = await collapseItemIdDuplicates(this, itemId);

  if (!survivor) {
    const inserted = setOnInsert ? mergeObjectLayerData(setOnInsert, payload) : payload;
    return await this.create({ ...inserted, sha256: computeObjectLayerSha256(inserted.data) });
  }

  const existing = survivor.toObject({ virtuals: false, depopulate: true });
  const update = {};
  for (const field of UPSERTABLE_FIELDS) {
    if (!(field in payload)) continue;
    const merged = mergeObjectLayerData(existing[field], payload[field]);
    if (merged !== undefined) update[field] = merged;
  }
  update.sha256 = computeObjectLayerSha256(update.data ?? existing.data);

  return await this.findByIdAndUpdate(survivor._id, { $set: update }, { returnDocument: 'after' });
};

// Create and export the model
const ObjectLayerModel = model('ObjectLayer', ObjectLayerSchema);
const ProviderSchema = ObjectLayerSchema;
class ObjectLayerDto {
  static select = {
    get: () => {
      return {
        _id: 1,
        'data.item': 1,
        'data.ledger': 1,
        'data.render': 1,
        cid: 1,
        objectLayerRenderFramesId: 1,
        atlasSpriteSheetId: 1,
      };
    },
    getMetadata: () => {
      return {
        _id: 1,
        'data.item': 1,
        'data.stats': 1,
        'data.ledger': 1,
        'data.render': 1,
        cid: 1,
        objectLayerRenderFramesId: 1,
        atlasSpriteSheetId: 1,
        sha256: 1,
        createdAt: 1,
        updatedAt: 1,
      };
    },
    getRender: () => {
      return {
        _id: 1,
        objectLayerRenderFramesId: 1,
      };
    },
  };
}
export {
  ObjectLayerSchema,
  ObjectLayerModel,
  ProviderSchema,
  ObjectLayerDto,
  computeObjectLayerSha256,
  mergeObjectLayerData,
  ITEM_ID_INDEX_NAME,
};
