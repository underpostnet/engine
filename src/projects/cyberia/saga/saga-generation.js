/**
 * Semantic generations of the Saga Engine: durable jobs a background worker runs, one generator step
 * at a time, under a lease.
 *
 * A generation is queued with a frozen request and the provenance of the content it runs on. A worker
 * claims it with a lease and runs its next step through the cyberia-content CLI. It stores the state
 * after the step only while it still holds the lease, so a worker that lost the lease stores nothing.
 * A worker that dies loses its lease when it expires; the next claim resumes at the first step not
 * done. A step that fails runs again up to {@link MAX_ATTEMPTS} times; a request the generator refuses
 * fails the generation for good. A cancel stops the running step and every later one. The package of
 * a completed generation is the next candidate of its workflow and never replaces an earlier one.
 *
 * @module src/projects/cyberia/saga/saga-generation.js
 * @namespace CyberiaSagaGeneration
 */
import { randomUUID } from 'node:crypto';
import { loggerFactory } from '../../../server/ops/logger.js';
import { ACTIVE_GENERATION } from '../../../api/cyberia-saga-workflow/cyberia-saga-workflow.model.js';
import { contentArtifact, contentCheckoutRevision } from '../content/content-artifact.js';
import { assertContentSources, runGenerationStep } from './content-cli.js';
import { appendCandidate, contextOf, historyEntry, readWorkflow, workflowModels } from './saga-workflow.js';

const logger = loggerFactory(import.meta);

/** The runs one step gets before its generation fails. */
export const MAX_ATTEMPTS = 3;
/** How long a claim holds a generation before another worker may take it. */
const LEASE_MS = 2 * 60 * 1000;
/** How often a running step renews its lease. */
const HEARTBEAT_MS = 30 * 1000;
/** How often the worker looks for work. */
const POLL_MS = 3000;
/** The log lines a step keeps, newest last. */
const LOG_LINES = 40;

const httpError = (status, message) => Object.assign(new Error(message), { status, expected: true });
const messageOf = (error) => String(error?.message ?? error);

/** The generator request of a narrative context: the fields it sets, nothing empty. */
const requestOf = (context) =>
  Object.fromEntries(
    Object.entries(context).filter(([key, value]) =>
      key === 'saga'
        ? Object.values(value ?? {}).some(Boolean)
        : Array.isArray(value)
          ? value.length > 0
          : value !== '' && value !== null && value !== undefined,
    ),
  );

/** Where a generation runs from: the served artifact and the content checkout. */
function provenanceOf(request) {
  let manifest = {};
  try {
    manifest = contentArtifact().manifest;
  } catch {
    manifest = {};
  }
  return {
    contentVersion: manifest.contentVersion ?? '',
    artifactSchema: manifest.schemaVersion ?? null,
    artifactRevision: manifest.sourceRevision ?? '',
    checkoutRevision: contentCheckoutRevision(),
    model: request.model ?? '',
  };
}

/** The next step of a generator state: the first of its steps it has not done. */
const nextStepOf = ({ steps = [], done = [] }) =>
  steps.length === 0 ? 'theme' : (steps.find((step) => !done.includes(step)) ?? null);

/**
 * Queues a generation: the next attempt of the workflow, with the request of its narrative context.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id - The workflow.
 * @param {{context?:Object}} [params.body] - Context fields to set first.
 * @param {string} params.actor
 * @returns {Promise<Object>} The workflow view.
 * @throws {Error} 409 while a generation of the workflow is queued or running, or without content sources.
 * @memberof CyberiaSagaGeneration
 */
export async function startGeneration({ models, id, body = {}, actor }) {
  assertContentSources();
  const workflow = await models.CyberiaSagaWorkflow.findById(id, {
    context: 1,
    'generations.attempt': 1,
    'generations.status': 1,
  })
    .lean()
    .catch(() => null);
  if (!workflow) throw httpError(404, `Saga workflow ${id} not found`);
  if (workflow.generations.some(({ status }) => ACTIVE_GENERATION.includes(status)))
    throw httpError(409, 'A generation of this workflow runs: wait for it or cancel it');
  const context = { ...workflow.context, ...contextOf(body.context ?? {}) };
  const request = requestOf(context);
  const now = new Date();
  const attempt = (workflow.generations.at(-1)?.attempt ?? 0) + 1;
  const { modifiedCount } = await models.CyberiaSagaWorkflow.updateOne(
    { _id: id, 'generations.status': { $nin: ACTIVE_GENERATION }, 'generations.attempt': { $ne: attempt } },
    {
      $set: { context },
      $push: {
        generations: {
          attempt,
          status: 'queued',
          request,
          provenance: provenanceOf(request),
          state: { request, done: [] },
          steps: [],
          createdBy: actor,
          createdAt: now,
        },
        history: historyEntry('generation.queued', actor, `generation ${attempt}`, now),
      },
    },
    { runValidators: true },
  );
  if (modifiedCount === 0) throw httpError(409, 'Another generation started meanwhile: reload the workflow');
  return await readWorkflow(models, id);
}

/** A generation of a workflow, with its state. */
async function findGeneration({ CyberiaSagaWorkflow }, id, attempt) {
  const workflow = await CyberiaSagaWorkflow.findById(id, { generations: { $elemMatch: { attempt: Number(attempt) } } })
    .lean()
    .catch(() => null);
  const generation = workflow?.generations?.[0];
  if (!generation) throw httpError(404, `Saga workflow ${id} has no generation ${attempt}`);
  return generation;
}

/**
 * A generation with its stage results: the generator state after its last step done.
 * @param {Object} models - {@link workflowModels}.
 * @param {string} id
 * @param {number} attempt
 * @returns {Promise<Object>}
 * @memberof CyberiaSagaGeneration
 */
export const readGeneration = (models, id, attempt) => findGeneration(models, id, attempt);

/** Updates the generation `attempt` of a workflow while `holder` holds its lease. */
const held = (models, id, attempt, holder, update, stepId) =>
  models.CyberiaSagaWorkflow.updateOne(
    { _id: id, generations: { $elemMatch: { attempt, status: 'running', 'lease.holder': holder } } },
    update,
    { arrayFilters: [{ 'g.attempt': attempt }, ...(stepId ? [{ 's.id': stepId }] : [])] },
  );

/**
 * Leases the next generation that waits, or runs under an expired lease, to a worker.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.holder - The worker.
 * @param {Date} [params.now]
 * @param {number} [params.leaseMs]
 * @returns {Promise<{id:string, attempt:number}|null>}
 * @memberof CyberiaSagaGeneration
 */
export async function claimGeneration({ models, holder, now = new Date(), leaseMs = LEASE_MS }) {
  const eligible = [{ status: 'queued' }, { status: 'running', 'lease.expiresAt': { $lt: now } }];
  const claimed = await models.CyberiaSagaWorkflow.findOneAndUpdate(
    { generations: { $elemMatch: { $or: eligible } } },
    {
      $set: {
        'generations.$[g].status': 'running',
        'generations.$[g].lease': { holder, expiresAt: new Date(now.getTime() + leaseMs) },
      },
    },
    {
      arrayFilters: [
        {
          $or: eligible.map((filter) =>
            Object.fromEntries(Object.entries(filter).map(([key, value]) => [`g.${key}`, value])),
          ),
        },
      ],
      sort: { updatedAt: 1 },
      projection: { 'generations.attempt': 1, 'generations.status': 1, 'generations.lease': 1 },
      returnDocument: 'after',
    },
  ).lean();
  const generation = claimed?.generations.find(({ status, lease }) => status === 'running' && lease?.holder === holder);
  return generation ? { id: String(claimed._id), attempt: generation.attempt } : null;
}

/** Ends a generation the moderator cancelled. */
const cancelled = (models, id, attempt, holder, now = new Date()) =>
  held(models, id, attempt, holder, {
    $set: {
      'generations.$[g].status': 'cancelled',
      'generations.$[g].lease': { holder: '', expiresAt: null },
      'generations.$[g].finishedAt': now,
    },
    $push: { history: historyEntry('generation.cancelled', 'system:saga-worker', `generation ${attempt}`, now) },
  });

/** Turns the package of a generation into the next candidate and completes it. */
async function complete(models, id, generation, holder) {
  const { package: pkg, findings = [] } = generation.state;
  const candidate = await appendCandidate({
    models,
    id,
    pkg,
    kind: 'generated',
    actor: generation.createdBy,
    generation: generation.attempt,
  });
  const now = new Date();
  await held(models, id, generation.attempt, holder, {
    $set: {
      'generations.$[g].status': 'completed',
      'generations.$[g].candidate': candidate.revision,
      'generations.$[g].lease': { holder: '', expiresAt: null },
      'generations.$[g].finishedAt': now,
    },
    $push: {
      history: historyEntry(
        'generation.completed',
        'system:saga-worker',
        `generation ${generation.attempt}: revision ${candidate.revision}, ${findings.length} generator finding(s)`,
        now,
      ),
    },
  });
}

/**
 * Runs a leased generation step after step until it completes, fails, waits for a retry, is
 * cancelled, or loses its lease. Each step renews the lease while it runs; a step whose lease is lost
 * or whose generation is cancelled stops at once, and its result is not stored.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id - The workflow.
 * @param {number} params.attempt - The generation.
 * @param {string} params.holder - The worker that holds the lease.
 * @param {typeof runGenerationStep} [params.runStep]
 * @param {number} [params.leaseMs]
 * @param {number} [params.heartbeatMs]
 * @returns {Promise<string>} The status it stops in.
 * @memberof CyberiaSagaGeneration
 */
export async function runGeneration({
  models,
  id,
  attempt,
  holder,
  runStep = runGenerationStep,
  leaseMs = LEASE_MS,
  heartbeatMs = HEARTBEAT_MS,
}) {
  for (;;) {
    const generation = await findGeneration(models, id, attempt);
    if (generation.status !== 'running' || generation.lease?.holder !== holder) return generation.status;
    if (generation.cancelRequestedAt) {
      await cancelled(models, id, attempt, holder);
      return 'cancelled';
    }
    const stepId = nextStepOf(generation.state);
    if (!stepId) {
      await complete(models, id, generation, holder);
      return 'completed';
    }
    const known = generation.steps.find((step) => step.id === stepId);
    const attempts = (known?.attempts ?? 0) + 1;
    const startedAt = new Date();
    const running = { id: stepId, status: 'running', attempts, startedAt, finishedAt: null, error: '', log: [] };
    const marked = await (known
      ? held(models, id, attempt, holder, { $set: { 'generations.$[g].steps.$[s]': running } }, stepId)
      : held(models, id, attempt, holder, { $push: { 'generations.$[g].steps': running } }));
    if (marked.matchedCount === 0) return 'lost';

    const log = [];
    const controller = new AbortController();
    let stop = '';
    const heartbeat = setInterval(async () => {
      const renewed = await models.CyberiaSagaWorkflow.updateOne(
        {
          _id: id,
          generations: { $elemMatch: { attempt, status: 'running', 'lease.holder': holder, cancelRequestedAt: null } },
        },
        { $set: { 'generations.$[g].lease.expiresAt': new Date(Date.now() + leaseMs) } },
        { arrayFilters: [{ 'g.attempt': attempt }] },
      ).catch(() => ({ matchedCount: 0 }));
      if (renewed.matchedCount === 0 && !controller.signal.aborted) {
        stop = 'stopped';
        controller.abort();
      }
    }, heartbeatMs);
    let state;
    let failure = null;
    try {
      state = await runStep(generation.state, {
        signal: controller.signal,
        onLine: (line) => log.push(line) > LOG_LINES && log.shift(),
      });
    } catch (error) {
      failure = error;
    } finally {
      clearInterval(heartbeat);
    }
    const finishedAt = new Date();
    if (stop) continue;
    if (failure) {
      const refused = failure instanceof RangeError;
      const final = refused || attempts >= MAX_ATTEMPTS;
      const message = messageOf(failure);
      logger.warn(`Saga generation ${id}#${attempt} step ${stepId} failed attempt ${attempts}: ${message}`);
      await held(
        models,
        id,
        attempt,
        holder,
        {
          $set: {
            'generations.$[g].steps.$[s]': {
              ...running,
              status: final ? 'failed' : 'queued',
              finishedAt,
              error: message,
              log,
            },
            'generations.$[g].status': final ? 'failed' : 'queued',
            'generations.$[g].lease': { holder: '', expiresAt: null },
            ...(final && {
              'generations.$[g].error': { message: `${stepId}: ${message}`, retryable: !refused, at: finishedAt },
              'generations.$[g].finishedAt': finishedAt,
            }),
          },
          $push: {
            history: historyEntry(
              final ? 'generation.failed' : 'generation.step_failed',
              'system:saga-worker',
              `generation ${attempt} step ${stepId} (attempt ${attempts}): ${message}`,
              finishedAt,
            ),
          },
        },
        stepId,
      );
      return final ? 'failed' : 'queued';
    }
    const stored = await held(
      models,
      id,
      attempt,
      holder,
      {
        $set: {
          'generations.$[g].state': state,
          'generations.$[g].steps.$[s]': { ...running, status: 'done', finishedAt, log },
        },
        $push: {
          history: historyEntry(
            'generation.step_done',
            'system:saga-worker',
            `generation ${attempt} step ${stepId}`,
            finishedAt,
          ),
        },
      },
      stepId,
    );
    if (stored.matchedCount === 0) return 'lost';
  }
}

/**
 * Cancels a generation: at once when no worker runs it, else at the next point the worker checks.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id
 * @param {number} params.attempt
 * @param {string} params.actor
 * @param {Date} [params.now]
 * @returns {Promise<Object>} The workflow view.
 * @throws {Error} 409 when the generation does not run.
 * @memberof CyberiaSagaGeneration
 */
export async function cancelGeneration({ models, id, attempt, actor, now = new Date() }) {
  const generation = await findGeneration(models, id, attempt);
  if (!ACTIVE_GENERATION.includes(generation.status)) throw httpError(409, `Generation ${attempt} does not run`);
  const live =
    generation.status === 'running' && generation.lease?.expiresAt && new Date(generation.lease.expiresAt) > now;
  const { modifiedCount } = await models.CyberiaSagaWorkflow.updateOne(
    { _id: id, generations: { $elemMatch: { attempt: generation.attempt, status: generation.status } } },
    {
      $set: live
        ? { 'generations.$[g].cancelRequestedAt': now }
        : {
            'generations.$[g].status': 'cancelled',
            'generations.$[g].lease': { holder: '', expiresAt: null },
            'generations.$[g].finishedAt': now,
          },
      $push: {
        history: historyEntry(
          live ? 'generation.cancel_requested' : 'generation.cancelled',
          actor,
          `generation ${attempt}`,
          now,
        ),
      },
    },
    { arrayFilters: [{ 'g.attempt': generation.attempt }] },
  );
  if (modifiedCount === 0) throw httpError(409, 'The generation moved meanwhile: reload the workflow');
  return await readWorkflow(models, id);
}

/**
 * Queues a failed or cancelled generation again. It resumes at its first step not done: the steps it
 * stored never run again.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id
 * @param {number} params.attempt
 * @param {string} params.actor
 * @returns {Promise<Object>} The workflow view.
 * @throws {Error} 409 when the generation runs, completed, or failed on a request the generator refuses.
 * @memberof CyberiaSagaGeneration
 */
export async function retryGeneration({ models, id, attempt, actor }) {
  const generation = await findGeneration(models, id, attempt);
  if (!['failed', 'cancelled'].includes(generation.status))
    throw httpError(409, `Generation ${attempt} is ${generation.status}: only a failed or cancelled one runs again`);
  if (generation.status === 'failed' && !generation.error?.retryable)
    throw httpError(409, `The generator refuses this request: ${generation.error.message}. Start a new generation`);
  const now = new Date();
  const { modifiedCount } = await models.CyberiaSagaWorkflow.updateOne(
    {
      _id: id,
      generations: { $elemMatch: { attempt: generation.attempt, status: generation.status } },
      'generations.status': { $nin: ACTIVE_GENERATION },
    },
    {
      $set: {
        'generations.$[g].status': 'queued',
        'generations.$[g].cancelRequestedAt': null,
        'generations.$[g].error': { message: '', retryable: false, at: null },
        'generations.$[g].finishedAt': null,
        'generations.$[g].steps': generation.steps.map((step) =>
          step.status === 'done' ? step : { ...step, status: 'queued', attempts: 0 },
        ),
      },
      $push: { history: historyEntry('generation.retried', actor, `generation ${attempt}`, now) },
    },
    { arrayFilters: [{ 'g.attempt': generation.attempt }] },
  );
  if (modifiedCount === 0) throw httpError(409, 'Another generation runs, or this one moved: reload the workflow');
  return await readWorkflow(models, id);
}

/**
 * Runs every generation that waits for a worker, one at a time.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.holder
 * @param {typeof runGenerationStep} [params.runStep]
 * @returns {Promise<number>} Generations run.
 * @memberof CyberiaSagaGeneration
 */
export async function drainGenerations({ models, holder, runStep }) {
  let run = 0;
  for (
    let claimed = await claimGeneration({ models, holder });
    claimed;
    claimed = await claimGeneration({ models, holder })
  ) {
    run++;
    try {
      await runGeneration({ models, ...claimed, holder, runStep });
    } catch (error) {
      logger.warn(`Saga generation ${claimed.id}#${claimed.attempt} stopped: ${messageOf(error)}`);
    }
  }
  return run;
}

const workers = new Map();

/**
 * Starts the generation worker of a deployment context. A second start for the same context returns
 * the first worker.
 * @param {{host:string,path:string}} options - The API context.
 * @param {{intervalMs?:number}} [params]
 * @returns {{stop:()=>void}}
 * @memberof CyberiaSagaGeneration
 */
export function startSagaWorker(options, { intervalMs = POLL_MS } = {}) {
  const key = `${options.host}${options.path}`;
  if (workers.has(key)) return workers.get(key);
  const holder = randomUUID();
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await drainGenerations({ models: workflowModels(options), holder });
    } catch (error) {
      logger.warn(`Saga worker failed: ${messageOf(error)}`);
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
