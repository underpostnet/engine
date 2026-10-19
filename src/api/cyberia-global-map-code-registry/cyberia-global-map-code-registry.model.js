/**
 * Mongoose model for the Global MapCode Registry: the owner instance of each map code of a catalog,
 * projected from its maps and instances. `src/projects/cyberia/instance/map-registry.js` is its
 * only writer.
 * @module src/api/cyberia-global-map-code-registry/cyberia-global-map-code-registry.model.js
 * @namespace CyberiaGlobalMapCodeRegistryModel
 */
import { Schema, model } from 'mongoose';

/**
 * `active` while the map and its instance are published, `unlisted` while either is not, and
 * `deprecated` once either is archived or no instance lists the code.
 * @memberof CyberiaGlobalMapCodeRegistryModel
 */
const REGISTRY_STATUSES = Object.freeze(['active', 'unlisted', 'deprecated']);

/**
 * @typedef {Object} CyberiaGlobalMapCodeRegistry
 * @property {string} catalog - The content database the code belongs to: the workspace or a release.
 * @property {string} mapCode - The map code, one owner per catalog.
 * @property {string} instanceCode - The owner instance, or the last one of a deprecated code.
 * @property {Types.ObjectId} instanceId - The owner document in the catalog database.
 * @property {string} status - `active`, `unlisted` or `deprecated`.
 * @property {string} checksum - sha256 of catalog, mapCode, instanceCode, instanceId and status.
 * @property {number} version - The revision of this row; a change of owner or status moves it.
 * @memberof CyberiaGlobalMapCodeRegistryModel
 */
const CyberiaGlobalMapCodeRegistrySchema = new Schema(
  {
    catalog: { type: String, required: true },
    mapCode: { type: String, required: true, trim: true },
    instanceCode: { type: String, required: true, trim: true },
    // The catalog database holds the owner; this database holds no such document.
    instanceId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: REGISTRY_STATUSES, required: true },
    checksum: { type: String, required: true },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
);
CyberiaGlobalMapCodeRegistrySchema.index({ catalog: 1, mapCode: 1 }, { unique: true });

const CyberiaGlobalMapCodeRegistryModel = model('CyberiaGlobalMapCodeRegistry', CyberiaGlobalMapCodeRegistrySchema);
const ProviderSchema = CyberiaGlobalMapCodeRegistrySchema;

class CyberiaGlobalMapCodeRegistryDto {
  static select = {
    get: () => ({ _id: 0, mapCode: 1, instanceCode: 1, status: 1, version: 1, updatedAt: 1 }),
  };
}

export {
  REGISTRY_STATUSES,
  CyberiaGlobalMapCodeRegistrySchema,
  CyberiaGlobalMapCodeRegistryModel,
  ProviderSchema,
  CyberiaGlobalMapCodeRegistryDto,
};
