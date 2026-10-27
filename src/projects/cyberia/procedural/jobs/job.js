/**
 * Job creation in the Procedural Engine. A job holds the spec of {@link module:src/projects/cyberia/procedural/spec.js}
 * and one item for each candidate the spec lists. The items are stored whole, so a request that
 * failed halfway completes when it is sent again.
 *
 * @module src/projects/cyberia/procedural/jobs/job.js
 * @namespace CyberiaProceduralJob
 */
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { itemSeed } from '../core/seed.js';
import { recordAudit, requestError, syncJob } from '../engine.js';
import { resolveSpec } from '../spec.js';

/** Where a source came from: the procedural revision it is, if it is one. */
async function lineageOf({ CyberiaProceduralJobItem }, sourceCid, generationRunId) {
  const parent = sourceCid
    ? await CyberiaProceduralJobItem.findOne({ 'revisions.cid': sourceCid }, { targetItemId: 1, revisions: 1 }).lean()
    : null;
  return {
    parentCid: sourceCid,
    parentItemId: parent?.targetItemId ?? '',
    parentRevision: parent?.revisions.find(({ cid }) => cid === sourceCid).revision ?? null,
    generationRunId,
  };
}

/**
 * Refuses a proposed item id some definition or live candidate already holds. The runs of one map
 * population share the new item ids of its targets.
 */
async function assertIdsFree(
  { CyberiaItemCatalog, CyberiaProceduralJob, CyberiaProceduralJobItem },
  itemIds,
  populationId,
) {
  const bound = await CyberiaItemCatalog.findOne({ itemId: { $in: itemIds } }, { itemId: 1 }).lean();
  if (bound) throw requestError(`Item ${bound.itemId} already runs a definition`, 409);
  const shared = populationId ? await CyberiaProceduralJob.distinct('_id', { populationId }) : [];
  const live = await CyberiaProceduralJobItem.findOne(
    {
      targetItemId: { $in: itemIds },
      status: { $nin: ['rejected', 'cancelled', 'failed'] },
      jobId: { $nin: shared },
    },
    { targetItemId: 1 },
  ).lean();
  if (live) throw requestError(`Item ${live.targetItemId} belongs to another generation`, 409);
}

/** Stores the items of a job that are not stored yet; safe to run again. */
async function ensureItems(models, job) {
  const { CyberiaProceduralJobItem } = models;
  const { spec } = job;
  const stored = new Set(
    (await CyberiaProceduralJobItem.find({ jobId: job._id }, { ordinal: 1 }).lean()).map(({ ordinal }) => ordinal),
  );
  const lineages = new Map();
  const missing = [];
  for (const { ordinal, targetItemId, sourceCid, templateId, paletteId } of spec.candidates) {
    if (stored.has(ordinal)) continue;
    if (!lineages.has(sourceCid)) lineages.set(sourceCid, await lineageOf(models, sourceCid, job.generationRunId));
    missing.push({
      jobId: job._id,
      ordinal,
      targetItemId,
      sourceCid,
      paletteId: paletteId ?? '',
      templateId,
      lineage: lineages.get(sourceCid),
      seed: itemSeed({
        rootSeed: job.rootSeed,
        sourceCid,
        itemId: targetItemId,
        ordinal,
        generationRunId: job.generationRunId,
        generatorId: spec.generator.id,
        profileId: spec.profile.profileId,
      }),
    });
  }
  if (missing.length === 0) return;
  try {
    await CyberiaProceduralJobItem.insertMany(missing, { ordered: false });
  } catch (error) {
    const failures = error.writeErrors ?? [error];
    if (!failures.every((failure) => (failure.code ?? failure.err?.code) === 11000)) throw error;
  }
}

/**
 * Stores the job of a resolved spec, or returns the one an equal spec stored.
 * @param {Object} params
 * @param {Object} params.models
 * @param {Object} params.spec - {@link resolveSpec}.
 * @param {string} params.actor - User id of the moderator.
 * @param {import('mongoose').Types.ObjectId|null} [params.populationId] - The map population whose item the job generates.
 * @param {string} [params.populationItemId] - That item.
 * @returns {Promise<Object>} The job.
 * @throws {Error} 409 when a proposed item id is taken.
 * @memberof CyberiaProceduralJob
 */
export async function storeJob({ models, spec, actor, populationId = null, populationItemId = '' }) {
  const { CyberiaProceduralJob } = models;
  const requestFingerprint = createHash('sha256').update(canonicalize(spec)).digest('hex');
  let job = await CyberiaProceduralJob.findOne({ requestFingerprint }).lean();
  if (!job) {
    if (spec.mode === 'create-new')
      await assertIdsFree(
        models,
        spec.candidates.map(({ targetItemId }) => targetItemId),
        populationId,
      );
    try {
      job = (
        await CyberiaProceduralJob.create({
          generatorId: spec.generator.id,
          proceduralProfileId: spec.profile.profileId,
          generationRunId: `run-${requestFingerprint.slice(0, 16)}`,
          requestFingerprint,
          rootSeed: spec.seed.value,
          spec,
          populationId,
          populationItemId,
          createdBy: actor,
        })
      ).toObject();
      await recordAudit(models, { action: 'job.created', actor, jobId: job._id });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      job = await CyberiaProceduralJob.findOne({ requestFingerprint }).lean();
    }
  }
  await ensureItems(models, job);
  await syncJob({ models, jobId: job._id });
  return await CyberiaProceduralJob.findById(job._id).lean();
}

/**
 * Creates the job of a request, or returns the one an equal spec created.
 * @param {Object} params
 * @param {Object} params.models
 * @param {Object} params.request - See {@link module:src/projects/cyberia/procedural/spec.js}.
 * @param {string} params.actor - User id of the moderator.
 * @returns {Promise<Object>} The job.
 * @throws {Error} 400 for an invalid request; 409 when a proposed item id is taken.
 * @memberof CyberiaProceduralJob
 */
export const createJob = async ({ models, request, actor }) =>
  await storeJob({ models, spec: (await resolveSpec(models, request)).spec, actor });
