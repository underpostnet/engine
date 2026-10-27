/**
 * The Procedural Engine of the Cyberia Studio: the models and the lifecycle of a job.
 *
 * A job is one generation run. Its spec is stored whole and never changes
 * ({@link module:src/projects/cyberia/procedural/spec.js}), so equal specs name one job and a retry
 * rebuilds the same candidates. This module counts, cancels and deletes jobs; the worker runs
 * their items ({@link module:src/projects/cyberia/procedural/jobs/worker.js}) and the review
 * flow decides them ({@link module:src/projects/cyberia/procedural/jobs/review.js}). It holds no
 * generation algorithm: see {@link module:src/projects/cyberia/procedural/generator-registry.js}.
 *
 * @module src/projects/cyberia/procedural/engine.js
 * @namespace CyberiaProceduralEngine
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { purgeObjectLayers } from '../../../api/object-layer/object-layer.purge.js';
import { isObjectLayerAuthority } from '../../../api/object-layer/object-layer.publication.js';
import { purgeObjectLayer, resolveRegisteredCids } from '../../../server/domain/object-layer-resolver.js';
import { ITEM_STATUS } from '../../../api/cyberia-procedural-job-item/cyberia-procedural-job-item.model.js';
import { SYSTEM_ACTOR } from '../../../api/cyberia-procedural-audit/cyberia-procedural-audit.model.js';

/** The item statuses a cancel stops: an item that waits, runs or awaits a decision. */
const ACTIVE_ITEM_STATUS = Object.freeze(['queued', 'running', 'generated', 'review', 'editing']);

/** The APIs a host mounts to run the Procedural Engine, besides the item definition APIs. */
export const PROCEDURAL_APIS = Object.freeze([
  'cyberia-procedural-profile',
  'cyberia-procedural-job',
  'cyberia-procedural-job-item',
  'cyberia-procedural-audit',
  'cyberia-procedural-population',
]);

/**
 * The models of the engine in a deployment context.
 * @param {{host:string,path:string}} options - Router options.
 * @returns {Object<string,import('mongoose').Model>}
 * @memberof CyberiaProceduralEngine
 */
export const proceduralModels = (options) =>
  Object.fromEntries(
    [
      'ObjectLayer',
      'ObjectLayerRenderFrames',
      'CyberiaItemCatalog',
      'CyberiaProceduralProfile',
      'CyberiaProceduralJob',
      'CyberiaProceduralJobItem',
      'CyberiaProceduralAudit',
      'CyberiaProceduralPopulation',
    ].map((name) => [name, DataBaseProviderService.getModel(name, options)]),
  );

/** An error a request answers with `status`: a domain outcome, so it logs without a stack. */
export const requestError = (message, status = 400) => Object.assign(new Error(message), { status, expected: true });

/** A conflict a retry meets again: the content needs a repair first. */
export const integrityError = (message) => Object.assign(requestError(message, 409), { integrity: true });

/**
 * Appends a record to the audit trail.
 * @param {Object} models
 * @param {Object} entry - `action` and `jobId` at least; see the audit model.
 * @param {import('mongoose').ClientSession} [session] - The transaction the record joins.
 * @returns {Promise<Object>}
 * @memberof CyberiaProceduralEngine
 */
export const recordAudit = (models, entry, session) =>
  models.CyberiaProceduralAudit.record({ actor: SYSTEM_ACTOR, ...entry }, session);

/**
 * Counts the items of a job by status and moves the job with them: running once an item runs,
 * completed when none waits or runs, running again when a regeneration queues an item. Each move
 * is one conditional update, so concurrent callers record each audit event once.
 * @param {Object} params
 * @param {Object} params.models
 * @param {import('mongoose').Types.ObjectId} params.jobId
 * @param {Date} [params.now]
 * @returns {Promise<Object<string,number>>} The counts.
 * @memberof CyberiaProceduralEngine
 */
export async function syncJob({ models, jobId, now = new Date() }) {
  const { CyberiaProceduralJob: Job, CyberiaProceduralJobItem: Item } = models;
  const counts = Object.fromEntries(ITEM_STATUS.map((status) => [status, 0]));
  for (const { _id, count } of await Item.aggregate([
    { $match: { jobId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]))
    counts[_id] = count;
  await Job.updateOne({ _id: jobId }, { $set: { counts } });

  if (counts.queued + counts.running > 0) {
    if (counts.running > 0) {
      const started = await Job.updateOne(
        { _id: jobId, startedAt: null, status: { $ne: 'cancelled' } },
        { $set: { startedAt: now, status: 'running' } },
      );
      if (started.modifiedCount) await recordAudit(models, { action: 'job.started', jobId });
    }
    await Job.updateOne({ _id: jobId, status: 'completed' }, { $set: { status: 'running', finishedAt: null } });
  } else {
    const done = await Job.updateOne(
      { _id: jobId, status: { $in: ['queued', 'running'] } },
      { $set: { status: 'completed', finishedAt: now } },
    );
    if (done.modifiedCount) await recordAudit(models, { action: 'job.completed', jobId });
  }
  return counts;
}

/**
 * Cancels the workflow of a job: its waiting and running items, and the candidates still under
 * review or in edit, become cancelled and take no more decisions. Nothing is deleted: the stored
 * candidates, their revisions and the approved items stay.
 * @param {Object} params
 * @param {Object} params.models
 * @param {import('mongoose').Types.ObjectId|string} params.jobId
 * @param {string} params.actor
 * @param {string} [params.reason]
 * @param {Date} [params.now]
 * @returns {Promise<Object>} The job.
 * @throws {Error} 404 for an unknown job; 409 when the job has no active work.
 * @memberof CyberiaProceduralEngine
 */
export async function cancelJob({ models, jobId, actor, reason = '', now = new Date() }) {
  const { CyberiaProceduralJob: Job, CyberiaProceduralJobItem: Item } = models;
  const current = await Job.findById(jobId, { status: 1 }).lean();
  if (!current) throw requestError('Job not found', 404);
  if (current.status === 'cancelled' || !(await Item.exists({ jobId, status: { $in: ACTIVE_ITEM_STATUS } })))
    throw requestError(`Job is ${current.status}: it has no active work to cancel`, 409);
  await stopWork(models, jobId, now);
  await recordAudit(models, { action: 'job.cancelled', actor, jobId, reason });
  await syncJob({ models, jobId, now });
  return await Job.findById(jobId).lean();
}

/**
 * Stops the work of a job: the job becomes cancelled, and so do its waiting, running and undecided
 * items. A worker then generates nothing more for it.
 * @returns {Promise<number>} Items stopped.
 */
async function stopWork({ CyberiaProceduralJob: Job, CyberiaProceduralJobItem: Item }, jobId, now) {
  await Job.updateOne({ _id: jobId }, { $set: { status: 'cancelled', finishedAt: now } });
  const { modifiedCount } = await Item.updateMany(
    { jobId, status: { $in: ACTIVE_ITEM_STATUS } },
    { $set: { status: 'cancelled', finishedAt: now, 'lease.holder': '', 'lease.expiresAt': null } },
  );
  return modifiedCount;
}

/**
 * What keeps each revision among `cids`: the catalog binds or bound it, a candidate of a job other
 * than `besides` names it, or a map population uses it or a publication plan names it.
 * @param {Object} models
 * @param {string[]} cids
 * @param {import('mongoose').Types.ObjectId|string} [besides] - A job whose candidates do not count.
 * @returns {Promise<Map<string,string>>} Revision → what keeps it.
 * @memberof CyberiaProceduralEngine
 */
export async function revisionKeepers(models, cids, besides) {
  const {
    CyberiaProceduralJobItem: Item,
    CyberiaItemCatalog: Catalog,
    CyberiaProceduralPopulation: Population,
  } = models;
  const named = (field) => ({ [field]: { $in: cids } });
  const found = await Promise.all([
    Catalog.distinct('objectLayerCid', named('objectLayerCid')),
    Catalog.distinct('history.objectLayerCid', named('history.objectLayerCid')),
    Item.distinct('revisions.cid', { ...named('revisions.cid'), ...(besides && { jobId: { $ne: besides } }) }),
    Population.distinct('targets.definitionCid', named('targets.definitionCid')),
    Population.distinct('removed.target.definitionCid', named('removed.target.definitionCid')),
    Population.distinct('publication.plan.assets.revisionCid', named('publication.plan.assets.revisionCid')),
  ]);
  const reasons = [
    'the catalog binds it',
    'the catalog bound it',
    'a generated entry names it',
    'a map population uses it',
    'a removed item of a map population uses it',
    'a publication plan names it',
  ];
  const keepers = new Map();
  found.forEach((values, at) => {
    for (const cid of values) if (cids.includes(cid) && !keepers.has(cid)) keepers.set(cid, reasons[at]);
  });
  return keepers;
}

/**
 * Removes the revisions among `cids` no record keeps ({@link revisionKeepers}). Each goes with every
 * record stored under it: here, and at the Object Layer authority when this host published it. A
 * revision ItemLedger registers stays.
 * @param {Object} params
 * @param {Object} params.models
 * @param {Object} params.options - Router options.
 * @param {string[]} params.cids - Revisions to check.
 * @param {import('mongoose').Types.ObjectId|string} [params.besides] - A job whose candidates do not count.
 * @returns {Promise<string[]>} The revisions removed here.
 * @throws {Error} When the authority refuses or does not answer: nothing here is removed yet.
 * @memberof CyberiaProceduralEngine
 */
export async function purgeRevisions({ models, options, cids, besides }) {
  if (cids.length === 0) return [];
  const { ObjectLayer } = models;
  const kept = await revisionKeepers(models, cids, besides);
  const leftover = await ObjectLayer.distinct('cid', { cid: { $in: cids.filter((cid) => !kept.has(cid)) } });
  if (leftover.length === 0) return [];
  if (!isObjectLayerAuthority(options)) {
    const published = await ObjectLayer.distinct('cid', { cid: { $in: leftover }, origin: 'cache' });
    const registered = await resolveRegisteredCids(published, options);
    for (const cid of published.filter((cid) => !registered.has(cid))) await purgeObjectLayer(cid);
  }
  const { kept: registered } = await purgeObjectLayers({ options, filter: { cid: { $in: leftover } } });
  return leftover.filter((cid) => !registered.some((entry) => entry.cid === cid));
}

/**
 * Deletes a job in any status and everything it left: it stops the work of the job first, then
 * removes its candidates, every revision no item runs or ran (here and at the Object Layer
 * authority) with its render frames and atlas, and its audit trail. A promoted item keeps its
 * definition. Safe to run again after a failure: the job goes last.
 * @param {Object} params
 * @param {Object} params.models
 * @param {import('mongoose').Types.ObjectId|string} params.jobId
 * @param {Object} params.options - Router options.
 * @param {Date} [params.now]
 * @returns {Promise<{stopped:number,candidates:number,drafts:string[],audit:number}>} What was stopped and removed.
 * @throws {Error} 404 for an unknown job.
 * @memberof CyberiaProceduralEngine
 */
export async function deleteJob({ models, jobId, options, now = new Date() }) {
  const { CyberiaProceduralJob: Job, CyberiaProceduralJobItem: Item, CyberiaProceduralAudit: Audit } = models;
  const job = await Job.findById(jobId, { _id: 1 }).lean();
  if (!job) throw requestError('Job not found', 404);
  const removed = { stopped: await stopWork(models, job._id, now) };
  const cids = await Item.distinct('revisions.cid', { jobId: job._id });
  removed.drafts = await purgeRevisions({ models, options, cids, besides: job._id });
  removed.candidates = (await Item.deleteMany({ jobId: job._id })).deletedCount;
  removed.audit = (await Audit.deleteMany({ jobId: job._id })).deletedCount;
  await Job.deleteOne({ _id: job._id });
  return removed;
}
