/**
 * Mongoose model for the CyberiaProceduralAudit API: the append-only trail of the Procedural
 * Engine workflow. Every transition that decides what an asset is, who decided and which revision
 * it concerned is a record here, so provenance never rests on application logs.
 *
 * @module src/api/cyberia-procedural-audit/cyberia-procedural-audit.model.js
 * @namespace CyberiaProceduralAuditModel
 */
import { Schema, model } from 'mongoose';

/**
 * The recorded actions.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaProceduralAuditModel
 */
export const AUDIT_ACTIONS = Object.freeze([
  'job.created',
  'job.started',
  'job.completed',
  'job.cancelled',
  'item.generated',
  'item.validation_failed',
  'item.regenerated',
  'item.opened_for_edit',
  'item.revision_created',
  'item.approved',
  'item.rejected',
  'item.promoted',
  'item.created',
]);

/** The actor of a transition no human made. */
export const SYSTEM_ACTOR = 'system:procedural-worker';

/**
 * @typedef {Object} CyberiaProceduralAudit
 * @property {string} action - One of {@link AUDIT_ACTIONS}
 * @property {string} actor - User id of the human, or {@link SYSTEM_ACTOR}
 * @property {import('mongoose').Types.ObjectId} jobId - The job concerned
 * @property {import('mongoose').Types.ObjectId|null} jobItemId - The item concerned; null for a job action
 * @property {number|null} previousRevision
 * @property {number|null} newRevision
 * @property {string} previousCid
 * @property {string} newCid
 * @property {string} reason - Why, in the words of the actor or the system
 * @property {Date} createdAt - When it happened
 * @memberof CyberiaProceduralAuditModel
 */
const CyberiaProceduralAuditSchema = new Schema(
  {
    action: { type: String, required: true, enum: AUDIT_ACTIONS, immutable: true },
    actor: { type: String, required: true, trim: true, immutable: true },
    jobId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    jobItemId: { type: Schema.Types.ObjectId, default: null, immutable: true },
    previousRevision: { type: Number, default: null, immutable: true },
    newRevision: { type: Number, default: null, immutable: true },
    previousCid: { type: String, default: '', immutable: true },
    newCid: { type: String, default: '', immutable: true },
    reason: { type: String, default: '', immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

CyberiaProceduralAuditSchema.index({ jobId: 1, createdAt: 1 });
CyberiaProceduralAuditSchema.index({ jobItemId: 1, createdAt: 1 });

/**
 * Appends one record.
 * @param {Object} entry - A record without `createdAt`.
 * @param {import('mongoose').ClientSession} [session] - The transaction the record joins.
 * @returns {Promise<Object>}
 * @memberof CyberiaProceduralAuditModel
 */
CyberiaProceduralAuditSchema.statics.record = async function (entry, session = null) {
  const [recorded] = await this.create([entry], { session });
  return recorded;
};

const CyberiaProceduralAuditModel = model('CyberiaProceduralAudit', CyberiaProceduralAuditSchema);
const ProviderSchema = CyberiaProceduralAuditSchema;

class CyberiaProceduralAuditDto {
  static select = {
    get: () => ({
      _id: 1,
      action: 1,
      actor: 1,
      jobId: 1,
      jobItemId: 1,
      previousRevision: 1,
      newRevision: 1,
      previousCid: 1,
      newCid: 1,
      reason: 1,
      createdAt: 1,
    }),
  };
}

export { CyberiaProceduralAuditSchema, CyberiaProceduralAuditModel, ProviderSchema, CyberiaProceduralAuditDto };
