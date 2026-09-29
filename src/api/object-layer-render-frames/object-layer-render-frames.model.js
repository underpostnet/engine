/**
 * Mongoose model of the editor source of an Object Layer render.
 * @module src/api/object-layer-render-frames/object-layer-render-frames.model.js
 * @namespace CyberiaObjectLayerRenderFramesModel
 */
import { Schema, model } from 'mongoose';
import { OBJECT_LAYER_CID_PATTERN } from '../object-layer/object-layer.identity.js';
import { OBJECT_LAYER_KEYFRAMES } from '../../client/components/objectlayer-studio/ObjectLayerProtocol.js';
import {
  RENDER_SOURCE_FORMAT,
  RENDER_SOURCE_MAX_COLORS,
  sameSource,
  sourceFromIndexedFrames,
  toWire,
} from '../../client/components/objectlayer-studio/RenderSource.js';

/** Frames by render keyframe: each frame one binary buffer of palette indexes, row by row. */
const ObjectLayerRenderFramesKeyframesSchema = new Schema(
  Object.fromEntries(OBJECT_LAYER_KEYFRAMES.map((keyframe) => [keyframe, { type: [Buffer], default: undefined }])),
  { _id: false },
);

/**
 * The editor source of one Object Layer definition, the one `objectLayerCid` names: the indexed
 * frames and palette its render is built from. Not canonical content, and not derivable from the
 * render. `revision` counts the writes of the document.
 *
 * @typedef {Object} ObjectLayerRenderFrames
 * @property {string} objectLayerCid - Canonical CID of the definition this is the source of
 * @property {string} format - The pixel format, {@link RENDER_SOURCE_FORMAT}
 * @property {number} width - Cells per row of every frame
 * @property {number} height - Rows of every frame
 * @property {string[]} palette - `#rrggbbaa` colors the frame bytes index
 * @property {number} frameDurationMs - Duration of each frame in milliseconds
 * @property {Object<string,Buffer[]>} frames - Frames by render keyframe
 * @property {number} revision - Writes of this document
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
    format: { type: String, enum: [RENDER_SOURCE_FORMAT], required: true },
    width: { type: Number, required: true, min: 0 },
    height: { type: Number, required: true, min: 0 },
    palette: {
      type: [String],
      required: true,
      validate: {
        validator: (palette) =>
          palette.length <= RENDER_SOURCE_MAX_COLORS && palette.every((hex) => /^#[0-9a-f]{8}$/.test(hex)),
        message: `palette holds up to ${RENDER_SOURCE_MAX_COLORS} #rrggbbaa colors`,
      },
    },
    frameDurationMs: { type: Number, required: true, min: 0 },
    frames: { type: ObjectLayerRenderFramesKeyframesSchema, required: true },
    revision: { type: Number, min: 1 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (doc, stored) => ({ ...stored, frames: toWire(sourceOf(stored)).frames }) },
    toObject: { virtuals: true },
  },
);
// One editor source per definition.
ObjectLayerRenderFramesSchema.index({ objectLayerCid: 1 }, { unique: true });

/** The bytes of a stored frame: a Buffer, or the BSON Binary a lean read returns. */
const bytesOf = (value) =>
  value instanceof Uint8Array ? Uint8Array.from(value) : Uint8Array.from(value.buffer.subarray(0, value.position));

/**
 * A stored document as a render source.
 * @param {Object} stored - Lean or hydrated document.
 * @returns {Object} The source, frames as `Uint8Array`.
 * @memberof CyberiaObjectLayerRenderFramesModel
 */
const sourceOf = ({ format, width, height, palette, frameDurationMs, frames = {} }) => ({
  format,
  width,
  height,
  palette: [...palette],
  frameDurationMs,
  frames: Object.fromEntries(
    Object.entries(frames)
      .filter(([, list]) => list?.length > 0)
      .map(([keyframe, list]) => [keyframe, list.map(bytesOf)]),
  ),
});

/** The stored fields of a render source, frames as Buffers. */
const storedOf = ({ format, width, height, palette, frameDurationMs, frames }) => ({
  format,
  width,
  height,
  palette,
  frameDurationMs,
  frames: Object.fromEntries(
    Object.entries(frames).map(([keyframe, list]) => [keyframe, list.map((pixels) => Buffer.from(pixels))]),
  ),
});

ObjectLayerRenderFramesSchema.statics.sourceOf = sourceOf;

/**
 * Stores the editor source of a definition, replacing the one it held. A stored source that holds
 * the same render is left as it is, so a rerun changes nothing.
 * @param {string} objectLayerCid - Canonical CID of the definition.
 * @param {Object} source - Render source.
 * @returns {Promise<Object>} The stored document, lean.
 * @memberof CyberiaObjectLayerRenderFramesModel
 */
ObjectLayerRenderFramesSchema.statics.materialize = async function (objectLayerCid, source) {
  const stored = await this.findOne({ objectLayerCid }).lean();
  if (stored && sameSource(sourceOf(stored), source)) return stored;
  return await this.findOneAndUpdate(
    { objectLayerCid },
    { $set: storedOf(source), $inc: { revision: 1 } },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean();
};

/**
 * Replaces the source of a stored document when it is still at the revision the writer read.
 * @param {string} id - Document id.
 * @param {Object} source - Render source.
 * @param {number} revision - The revision the writer read.
 * @returns {Promise<Object>} The stored document, lean.
 * @throws {Error} 404 when no document has the id; 409 when another write came first.
 * @memberof CyberiaObjectLayerRenderFramesModel
 */
ObjectLayerRenderFramesSchema.statics.replaceAt = async function (id, source, revision) {
  const stored = await this.findOneAndUpdate(
    { _id: id, revision },
    { $set: storedOf(source), $inc: { revision: 1 } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (stored) return stored;
  const current = await this.findById(id, { revision: 1 }).lean();
  if (!current) throw Object.assign(new Error('ObjectLayerRenderFrames not found'), { status: 404 });
  throw Object.assign(
    new Error(`The editor source is at revision ${current.revision}, not ${revision}: reload it before saving`),
    { status: 409 },
  );
};

/**
 * Moves every stored source of the nested-matrix form (`colors`, `frame_duration`) to the indexed
 * form. Idempotent.
 * @returns {Promise<number>} Documents moved.
 * @memberof CyberiaObjectLayerRenderFramesModel
 */
ObjectLayerRenderFramesSchema.statics.migrateFormat = async function () {
  let migrated = 0;
  for await (const stored of this.collection.find({ format: { $exists: false } })) {
    const source = sourceFromIndexedFrames({
      frames: stored.frames ?? {},
      colors: stored.colors ?? [],
      frameDurationMs: stored.frame_duration ?? 100,
    });
    await this.collection.updateOne(
      { _id: stored._id },
      { $set: { ...storedOf(source), revision: 1 }, $unset: { colors: '', frame_duration: '' } },
    );
    migrated++;
  }
  return migrated;
};

const ObjectLayerRenderFramesModel = model('ObjectLayerRenderFrames', ObjectLayerRenderFramesSchema);
const ProviderSchema = ObjectLayerRenderFramesSchema;
class ObjectLayerRenderFramesDto {
  static select = {
    getFull: () => ({
      _id: 1,
      objectLayerCid: 1,
      format: 1,
      width: 1,
      height: 1,
      palette: 1,
      frameDurationMs: 1,
      frames: 1,
      revision: 1,
    }),
  };
}
export { ObjectLayerRenderFramesSchema, ObjectLayerRenderFramesModel, ProviderSchema, ObjectLayerRenderFramesDto };
