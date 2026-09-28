import { Schema, model, Types } from 'mongoose';
import { CyberiaEntitySchema } from '../cyberia-entity/cyberia-entity.model.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaMapSchema = new Schema(
  {
    code: { type: String, default: '', unique: true },
    name: { type: String, default: '' },
    description: { type: String, default: '' },
    entities: { type: [CyberiaEntitySchema], default: [] },
    tags: { type: [String], default: [] },
    creator: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'unlisted' },
    thumbnail: { type: Schema.Types.ObjectId, ref: 'File' },
    // Auto-generated Object Layer canvas capture (MapEngine save/clone).
    // Serves as the node background image in the client's Instance Map.
    preview: { type: Schema.Types.ObjectId, ref: 'File' },
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

export { CyberiaMapSchema, CyberiaMapModel, ProviderSchema, CyberiaMapDto };
