/**
 * Mongoose model for AtlasSpriteSheet API, defining schema for consolidated sprite sheet atlases.
 * @module src/api/atlas-sprite-sheet/atlas-sprite-sheet.model.js
 * @namespace CyberiaAtlasSpriteSheetModel
 */
import { Schema, model, Types } from 'mongoose';
import { OBJECT_LAYER_CID_PATTERN } from '../object-layer/object-layer.identity.js';
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
 * The local materialization of the render of one Object Layer definition, the one
 * `objectLayerCid` names. The definition owns the render: its `data.render.cid` addresses the
 * primary render and `data.render.metadataCid` its layout. This document holds the bytes of that
 * render on this host, the renders derived from it, and the layout decoded for the runtime. It
 * holds no render CID: the definition is the source of truth.
 *
 * `fileId` is the primary render, `metadata.cellPixelDim` pixels per cell: the bytes
 * `data.render.cid` addresses and the runtime downloads. `metadata` describes it.
 * `upscaleFileId` is the upscaled render derived from it at `metadata.upscaleFactor`
 * pixels per cell. `idlePreviewFileId` is the idle preview: the first down-idle frame on a
 * 300 px square.
 *
 * @typedef {Object} AtlasSpriteSheet
 * @property {string} objectLayerCid - Canonical CID of the definition whose render this materializes
 * @property {Types.ObjectId} fileId - Primary render File document
 * @property {Types.ObjectId} [upscaleFileId] - Derived upscaled render File document
 * @property {Types.ObjectId} [idlePreviewFileId] - Derived idle preview File document
 * @property {Object} metadata - Layout of the primary render
 * @property {string} metadata.itemKey - Item label the render was generated for; a label, never identity
 * @property {number} metadata.atlasWidth - Primary render width in cells
 * @property {number} metadata.atlasHeight - Primary render height in cells
 * @property {number} metadata.cellPixelDim - Pixels per cell of the primary render
 * @property {number} metadata.upscaleFactor - Pixels per cell of the upscaled derived render
 * @property {number} metadata.frame_duration - Duration of each frame in milliseconds
 * @property {DirectionFrames} metadata.frames - Frame boxes by direction, in cells
 * @property {Date} createdAt - When the document was created
 * @property {Date} updatedAt - When the document was last updated
 * @memberof CyberiaAtlasSpriteSheetModel
 */
const AtlasSpriteSheetSchema = new Schema(
  {
    objectLayerCid: {
      type: String,
      required: true,
      trim: true,
      match: [OBJECT_LAYER_CID_PATTERN, 'objectLayerCid must be an Object Layer CID'],
    },
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      required: true,
    },
    // Derived: absent when the render is served at its own resolution only.
    upscaleFileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      default: null,
    },
    // Derived: absent for a render with no frame to cut.
    idlePreviewFileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      default: null,
    },
    metadata: {
      itemKey: { type: String, required: true, trim: true },
      atlasWidth: { type: Number, required: true, min: 1 },
      atlasHeight: { type: Number, required: true, min: 1 },
      cellPixelDim: { type: Number, required: true, min: 1 },
      upscaleFactor: { type: Number, required: false, min: 1 },
      frame_duration: { type: Number, min: 0, default: 100 },
      frames: { type: DirectionFramesSchema, required: true },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);
// One materialization per definition. A label is shared by many, so it indexes discovery only.
AtlasSpriteSheetSchema.index({ objectLayerCid: 1 }, { unique: true });
AtlasSpriteSheetSchema.index({ 'metadata.itemKey': 1 });
AtlasSpriteSheetSchema.index({ fileId: 1 });
AtlasSpriteSheetSchema.index({ upscaleFileId: 1 });
AtlasSpriteSheetSchema.index({ idlePreviewFileId: 1 });
// Pre-save validation
AtlasSpriteSheetSchema.pre('save', function () {
  if (!this.fileId || !this.metadata) {
    throw new Error('AtlasSpriteSheet missing required fields: fileId or metadata');
  }
});
const AtlasSpriteSheetModel = model('AtlasSpriteSheet', AtlasSpriteSheetSchema);
const ProviderSchema = AtlasSpriteSheetSchema;
class AtlasSpriteSheetDto {
  static select = {
    get: () => {
      return {
        _id: 1,
        objectLayerCid: 1,
        fileId: 1,
        upscaleFileId: 1,
        idlePreviewFileId: 1,
        metadata: 1,
        createdAt: 1,
        updatedAt: 1,
      };
    },
    // The layout the runtime pairs with the primary render: GET /metadata/:itemKey, then
    // GET /blob/:itemKey for the PNG it describes.
    getMetadataOnly: () => {
      return {
        _id: 1,
        objectLayerCid: 1,
        'metadata.itemKey': 1,
        'metadata.atlasWidth': 1,
        'metadata.atlasHeight': 1,
        'metadata.cellPixelDim': 1,
        'metadata.upscaleFactor': 1,
        'metadata.frame_duration': 1,
        'metadata.frames': 1,
        createdAt: 1,
        updatedAt: 1,
      };
    },
  };
}
export { AtlasSpriteSheetSchema, AtlasSpriteSheetModel, ProviderSchema, AtlasSpriteSheetDto };
