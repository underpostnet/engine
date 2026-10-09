/**
 * Human review in the Procedural Engine: the decisions a moderator takes on a generated item.
 *
 * A moderator approves, rejects, regenerates or edits a candidate. An edit is a save in the Object
 * Layer Studio: it stores a new draft definition, so the candidate gets a new revision under a new
 * cid and the revision it replaced stays stored. Approval names the exact revision it covers and
 * needs a technically valid one; a later revision returns the candidate to review. Promotion
 * ({@link module:src/projects/cyberia/procedural/jobs/promotion.js}) makes the approved revision the
 * active definition of the target item. Every decision is an audit record.
 *
 * @module src/projects/cyberia/procedural/jobs/review.js
 * @namespace CyberiaProceduralReview
 */
import {
  EMPTY_REVIEW,
  ITEM_REVIEWABLE,
} from '../../../../api/cyberia-procedural-job-item/cyberia-procedural-job-item.model.js';
import { fromWire } from '../../../../client/components/objectlayer-studio/RenderSource.js';
import { regenerationSeed } from '../core/seed.js';
import { ObjectLayerEngine } from '../../object-layer/object-layer.js';
import { recordAudit, requestError, syncJob } from '../engine.js';
import { validateRevision } from './worker.js';

/** Statuses in which a revision may be added or a decision taken back. */
const EDITABLE = Object.freeze([...ITEM_REVIEWABLE, 'approved']);

/**
 * One item of a job.
 * @param {Object} models
 * @param {string} jobId
 * @param {string} id - The item's document id.
 * @returns {Promise<Object>} A lean item.
 * @throws {Error} 404 when the job has no such item.
 * @memberof CyberiaProceduralReview
 */
export async function findItem({ CyberiaProceduralJobItem }, jobId, id) {
  const item =
    /^[0-9a-f]{24}$/i.test(String(id)) && (await CyberiaProceduralJobItem.findOne({ _id: id, jobId }).lean());
  if (!item) throw requestError('Job item not found', 404);
  return item;
}

/** The 409 of an item that is not in a status a decision needs. */
export const conflict = async ({ CyberiaProceduralJobItem }, item, allowed) => {
  const { status } = await CyberiaProceduralJobItem.findById(item._id, { status: 1 }).lean();
  return requestError(`The item is ${status}; this needs ${allowed.join(', ')}`, 409);
};

/** The audit record of a decision on an item; `extra` overrides what changed. */
export const auditOf = (item, action, actor, extra = {}) => ({
  action,
  actor,
  jobId: item.jobId,
  jobItemId: item._id,
  previousRevision: item.revision,
  newRevision: item.revision,
  previousCid: item.candidateCid,
  newCid: item.candidateCid,
  ...extra,
});

/**
 * What the Object Layer Studio needs to edit a candidate in a review.
 * @param {Object} job
 * @param {Object} item
 * @returns {{generationRunId:string,jobId:string,jobItemId:string,targetItemId:string,candidateCid:string,candidateRevision:number}}
 * @memberof CyberiaProceduralReview
 */
const reviewContextOf = (job, item) => ({
  generationRunId: job.generationRunId,
  jobId: String(job._id),
  jobItemId: String(item._id),
  targetItemId: item.targetItemId,
  candidateCid: item.candidateCid,
  candidateRevision: item.revision,
});

/**
 * Opens an item for a visual edit: its status becomes `editing`. An approval stays until an edit
 * stores a new revision.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.jobId
 * @param {string} params.id - The item's document id.
 * @param {string} params.actor
 * @returns {Promise<Object>} The review context.
 * @throws {Error} 404 for an unknown item; 409 when the item is not under review.
 * @memberof CyberiaProceduralReview
 */
export async function openForEdit({ models, jobId, id, actor }) {
  const item = await findItem(models, jobId, id);
  const opened = await models.CyberiaProceduralJobItem.advance({
    id: item._id,
    from: EDITABLE,
    to: 'editing',
    where: { candidateCid: item.candidateCid },
  });
  if (!opened) throw await conflict(models, item, EDITABLE);
  await recordAudit(models, auditOf(item, 'item.opened_for_edit', actor));
  return reviewContextOf(await models.CyberiaProceduralJob.findById(jobId).lean(), opened);
}

/**
 * Adds the revision a save stored: the item takes the new cid, is validated again and returns to
 * review, and an earlier approval no longer covers it. A save of the revision the item already has
 * adds nothing.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id - The item's document id.
 * @param {string} params.cid - The stored revision.
 * @param {string} params.actor
 * @param {Date} [params.now]
 * @returns {Promise<Object>} The item.
 * @throws {Error} 404 for an unknown item; 409 when the item is not under review or changed meanwhile.
 * @memberof CyberiaProceduralReview
 */
async function recordRevision({ models, id, cid, actor, now = new Date() }) {
  const { CyberiaProceduralJob: Job, CyberiaProceduralJobItem: Item } = models;
  const item = await Item.findById(id).lean();
  if (!item) throw requestError('Job item not found', 404);
  if (!EDITABLE.includes(item.status)) throw await conflict(models, item, EDITABLE);
  if (item.candidateCid === cid) {
    return (
      (await Item.advance({ id, from: ['editing'], to: 'review', where: { candidateCid: cid } })) ??
      (await Item.findById(id).lean())
    );
  }
  const { spec } = await Job.findById(item.jobId, { spec: 1 }).lean();
  const validation = await validateRevision({ models, cid, item, spec, now });
  const revision = item.revisions.length;
  const updated = await Item.advance({
    id,
    from: EDITABLE,
    to: 'review',
    where: { candidateCid: item.candidateCid },
    set: { candidateCid: cid, revision, validation, review: EMPTY_REVIEW },
    push: { revisions: { revision, cid, kind: 'edited', parentCid: item.candidateCid, actor, at: now } },
  });
  if (!updated) throw await conflict(models, item, EDITABLE);
  await recordAudit(
    models,
    auditOf(item, 'item.revision_created', actor, {
      newRevision: revision,
      newCid: cid,
      reason: item.review.decision === 'approved' ? 'the approval of the previous revision no longer applies' : '',
    }),
  );
  return updated;
}

/**
 * Stores the save of an item in review as a new draft definition, then records it as a revision.
 * The one write of Object Layer content stays {@link ObjectLayerEngine.persistObjectLayerDocuments}.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id - The item's document id.
 * @param {{data:Object,objectLayerRenderFramesData:Object}} params.body - What the Studio sends.
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} The stored definition.
 * @throws {Error} 400 when the save changes the item id or has no render; 404/409 as {@link recordRevision}.
 * @memberof CyberiaProceduralReview
 */
export async function saveRevision({ models, id, body, actor, options }) {
  const item = await models.CyberiaProceduralJobItem.findById(id).lean();
  if (!item) throw requestError('Job item not found', 404);
  if (!EDITABLE.includes(item.status)) throw await conflict(models, item, EDITABLE);
  if (body.data?.item?.id !== item.targetItemId)
    throw requestError(`A revision of this candidate keeps the item id ${item.targetItemId}`);
  if (!body.objectLayerRenderFramesData) throw requestError('A revision needs its render frames');
  const definition = await ObjectLayerEngine.persistObjectLayerDocuments({
    models,
    objectLayerRenderFramesData: fromWire(body.objectLayerRenderFramesData),
    objectLayerData: { data: body.data, createdBy: actor },
    persistOptions: { options, draft: true },
  });
  await recordRevision({ models, id, cid: definition.cid, actor });
  return definition;
}

/**
 * Approves the current revision of an item. The caller names the revision it saw, so an approval
 * never lands on a revision stored meanwhile; the revision must be technically valid.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.jobId
 * @param {string} params.id - The item's document id.
 * @param {string} params.cid - The revision approved.
 * @param {string} params.actor
 * @param {string} [params.reason]
 * @param {Date} [params.now]
 * @returns {Promise<Object>} The item.
 * @throws {Error} 400 without a cid; 409 for another current revision, an invalid one, a wrong status or
 *   another approved candidate of the same target item.
 * @memberof CyberiaProceduralReview
 */
export async function approveItem({ models, jobId, id, cid, actor, reason = '', now = new Date() }) {
  if (!cid) throw requestError('An approval names the cid of the revision it covers');
  const item = await findItem(models, jobId, id);
  if (item.candidateCid !== cid)
    throw requestError(`The current revision is ${item.revision} (${item.candidateCid}), not ${cid}`, 409);
  if (!item.validation.ok) throw requestError(`Revision ${item.revision} is not technically valid`, 409);
  const rival = await models.CyberiaProceduralJobItem.exists({
    jobId,
    targetItemId: item.targetItemId,
    _id: { $ne: item._id },
    status: { $in: ['approved', 'promoted'] },
  });
  if (rival) throw requestError(`Another candidate of ${item.targetItemId} is already approved`, 409);
  const approved = await models.CyberiaProceduralJobItem.advance({
    id: item._id,
    from: ITEM_REVIEWABLE,
    to: 'approved',
    where: { candidateCid: cid, 'validation.ok': true },
    set: { review: { decision: 'approved', reviewer: actor, decidedAt: now, revision: item.revision, cid, reason } },
  });
  if (!approved) throw await conflict(models, item, ITEM_REVIEWABLE);
  await recordAudit(models, auditOf(item, 'item.approved', actor, { reason }));
  return approved;
}

/**
 * Rejects the current revision of an item. A rejected item can be regenerated.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.jobId
 * @param {string} params.id - The item's document id.
 * @param {string} params.actor
 * @param {string} [params.reason]
 * @param {Date} [params.now]
 * @returns {Promise<Object>} The item.
 * @throws {Error} 409 when the item is not under review or approved.
 * @memberof CyberiaProceduralReview
 */
export async function rejectItem({ models, jobId, id, actor, reason = '', now = new Date() }) {
  const item = await findItem(models, jobId, id);
  const rejected = await models.CyberiaProceduralJobItem.advance({
    id: item._id,
    from: EDITABLE,
    to: 'rejected',
    where: { candidateCid: item.candidateCid },
    set: {
      review: {
        decision: 'rejected',
        reviewer: actor,
        decidedAt: now,
        revision: item.revision,
        cid: item.candidateCid,
        reason,
      },
    },
  });
  if (!rejected) throw await conflict(models, item, EDITABLE);
  await recordAudit(models, auditOf(item, 'item.rejected', actor, { reason }));
  await syncJob({ models, jobId: item.jobId, now });
  return rejected;
}

/**
 * Queues an item for a new generation under a new seed. The revisions it holds stay stored; the
 * item records the generation it replaces.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.jobId
 * @param {string} params.id - The item's document id.
 * @param {string} params.actor
 * @param {string} [params.reason]
 * @param {Date} [params.now]
 * @returns {Promise<Object>} The queued item.
 * @throws {Error} 409 when the job was cancelled or the item is neither under review, rejected nor failed.
 * @memberof CyberiaProceduralReview
 */
export async function regenerateItem({ models, jobId, id, actor, reason = '', now = new Date() }) {
  const job = await models.CyberiaProceduralJob.findById(jobId, { status: 1 }).lean();
  if (job?.status === 'cancelled') throw requestError('The job was cancelled, so it generates no more', 409);
  const item = await findItem(models, jobId, id);
  const from = [...ITEM_REVIEWABLE, 'rejected', 'failed'];
  const queued = await models.CyberiaProceduralJobItem.advance({
    id: item._id,
    from,
    to: 'queued',
    where: { candidateCid: item.candidateCid },
    set: {
      seed: regenerationSeed(item.seed),
      attempt: 0,
      predecessor: { cid: item.candidateCid, seed: item.seed, revision: item.revision },
      error: { message: '', at: null },
      validation: { ok: false, checkedAt: null, problems: [] },
      diversity: { score: null, nearest: '', metrics: {} },
      signature: null,
      review: EMPTY_REVIEW,
      finishedAt: null,
    },
  });
  if (!queued) throw await conflict(models, item, from);
  await recordAudit(models, auditOf(item, 'item.regenerated', actor, { newRevision: item.revisions.length, reason }));
  await syncJob({ models, jobId: item.jobId, now });
  return queued;
}

/**
 * What decides the provenance of an item: the run that made it, every revision and the audit trail.
 * @param {Object} models
 * @param {string} jobId
 * @param {string} id - The item's document id.
 * @returns {Promise<{job:Object,item:Object,audit:Object[]}>}
 * @memberof CyberiaProceduralReview
 */
export async function itemProvenance(models, jobId, id) {
  const item = await findItem(models, jobId, id);
  const job = await models.CyberiaProceduralJob.findById(jobId, {
    generationRunId: 1,
    generatorId: 1,
    proceduralProfileId: 1,
    rootSeed: 1,
    spec: 1,
  }).lean();
  const audit = await models.CyberiaProceduralAudit.find({ jobItemId: item._id }).sort({ createdAt: 1 }).lean();
  return { job, item, audit };
}
