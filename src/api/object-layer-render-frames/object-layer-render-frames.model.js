/**
 * Mongoose model for ObjectLayerRenderFrames API, defining schema for render frame data.
 * @module src/api/object-layer-render-frames/object-layer-render-frames.model.js
 * @namespace CyberiaObjectLayerRenderFramesModel
 */

import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} ObjectLayerRenderFramesDirections
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
 * @memberof CyberiaObjectLayerRenderFramesModel
 */
const ObjectLayerRenderFramesDirectionsSchema = new Schema(
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
 * @typedef {Object} ObjectLayerRenderFrames
 * @property {RenderFrames} frames - Animation frames for different states
 * @property {number[][]} colors - Color palette for rendering
 * @property {number} frame_duration - Duration of each frame in milliseconds
 * @property {boolean} is_stateless - Whether the render is stateless
 * @property {Date} createdAt - When the document was created
 * @property {Date} updatedAt - When the document was last updated
 * @memberof CyberiaObjectLayerRenderFramesModel
 */
const ObjectLayerRenderFramesSchema = new Schema(
  {
    frames: { type: ObjectLayerRenderFramesDirectionsSchema, required: true },
    colors: { type: [[Number]], required: true },
    frame_duration: { type: Number, required: true, min: 0 },
    is_stateless: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Pre-save hook to ensure data consistency
ObjectLayerRenderFramesSchema.pre('save', function (next) {
  // Ensure all required fields are present
  if (!this.frames || !this.colors || this.frame_duration === undefined) {
    throw new Error('Missing required fields: frames, colors, or frame_duration');
  }
  next();
});

// Create and export the model
const ObjectLayerRenderFramesModel = model('ObjectLayerRenderFrames', ObjectLayerRenderFramesSchema);

const ProviderSchema = ObjectLayerRenderFramesSchema;

const ObjectLayerRenderFramesDto = {
  select: {
    get: () => {
      return { _id: 1, frame_duration: 1, is_stateless: 1 };
    },
    getFull: () => {
      return { _id: 1, frames: 1, colors: 1, frame_duration: 1, is_stateless: 1 };
    },
  },
};

export { ObjectLayerRenderFramesSchema, ObjectLayerRenderFramesModel, ProviderSchema, ObjectLayerRenderFramesDto };
