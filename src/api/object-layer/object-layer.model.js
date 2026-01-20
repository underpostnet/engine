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
 * @typedef {Object} ObjectLayer
 * @property {Object} data - Object layer data
 * @property {Data.Stats} data.stats - Statistical attributes of the object layer
 * @property {Data.Item} data.item - Item information this layer represents
 * @property {string} data.seed - Random UUID for unique state generation
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
      seed: {
        type: String,
        required: true,
        match: [
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          'Please provide a valid UUID v4',
        ],
      },
    },
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
  next();
});

// Create and export the model
const ObjectLayerModel = model('ObjectLayer', ObjectLayerSchema);

const ProviderSchema = ObjectLayerSchema;

const ObjectLayerDto = {
  select: {
    get: () => {
      return { _id: 1, 'data.item': 1 };
    },
    getMetadata: () => {
      return {
        _id: 1,
        'data.item': 1,
        'data.stats': 1,
        'data.seed': 1,
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
