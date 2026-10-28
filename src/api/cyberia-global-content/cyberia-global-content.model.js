/**
 * Mongoose model for the CyberiaGlobalContent API: the Object Layer definitions Cyberia keeps
 * available with no world. A row names a definition by its CID and says why it stays; the
 * definition, its render and any item binding stay with their own owners. The content release
 * carries every row, so a definition no foundation, saga or instance names reaches the next
 * release.
 *
 * @module src/api/cyberia-global-content/cyberia-global-content.model.js
 * @namespace CyberiaGlobalContentModel
 */
import { Schema, model } from 'mongoose';
import { OBJECT_LAYER_CID_PATTERN } from '../object-layer/object-layer.identity.js';

/**
 * Why a definition stays: a moderator imported it, an item binding no world carries names it, or a
 * player owns a stack of it.
 * @memberof CyberiaGlobalContentModel
 */
export const GLOBAL_CONTENT_REASONS = Object.freeze(['import', 'catalog', 'owned']);

/** Where a definition came from. */
const ProvenanceSchema = new Schema(
  {
    domain: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    createdAt: { type: Date, default: null },
  },
  { _id: false },
);

/**
 * @typedef {Object} CyberiaGlobalContent
 * @property {string} objectLayerCid - The definition, one row per CID.
 * @property {string} reason - One of {@link GLOBAL_CONTENT_REASONS}.
 * @property {string} by - The actor that registered it.
 * @property {Date} registeredAt - When it was registered; a release keeps the first date.
 * @property {{domain:string,createdBy:string,createdAt:Date}} provenance - Where it came from.
 * @memberof CyberiaGlobalContentModel
 */
const CyberiaGlobalContentSchema = new Schema(
  {
    objectLayerCid: { type: String, required: true, unique: true, trim: true, match: OBJECT_LAYER_CID_PATTERN },
    reason: { type: String, required: true, enum: GLOBAL_CONTENT_REASONS },
    by: { type: String, default: '' },
    registeredAt: { type: Date, required: true },
    provenance: { type: ProvenanceSchema, default: () => ({}) },
  },
  { timestamps: true },
);

const CyberiaGlobalContentModel = model('CyberiaGlobalContent', CyberiaGlobalContentSchema);
const ProviderSchema = CyberiaGlobalContentSchema;

export { CyberiaGlobalContentSchema, CyberiaGlobalContentModel, ProviderSchema };
