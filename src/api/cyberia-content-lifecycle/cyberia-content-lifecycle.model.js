/**
 * Mongoose model for `CyberiaContentLifecycle`: one content maintenance and release cycle of a
 * deployment, from its infrastructure backup to its runtime convergence. It is the projection of the
 * cycle's event journal (`CyberiaContentLifecycleEvent`): the newest execution of each stage for each
 * execution target, the ids of the records each domain owns, and the shares of the cycle. It lives
 * in the runtime database beside the release ledger, so a workspace reset, a release build and a
 * promotion leave it as it is.
 *
 * @module src/api/cyberia-content-lifecycle/cyberia-content-lifecycle.model.js
 * @namespace CyberiaContentLifecycleModel
 */
import { Schema, model } from 'mongoose';

/**
 * The states of a cycle; `completed` once its last stage is verified and current, `superseded` when it
 * started under another stage order.
 */
export const LIFECYCLE_STATUS = Object.freeze([
  'in-progress',
  'blocked',
  'failed',
  'completed',
  'cancelled',
  'superseded',
]);

/** The states an execution records; a stage with no execution for a target is pending for it. */
export const STAGE_STATUS = Object.freeze(['completed', 'failed', 'blocked']);

/** How a share ended. */
export const SHARE_CLOSE_REASONS = Object.freeze(['closed', 'expired', 'revoked']);

/** The environments a cycle targets. */
export const LIFECYCLE_ENVIRONMENTS = Object.freeze(['development', 'production', 'test']);

/** A cycle id: `<deploy-id>-<yyyymmddhhmm>-<suffix>`, lowercase. */
export const CYCLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;

const NodeSchema = new Schema(
  {
    nodeName: { type: String, default: '' },
    role: { type: String, default: '' },
    peerId: { type: String, default: '' },
  },
  { _id: false },
);

const ExecutionSchema = new Schema(
  {
    stage: { type: String, required: true },
    targetId: { type: String, required: true },
    targetKind: { type: String, required: true },
    targetFingerprint: { type: String, required: true },
    // The identity of the target incarnation; it holds no secret.
    target: { type: Schema.Types.Mixed, default: () => ({}) },
    status: { type: String, enum: STAGE_STATUS, required: true },
    attempts: { type: Number, default: 1, min: 1 },
    inputExecution: { type: String, default: '' },
    inputFingerprint: { type: String, default: '' },
    evidenceDigest: { type: String, default: '' },
    evidence: { type: Schema.Types.Mixed, default: () => ({}) },
    error: { type: String, default: '' },
    eventId: { type: String, required: true },
    node: { type: NodeSchema, default: () => ({}) },
    at: { type: Date, required: true },
  },
  { _id: false },
);

// The newest outcome of one operation the journal holds for the cycle.
const OperationSchema = new Schema(
  {
    operation: { type: String, required: true },
    status: { type: String, required: true },
    at: { type: Date, required: true },
    eventId: { type: String, required: true },
  },
  { _id: false },
);

const ShareSchema = new Schema(
  {
    shareId: { type: String, required: true },
    peerId: { type: String, required: true },
    nodeName: { type: String, default: '' },
    address: { type: String, default: '' },
    // The sha256 of the token: the token itself is never stored.
    tokenDigest: { type: String, required: true },
    openedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    leaseUntil: { type: Date, required: true },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, enum: [...SHARE_CLOSE_REASONS, ''], default: '' },
  },
  { _id: false },
);

const CyberiaContentLifecycleSchema = new Schema(
  {
    cycleId: { type: String, required: true, unique: true, trim: true, match: CYCLE_ID_PATTERN },
    deployId: { type: String, required: true, trim: true },
    environment: { type: String, enum: LIFECYCLE_ENVIRONMENTS, required: true },
    status: { type: String, enum: LIFECYCLE_STATUS, default: 'in-progress' },
    // The stage ids in the order the cycle runs them, set when it starts.
    stageOrder: { type: [String], default: undefined, immutable: true },
    scope: {
      sagas: { type: [String], default: [] },
      instances: { type: [String], default: [] },
      maps: { type: [String], default: [] },
      items: { type: [String], default: [] },
      cids: { type: [String], default: [] },
    },
    // The ids of the records each domain owns, as the newest evidence names them.
    references: { type: Schema.Types.Mixed, default: () => ({}) },
    executions: { type: [ExecutionSchema], default: () => [] },
    operations: { type: [OperationSchema], default: () => [] },
    shares: { type: [ShareSchema], default: () => [] },
    origin: { type: NodeSchema, default: () => ({}) },
    createdBy: { type: String, default: '' },
    sequence: { type: Number, default: 0, min: 0 },
    revision: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
);

CyberiaContentLifecycleSchema.index({ deployId: 1, updatedAt: -1 });

const CyberiaContentLifecycleModel = model('CyberiaContentLifecycle', CyberiaContentLifecycleSchema);
const ProviderSchema = CyberiaContentLifecycleSchema;

export { CyberiaContentLifecycleSchema, CyberiaContentLifecycleModel, ProviderSchema };
