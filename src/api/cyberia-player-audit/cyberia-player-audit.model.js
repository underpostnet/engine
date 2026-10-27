/**
 * Mongoose model for `CyberiaPlayerAudit`: the append-only trail of what operators did to player
 * profiles, their sessions and their accounts. Every privileged action is a record, refused or done,
 * with what it found and what it left, so what an operator changed never rests on application logs.
 *
 * @module src/api/cyberia-player-audit/cyberia-player-audit.model.js
 * @namespace CyberiaPlayerAuditModel
 */
import { Schema, model } from 'mongoose';

/** The recorded actions. */
const PLAYER_AUDIT_ACTIONS = Object.freeze([
  'session.end',
  'inventory.add',
  'inventory.remove',
  'inventory.quantity',
  'layer.activate',
  'layer.deactivate',
  'account.lock',
  'account.ban',
  'account.lift',
]);

/** How an action ended. */
const PLAYER_AUDIT_OUTCOMES = Object.freeze(['done', 'refused']);

const CyberiaPlayerAuditSchema = new Schema(
  {
    // The id the operator view sent: a retry of the same id answers the recorded outcome.
    operationId: { type: String, required: true, unique: true, immutable: true },
    action: { type: String, required: true, enum: PLAYER_AUDIT_ACTIONS, immutable: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    player: { type: Schema.Types.ObjectId, ref: 'CyberiaPlayer', required: true, immutable: true },
    account: { type: Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
    reason: { type: String, required: true, immutable: true },
    // The batch the request ran in; empty for a request of its own.
    batchId: { type: String, default: '', immutable: true },
    outcome: { type: String, required: true, enum: PLAYER_AUDIT_OUTCOMES, immutable: true },
    refusal: { type: String, default: '', immutable: true },
    epochBefore: { type: Number, default: null, immutable: true },
    epochAfter: { type: Number, default: null, immutable: true },
    // The change of the stacks it asked for: `{ op, container, itemId, slot, quantity }`.
    change: { type: Schema.Types.Mixed, default: null, immutable: true },
    // What it found and what it left: the stacks it changed, the worn stacks, or the restriction.
    before: { type: [Schema.Types.Mixed], default: [], immutable: true },
    after: { type: [Schema.Types.Mixed], default: [], immutable: true },
    // When the restriction it applied ends; null for a ban without an end, or any other action.
    until: { type: Date, default: null, immutable: true },
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
CyberiaPlayerAuditSchema.index({ batchId: 1 }, { partialFilterExpression: { batchId: { $gt: '' } } });

const CyberiaPlayerAuditModel = model('CyberiaPlayerAudit', CyberiaPlayerAuditSchema);

const ProviderSchema = CyberiaPlayerAuditSchema;

export {
  CyberiaPlayerAuditSchema,
  CyberiaPlayerAuditModel,
  PLAYER_AUDIT_ACTIONS,
  PLAYER_AUDIT_OUTCOMES,
  ProviderSchema,
};
