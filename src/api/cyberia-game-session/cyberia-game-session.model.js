/**
 * Mongoose model for `CyberiaGameSession`: the one gameplay session of an account.
 *
 * The document is the lease of the profile it plays, the presence friends read, and the record of
 * the server that holds the player. A checkpoint renews `expiresAt`; presence reads a session as
 * online until then. The release deletes the document; a crash leaves it expired until the next
 * acquisition of the account overwrites it.
 *
 * @module src/api/cyberia-game-session/cyberia-game-session.model.js
 */

import { Schema, model } from 'mongoose';

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
  },
  { timestamps: true },
);

const CyberiaGameSessionModel = model('CyberiaGameSession', CyberiaGameSessionSchema);

const ProviderSchema = CyberiaGameSessionSchema;

export { CyberiaGameSessionSchema, CyberiaGameSessionModel, ProviderSchema };
