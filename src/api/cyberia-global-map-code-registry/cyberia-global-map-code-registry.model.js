/**
 * Mongoose model for Global MapCode Registry API.
 * Universal registry that maps every mapCode to its owning instance across the entire Cyberia universe.
 * @module src/api/cyberia-global-map-code-registry/cyberia-global-map-code-registry.model.js
 * @namespace CyberiaGlobalMapCodeRegistryModel
 */
import { Schema, model } from 'mongoose';
/**
 * @typedef {Object} CyberiaGlobalMapCodeRegistry
 * @property {string} mapCode - Global unique identifier for the map (never repeats across the whole universe)
 * @property {string} instanceCode - Code of the instance this map belongs to
 * @property {Types.ObjectId} instanceId - Reference to the CyberiaInstance document
 * @property {string} status - Current status of the map
 * @property {Date} lastPortalUpdate - Last time a portal involving this map was updated (used for hot-reload)
 * @property {string} checksum - Optional hash to validate data consistency
 * @property {number} version - Version counter for change detection
 * @property {Date} createdAt - When the registry entry was created
 * @property {Date} updatedAt - When the registry entry was last updated
 * @memberof CyberiaGlobalMapCodeRegistryModel
 */
const CyberiaGlobalMapCodeRegistrySchema = new Schema(
  {
    // Global unique map identifier
    mapCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    // Instance this map belongs to
    instanceCode: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    // Reference to the full instance document
    instanceId: {
      type: Schema.Types.ObjectId,
      ref: 'CyberiaInstance',
      required: true,
    },
    // Status control
    status: {
      type: String,
      enum: ['active', 'deprecated', 'locked', 'maintenance'],
      default: 'active',
    },
    // Used for portal hot-reload and cache invalidation
    lastPortalUpdate: {
      type: Date,
      default: Date.now,
    },
    // Optional checksum for data integrity
    checksum: {
      type: String,
    },
    // Version counter (useful for live updates)
    version: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);
// ──────────────────────────────────────────────────────────────
// Indexes for high-performance queries
// ──────────────────────────────────────────────────────────────
CyberiaGlobalMapCodeRegistrySchema.index({ mapCode: 1 }, { unique: true });
CyberiaGlobalMapCodeRegistrySchema.index({ instanceCode: 1, mapCode: 1 });
CyberiaGlobalMapCodeRegistrySchema.index({ instanceId: 1 });
// Pre-save hook to ensure data consistency and auto-increment version
CyberiaGlobalMapCodeRegistrySchema.pre('save', function () {
  if (!this.mapCode || !this.instanceCode || !this.instanceId) {
    throw new Error('GlobalMapCodeRegistry: mapCode, instanceCode and instanceId are required');
  }
  // Auto-increment version on every update
  if (this.isModified()) {
    this.version = (this.version || 0) + 1;
    this.lastPortalUpdate = new Date();
  }
});
// Create and export the model
const GlobalMapCodeRegistryModel = model('GlobalMapCodeRegistry', CyberiaGlobalMapCodeRegistrySchema);
const ProviderSchema = CyberiaGlobalMapCodeRegistrySchema;
class GlobalMapCodeRegistryDto {
  static select = {
    get: () => {
      return {
        _id: 1,
        mapCode: 1,
        instanceCode: 1,
        instanceId: 1,
        status: 1,
        lastPortalUpdate: 1,
        checksum: 1,
        version: 1,
        createdAt: 1,
        updatedAt: 1,
      };
    },
    getForGoServer: () => {
      return {
        mapCode: 1,
        instanceCode: 1,
        status: 1,
      };
    },
  };
}
export { CyberiaGlobalMapCodeRegistrySchema, GlobalMapCodeRegistryModel, ProviderSchema, GlobalMapCodeRegistryDto };
