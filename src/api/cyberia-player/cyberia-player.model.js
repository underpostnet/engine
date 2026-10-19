/**
 * Mongoose model for `CyberiaPlayer`: the persistent profile of one account in one universe.
 *
 * The profile holds what the player carries between the worlds of its universe: coins, total XP,
 * the bag, the personal storage and their held stacks. `worlds` holds what stays in one world: the
 * position, the NPC vaults and their held stacks. Quest progress is per world too, in its own
 * collection.
 *
 * The game server is the authority: it commits the whole durable state of a session, and the
 * engine stores it. `epoch` fences the sessions in every world of the universe: each acquisition
 * raises it, and a write of an older epoch is refused. `commitSeq` and each `positionSeq` order the
 * writes inside one epoch.
 *
 * @module src/api/cyberia-player/cyberia-player.model.js
 */

import { Schema, model } from 'mongoose';

/** The shape version of a profile document. */
const PLAYER_SCHEMA_VERSION = 2;

/**
 * Why a world holds a stack: its label names another definition now, the world cannot get its
 * content, the container had no room, the server runs no handler of its skill, or the content
 * comes from another release than the world's.
 */
const HELD_REASONS = Object.freeze(['rebound', 'unknown', 'no_room', 'unsupported', 'incompatible']);
const CONTAINERS = Object.freeze(['bag', 'storage', 'vault']);
/** The containers of the profile; a vault stays in its world. */
const PROFILE_CONTAINERS = Object.freeze(['bag', 'storage']);

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

/** An owned stack the world cannot load now. Kept untouched until it loads again. */
const HeldStackSchema = new Schema(
  {
    stack: { type: PlayerStackSchema, required: true },
    container: { type: String, enum: CONTAINERS, required: true },
    actionCode: { type: String, default: '' },
    reason: { type: String, enum: HELD_REASONS, required: true },
  },
  { _id: false },
);

/** What one account keeps in one world of the universe. */
const PlayerWorldSchema = new Schema(
  {
    instanceCode: { type: String, required: true, trim: true },
    positionSeq: { type: Number, default: 0 },
    position: {
      mapCode: { type: String, default: '' },
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      at: { type: Date, default: null },
    },
    vaults: {
      type: [
        new Schema(
          { actionCode: { type: String, required: true }, stacks: { type: [PlayerStackSchema], default: [] } },
          { _id: false },
        ),
      ],
      default: [],
    },
    // The held vault stacks of this world.
    held: { type: [HeldStackSchema], default: [] },
  },
  { _id: false },
);

const CyberiaPlayerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    universeCode: { type: String, required: true, trim: true },
    schemaVersion: { type: Number, default: PLAYER_SCHEMA_VERSION },
    epoch: { type: Number, default: 0 },
    commitSeq: { type: Number, default: 0 },
    revision: { type: Number, default: 0 },
    coins: { type: Number, default: 0, min: 0 },
    xp: { type: Number, default: 0, min: 0 },
    bag: { type: [PlayerStackSchema], default: [] },
    storage: { type: [PlayerStackSchema], default: [] },
    // The held bag and storage stacks.
    held: { type: [HeldStackSchema], default: [] },
    worlds: { type: [PlayerWorldSchema], default: [] },
    lastPlayedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CyberiaPlayerSchema.index({ user: 1, universeCode: 1 }, { unique: true });

/** The definition path of every stack a profile keeps: bag, storage, world vaults and their held stacks. */
const STACK_CID_PATHS = Object.freeze([
  'bag.olCid',
  'storage.olCid',
  'held.stack.olCid',
  'worlds.vaults.stacks.olCid',
  'worlds.held.stack.olCid',
]);

/**
 * The definition cid of every stack any profile keeps.
 * @returns {Promise<string[]>}
 */
CyberiaPlayerSchema.statics.ownedDefinitionCids = async function () {
  const cids = new Set();
  for (const path of STACK_CID_PATHS) for (const cid of await this.distinct(path)) if (cid) cids.add(cid);
  return [...cids];
};

const CyberiaPlayerModel = model('CyberiaPlayer', CyberiaPlayerSchema);

const ProviderSchema = CyberiaPlayerSchema;

export {
  CyberiaPlayerSchema,
  CyberiaPlayerModel,
  ProviderSchema,
  PLAYER_SCHEMA_VERSION,
  HELD_REASONS,
  CONTAINERS,
  PROFILE_CONTAINERS,
};
