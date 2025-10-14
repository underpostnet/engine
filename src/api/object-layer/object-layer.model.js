/**
 * Object layer model for managing the generation and deployment of cloud-init configuration files
 * and associated scripts for baremetal provisioning.
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
 * @typedef {Object} RenderFrames
 * @property {number[][][]} up_idle - Up idle animation frames
 * @property {number[][][]} down_idle - Down idle animation frames
 * @property {number[][][]} right_idle - Right idle animation frames
 * @property {number[][][]} left_idle - Left idle animation frames
 * @property {number[][][]} up_right_idle - Up-right idle animation frames
 * @property {number[][][]} down_right_idle - Down-right idle animation frames
 * @property {number[][][]} up_left_idle - Up-left idle animation frames
 * @property {number[][][]} down_left_idle - Down-left idle animation frames
 * @property {number[][][]} default_idle - Default idle animation frames
 * @property {number[][][]} up_walking - Up walking animation frames
 * @property {number[][][]} down_walking - Down walking animation frames
 * @property {number[][][]} right_walking - Right walking animation frames
 * @property {number[][][]} left_walking - Left walking animation frames
 * @property {number[][][]} up_right_walking - Up-right walking animation frames
 * @property {number[][][]} down_right_walking - Down-right walking frames
 * @property {number[][][]} up_left_walking - Up-left walking animation frames
 * @property {number[][][]} down_left_walking - Down-left walking frames
 * @property {number[][][]} none_idle - None state animation frames
 * @memberof CyberiaObjectLayerModel
 */
const RenderFramesSchema = new Schema(
  {
    up_idle: { type: [[[Number]]], default: [] },
    down_idle: { type: [[[Number]]], default: [] },
    right_idle: { type: [[[Number]]], default: [] },
    left_idle: { type: [[[Number]]], default: [] },
    up_right_idle: { type: [[[Number]]], default: [] },
    down_right_idle: { type: [[[Number]]], default: [] },
    up_left_idle: { type: [[[Number]]], default: [] },
    down_left_idle: { type: [[[Number]]], default: [] },
    default_idle: { type: [[[Number]]], default: [] },
    up_walking: { type: [[[Number]]], default: [] },
    down_walking: { type: [[[Number]]], default: [] },
    right_walking: { type: [[[Number]]], default: [] },
    left_walking: { type: [[[Number]]], default: [] },
    up_right_walking: { type: [[[Number]]], default: [] },
    down_right_walking: { type: [[[Number]]], default: [] },
    up_left_walking: { type: [[[Number]]], default: [] },
    down_left_walking: { type: [[[Number]]], default: [] },
    none_idle: { type: [[[Number]]], default: [] },
  },
  { _id: false },
);

/**
 * @typedef {Object} Render
 * @property {RenderFrames} frames - Animation frames for different states
 * @property {number[][]} colors - Color palette for rendering
 * @property {number} frame_duration - Duration of each frame in milliseconds
 * @property {boolean} is_stateless - Whether the render is stateless
 * @memberof CyberiaObjectLayerModel
 */
const RenderSchema = new Schema(
  {
    frames: { type: RenderFramesSchema, required: true },
    colors: { type: [[Number]], required: true },
    frame_duration: { type: Number, required: true, min: 0 },
    is_stateless: { type: Boolean, default: false },
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
 * @property {Data.Render} data.render - Rendering information and animations
 * @property {Data.Item} data.item - Item information this layer represents
 * @property {string} sha256 - SHA-256 hash of the object layer data
 * @property {Date} createdAt - When the document was created
 * @property {Date} updatedAt - When the document was last updated
 * @memberof CyberiaObjectLayerModel
 */
const ObjectLayerSchema = new Schema(
  {
    data: {
      stats: { type: StatsSchema, required: true },
      render: { type: RenderSchema, required: true },
      item: { type: ItemSchema, required: true },
    },
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
ObjectLayerSchema.index({ sha256: 1 }, { unique: true });

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
  if (!this.data.stats || !this.data.render || !this.data.item || !this.sha256) {
    throw new Error('Missing required fields');
  }
  next();
});

// Create and export the model
const ObjectLayerModel = model('ObjectLayer', ObjectLayerSchema);

const ProviderSchema = ObjectLayerSchema;

export { ObjectLayerSchema, ObjectLayerModel, ProviderSchema };
