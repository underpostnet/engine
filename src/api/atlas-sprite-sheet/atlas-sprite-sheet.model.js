/**
 * Mongoose model for AtlasSpriteSheet API, defining schema for consolidated sprite sheet atlases.
 * @module src/api/atlas-sprite-sheet/atlas-sprite-sheet.model.js
 * @namespace CyberiaAtlasSpriteSheetModel
 */

import { Schema, model, Types } from 'mongoose';

/**
 * @typedef {Object} FrameMetadata
 * @property {number} x - X position in the atlas
 * @property {number} y - Y position in the atlas
 * @property {number} width - Frame width
 * @property {number} height - Frame height
 * @property {number} frameIndex - Frame index in animation sequence
 * @memberof CyberiaAtlasSpriteSheetModel
 */
const FrameMetadataSchema = new Schema(
  {
    x: { type: Number, required: true, min: 0 },
    y: { type: Number, required: true, min: 0 },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    frameIndex: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

/**
 * @typedef {Object} DirectionFrames
 * @property {FrameMetadata[]} up_idle - Up idle animation frames
 * @property {FrameMetadata[]} down_idle - Down idle animation frames
 * @property {FrameMetadata[]} right_idle - Right idle animation frames
 * @property {FrameMetadata[]} left_idle - Left idle animation frames
 * @property {FrameMetadata[]} up_right_idle - Up-right idle animation frames
 * @property {FrameMetadata[]} down_right_idle - Down-right idle animation frames
 * @property {FrameMetadata[]} up_left_idle - Up-left idle animation frames
 * @property {FrameMetadata[]} down_left_idle - Down-left idle animation frames
 * @property {FrameMetadata[]} default_idle - Default idle animation frames
 * @property {FrameMetadata[]} up_walking - Up walking animation frames
 * @property {FrameMetadata[]} down_walking - Down walking animation frames
 * @property {FrameMetadata[]} right_walking - Right walking animation frames
 * @property {FrameMetadata[]} left_walking - Left walking animation frames
 * @property {FrameMetadata[]} up_right_walking - Up-right walking frames
 * @property {FrameMetadata[]} down_right_walking - Down-right walking frames
 * @property {FrameMetadata[]} up_left_walking - Up-left walking frames
 * @property {FrameMetadata[]} down_left_walking - Down-left walking frames
 * @property {FrameMetadata[]} none_idle - None state animation frames
 * @memberof CyberiaAtlasSpriteSheetModel
 */
const DirectionFramesSchema = new Schema(
  {
    up_idle: { type: [FrameMetadataSchema], default: [] },
    down_idle: { type: [FrameMetadataSchema], default: [] },
    right_idle: { type: [FrameMetadataSchema], default: [] },
    left_idle: { type: [FrameMetadataSchema], default: [] },
    up_right_idle: { type: [FrameMetadataSchema], default: [] },
    down_right_idle: { type: [FrameMetadataSchema], default: [] },
    up_left_idle: { type: [FrameMetadataSchema], default: [] },
    down_left_idle: { type: [FrameMetadataSchema], default: [] },
    default_idle: { type: [FrameMetadataSchema], default: [] },
    up_walking: { type: [FrameMetadataSchema], default: [] },
    down_walking: { type: [FrameMetadataSchema], default: [] },
    right_walking: { type: [FrameMetadataSchema], default: [] },
    left_walking: { type: [FrameMetadataSchema], default: [] },
    up_right_walking: { type: [FrameMetadataSchema], default: [] },
    down_right_walking: { type: [FrameMetadataSchema], default: [] },
    up_left_walking: { type: [FrameMetadataSchema], default: [] },
    down_left_walking: { type: [FrameMetadataSchema], default: [] },
    none_idle: { type: [FrameMetadataSchema], default: [] },
  },
  { _id: false },
);

/**
 * @typedef {Object} AtlasSpriteSheet
 * @property {Types.ObjectId} fileId - Reference to File document (consolidated PNG)
 * @property {Object} metadata - Atlas sprite sheet metadata
 * @property {string} metadata.itemKey - Item identifier key for texture reference
 * @property {number} metadata.atlasWidth - Total atlas width in pixels
 * @property {number} metadata.atlasHeight - Total atlas height in pixels
 * @property {number} metadata.cellPixelDim - Pixel dimension of each cell
 * @property {DirectionFrames} metadata.frames - Frame positions in atlas by direction
 * @property {Date} createdAt - When the document was created
 * @property {Date} updatedAt - When the document was last updated
 * @memberof CyberiaAtlasSpriteSheetModel
 */
const AtlasSpriteSheetSchema = new Schema(
  {
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      required: true,
    },
    metadata: {
      itemKey: { type: String, required: true, trim: true },
      atlasWidth: { type: Number, required: true, min: 1 },
      atlasHeight: { type: Number, required: true, min: 1 },
      cellPixelDim: { type: Number, required: true, min: 1, default: 20 },
      frames: { type: DirectionFramesSchema, required: true },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for efficient querying
AtlasSpriteSheetSchema.index({ 'metadata.itemKey': 1 }, { unique: true });
AtlasSpriteSheetSchema.index({ fileId: 1 });

// Pre-save validation
AtlasSpriteSheetSchema.pre('save', function (next) {
  if (!this.fileId || !this.metadata) {
    throw new Error('AtlasSpriteSheet missing required fields: fileId or metadata');
  }
  next();
});

const AtlasSpriteSheetModel = model('AtlasSpriteSheet', AtlasSpriteSheetSchema);

const ProviderSchema = AtlasSpriteSheetSchema;

export { AtlasSpriteSheetSchema, AtlasSpriteSheetModel, ProviderSchema };
