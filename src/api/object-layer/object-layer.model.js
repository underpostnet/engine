/**
 * Mongoose model for ObjectLayer API, defining schema, indexes, and data validation.
 * @module src/api/object-layer/object-layer.model.js
 * @namespace CyberiaObjectLayerModel
 */

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
 * @property {string} type - The token standard or off-chain designation (ERC20, ERC721, OFF_CHAIN).
 * @property {string} address - The Solidity smart contract address.
 * @memberof CyberiaObjectLayerModel
 */
const LedgerSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['ERC20', 'ERC721', 'OFF_CHAIN'],
      required: true,
    },
    address: { type: String }, // Solidity contract address
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
 * @property {string} data.ledger.type - The token standard or off-chain designation (ERC20, ERC721, OFF_CHAIN).
 * @property {string} data.ledger.address - The Solidity smart contract address.
 * @property {Object} data.render - IPFS content identifiers for the consolidated atlas sprite sheet
 * @property {string} data.render.cid - IPFS Content Identifier for the consolidated atlas sprite sheet PNG
 * @property {string} data.render.metadataCid - IPFS Content Identifier for the atlas sprite sheet metadata JSON (fast-json-stable-stringify)
 * @property {string} data.seed - Random UUID for unique state generation
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
      seed: {
        type: String,
        required: true,
        match: [
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          'Please provide a valid UUID v4',
        ],
      },
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

// Index for faster querying
ObjectLayerSchema.index({ 'data.item.id': 1 });
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
ObjectLayerSchema.pre('save', function (next) {
  // Ensure all required fields are present
  if (!this.data.stats || !this.data.item || !this.data.seed || !this.sha256) {
    throw new Error('Missing required fields');
  }
  // cid (object layer data JSON) and data.render.cid (atlas PNG) are optional – default to ''
  next();
});

// Create and export the model
const ObjectLayerModel = model('ObjectLayer', ObjectLayerSchema);

const ProviderSchema = ObjectLayerSchema;

const ObjectLayerDto = {
  select: {
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
        'data.seed': 1,
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
  },
};

export { ObjectLayerSchema, ObjectLayerModel, ProviderSchema, ObjectLayerDto };
