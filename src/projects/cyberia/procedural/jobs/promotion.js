/**
 * Promotion in the Procedural Engine: an approved candidate becomes the active definition of its
 * target item. Generation, review and edits never bind; promotion is the explicit bind.
 *
 * The candidate is published first: a definition is immutable, so a publication that a later step
 * refuses leaves nothing to undo. Then one transaction binds the item in the catalog, moves the
 * candidate to `promoted` and records the audit entry. An update binds only while the item still
 * runs the definition the run read, a create only while the proposed item id is still free, so a
 * concurrent promotion or bind answers 409 and changes nothing.
 *
 * @module src/projects/cyberia/procedural/jobs/promotion.js
 * @namespace CyberiaProceduralPromotion
 */
import { bindItem } from '../../catalog/object-layer-catalog.js';
import { ObjectLayerEngine } from '../../object-layer/object-layer.js';
import { recordAudit, requestError, syncJob } from '../engine.js';
import { auditOf, conflict, findItem } from './review.js';

/** The published definition of the approved revision of a candidate. */
async function publishCandidate({ models, item, options }) {
  const draft = await models.ObjectLayer.findByCid(item.candidateCid);
  const published = draft && (await ObjectLayerEngine.rebuildItemRender({ models, objectLayer: draft, options }));
  if (!published) throw requestError(`Revision ${item.candidateCid} has no stored render frames`, 409);
  return published.definition;
}

/**
 * Promotes one approved candidate.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.jobId
 * @param {string} params.id - The item's document id.
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @param {Date} [params.now]
 * @returns {Promise<Object>} The promoted item.
 * @throws {Error} 404 for an unknown item; 409 when the approval does not cover the current revision, the
 *   target item runs another definition than the run read, or the proposed item id is taken.
 * @memberof CyberiaProceduralPromotion
 */
export async function promoteItem({ models, jobId, id, actor, options, now = new Date() }) {
  const item = await findItem(models, jobId, id);
  if (item.status !== 'approved') throw await conflict(models, item, ['approved']);
  if (item.review.decision !== 'approved' || item.review.cid !== item.candidateCid)
    throw requestError('The approval does not cover the current revision', 409);
  const { spec } = await models.CyberiaProceduralJob.findById(jobId, { spec: 1 }).lean();
  const definition = await publishCandidate({ models, item, options });
  const action = spec.mode === 'update-existing' ? 'item.promoted' : 'item.created';

  const session = await models.CyberiaProceduralJobItem.db.startSession();
  let done;
  try {
    await session.withTransaction(async () => {
      await bindItem({
        models,
        itemId: item.targetItemId,
        objectLayerCid: definition.cid,
        expectedCid: item.sourceCid || null,
        source: 'procedural',
        by: actor,
        session,
        options,
      });
      done = await models.CyberiaProceduralJobItem.advance({
        id: item._id,
        from: ['approved'],
        to: 'promoted',
        where: { candidateCid: item.candidateCid },
        set: { promotion: { cid: definition.cid, previousCid: item.sourceCid, at: now, by: actor } },
        session,
      });
      if (!done) throw await conflict(models, item, ['approved']);
      await recordAudit(
        models,
        auditOf(item, action, actor, { previousCid: item.sourceCid || item.candidateCid, newCid: definition.cid }),
        session,
      );
    });
  } finally {
    await session.endSession();
  }
  await syncJob({ models, jobId, now });
  return done;
}

/**
 * Promotes every approved candidate of a job. A candidate that fails stays approved and is
 * reported, so the call can run again.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.jobId
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @param {Date} [params.now]
 * @returns {Promise<{promoted:string[],failed:Array<{targetItemId:string,message:string}>}>}
 * @throws {Error} 404 for an unknown job.
 * @memberof CyberiaProceduralPromotion
 */
export async function promoteJob({ models, jobId, actor, options, now = new Date() }) {
  if (!(await models.CyberiaProceduralJob.exists({ _id: jobId }))) throw requestError('Job not found', 404);
  const result = { promoted: [], failed: [] };
  for (const item of await models.CyberiaProceduralJobItem.find({ jobId, status: 'approved' })
    .sort({ ordinal: 1 })
    .lean()) {
    try {
      await promoteItem({ models, jobId, id: item._id, actor, options, now });
      result.promoted.push(item.targetItemId);
    } catch (error) {
      result.failed.push({ targetItemId: item.targetItemId, message: error.message });
    }
  }
  return result;
}
