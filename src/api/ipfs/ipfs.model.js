/**
 * Mongoose model for the IPFS CID Registry.
 *
 * Purpose: tracks every CID that the Engine has pinned to IPFS so that:
 *   1. Deletions can cleanly unpin the right CID from the IPFS node/cluster.
 *   2. Admins can run a health-check that verifies every DB-registered CID is
 *      still actually pinned (GET /ipfs/verify).
 *   3. Garbage-collection jobs can discover orphaned CIDs (pinned on the node
 *      but not referenced by any DB document).
 *
 * Fields:
 *   cid          - IPFS Content Identifier (CIDv0 or CIDv1).
 *   resourceType - What kind of asset this CID belongs to:
 *                    'object-layer-data'  - JSON payload of an ObjectLayer document.
 *                    'atlas-sprite-sheet' - PNG sprite-sheet of an ObjectLayer.
 *                    'atlas-metadata'     - JSON metadata of an AtlasSpriteSheet.
 *   mfsPath      - MFS (Mutable File System) path used when the CID was added,
 *                  e.g. /object-layer/sword/sword_data.json.
 *                  Enables targeted removal via files/rm without knowing the CID.
 *
 * @module src/api/ipfs/ipfs.model.js
 * @namespace IpfsModel
 */
import { Schema, model } from 'mongoose';
const IpfsSchema = new Schema(
  {
    cid: {
      type: String,
      required: true,
      trim: true,
    },
    // Asset category - determines which service owns this CID.
    resourceType: {
      type: String,
      required: true,
      trim: true,
      enum: ['object-layer-data', 'atlas-sprite-sheet', 'atlas-metadata'],
    },
    // MFS path used when the content was added to IPFS.
    // Empty string when the content was added without an MFS copy.
    mfsPath: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);
// One DB record per (CID, resourceType) pair.
IpfsSchema.index({ cid: 1, resourceType: 1 }, { unique: true });
// Fast look-ups for health-check and garbage-collection by type.
IpfsSchema.index({ resourceType: 1 });
// Fast look-ups for targeted MFS cleanup.
IpfsSchema.index({ mfsPath: 1 });
const IpfsModel = model('Ipfs', IpfsSchema);
const ProviderSchema = IpfsSchema;
class IpfsDto {
  static select = {
    get: () => ({
      _id: 1,
      cid: 1,
      resourceType: 1,
      mfsPath: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  };
}
export { IpfsSchema, IpfsModel, ProviderSchema, IpfsDto };
