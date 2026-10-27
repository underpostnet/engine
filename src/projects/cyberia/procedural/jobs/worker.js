/**
 * The background worker of the Procedural Engine: it claims queued candidates, runs their generator,
 * stores each result as a draft Object Layer and validates it. It also runs the publications of map
 * populations, phase by phase, under the same kind of lease.
 *
 * Every candidate is a task of its own. A claim is one atomic update that leases the candidate to a
 * worker for a time; a worker that dies loses it when the lease expires, and it runs again up to
 * {@link MAX_ATTEMPTS} times. The candidates of one job run in order: a candidate waits while the one
 * before it waits or runs, so each differs from the siblings accepted before it. The generator input
 * is the candidate seed, the stored spec and those siblings; the seed a revision records rebuilds its
 * content alone. The analysis of a target item is the same for a whole job, so the worker keeps it
 * for the last few items.
 *
 * @module src/projects/cyberia/procedural/jobs/worker.js
 * @namespace CyberiaProceduralWorker
 */
import { randomUUID } from 'node:crypto';
import { loggerFactory } from '../../../../server/ops/logger.js';
import { objectLayerIdentity } from '../../../../api/object-layer/object-layer.identity.js';
import { SYSTEM_ACTOR } from '../../../../api/cyberia-procedural-audit/cyberia-procedural-audit.model.js';
import { EMPTY_REVIEW } from '../../../../api/cyberia-procedural-job-item/cyberia-procedural-job-item.model.js';
import { CyberiaObjectLayerProfile } from '../../../../client/components/cyberia/ObjectLayerProfileCyberia.js';
import { ObjectLayerEngine } from '../../object-layer/object-layer.js';
import { resolveProceduralContext } from '../context.js';
import { proceduralModels, purgeRevisions, recordAudit, syncJob } from '../engine.js';
import { GENERATORS } from '../generator-registry.js';
import { candidatePalette } from '../palettes/resolver.js';
import { populationModels } from '../population/map-context.js';
import { drainPublications } from '../population/publication.js';
import { ensureDefaultProfiles } from '../profiles/registry.js';
import { baselineSource, loadSource } from '../source.js';
import { specChoice, specPalette, specTemplate } from '../spec.js';
import { compatibilityProblems } from '../templates.js';

const logger = loggerFactory(import.meta);

/** The runs one item gets for one generation. */
export const MAX_ATTEMPTS = 3;
/** How long a claim holds an item before another worker may take it. */
const LEASE_MS = 5 * 60 * 1000;
/** How often the worker looks for work. */
const POLL_MS = 2000;
/** The waiting items a claim looks through for one it may take. */
const CLAIM_WINDOW = 50;
/** The target items whose source analysis the worker keeps. */
const BATCH_CACHE_SIZE = 4;

const messageOf = (error) => String(error?.message ?? error);

/**
 * Stores a generated variant as a draft definition with its render. The one write path of
 * Object Layer content: a draft is never bound to a label and never served.
 * @param {Object} params
 * @param {Object} params.models
 * @param {{data:Object,renderSource:Object}} params.result - A generator result.
 * @param {string} params.createdBy
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} The stored definition.
 * @memberof CyberiaProceduralWorker
 */
export const persistCandidate = async ({ models, result, createdBy, options }) =>
  await ObjectLayerEngine.persistObjectLayerDocuments({
    models,
    objectLayerRenderFramesData: result.renderSource,
    objectLayerData: { data: result.data, createdBy },
    persistOptions: { options, draft: true },
  });

/**
 * The technical validation of one revision: the checks that decide whether it is a sound Object
 * Layer of the template and the profile of its candidate. It says nothing of whether it is good; a
 * human decides that.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.cid - The revision.
 * @param {Object} params.item - The candidate: its target item id and its template.
 * @param {Object} params.spec - The spec of its job.
 * @param {Date} [params.now]
 * @returns {Promise<{ok:boolean,checkedAt:Date,problems:string[]}>}
 * @memberof CyberiaProceduralWorker
 */
export async function validateRevision({ models, cid, item, spec, now = new Date() }) {
  const { ObjectLayer, ObjectLayerRenderFrames } = models;
  const itemId = item.targetItemId;
  const template = specTemplate(spec, item.templateId);
  const problems = [];
  const definition = await ObjectLayer.findByCid(cid).lean();
  if (!definition) problems.push('the definition is not stored');
  else {
    if (objectLayerIdentity(definition).cid !== cid) problems.push('its content does not hash to its cid');
    if (definition.data.item.id !== itemId) problems.push(`its item id is ${definition.data.item.id}, not ${itemId}`);
    try {
      CyberiaObjectLayerProfile.validateStats(definition.data.stats);
    } catch (error) {
      problems.push(messageOf(error));
    }
    if (!definition.data.render?.cid) problems.push('it names no render');
    const frames = await ObjectLayerRenderFrames.findOne({ objectLayerCid: cid }).lean();
    if (!frames) problems.push('its render frames are not stored');
    else {
      const source = ObjectLayerRenderFrames.sourceOf(frames);
      problems.push(
        ...compatibilityProblems(template, source, definition.data.item.type),
        ...(GENERATORS[spec.generator.id]?.renderProblems?.(source) ?? []),
      );
    }
  }
  return { ok: problems.length === 0, checkedAt: now, problems };
}

/**
 * Leases the next item that waits or whose lease expired to a worker. An item that expired on its
 * last attempt fails instead.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.holder - The worker.
 * @param {Date} [params.now]
 * @param {number} [params.leaseMs]
 * @returns {Promise<Object|null>} The claimed item, or null when no item is eligible.
 * @memberof CyberiaProceduralWorker
 */
export async function claimNextItem({ models, holder, now = new Date(), leaseMs = LEASE_MS }) {
  const { CyberiaProceduralJobItem: Item } = models;
  const expired = { status: 'running', 'lease.expiresAt': { $lt: now } };
  const exhausted = await Item.find({ ...expired, attempt: { $gte: MAX_ATTEMPTS } }, { jobId: 1 }).lean();
  if (exhausted.length > 0) {
    await Item.updateMany(
      { _id: { $in: exhausted.map(({ _id }) => _id) }, ...expired },
      {
        $set: {
          status: 'failed',
          error: { message: 'The lease expired on the last attempt', retryable: true, at: now },
          'lease.holder': '',
          'lease.expiresAt': null,
          finishedAt: now,
        },
      },
    );
    for (const jobId of new Set(exhausted.map((item) => String(item.jobId)))) await syncJob({ models, jobId, now });
  }
  const eligible = { $or: [{ status: 'queued' }, expired] };
  const waiting = await Item.find(eligible, { jobId: 1, ordinal: 1 })
    .sort({ createdAt: 1, ordinal: 1 })
    .limit(CLAIM_WINDOW)
    .lean();
  for (const { _id, jobId, ordinal } of waiting) {
    const before = { jobId, ordinal: ordinal - 1, status: { $in: ['queued', 'running'] } };
    if (ordinal > 0 && (await Item.exists(before))) continue;
    const claimed = await Item.findOneAndUpdate(
      { _id, ...eligible },
      {
        $set: {
          status: 'running',
          'lease.holder': holder,
          'lease.expiresAt': new Date(now.getTime() + leaseMs),
          startedAt: now,
        },
        $inc: { attempt: 1 },
      },
      { returnDocument: 'after' },
    );
    if (claimed) return claimed;
  }
  return null;
}

/**
 * Validates a generated item and moves it to review, or to failed with the problems found.
 * @param {Object} params
 * @param {Object} params.models
 * @param {Object} params.item - An item in `generated`.
 * @param {Date} [params.now]
 * @returns {Promise<void>}
 * @memberof CyberiaProceduralWorker
 */
async function validateGenerated({ models, item, now = new Date() }) {
  const { CyberiaProceduralJob: Job, CyberiaProceduralJobItem: Item } = models;
  const where = { candidateCid: item.candidateCid };
  try {
    const { spec } = await Job.findById(item.jobId, { spec: 1 }).lean();
    const validation = await validateRevision({ models, cid: item.candidateCid, item, spec, now });
    if (validation.ok)
      await Item.advance({
        id: item._id,
        from: ['generated'],
        to: 'review',
        where,
        set: { validation, finishedAt: now },
      });
    else await failValidation({ models, item, validation, now });
  } catch (error) {
    await failValidation({
      models,
      item,
      validation: { ok: false, checkedAt: now, problems: [messageOf(error)] },
      now,
    });
  }
}

async function failValidation({ models, item, validation, now }) {
  const failed = await models.CyberiaProceduralJobItem.advance({
    id: item._id,
    from: ['generated'],
    to: 'failed',
    where: { candidateCid: item.candidateCid },
    set: {
      validation,
      error: { message: validation.problems.join('; '), retryable: false, at: now },
      finishedAt: now,
    },
  });
  if (failed)
    await recordAudit(models, {
      action: 'item.validation_failed',
      jobId: item.jobId,
      jobItemId: item._id,
      previousRevision: item.revision,
      newRevision: item.revision,
      previousCid: item.candidateCid,
      newCid: item.candidateCid,
      reason: validation.problems.join('; '),
    });
}

const batches = new Map();

/**
 * The source analysis of a candidate: the same for every candidate of one target item in a job, so it is
 * built once. It reads the spec, and the stored definition of an existing item; a spec never changes,
 * so the cache never goes stale.
 * @param {Object} models
 * @param {Object} job
 * @param {Object} item
 * @returns {Promise<{generator:Object,batch:Object}>}
 * @throws {RangeError} When this process does not run the generator of the job.
 */
async function batchOf(models, job, item) {
  const { spec } = job;
  const entry = spec.sources.find(({ itemId }) => itemId === item.targetItemId);
  const key = `${job._id}:${item.templateId}:${entry?.itemId ?? ''}`;
  if (!batches.has(key)) {
    const generator = GENERATORS[spec.generator.id];
    if (!generator) throw new RangeError(`Generator ${spec.generator.id} is not available`);
    const context = resolveProceduralContext({
      source: entry ? await loadSource(models, entry.cid) : baselineSource(spec.itemType, spec.baseline),
      template: specTemplate(spec, item.templateId),
      profile: spec.profile,
      artDirection: entry?.artDirection ?? null,
      origin: entry?.origin ?? 'template',
    });
    batches.set(key, { generator, batch: generator.prepare(context) });
    if (batches.size > BATCH_CACHE_SIZE) batches.delete(batches.keys().next().value);
  }
  return batches.get(key);
}

/**
 * Runs one claimed item: generates its variant, stores it, records the revision and validates it.
 * A run that fails queues the item again until {@link MAX_ATTEMPTS}, then fails it as retryable; a
 * generator that refuses the input with a RangeError fails it at once and for good, since a run
 * under the same seed gives the same answer. A result whose item was cancelled or deleted meanwhile
 * is purged, so it leaves no draft.
 * @param {Object} params
 * @param {Object} params.models
 * @param {Object} params.item - A claimed item.
 * @param {string} params.holder - The worker that claimed it.
 * @param {Object} [params.options] - Router options.
 * @param {typeof persistCandidate} [params.persist]
 * @param {Date} [params.now]
 * @returns {Promise<void>}
 * @memberof CyberiaProceduralWorker
 */
export async function runItem({ models, item, holder, options, persist = persistCandidate, now = new Date() }) {
  const { CyberiaProceduralJob: Job, CyberiaProceduralJobItem: Item } = models;
  const where = { 'lease.holder': holder };
  try {
    const job = await Job.findById(item.jobId).lean();
    if (!job || job.status === 'cancelled') {
      await Item.advance({ id: item._id, from: ['running'], to: 'cancelled', where, set: { finishedAt: now } });
      return;
    }
    const { spec } = job;
    const { generator, batch } = await batchOf(models, job, item);
    const siblings = (
      await Item.find(
        {
          jobId: item.jobId,
          _id: { $ne: item._id },
          signature: { $ne: null },
          status: { $nin: ['rejected', 'cancelled', 'failed'] },
          ...(spec.mode === 'update-existing' && { targetItemId: item.targetItemId }),
        },
        { targetItemId: 1, ordinal: 1, signature: 1 },
      ).lean()
    ).map(({ targetItemId, ordinal, signature }) => ({ id: `${targetItemId}#${ordinal}`, signature }));
    const result = generator.generate(batch, {
      itemId: item.targetItemId,
      seed: item.seed,
      parameters: spec.parameters,
      palette: candidatePalette(batch.context.template, {
        palette: specPalette(spec, item.paletteId),
        slots: specChoice(spec, item.targetItemId).slots,
        artDirection: batch.context.artDirection,
      }),
      siblings,
    });
    const definition = await persist({ models, result, createdBy: job.createdBy, options });
    const revision = item.revisions.length;
    const generated = await Item.advance({
      id: item._id,
      from: ['running'],
      to: 'generated',
      where,
      set: {
        generatedCid: definition.cid,
        candidateCid: definition.cid,
        revision,
        metrics: result.metrics,
        diversity: {
          score: result.diversity.score,
          nearest: result.diversity.nearest,
          metrics: result.diversity.metrics,
        },
        signature: result.diversity.signature,
        error: { message: '', retryable: false, at: null },
        validation: { ok: false, checkedAt: null, problems: [] },
        review: EMPTY_REVIEW,
        'lease.holder': '',
        'lease.expiresAt': null,
      },
      push: {
        revisions: {
          revision,
          cid: definition.cid,
          kind: revision === 0 ? 'generated' : 'regenerated',
          seed: result.seed,
          parentCid: item.sourceCid,
          actor: SYSTEM_ACTOR,
          at: now,
        },
      },
    });
    if (!generated) {
      const current = await Item.findById(item._id, { status: 1 }).lean();
      if (!current || current.status === 'cancelled') await purgeRevisions({ models, options, cids: [definition.cid] });
      return;
    }
    logger.info(`Item ${item.targetItemId} generated as revision ${revision}: ${definition.cid}`);
    await recordAudit(models, {
      action: 'item.generated',
      jobId: item.jobId,
      jobItemId: item._id,
      previousRevision: item.revision,
      newRevision: revision,
      previousCid: item.candidateCid,
      newCid: definition.cid,
      reason: `seed ${result.seed}, diversity ${result.diversity.score.toFixed(3)}`,
    });
    await validateGenerated({ models, item: generated, now });
  } catch (error) {
    logger.warn(`Item ${item.targetItemId} failed attempt ${item.attempt}: ${messageOf(error)}`);
    const refused = error instanceof RangeError;
    await Item.advance({
      id: item._id,
      from: ['running'],
      to: refused || item.attempt >= MAX_ATTEMPTS ? 'failed' : 'queued',
      where,
      set: {
        error: { message: messageOf(error), retryable: !refused, at: now },
        'lease.holder': '',
        'lease.expiresAt': null,
      },
    });
  } finally {
    await syncJob({ models, jobId: item.jobId, now });
  }
}

/**
 * Runs every item that waits, up to `concurrency` at a time, then validates the items a stopped
 * worker left generated. A generator never sees the concurrency.
 * @param {Object} params
 * @param {Object} params.models
 * @param {Object} [params.options] - Router options.
 * @param {string} [params.holder] - Name of this worker.
 * @param {number} [params.concurrency=1]
 * @param {typeof persistCandidate} [params.persist]
 * @param {()=>Date} [params.clock]
 * @returns {Promise<number>} Items run.
 * @memberof CyberiaProceduralWorker
 */
export async function drainQueue({
  models,
  options,
  holder = randomUUID(),
  concurrency = 1,
  persist,
  clock = () => new Date(),
}) {
  let run = 0;
  const runner = async () => {
    for (;;) {
      const item = await claimNextItem({ models, holder, now: clock() });
      if (!item) return;
      run++;
      await syncJob({ models, jobId: item.jobId, now: clock() });
      await runItem({ models, item, holder, options, persist, now: clock() });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, runner));
  for (const item of await models.CyberiaProceduralJobItem.find({ status: 'generated' }))
    await validateGenerated({ models, item, now: clock() });
  return run;
}

const workers = new Map();

/**
 * Starts the worker of a deployment context: it stores the shipped profiles once, then drains the
 * queue and the publications on an interval. A second start for the same context returns the first worker.
 * @param {{host:string,path:string}} options - Router options.
 * @param {Object} [params]
 * @param {number} [params.intervalMs]
 * @param {number} [params.concurrency]
 * @returns {{stop:()=>void}}
 * @memberof CyberiaProceduralWorker
 */
export function startProceduralWorker(options, { intervalMs = POLL_MS, concurrency = 1 } = {}) {
  const key = `${options.host}${options.path}`;
  if (workers.has(key)) return workers.get(key);
  const holder = randomUUID();
  let seeded = false;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const models = proceduralModels(options);
      if (!seeded) {
        await ensureDefaultProfiles(models);
        seeded = true;
      }
      await drainQueue({ models, options, holder, concurrency });
      await drainPublications({ models: populationModels(options), options, holder });
    } catch (error) {
      logger.warn(`Procedural worker failed: ${messageOf(error)}`);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  timer.unref?.();
  const worker = {
    stop: () => {
      clearInterval(timer);
      workers.delete(key);
    },
  };
  workers.set(key, worker);
  return worker;
}

/** Stops every worker this process started. */
export const stopProceduralWorkers = () => [...workers.values()].forEach((worker) => worker.stop());
