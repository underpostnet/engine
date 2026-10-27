/**
 * Mongoose model for the CyberiaProceduralJobItem API: one candidate of a job and the workflow
 * that takes it from a queued task to the active Object Layer of its target item.
 *
 * The item holds identity and lineage, never content: every revision is an Object Layer by cid.
 * Its status moves only along {@link ITEM_TRANSITIONS}, each move one atomic update that names the
 * statuses it leaves, so two workers or two moderators never both win a transition.
 *
 * @module src/api/cyberia-procedural-job-item/cyberia-procedural-job-item.model.js
 * @namespace CyberiaProceduralJobItemModel
 */
import { Schema, model } from 'mongoose';

/**
 * Workflow of an item.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaProceduralJobItemModel
 */
export const ITEM_STATUS = Object.freeze([
  'queued',
  'running',
  'generated',
  'review',
  'editing',
  'approved',
  'promoted',
  'rejected',
  'cancelled',
  'failed',
]);

/**
 * The statuses an item may move to from each status. `queued` after `running` is a retry; `queued`
 * after a decision is a regeneration. `review` and `editing` repeat: opening an editor again and
 * saving a revision change the content, not the status; a revision of an approved item returns it
 * to `review`.
 * @constant {Readonly<Object<string,ReadonlyArray<string>>>}
 * @memberof CyberiaProceduralJobItemModel
 */
export const ITEM_TRANSITIONS = Object.freeze({
  queued: ['running', 'cancelled'],
  running: ['queued', 'generated', 'failed', 'cancelled'],
  generated: ['review', 'failed', 'cancelled'],
  review: ['review', 'editing', 'approved', 'rejected', 'queued', 'cancelled'],
  editing: ['editing', 'review', 'approved', 'rejected', 'queued', 'cancelled'],
  approved: ['review', 'editing', 'promoted', 'rejected'],
  rejected: ['queued'],
  failed: ['queued'],
  promoted: [],
  cancelled: [],
});

/** The review of a revision no human decided on. */
export const EMPTY_REVIEW = Object.freeze({
  decision: '',
  reviewer: '',
  decidedAt: null,
  revision: null,
  cid: '',
  reason: '',
});

/** Statuses in which the item is a candidate a human may still decide on. */
export const ITEM_REVIEWABLE = Object.freeze(['review', 'editing']);

const RevisionSchema = new Schema(
  {
    revision: { type: Number, required: true },
    cid: { type: String, required: true },
    kind: { type: String, required: true, enum: ['generated', 'regenerated', 'edited'] },
    seed: { type: Number, default: null },
    parentCid: { type: String, default: '' },
    actor: { type: String, default: '' },
    at: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * @typedef {Object} CyberiaProceduralJobItem
 * @property {import('mongoose').Types.ObjectId} jobId - The job the item belongs to
 * @property {number} ordinal - Position in the job, from 0
 * @property {string} targetItemId - The item the candidate becomes: an existing item id, or the proposed id of a new item; the `data.item.id` of every revision
 * @property {string} sourceCid - Object Layer the target item ran on when the job was created; empty for a new item
 * @property {string} paletteId - The palette of the candidate; empty when its palette choice names none
 * @property {string} templateId - Genesis Template the candidate starts from
 * @property {{parentCid:string,parentItemId:string,parentRevision:number|null,generationRunId:string}} lineage - Where the source came from; the parent revision is the source revision
 * @property {string} generatedCid - Cid of the latest generated revision
 * @property {string} candidateCid - Cid of the revision under review
 * @property {number|null} revision - Number of the current revision; 0 is the first generated one
 * @property {number} seed - Seed of the next or latest generation
 * @property {string} status - One of {@link ITEM_STATUS}
 * @property {number} attempt - Runs started for the current generation
 * @property {Object} metrics - What the generator reported
 * @property {{score:number|null,nearest:string,metrics:Object}} diversity - How far the current generation stands from the source and its siblings
 * @property {Object|null} signature - The compact signature of the current generation, for the diversity of its siblings
 * @property {{message:string,retryable:boolean,at:Date}} error - Why the last run failed, and whether a run under the same seed can succeed
 * @property {{ok:boolean,checkedAt:Date,problems:string[]}} validation - Technical validation of the current revision
 * @property {Array<Object>} revisions - Every revision, oldest first
 * @property {{cid:string,seed:number,revision:number}} predecessor - The generation a regeneration replaced
 * @property {{decision:string,reviewer:string,decidedAt:Date,revision:number,cid:string,reason:string}} review - The last human decision on the current revision
 * @property {{cid:string,previousCid:string,at:Date,by:string}} promotion - The definition the target item runs on after the promotion, and the one it replaced
 * @property {{holder:string,expiresAt:Date}} lease - The worker running the item
 * @memberof CyberiaProceduralJobItemModel
 */
const CyberiaProceduralJobItemSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    ordinal: { type: Number, required: true, min: 0, immutable: true },
    targetItemId: { type: String, required: true, trim: true, immutable: true },
    sourceCid: { type: String, default: '', immutable: true },
    paletteId: { type: String, default: '', immutable: true },
    templateId: { type: String, required: true, immutable: true },
    lineage: {
      parentCid: { type: String, default: '' },
      parentItemId: { type: String, default: '' },
      parentRevision: { type: Number, default: null },
      generationRunId: { type: String, default: '' },
    },
    generatedCid: { type: String, default: '' },
    candidateCid: { type: String, default: '' },
    revision: { type: Number, default: null },
    seed: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: ITEM_STATUS, default: 'queued' },
    attempt: { type: Number, default: 0 },
    metrics: { type: Schema.Types.Mixed, default: () => ({}) },
    diversity: {
      score: { type: Number, default: null },
      nearest: { type: String, default: '' },
      metrics: { type: Schema.Types.Mixed, default: () => ({}) },
    },
    signature: { type: Schema.Types.Mixed, default: null },
    error: {
      message: { type: String, default: '' },
      retryable: { type: Boolean, default: false },
      at: { type: Date, default: null },
    },
    validation: {
      ok: { type: Boolean, default: false },
      checkedAt: { type: Date, default: null },
      problems: { type: [String], default: [] },
    },
    revisions: { type: [RevisionSchema], default: [] },
    predecessor: {
      cid: { type: String, default: '' },
      seed: { type: Number, default: null },
      revision: { type: Number, default: null },
    },
    review: {
      decision: { type: String, enum: ['', 'approved', 'rejected'], default: '' },
      reviewer: { type: String, default: '' },
      decidedAt: { type: Date, default: null },
      revision: { type: Number, default: null },
      cid: { type: String, default: '' },
      reason: { type: String, default: '' },
    },
    promotion: {
      cid: { type: String, default: '' },
      previousCid: { type: String, default: '' },
      at: { type: Date, default: null },
      by: { type: String, default: '' },
    },
    lease: { holder: { type: String, default: '' }, expiresAt: { type: Date, default: null } },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

CyberiaProceduralJobItemSchema.index({ jobId: 1, ordinal: 1 }, { unique: true });
CyberiaProceduralJobItemSchema.index({ jobId: 1, status: 1 });
CyberiaProceduralJobItemSchema.index({ status: 1, 'lease.expiresAt': 1, createdAt: 1, ordinal: 1 });
CyberiaProceduralJobItemSchema.index({ targetItemId: 1 });
CyberiaProceduralJobItemSchema.index({ 'revisions.cid': 1 });

/**
 * Moves an item along {@link ITEM_TRANSITIONS} in one atomic update. The update applies only while
 * the item is in one of the `from` statuses and matches every `where` field.
 * @param {Object} params
 * @param {import('mongoose').Types.ObjectId|string} params.id - The item.
 * @param {string[]} params.from - Statuses the item may leave.
 * @param {string} params.to - Status it takes.
 * @param {Object} [params.where] - Extra fields the item must hold, such as `candidateCid` or `lease.holder`.
 * @param {Object} [params.set] - Fields to set with the move.
 * @param {Object} [params.push] - Array entries to append with the move.
 * @param {import('mongoose').ClientSession} [params.session] - The transaction the move joins.
 * @returns {Promise<Object|null>} The item after the move; null when it was not in a `from` status or did not match.
 * @throws {Error} When a `from` status has no transition to `to`.
 * @memberof CyberiaProceduralJobItemModel
 */
CyberiaProceduralJobItemSchema.statics.advance = async function ({
  id,
  from,
  to,
  where = {},
  set = {},
  push = {},
  session = null,
}) {
  for (const status of from)
    if (!ITEM_TRANSITIONS[status]?.includes(to)) throw new Error(`An item cannot move from ${status} to ${to}`);
  const update = { $set: { ...set, status: to } };
  if (Object.keys(push).length > 0) update.$push = push;
  return await this.findOneAndUpdate({ ...where, _id: id, status: { $in: from } }, update, {
    returnDocument: 'after',
    session,
  });
};

const CyberiaProceduralJobItemModel = model('CyberiaProceduralJobItem', CyberiaProceduralJobItemSchema);
const ProviderSchema = CyberiaProceduralJobItemSchema;

class CyberiaProceduralJobItemDto {
  static select = {
    get: () => ({
      _id: 1,
      jobId: 1,
      ordinal: 1,
      targetItemId: 1,
      sourceCid: 1,
      paletteId: 1,
      templateId: 1,
      lineage: 1,
      generatedCid: 1,
      candidateCid: 1,
      revision: 1,
      seed: 1,
      status: 1,
      attempt: 1,
      metrics: 1,
      diversity: 1,
      error: 1,
      validation: 1,
      revisions: 1,
      predecessor: 1,
      review: 1,
      promotion: 1,
      startedAt: 1,
      finishedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  };
}

export { CyberiaProceduralJobItemSchema, CyberiaProceduralJobItemModel, ProviderSchema, CyberiaProceduralJobItemDto };
