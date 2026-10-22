/**
 * Mongoose model for `CyberiaGameSession`: the one gameplay session of an account.
 *
 * The document is the lease of the profile it plays, the presence friends read, and the record of
 * the server that holds the player. A checkpoint renews `expiresAt` and reports `health`; presence
 * reads a session as online until then. The release deletes the document; a crash leaves it expired
 * until the next acquisition of the account overwrites it.
 *
 * @module src/api/cyberia-game-session/cyberia-game-session.model.js
 */

import { Schema, model } from 'mongoose';

/** How far the engine holds the state of a session, as its server reports it. */
const SESSION_DURABILITY = Object.freeze(['saved', 'saving', 'degraded', 'recovery']);

/** The classes of the failure of the commits of a session: none, the call, the state, the call itself. */
const SESSION_FAILURES = Object.freeze(['', 'transport', 'integrity', 'rejected']);

const CyberiaGameSessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    player: { type: Schema.Types.ObjectId, ref: 'CyberiaPlayer', required: true },
    instanceCode: { type: String, required: true },
    serverId: { type: String, required: true },
    connection: { type: String, required: true },
    epoch: { type: Number, required: true },
    // The `User.activeSessions` entry that launched the game. Its end ends this session.
    accountSession: { type: Schema.Types.ObjectId, required: true },
    mapCode: { type: String, default: '' },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    // The last checkpoint report; `at` is null before the first one.
    health: {
      durability: { type: String, enum: SESSION_DURABILITY, default: 'saved' },
      // The session ended; its final state is on its way.
      closing: { type: Boolean, default: false },
      seq: { type: Number, default: 0 },
      durableSeq: { type: Number, default: 0 },
      unsavedMs: { type: Number, default: 0 },
      failure: { type: String, enum: SESSION_FAILURES, default: '' },
      at: { type: Date, default: null },
    },
    // The operator who ended the session; its server ends it at the next checkpoint.
    endedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const CyberiaGameSessionModel = model('CyberiaGameSession', CyberiaGameSessionSchema);

const ProviderSchema = CyberiaGameSessionSchema;

export { CyberiaGameSessionSchema, CyberiaGameSessionModel, ProviderSchema, SESSION_DURABILITY, SESSION_FAILURES };
