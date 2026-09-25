/**
 * Mongoose model for the ObjectLayer API: the content store of the Object Layer protocol.
 *
 * One document is one immutable definition. `cid` and `contentHash` are computed from the
 * canonical content on creation and are unique; the content never changes afterwards.
 * `data.item.id` is a semantic label, indexed for search, never unique.
 * Ledger registration and ownership live in the ItemLedger API, outside this document.
 *
 * @module src/api/object-layer/object-layer.model.js
 * @namespace ObjectLayerModel
 */
import { Schema, model } from 'mongoose';
import {
  OBJECT_LAYER_SCHEMA_VERSION,
  isProfileRef,
  isStatRecord,
  STAT_RECORD_RULE,
  profileRef,
} from '../../client/components/object-layer/ObjectLayerProtocol.js';
import {
  CONTENT_HASH_PATTERN,
  OBJECT_LAYER_CID_PATTERN,
  isObjectLayerCid,
  objectLayerIdentity,
} from './object-layer.identity.js';

/**
 * @typedef {Object} Item
 * @property {string} id - Semantic label of the item, shared by every definition of that item
 * @property {string} type - Type of the item
 * @property {string} description - Description of the item
 * @property {boolean} activable - Whether the item can be activated
 * @memberof ObjectLayerModel
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
 * @typedef {Object} Render
 * IPFS content identifiers for the consolidated atlas sprite sheet.
 * @property {string} cid - IPFS CID of the atlas sprite sheet PNG
 * @property {string} metadataCid - IPFS CID of the atlas sprite sheet metadata JSON
 * @memberof ObjectLayerModel
 */
const RenderSchema = new Schema(
  {
    cid: { type: String, default: '', trim: true },
    metadataCid: { type: String, default: '', trim: true },
  },
  { _id: false },
);

/**
 * @typedef {Object} Profile
 * The content profile that gives `data.stats` and `data.item.type` their vocabulary.
 * @property {string} id - Profile id (`cyberia`)
 * @property {number} version - Profile contract version
 * @memberof ObjectLayerModel
 */
const ProfileSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1, validate: Number.isInteger },
  },
  { _id: false },
);

/**
 * What one stored copy of a definition is.
 * - `canonical`: stored by the Object Layer authority. The only published copy.
 * - `cache`: a consumer's copy of a canonical definition, identical to the authority's.
 * - `draft`: authoring work of a consumer, not published. Never bound, never served.
 * @constant {ReadonlyArray<string>}
 * @memberof ObjectLayerModel
 */
export const OBJECT_LAYER_ORIGINS = Object.freeze(['draft', 'cache', 'canonical']);

/**
 * @typedef {Object} ObjectLayer
 * @property {number} schemaVersion - Canonical payload schema version
 * @property {Profile} profile - Content profile the mechanical block follows
 * @property {Object} data - Canonical content
 * @property {Item} data.item - Semantic item information
 * @property {Object<string,number>} data.stats - Mechanical content: an integer record the profile interprets
 * @property {Render} data.render - Canonical render contract: the canonical render CID and metadata CID
 * @property {string} cid - Canonical Object Layer CID (CIDv1, raw, sha2-256)
 * @property {string} contentHash - Hex SHA-256 of the canonical bytes
 * @property {boolean} published - Whether a node holds the canonical bytes under `cid`
 * @property {string} origin - What this copy is: see {@link OBJECT_LAYER_ORIGINS}
 * @property {string} createdBy - The principal that stored this copy: a user id of this host, or `service:<domain>`
 * @property {Date|null} archivedAt - When the definition was archived; null while it is offered
 * @property {Date} createdAt - When the document was created
 * @property {Date} updatedAt - When the document was last updated
 * @memberof ObjectLayerModel
 */
const ObjectLayerSchema = new Schema(
  {
    schemaVersion: { type: Number, default: OBJECT_LAYER_SCHEMA_VERSION, enum: [OBJECT_LAYER_SCHEMA_VERSION] },
    profile: { type: ProfileSchema, required: true },
    data: {
      item: { type: ItemSchema, required: true },
      stats: {
        type: Schema.Types.Mixed,
        required: true,
        validate: { validator: isStatRecord, message: STAT_RECORD_RULE },
      },
      render: { type: RenderSchema, default: () => ({}) },
    },
    cid: { type: String, required: true, unique: true, trim: true, match: OBJECT_LAYER_CID_PATTERN },
    contentHash: { type: String, required: true, unique: true, trim: true, match: CONTENT_HASH_PATTERN },
    // The identity is always real; `published` says whether IPFS serves the bytes it names.
    published: { type: Boolean, default: false },
    origin: { type: String, enum: OBJECT_LAYER_ORIGINS, default: 'draft' },
    createdBy: { type: String, default: '', trim: true },
    // Lifecycle: an archived definition stays stored under its cid and is offered to no one.
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Discovery indexes. The item id is a label: many definitions may carry the same one.
ObjectLayerSchema.index({ 'data.item.id': 1 });
ObjectLayerSchema.index({ origin: 1 });
ObjectLayerSchema.index({ 'data.item.type': 1 });
ObjectLayerSchema.index({ createdBy: 1 });
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

// Identity is derived once, from the content. A stored definition never changes content.
ObjectLayerSchema.pre('validate', function () {
  const { cid, contentHash } = objectLayerIdentity(this);
  if (this.isNew) {
    this.cid = cid;
    this.contentHash = contentHash;
    return;
  }
  if (this.cid !== cid) throw new Error(`ObjectLayer ${this.cid} is immutable: publish the changed content as a new definition`);
});

/**
 * Records whether a node holds the canonical bytes of a definition.
 * @param {string} cid
 * @param {boolean} published
 * @returns {Promise<void>}
 * @memberof ObjectLayerModel
 */
ObjectLayerSchema.statics.setPublished = async function (cid, published) {
  await this.updateOne({ cid }, { $set: { published } });
};

/**
 * Archives a definition or offers it again. The content and its cid stay as they are.
 * @param {string} cid
 * @param {boolean} archived
 * @returns {Promise<Object|null>} The stored document.
 * @memberof ObjectLayerModel
 */
ObjectLayerSchema.statics.setArchived = async function (cid, archived) {
  return await this.findOneAndUpdate(
    { cid },
    { $set: { archivedAt: archived ? new Date() : null } },
    { returnDocument: 'after' },
  );
};

/** Legacy document fields the identity migration removes. */
const LEGACY_FIELDS = ['sha256', 'statContractVersion', 'data.ledger'];
/** Legacy index names the identity migration drops. */
const LEGACY_INDEXES = ['data.item.id_1', 'sha256_1'];

/**
 * The definition with this canonical CID, or null.
 * @param {string} cid
 * @returns {import('mongoose').Query}
 * @memberof ObjectLayerModel
 */
ObjectLayerSchema.statics.findByCid = function (cid) {
  return this.findOne({ cid });
};

/**
 * Stores a definition keyed by its content. Identical content resolves to the stored
 * document, which is offered again if it was archived; new content creates a document owned by
 * `payload.createdBy`.
 *
 * The origin only moves up (`draft` → `cache` → `canonical`): publication never becomes a
 * draft again. Only the publication module writes `cache` or `canonical`.
 *
 * @param {Object} payload - `{ profile, data, createdBy?, _id? }`.
 * @param {Object} params
 * @param {string} params.origin - One of {@link OBJECT_LAYER_ORIGINS}.
 * @returns {Promise<Object>} The stored document.
 * @memberof ObjectLayerModel
 */
ObjectLayerSchema.statics.upsertByIdentity = async function (payload, { origin }) {
  if (!OBJECT_LAYER_ORIGINS.includes(origin)) throw new Error(`Unknown Object Layer origin "${origin}"`);
  const { cid, contentHash } = objectLayerIdentity(payload);
  const existing = await this.findOne({ cid });
  if (existing) {
    if (OBJECT_LAYER_ORIGINS.indexOf(origin) > OBJECT_LAYER_ORIGINS.indexOf(existing.origin)) existing.origin = origin;
    existing.archivedAt = null;
    return await existing.save();
  }
  const document = {
    profile: payload.profile,
    data: payload.data,
    cid,
    contentHash,
    origin,
    schemaVersion: OBJECT_LAYER_SCHEMA_VERSION,
    createdBy: payload.createdBy ? String(payload.createdBy) : '',
  };
  if (payload._id) document._id = payload._id;
  try {
    return await this.create(document);
  } catch (error) {
    throw error?.code === 11000 ? new Error(`An Object Layer with cid ${cid} already exists`) : error;
  }
};

/**
 * Idempotent migration to the content identity model. Stamps the profile, recomputes `cid`
 * and `contentHash` for every legacy document, removes legacy fields and drops the legacy
 * indexes. A legacy on-chain ledger becomes an ItemLedger binding when a model and chain id
 * are given; otherwise it is reported so the operator can index it from the contract.
 *
 * @param {Object} params
 * @param {import('../../client/components/object-layer/ObjectLayerProtocol.js').ProfileRef} params.profile - Profile the legacy documents follow.
 * @param {import('mongoose').Model} [params.ItemLedger] - Bound ItemLedger model.
 * @param {number} [params.chainId] - Chain id of the legacy contract addresses.
 * @param {string} [params.origin='draft'] - Origin a document without one takes: `canonical` on the
 *   Object Layer authority, `draft` on a consumer, which must publish it.
 * @returns {Promise<{migrated:number,originsSet:number,bindings:number,unbound:Array,indexesDropped:string[],labels:Array<{itemId:string,cid:string}>}>}
 * @memberof ObjectLayerModel
 */
ObjectLayerSchema.statics.migrateIdentity = async function ({
  profile,
  ItemLedger = null,
  chainId = null,
  origin = 'draft',
}) {
  if (!isProfileRef(profile)) throw new Error('migrateIdentity requires the profile the legacy documents follow');
  if (origin !== 'draft' && origin !== 'canonical')
    throw new Error('A legacy definition is a draft or, on the authority, canonical');
  const collection = this.collection;
  const result = { migrated: 0, originsSet: 0, bindings: 0, unbound: [], indexesDropped: [], labels: [] };

  const indexes = await collection.indexes().catch(() => []);
  for (const index of indexes) {
    if (!LEGACY_INDEXES.includes(index.name)) continue;
    // The item id index stays, as a plain index; the old one is unique.
    if (index.name === 'data.item.id_1' && !index.unique) continue;
    await collection.dropIndex(index.name);
    result.indexesDropped.push(index.name);
  }

  const legacyFilter = {
    $or: [
      { contentHash: { $exists: false } },
      { profile: { $exists: false } },
      { cid: { $not: OBJECT_LAYER_CID_PATTERN } },
      ...LEGACY_FIELDS.map((field) => ({ [field]: { $exists: true } })),
    ],
  };
  for await (const raw of collection.find(legacyFilter)) {
    const stamped = { ...raw, profile: raw.profile ?? profileRef(profile) };
    const { cid, contentHash } = objectLayerIdentity(stamped);
    const ledger = raw.data?.ledger;
    if (ledger?.type === 'ERC1155' && ledger.address && ledger.tokenId) {
      const binding = {
        objectLayerCid: cid,
        itemId: raw.data?.item?.id || '',
        chainId,
        contractAddress: ledger.address,
        tokenId: ledger.tokenId,
      };
      if (ItemLedger && chainId !== null) {
        await ItemLedger.bind(binding);
        result.bindings++;
      } else result.unbound.push(binding);
    }
    const $set = { cid, contentHash, schemaVersion: OBJECT_LAYER_SCHEMA_VERSION, profile: stamped.profile };
    const $unset = Object.fromEntries(LEGACY_FIELDS.map((field) => [field, '']));
    await collection.updateOne({ _id: raw._id }, { $set, $unset });
    result.labels.push({ itemId: raw.data?.item?.id || '', cid });
    result.migrated++;
  }

  result.originsSet = (await collection.updateMany({ origin: { $exists: false } }, { $set: { origin } })).modifiedCount;

  if (result.migrated > 0 || result.indexesDropped.length > 0) await this.syncIndexes();
  return result;
};

/**
 * Idempotent migration of the materialization relationship. Every atlas and render frames
 * document a definition referenced takes the definition's cid as `objectLayerCid`; one several
 * definitions shared is copied once per definition. The definitions lose the references, and a
 * materialization no definition referenced is removed: nothing can reach it. Runs after
 * {@link migrateIdentity}, so every cid is final.
 *
 * @param {Object} models
 * @param {import('mongoose').Model} models.AtlasSpriteSheet
 * @param {import('mongoose').Model} models.ObjectLayerRenderFrames
 * @returns {Promise<{linked:number,unowned:number}>} Materializations linked to a definition, and
 *   the ones removed. The Files an unowned atlas held are left to the File sweep.
 * @memberof ObjectLayerModel
 */
ObjectLayerSchema.statics.migrateMaterializations = async function ({ AtlasSpriteSheet, ObjectLayerRenderFrames }) {
  // The references a definition held to its materializations before they referenced it by cid.
  const materializations = { atlasSpriteSheetId: AtlasSpriteSheet, objectLayerRenderFramesId: ObjectLayerRenderFrames };
  const refs = Object.keys(materializations);
  const filter = { $or: refs.map((field) => ({ [field]: { $exists: true } })) };
  const result = { linked: 0, unowned: 0 };
  for await (const owner of this.collection.find(filter)) {
    for (const [field, Model] of Object.entries(materializations)) {
      if (!owner[field] || (await Model.collection.countDocuments({ objectLayerCid: owner.cid }, { limit: 1 })))
        continue;
      const materialization = await Model.collection.findOne({ _id: owner[field] });
      if (!materialization) continue;
      if (materialization.objectLayerCid) {
        const { _id, ...copy } = materialization;
        await Model.collection.insertOne({ ...copy, objectLayerCid: owner.cid });
      } else await Model.collection.updateOne({ _id: materialization._id }, { $set: { objectLayerCid: owner.cid } });
      result.linked++;
    }
  }
  await this.collection.updateMany(filter, {
    $unset: Object.fromEntries(refs.map((field) => [field, ''])),
  });
  for (const Model of Object.values(materializations))
    result.unowned += (await Model.collection.deleteMany({ objectLayerCid: { $exists: false } })).deletedCount;
  return result;
};

const ObjectLayerModel = model('ObjectLayer', ObjectLayerSchema);
const ProviderSchema = ObjectLayerSchema;

class ObjectLayerDto {
  static select = {
    get: () => {
      return {
        _id: 1,
        schemaVersion: 1,
        profile: 1,
        'data.item': 1,
        'data.render': 1,
        cid: 1,
        contentHash: 1,
        published: 1,
        origin: 1,
        createdBy: 1,
        archivedAt: 1,
      };
    },
    getMetadata: () => {
      return {
        _id: 1,
        schemaVersion: 1,
        profile: 1,
        'data.item': 1,
        'data.stats': 1,
        'data.render': 1,
        cid: 1,
        contentHash: 1,
        published: 1,
        origin: 1,
        createdBy: 1,
        archivedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      };
    },
  };
}

export { ObjectLayerSchema, ObjectLayerModel, ProviderSchema, ObjectLayerDto, isObjectLayerCid };
