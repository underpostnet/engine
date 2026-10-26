import { Schema, model, Types } from 'mongoose';
import { CyberiaEntitySchema } from '../cyberia-entity/cyberia-entity.model.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

/** The states of the preview of a map revision. */
const MEDIA_STATUS = Object.freeze(['pending', 'ready', 'failed']);

const CyberiaMapSchema = new Schema(
  {
    code: { type: String, default: '', unique: true },
    name: { type: String, default: '' },
    description: { type: String, default: '' },
    entities: { type: [CyberiaEntitySchema], default: [] },
    tags: { type: [String], default: [] },
    creator: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'unlisted' },
    // The custom picture its author chose. Without one, the preview is the thumbnail.
    thumbnail: { type: Schema.Types.ObjectId, ref: 'File' },
    // The server render of the placed entities at `media.revision`: the Instance Map node background.
    preview: { type: Schema.Types.ObjectId, ref: 'File' },
    // The state of the preview of a revision: `pending` from the write of the revision until its
    // preview is stored, `ready`, or `failed` with the error of the render.
    media: {
      type: new Schema(
        {
          revision: { type: Number, required: true, min: 1 },
          status: { type: String, required: true, enum: MEDIA_STATUS },
          error: { type: String, default: '' },
          at: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    worldX: { type: Number, default: null },
    worldY: { type: Number, default: null },
    gridX: { type: Number, default: 16 },
    gridY: { type: Number, default: 16 },
    cellWidth: { type: Number, default: 32 },
    cellHeight: { type: Number, default: 32 },
    // Writes of this map. A save names the revision it read, so no save overwrites a newer one.
    revision: { type: Number, default: 1, min: 1 },
  },
  {
    timestamps: true,
  },
);

const CyberiaMapModel = model('CyberiaMap', CyberiaMapSchema);

const ProviderSchema = CyberiaMapSchema;

class CyberiaMapDto {
  static select = {
    /** A list row: the map without its entities. */
    list: () => ({ entities: 0 }),
  };
}

export { CyberiaMapSchema, CyberiaMapModel, ProviderSchema, CyberiaMapDto, MEDIA_STATUS };
