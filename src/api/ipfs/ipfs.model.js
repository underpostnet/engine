/**
 * Mongoose model for the IPFS content registry: one record per CID this host pinned.
 *
 * A record is content identity only. The MFS path a CID is listed under is derived from the
 * content it belongs to (`objectLayerMfsPaths` of `object-layer.ipfs.js`), never stored, and a pin
 * is the node's state, never a record field. The registry lets a deletion unpin what this host
 * pinned, `GET /ipfs/verify` check every recorded CID is still pinned, and a prune find content no
 * kept store references.
 *
 * Fields:
 *   cid          - IPFS Content Identifier (CIDv1). Unique.
 *   resourceType - What the content is:
 *                    'object-layer-data'  - Canonical bytes of an ObjectLayer definition (`object-layer.json`).
 *                    'atlas-sprite-sheet' - Primary render PNG of an ObjectLayer (`data.render.cid`, `atlas.png`).
 *                    'atlas-metadata'     - Render metadata JSON of an ObjectLayer (`data.render.metadataCid`, `atlas.json`).
 *   size         - Cumulative DAG size the node reported.
 *
 * @module src/api/ipfs/ipfs.model.js
 * @namespace IpfsModel
 */
import { Schema, model } from 'mongoose';

export const IPFS_RESOURCE_TYPES = Object.freeze(['object-layer-data', 'atlas-sprite-sheet', 'atlas-metadata']);

const IpfsSchema = new Schema(
  {
    cid: { type: String, required: true, unique: true, trim: true },
    resourceType: { type: String, required: true, trim: true, enum: IPFS_RESOURCE_TYPES },
    size: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);
IpfsSchema.index({ resourceType: 1 });
const IpfsModel = model('Ipfs', IpfsSchema);
const ProviderSchema = IpfsSchema;
class IpfsDto {
  static select = {
    get: () => ({
      _id: 1,
      cid: 1,
      resourceType: 1,
      size: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  };
}
export { IpfsSchema, IpfsModel, ProviderSchema, IpfsDto };
