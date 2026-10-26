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
import { runsAnother } from '../../../../api/cyberia-item-catalog/cyberia-item-catalog.model.js';
import { bindItem } from '../../catalog/object-layer-catalog.js';
import { ObjectLayerEngine } from '../../object-layer/object-layer.js';
import { integrityError, recordAudit, requestError, syncJob } from '../engine.js';
import { auditOf, conflict, findItem } from './review.js';

/**
 * Publishes one approved revision exactly as stored, through the one Object Layer publication path:
 * its content alone, never composed over the definition its item runs. The authority then holds a
 * definition with the cid of the revision. Safe to run again: a definition is immutable.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.revisionCid - The revision a moderator approved, selected or authored.
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} The published definition.
 * @throws {Error} 409 with `integrity` when the revision or its render frames are not stored, or the
 *   authority answers another definition.
 * @memberof CyberiaProceduralPromotion
 */
export async function publishRevision({ models, revisionCid, options }) {
  const revision = await models.ObjectLayer.findByCid(revisionCid);
  if (!revision) throw integrityError(`Revision ${revisionCid} is not stored`);
  const published = await ObjectLayerEngine.rebuildItemRender({ models, objectLayer: revision, exact: true, options });
  if (!published) throw integrityError(`Revision ${revisionCid} has no stored render frames`);
  if (published.definition.cid !== revisionCid)
    throw integrityError(
      `The authority answers definition ${published.definition.cid} for revision ${revisionCid}: the published content differs from the approved revision`,
    );
  return published.definition;
}

/**
 * Binds the target item of an approved candidate to its published definition, moves the candidate to
 * `promoted` and records the audit entry, in the transaction of `session`. An update binds only while
 * the item still runs the definition its run read, a create only while the id is free.
 * @param {Object} params
 * @param {Object} params.models
 * @param {Object} params.item - An approved candidate.
 * @param {Object} params.definition - {@link publishRevision}.
 * @param {string} params.actor
 * @param {string} params.action - `item.promoted` for an update, `item.created` for a create.
 * @param {import('mongoose').ClientSession} params.session
 * @param {Object} params.options - Router options.
 * @param {Date} params.now
 * @returns {Promise<Object>} The promoted candidate.
 * @throws {Error} 409 when the binding or the candidate moved meanwhile.
 * @memberof CyberiaProceduralPromotion
 */
export async function commitPromotion({ models, item, definition, actor, action, session, options, now }) {
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
  const done = await models.CyberiaProceduralJobItem.advance({
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
  return done;
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
  const runs = (await models.CyberiaItemCatalog.resolve([item.targetItemId])).get(item.targetItemId) ?? '';
  if (runs !== (item.sourceCid ?? '')) throw requestError(runsAnother(item.targetItemId, runs, item.sourceCid), 409);
  const definition = await publishRevision({ models, revisionCid: item.candidateCid, options });
  const action = spec.mode === 'update-existing' ? 'item.promoted' : 'item.created';

  const session = await models.CyberiaProceduralJobItem.db.startSession();
  let done;
  try {
    await session.withTransaction(async () => {
      done = await commitPromotion({ models, item, definition, actor, action, session, options, now });
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
