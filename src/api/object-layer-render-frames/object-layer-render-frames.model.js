/**
 * Mongoose model for ObjectLayerRenderFrames API, defining schema for render frame data.
 * @module src/api/object-layer-render-frames/object-layer-render-frames.model.js
 * @namespace CyberiaObjectLayerRenderFramesModel
 */
import { isDeepStrictEqual } from 'node:util';
import { Schema, model } from 'mongoose';
import { OBJECT_LAYER_CID_PATTERN } from '../object-layer/object-layer.identity.js';
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
 * The editor source of one Object Layer definition, the one `objectLayerCid` names: the frames
 * and palette its render is built from. Not canonical content, and not derivable from the render.
 *
 * @typedef {Object} ObjectLayerRenderFrames
 * @property {string} objectLayerCid - Canonical CID of the definition this is the source of
 * @property {RenderFrames} frames - Animation frames for different states
 * @property {number[][]} colors - Color palette for rendering
 * @property {number} frame_duration - Duration of each frame in milliseconds
 * @property {Date} createdAt - When the document was created
 * @property {Date} updatedAt - When the document was last updated
 * @memberof CyberiaObjectLayerRenderFramesModel
 */
const ObjectLayerRenderFramesSchema = new Schema(
  {
    objectLayerCid: {
      type: String,
      required: true,
      trim: true,
      match: [OBJECT_LAYER_CID_PATTERN, 'objectLayerCid must be an Object Layer CID'],
    },
    frames: { type: ObjectLayerRenderFramesDirectionsSchema, required: true },
    colors: { type: [[Number]], required: true },
    frame_duration: { type: Number, required: true, min: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);
// One editor source per definition.
ObjectLayerRenderFramesSchema.index({ objectLayerCid: 1 }, { unique: true });

/**
 * Stores the editor source of a definition, replacing the one it held. A stored source equal to it
 * in structure and values, as the schema casts it, is left as it is, so a rerun changes nothing.
 * @param {string} objectLayerCid - Canonical CID of the definition.
 * @param {{frames: Object, colors: number[][], frame_duration: number}} source
 * @returns {Promise<Object>} The stored document, lean.
 * @memberof CyberiaObjectLayerRenderFramesModel
 */
ObjectLayerRenderFramesSchema.statics.materialize = async function (
  objectLayerCid,
  { frames, colors, frame_duration },
) {
  const source = { frames, colors, frame_duration };
  const cast = new this({ objectLayerCid, ...source }).toObject();
  const stored = await this.findOne({ objectLayerCid }).lean();
  if (stored && Object.keys(source).every((field) => isDeepStrictEqual(stored[field], cast[field]))) return stored;
  return await this.findOneAndUpdate(
    { objectLayerCid },
    { $set: source },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean();
};

// Pre-save hook to ensure data consistency
ObjectLayerRenderFramesSchema.pre('save', function () {
  // Ensure all required fields are present
  if (!this.frames || !this.colors || this.frame_duration === undefined) {
    throw new Error('Missing required fields: frames, colors, or frame_duration');
  }
});
// Create and export the model
const ObjectLayerRenderFramesModel = model('ObjectLayerRenderFrames', ObjectLayerRenderFramesSchema);
const ProviderSchema = ObjectLayerRenderFramesSchema;
class ObjectLayerRenderFramesDto {
  static select = {
    getFull: () => {
      return { _id: 1, objectLayerCid: 1, frames: 1, colors: 1, frame_duration: 1 };
    },
  };
}
export { ObjectLayerRenderFramesSchema, ObjectLayerRenderFramesModel, ProviderSchema, ObjectLayerRenderFramesDto };
