/**
 * Mongoose model for `CyberiaUniverse`: a set of instances that share player profiles, with the
 * layout of its graph view and the links between them.
 *
 * A universe names its instances by code and never holds their content. Each member keeps its cell
 * of the graph view (see LAYOUT_CELL_LIMIT). An instance belongs to one universe at most, so every
 * world resolves one profile per account. The universe lives in the host database: a content
 * release, a promotion or a rollback never changes it.
 *
 * @module src/api/cyberia-universe/cyberia-universe.model.js
 */

import { Schema, model } from 'mongoose';

const UniverseMemberSchema = new Schema(
  {
    instanceCode: { type: String, required: true, trim: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false },
);

/** A link a player can travel. A bidirectional link goes both ways. */
const UniverseLinkSchema = new Schema(
  {
    sourceInstanceCode: { type: String, required: true, trim: true },
    targetInstanceCode: { type: String, required: true, trim: true },
    bidirectional: { type: Boolean, default: true },
  },
  { _id: false },
);

const CyberiaUniverseSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    creator: { type: Schema.Types.ObjectId, ref: 'User' },
    instances: { type: [UniverseMemberSchema], default: [] },
    links: { type: [UniverseLinkSchema], default: [] },
    // Writes of this universe. A save names the revision it read, so no save overwrites a newer one.
    revision: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
);

CyberiaUniverseSchema.index(
  { 'instances.instanceCode': 1 },
  { unique: true, partialFilterExpression: { 'instances.instanceCode': { $exists: true } } },
);

const CyberiaUniverseModel = model('CyberiaUniverse', CyberiaUniverseSchema);

const ProviderSchema = CyberiaUniverseSchema;

export { CyberiaUniverseSchema, CyberiaUniverseModel, ProviderSchema };
