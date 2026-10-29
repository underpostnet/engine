/**
 * Durable tasks of one release, held in its own ledger document under `tasks.<id>`.
 *
 * A task is one recoverable operation: an import step, the publication of one definition. Its
 * state survives the worker: a crash, an evicted pod or a rerun of the deploy finds every
 * completed task completed and resumes the rest.
 *
 * - A claim is one conditional update on the task's `generation`: one worker wins, and the winner
 *   holds the next generation and a lease.
 * - Completing or failing a task names the generation it holds. A worker whose lease expired and
 *   whose task another worker claimed again writes nothing.
 * - A transient failure schedules a retry with backoff and jitter until the attempts run out; then
 *   the task is `blocked`, for an operator to resume. A permanent failure is `failed`.
 * - A retry never resets a completed task.
 *
 * @module src/server/release/release-tasks.js
 * @namespace ReleaseTasks
 */
import { CircuitBreaker, isTransientError, retryDelayMs } from '../runtime/retry.js';

/** Lifecycle of a task. */
export const TASK_STATUS = Object.freeze(['pending', 'running', 'retry', 'completed', 'blocked', 'failed']);

/** Statuses a worker may claim. */
const CLAIMABLE = ['pending', 'retry'];

/** Statuses an operator resumes: every unfinished end. */
const RESUMABLE = ['blocked', 'failed', 'retry'];

const TASK_ID_PATTERN = /^[a-z][a-z-]*:[A-Za-z0-9_-]+$/;

/**
 * The id of a task: its kind and its key, such as `publish:bafkrei…`.
 * @param {string} kind
 * @param {string} key
 * @returns {string}
 * @memberof ReleaseTasks
 */
export const taskIdFactory = (kind, key) => {
  const id = `${kind}:${key}`;
  if (!TASK_ID_PATTERN.test(id)) throw new Error(`Invalid task id: ${JSON.stringify(id)}`);
  return id;
};

const field = (id, name) => `tasks.${id}${name ? `.${name}` : ''}`;

/**
 * A failure as a task records it: transient or permanent, and why.
 * @param {Error} error
 * @returns {{class:'transient'|'permanent', message:string}}
 * @memberof ReleaseTasks
 */
export const classifyFailure = (error) => ({
  class: isTransientError(error) ? 'transient' : 'permanent',
  message: String(error?.message ?? error).slice(0, 2000),
});

/**
 * Adds the tasks a stage needs. A task that exists keeps its state.
 * @param {import('mongoose').Model} Model
 * @param {Object} filter - Selects the ledger document.
 * @param {Array<{kind:string, key:string, input?:Object}>} specs
 * @returns {Promise<string[]>} The ids of the stage's tasks.
 * @memberof ReleaseTasks
 */
export async function ensureTasks(Model, filter, specs) {
  const ids = specs.map(({ kind, key }) => taskIdFactory(kind, key));
  if (!ids.length) return ids;
  await Model.bulkWrite(
    specs.map(({ kind, key, input = {} }, index) => ({
      updateOne: {
        filter: { ...filter, [field(ids[index])]: { $exists: false } },
        update: {
          $set: {
            [field(ids[index])]: {
              kind,
              key,
              input,
              status: 'pending',
              attempts: 0,
              generation: 0,
              nextAttemptAt: null,
              lease: null,
              error: null,
              completedAt: null,
              result: null,
            },
          },
        },
      },
    })),
    { ordered: false },
  );
  return ids;
}

/**
 * Claims one task: pending, due for a retry, or running under an expired lease.
 * @param {import('mongoose').Model} Model
 * @param {Object} filter
 * @param {string} id
 * @param {Object} task - The task as the caller last read it.
 * @param {{holder:string, leaseMs:number, now?:Date}} params
 * @returns {Promise<number|null>} The generation the claim holds, or null when another worker won.
 * @memberof ReleaseTasks
 */
export async function claimTask(Model, filter, id, task, { holder, leaseMs, now = new Date() }) {
  const generation = task.generation + 1;
  const eligible =
    CLAIMABLE.includes(task.status) || (task.status === 'running' && new Date(task.lease?.expiresAt) < now);
  if (!eligible) return null;
  const result = await Model.updateOne(
    { ...filter, [field(id, 'generation')]: task.generation, [field(id, 'status')]: task.status },
    {
      $set: {
        [field(id, 'status')]: 'running',
        [field(id, 'generation')]: generation,
        [field(id, 'lease')]: { holder, claimedAt: now, expiresAt: new Date(now.getTime() + leaseMs) },
      },
      $inc: { [field(id, 'attempts')]: 1 },
    },
  );
  return result.modifiedCount === 1 ? generation : null;
}

/**
 * Extends the lease of a claimed task.
 * @returns {Promise<boolean>} False when the claim was lost.
 * @memberof ReleaseTasks
 */
export async function heartbeatTask(Model, filter, id, generation, { leaseMs, now = new Date() }) {
  const result = await Model.updateOne(
    { ...filter, [field(id, 'generation')]: generation, [field(id, 'status')]: 'running' },
    { $set: { [field(id, 'lease.expiresAt')]: new Date(now.getTime() + leaseMs) } },
  );
  return result.modifiedCount === 1;
}

/**
 * Completes a claimed task with its verified result.
 * @returns {Promise<boolean>} False when the claim was lost: the result is not recorded.
 * @memberof ReleaseTasks
 */
export async function completeTask(Model, filter, id, generation, result = null, now = new Date()) {
  const update = await Model.updateOne(
    { ...filter, [field(id, 'generation')]: generation, [field(id, 'status')]: 'running' },
    {
      $set: {
        [field(id, 'status')]: 'completed',
        [field(id, 'completedAt')]: now,
        [field(id, 'result')]: result,
        [field(id, 'error')]: null,
        [field(id, 'lease')]: null,
      },
    },
  );
  return update.modifiedCount === 1;
}

/**
 * Ends a claimed attempt that failed: a transient failure is retried while attempts remain, then
 * blocks; a permanent one fails.
 * @param {import('mongoose').Model} Model
 * @param {Object} filter
 * @param {string} id
 * @param {number} generation
 * @param {Object} params
 * @param {Error} params.error
 * @param {number} params.attempts - Attempts made, this one included.
 * @param {{attempts:number, baseDelayMs:number, maxDelayMs:number}} params.policy
 * @param {Date} [params.now]
 * @returns {Promise<{recorded:boolean, status:string, nextAttemptAt:Date|null, failure:Object}>}
 * @memberof ReleaseTasks
 */
export async function failTask(Model, filter, id, generation, { error, attempts, policy, now = new Date() }) {
  const failure = { ...classifyFailure(error), at: now };
  const retry = failure.class === 'transient' && attempts < policy.attempts;
  const status = retry ? 'retry' : failure.class === 'transient' ? 'blocked' : 'failed';
  const nextAttemptAt = retry
    ? new Date(now.getTime() + retryDelayMs({ attempt: attempts, ...policy, retryAfter: error?.retryAfterMs }))
    : null;
  const update = await Model.updateOne(
    { ...filter, [field(id, 'generation')]: generation, [field(id, 'status')]: 'running' },
    {
      $set: {
        [field(id, 'status')]: status,
        [field(id, 'error')]: failure,
        [field(id, 'nextAttemptAt')]: nextAttemptAt,
        [field(id, 'lease')]: null,
      },
    },
  );
  return { recorded: update.modifiedCount === 1, status, nextAttemptAt, failure };
}

/**
 * Makes unfinished tasks claimable again: blocked, failed and waiting ones. Completed tasks stay.
 * @param {import('mongoose').Model} Model
 * @param {Object} filter
 * @param {{kinds?:string[], statuses?:string[]}} [params]
 * @returns {Promise<number>} Tasks resumed.
 * @memberof ReleaseTasks
 */
export async function resumeTasks(Model, filter, { kinds, statuses = RESUMABLE } = {}) {
  const doc = await Model.findOne(filter, { tasks: 1 }).lean();
  const ids = Object.entries(doc?.tasks ?? {})
    .filter(([, task]) => statuses.includes(task.status) && (!kinds || kinds.includes(task.kind)))
    .map(([id]) => id);
  if (!ids.length) return 0;
  await Model.bulkWrite(
    ids.map((id) => ({
      updateOne: {
        filter: { ...filter, [field(id, 'status')]: { $in: statuses } },
        update: {
          $set: { [field(id, 'status')]: 'pending', [field(id, 'attempts')]: 0, [field(id, 'nextAttemptAt')]: null },
        },
      },
    })),
  );
  return ids.length;
}

/**
 * Counts the tasks of a ledger document by status, with the failures and the next retry.
 * @param {Object} doc - A ledger document, lean.
 * @param {{kinds?:string[]}} [params]
 * @returns {{total:number, counts:Object<string,number>, nextAttemptAt:Date|null,
 *   failures:Array<{id:string, status:string, attempts:number, error:Object}>, running:Array<{id:string, holder:string}>}}
 * @memberof ReleaseTasks
 */
export function taskSummary(doc, { kinds } = {}) {
  const tasks = Object.entries(doc?.tasks ?? {}).filter(([, task]) => !kinds || kinds.includes(task.kind));
  const counts = Object.fromEntries(TASK_STATUS.map((status) => [status, 0]));
  let nextAttemptAt = null;
  for (const [, task] of tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
    if (task.status === 'retry' && (!nextAttemptAt || new Date(task.nextAttemptAt) < nextAttemptAt))
      nextAttemptAt = new Date(task.nextAttemptAt);
  }
  return {
    total: tasks.length,
    counts,
    nextAttemptAt,
    failures: tasks
      .filter(([, task]) => ['retry', 'blocked', 'failed'].includes(task.status))
      .map(([id, task]) => ({ id, status: task.status, attempts: task.attempts, error: task.error })),
    running: tasks
      .filter(([, task]) => task.status === 'running')
      .map(([id, task]) => ({ id, holder: task.lease?.holder ?? '' })),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs the tasks of some kinds to an end with a bounded pool of claims. A task runs `run(task)`;
 * its lease is extended while it runs. It returns when no task of those kinds is pending, waiting
 * or running, or when the deadline passes: what is left keeps its state for the next run.
 * Transient failures in a row open a circuit breaker, and no claim is made while it is open.
 * @param {Object} params
 * @param {import('mongoose').Model} params.Model
 * @param {Object} params.filter
 * @param {string[]} params.kinds
 * @param {string} params.holder
 * @param {(task:Object, id:string) => Promise<Object>} params.run - Resolves with the verified result.
 * @param {number} [params.concurrency=4]
 * @param {number} [params.leaseMs=120000]
 * @param {number} [params.deadlineMs=900000]
 * @param {{attempts:number, baseDelayMs:number, maxDelayMs:number}} [params.policy]
 * @param {CircuitBreaker} [params.breaker]
 * @param {(event:Object) => void} [params.onEvent] - Each claim, completion and failure.
 * @param {() => Date} [params.clock]
 * @returns {Promise<ReturnType<typeof taskSummary> & {done:boolean}>} `done` when every task completed.
 * @memberof ReleaseTasks
 */
export async function runTasks({
  Model,
  filter,
  kinds,
  holder,
  run,
  concurrency = 4,
  leaseMs = 120000,
  deadlineMs = 900000,
  policy = { attempts: 8, baseDelayMs: 2000, maxDelayMs: 60000 },
  breaker = new CircuitBreaker({ threshold: 5, cooldownMs: 30000 }),
  onEvent = () => {},
  clock = () => new Date(),
}) {
  const deadline = clock().getTime() + deadlineMs;
  const active = new Map();
  const runOne = async (id, task, generation) => {
    const heartbeat = setInterval(
      () => heartbeatTask(Model, filter, id, generation, { leaseMs }).catch(() => {}),
      Math.max(1000, Math.floor(leaseMs / 3)),
    );
    try {
      const result = await run(task, id);
      breaker.succeeded();
      const recorded = await completeTask(Model, filter, id, generation, result ?? null, clock());
      onEvent({ type: recorded ? 'completed' : 'fenced', id, attempts: task.attempts + 1 });
    } catch (error) {
      const outcome = await failTask(Model, filter, id, generation, {
        error,
        attempts: task.attempts + 1,
        policy,
        now: clock(),
      });
      if (outcome.failure.class === 'transient') breaker.failed();
      onEvent({
        type: outcome.status,
        id,
        attempts: task.attempts + 1,
        error: outcome.failure,
        nextAttemptAt: outcome.nextAttemptAt,
      });
    } finally {
      clearInterval(heartbeat);
      active.delete(id);
    }
  };
  for (;;) {
    const doc = await Model.findOne(filter, { tasks: 1 }).lean();
    if (!doc) throw new Error('The ledger document of the tasks is gone');
    const now = clock();
    const tasks = Object.entries(doc.tasks ?? {}).filter(([, task]) => kinds.includes(task.kind));
    const open = tasks.filter(([, task]) => ['pending', 'retry', 'running'].includes(task.status));
    if (!open.length && !active.size)
      return { ...taskSummary(doc, { kinds }), done: tasks.every(([, t]) => t.status === 'completed') };
    if (now.getTime() >= deadline) {
      await Promise.allSettled([...active.values()]);
      const last = await Model.findOne(filter, { tasks: 1 }).lean();
      return { ...taskSummary(last, { kinds }), done: false };
    }
    const due = open.filter(
      ([id, task]) =>
        !active.has(id) &&
        (task.status === 'pending' ||
          (task.status === 'retry' && new Date(task.nextAttemptAt) <= now) ||
          (task.status === 'running' && new Date(task.lease?.expiresAt) < now)),
    );
    const wait = breaker.waitMs;
    if (!wait)
      for (const [id, task] of due) {
        if (active.size >= concurrency) break;
        const generation = await claimTask(Model, filter, id, task, { holder, leaseMs, now });
        if (generation === null) continue;
        onEvent({ type: 'claimed', id, attempts: task.attempts + 1 });
        active.set(id, runOne(id, task, generation));
      }
    if (active.size) await Promise.race([...active.values(), sleep(1000)]);
    else {
      const retries = open
        .filter(([, task]) => task.status === 'retry')
        .map(([, task]) => new Date(task.nextAttemptAt).getTime());
      const leases = open
        .filter(([, task]) => task.status === 'running')
        .map(([, task]) => new Date(task.lease?.expiresAt).getTime());
      const next = Math.min(...retries, ...leases, deadline);
      const pause = Math.max(wait, Math.min(Math.max(250, next - now.getTime()), 15000));
      await sleep(Math.min(pause, Math.max(0, deadline - now.getTime())));
    }
  }
}
