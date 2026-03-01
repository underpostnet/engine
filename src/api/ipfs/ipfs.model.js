/**
 * Mongoose model for IPFS API – a general-purpose pin record that relates
 * a user to a CID.
 *
 * @module src/api/ipfs/ipfs.model.js
 * @namespace IpfsModel
 */

import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} Ipfs
 * @property {string}         cid       – IPFS Content Identifier (CIDv0 or CIDv1).
 * @property {Types.ObjectId} userId    – Reference to the User who owns / requested the pin.
 * @property {Date}           createdAt – Auto-managed by Mongoose.
 * @property {Date}           updatedAt – Auto-managed by Mongoose.
 * @memberof IpfsModel
 */
const IpfsSchema = new Schema(
  {
    cid: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index: one pin record per user + CID pair.
IpfsSchema.index({ cid: 1, userId: 1 }, { unique: true });

// Fast look-ups by user.
IpfsSchema.index({ userId: 1 });

// Fast look-ups by CID.
IpfsSchema.index({ cid: 1 });

const IpfsModel = model('Ipfs', IpfsSchema);

const ProviderSchema = IpfsSchema;

const IpfsDto = {
  select: {
    get: () => {
      return {
        _id: 1,
        cid: 1,
        userId: 1,
        createdAt: 1,
        updatedAt: 1,
      };
    },
  },
  populate: {
    user: () => ({
      path: 'userId',
      model: 'User',
      select: '_id username email role',
    }),
  },
};

export { IpfsSchema, IpfsModel, ProviderSchema, IpfsDto };
