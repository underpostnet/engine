/**
 * Mongoose model for `CyberiaContentLifecycleEvent`: the journal of a content lifecycle. Each
 * operation a host runs for a cycle appends one event, ordered by `seq` within the cycle. An event
 * is never rewritten: the model refuses every update and replacement.
 *
 * @module src/api/cyberia-content-lifecycle-event/cyberia-content-lifecycle-event.model.js
 * @namespace CyberiaContentLifecycleEventModel
 */
import { Schema, model } from 'mongoose';

/** How an operation ended; `blocked` means a policy or a precondition refused it before it ran. */
export const EVENT_STATUS = Object.freeze(['succeeded', 'failed', 'blocked', 'cancelled']);

const CyberiaContentLifecycleEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    cycleId: { type: String, required: true, trim: true },
    seq: { type: Number, required: true, min: 1 },
    previousEventId: { type: String, default: '' },
    stage: { type: String, default: '' },
    operation: { type: String, required: true },
    status: { type: String, enum: EVENT_STATUS, required: true },
    actor: { type: String, default: '' },
    node: {
      nodeName: { type: String, default: '' },
      role: { type: String, default: '' },
      peerId: { type: String, default: '' },
    },
    executionContext: { type: String, default: '' },
    environment: { type: String, default: '' },
    deployId: { type: String, default: '' },
    commandId: { type: String, default: '' },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, required: true },
    attempt: { type: Number, default: 1, min: 1 },
    executionTargetId: { type: String, default: '' },
    targetKind: { type: String, default: '' },
    targetFingerprint: { type: String, default: '' },
    target: { type: Schema.Types.Mixed, default: () => ({}) },
    inputExecution: { type: String, default: '' },
    shareId: { type: String, default: '' },
    idempotencyKey: { type: String, default: '' },
    inputFingerprint: { type: String, default: '' },
    resultSummary: { type: Schema.Types.Mixed, default: () => ({}) },
    references: { type: Schema.Types.Mixed, default: () => ({}) },
    error: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

CyberiaContentLifecycleEventSchema.index({ cycleId: 1, seq: 1 }, { unique: true });
// One event per idempotency key: a repeated operation finds the event of its first run.
CyberiaContentLifecycleEventSchema.index(
  { cycleId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $gt: '' } } },
);

const refuseRewrite = function () {
  throw new Error('The content lifecycle journal is append-only');
};
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'])
  CyberiaContentLifecycleEventSchema.pre(operation, refuseRewrite);
CyberiaContentLifecycleEventSchema.pre('save', function () {
  if (!this.isNew) refuseRewrite();
});

const CyberiaContentLifecycleEventModel = model('CyberiaContentLifecycleEvent', CyberiaContentLifecycleEventSchema);
const ProviderSchema = CyberiaContentLifecycleEventSchema;

export { CyberiaContentLifecycleEventSchema, CyberiaContentLifecycleEventModel, ProviderSchema };
