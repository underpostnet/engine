/**
 * Mongoose model for `CyberiaPlayer`: the persistent profile of one account in one world.
 *
 * The game server is the authority: it commits the whole durable state of a session, and the
 * engine stores it. `epoch` fences the sessions: each acquisition raises it, and a write of an
 * older epoch is refused. `commitSeq` and `positionSeq` order the writes inside one epoch.
 *
 * @module src/api/cyberia-player/cyberia-player.model.js
 */

import { Schema, model } from 'mongoose';

/** The shape version of a profile document. */
const PLAYER_SCHEMA_VERSION = 1;

const HELD_REASONS = Object.freeze(['rebound', 'unknown', 'no_room']);
const CONTAINERS = Object.freeze(['bag', 'storage', 'vault']);

const PlayerStackSchema = new Schema(
  {
    itemId: { type: String, required: true, trim: true },
    // The definition the stack was granted with. A rebound label never rewrites it.
    olCid: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    slot: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: false },
  },
  { _id: false },
);

const CyberiaPlayerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    instanceCode: { type: String, required: true, trim: true },
    schemaVersion: { type: Number, default: PLAYER_SCHEMA_VERSION },
    epoch: { type: Number, default: 0 },
    commitSeq: { type: Number, default: 0 },
    positionSeq: { type: Number, default: 0 },
    revision: { type: Number, default: 0 },
    coins: { type: Number, default: 0, min: 0 },
    xp: { type: Number, default: 0, min: 0 },
    bag: { type: [PlayerStackSchema], default: [] },
    storage: { type: [PlayerStackSchema], default: [] },
    vaults: {
      type: [
        new Schema(
          { actionCode: { type: String, required: true }, stacks: { type: [PlayerStackSchema], default: [] } },
          { _id: false },
        ),
      ],
      default: [],
    },
    // Owned stacks the world cannot load now. Kept untouched until they load again.
    held: {
      type: [
        new Schema(
          {
            stack: { type: PlayerStackSchema, required: true },
            container: { type: String, enum: CONTAINERS, required: true },
            actionCode: { type: String, default: '' },
            reason: { type: String, enum: HELD_REASONS, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    position: {
      mapCode: { type: String, default: '' },
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      at: { type: Date, default: null },
    },
    lastPlayedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CyberiaPlayerSchema.index({ user: 1, instanceCode: 1 }, { unique: true });

const CyberiaPlayerModel = model('CyberiaPlayer', CyberiaPlayerSchema);

const ProviderSchema = CyberiaPlayerSchema;

export { CyberiaPlayerSchema, CyberiaPlayerModel, ProviderSchema, PLAYER_SCHEMA_VERSION, HELD_REASONS, CONTAINERS };
