/**
 * Mongoose model for `CyberiaPlayerAudit`: the append-only trail of what operators did to player
 * sessions. Every privileged action is a record, refused or done, so what an operator changed never
 * rests on application logs.
 *
 * @module src/api/cyberia-player-audit/cyberia-player-audit.model.js
 * @namespace CyberiaPlayerAuditModel
 */
import { Schema, model } from 'mongoose';

/** The recorded actions. */
const PLAYER_AUDIT_ACTIONS = Object.freeze(['session.end']);

/** How an action ended. */
const PLAYER_AUDIT_OUTCOMES = Object.freeze(['done', 'refused']);

const CyberiaPlayerAuditSchema = new Schema(
  {
    // The id the operator view sent: a retry of the same id answers the recorded outcome.
    operationId: { type: String, required: true, unique: true, immutable: true },
    action: { type: String, required: true, enum: PLAYER_AUDIT_ACTIONS, immutable: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    player: { type: Schema.Types.ObjectId, ref: 'CyberiaPlayer', required: true, immutable: true },
    reason: { type: String, required: true, immutable: true },
    outcome: { type: String, required: true, enum: PLAYER_AUDIT_OUTCOMES, immutable: true },
    refusal: { type: String, default: '', immutable: true },
    epochBefore: { type: Number, default: null, immutable: true },
    epochAfter: { type: Number, default: null, immutable: true },
    // The lease the action found: where the session played and how far the engine held its state.
    session: {
      type: {
        _id: false,
        instanceCode: String,
        serverId: String,
        durability: String,
        seq: Number,
        durableSeq: Number,
        unsavedMs: Number,
      },
      default: null,
      immutable: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

CyberiaPlayerAuditSchema.index({ player: 1, createdAt: -1 });

const CyberiaPlayerAuditModel = model('CyberiaPlayerAudit', CyberiaPlayerAuditSchema);

const ProviderSchema = CyberiaPlayerAuditSchema;

export {
  CyberiaPlayerAuditSchema,
  CyberiaPlayerAuditModel,
  PLAYER_AUDIT_ACTIONS,
  PLAYER_AUDIT_OUTCOMES,
  ProviderSchema,
};
