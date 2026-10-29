import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import {
  claimTask,
  completeTask,
  ensureTasks,
  failTask,
  heartbeatTask,
  resumeTasks,
  runTasks,
  taskIdFactory,
  taskSummary,
} from '../../../src/server/release/release-tasks.js';

// Needs `mongod`: `UNDERPOST_MONGOD_BIN`, or one on PATH. The claims are conditional updates: only a
// real server proves that two of them never both win.
const POLICY = { attempts: 3, baseDelayMs: 10, maxDelayMs: 20 };

describe.skipIf(!mongodBinary)('durable release tasks on MongoDB', () => {
  let mongod;
  let connection;
  let Ledger;
  const filter = { releaseId: 'r1' };
  const task = async (id) => (await Ledger.findOne(filter).lean()).tasks[id];

  beforeAll(async () => {
    mongod = await startMongod('tasks');
    connection = await mongoose.createConnection(mongod.uri).asPromise();
    Ledger = connection.model(
      'Ledger',
      new mongoose.Schema({ releaseId: String, tasks: { type: mongoose.Schema.Types.Mixed, default: () => ({}) } }),
    );
  }, 60000);

  afterAll(async () => {
    await connection?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await Ledger.deleteMany({});
    await Ledger.create({ releaseId: 'r1' });
  });

  it('adds each task once and keeps the state of a task that exists', async () => {
    const [id] = await ensureTasks(Ledger, filter, [{ kind: 'publish', key: 'bafkreia' }]);
    expect(id).toBe('publish:bafkreia');
    const generation = await claimTask(Ledger, filter, id, await task(id), { holder: 'w1', leaseMs: 60000 });
    await completeTask(Ledger, filter, id, generation, { contentHash: 'h' });
    await ensureTasks(Ledger, filter, [
      { kind: 'publish', key: 'bafkreia' },
      { kind: 'publish', key: 'bafkreib' },
    ]);
    expect(await task(id)).toMatchObject({ status: 'completed', result: { contentHash: 'h' }, attempts: 1 });
    expect(await task('publish:bafkreib')).toMatchObject({ status: 'pending', attempts: 0, generation: 0 });
    expect(() => taskIdFactory('publish', 'a.b')).toThrow(/Invalid task id/);
  });

  it('lets one of two simultaneous claims win', async () => {
    const [id] = await ensureTasks(Ledger, filter, [{ kind: 'publish', key: 'c' }]);
    const seen = await task(id);
    const claims = await Promise.all(
      ['w1', 'w2', 'w3'].map((holder) => claimTask(Ledger, filter, id, seen, { holder, leaseMs: 60000 })),
    );
    expect(claims.filter((generation) => generation !== null)).toEqual([1]);
    expect(await task(id)).toMatchObject({ status: 'running', generation: 1, attempts: 1 });
  });

  it('fences a worker whose lease expired and whose task another worker claimed', async () => {
    const [id] = await ensureTasks(Ledger, filter, [{ kind: 'publish', key: 'd' }]);
    const stale = await claimTask(Ledger, filter, id, await task(id), { holder: 'w1', leaseMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      await claimTask(Ledger, filter, id, await task(id), { holder: 'w1-again', leaseMs: 60000, now: new Date(0) }),
    ).toBeNull();
    const fresh = await claimTask(Ledger, filter, id, await task(id), { holder: 'w2', leaseMs: 60000 });
    expect(fresh).toBe(stale + 1);
    expect(await heartbeatTask(Ledger, filter, id, stale, { leaseMs: 60000 })).toBe(false);
    expect(await completeTask(Ledger, filter, id, stale, { by: 'w1' })).toBe(false);
    expect(await completeTask(Ledger, filter, id, fresh, { by: 'w2' })).toBe(true);
    expect(await task(id)).toMatchObject({ status: 'completed', result: { by: 'w2' }, attempts: 2 });
  });

  it('retries a transient failure, blocks when the attempts run out, fails a permanent one, and resumes both', async () => {
    const [flaky, broken, done] = await ensureTasks(Ledger, filter, [
      { kind: 'publish', key: 'flaky' },
      { kind: 'publish', key: 'broken' },
      { kind: 'publish', key: 'done' },
    ]);
    const timeout = Object.assign(new Error('POST timed out after 5000ms'), { retryable: true });
    for (let attempt = 1; attempt <= 3; attempt++) {
      const generation = await claimTask(
        Ledger,
        filter,
        flaky,
        { ...(await task(flaky)), status: attempt === 1 ? 'pending' : 'retry' },
        { holder: 'w', leaseMs: 60000 },
      );
      const outcome = await failTask(Ledger, filter, flaky, generation, {
        error: timeout,
        attempts: attempt,
        policy: POLICY,
      });
      expect(outcome.status).toBe(attempt < 3 ? 'retry' : 'blocked');
      expect(outcome.failure.class).toBe('transient');
    }
    const generation = await claimTask(Ledger, filter, broken, await task(broken), { holder: 'w', leaseMs: 60000 });
    const refused = Object.assign(new Error('invalid content'), { status: 400 });
    expect(
      (await failTask(Ledger, filter, broken, generation, { error: refused, attempts: 1, policy: POLICY })).status,
    ).toBe('failed');
    const finished = await claimTask(Ledger, filter, done, await task(done), { holder: 'w', leaseMs: 60000 });
    await completeTask(Ledger, filter, done, finished, {});

    const summary = taskSummary(await Ledger.findOne(filter).lean());
    expect(summary.counts).toMatchObject({ blocked: 1, failed: 1, completed: 1 });
    expect(summary.failures.map(({ id, error }) => [id, error.class])).toEqual([
      ['publish:flaky', 'transient'],
      ['publish:broken', 'permanent'],
    ]);
    expect(await resumeTasks(Ledger, filter)).toBe(2);
    expect(await task(flaky)).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await task(done)).toMatchObject({ status: 'completed' });
  });

  it('runs every task to an end with a bounded pool, retrying what failed for a while', async () => {
    const keys = Array.from({ length: 8 }, (_, index) => `k${index}`);
    await ensureTasks(
      Ledger,
      filter,
      keys.map((key) => ({ kind: 'publish', key })),
    );
    const failures = new Map(keys.map((key, index) => [key, index % 3]));
    let running = 0;
    let peak = 0;
    const summary = await runTasks({
      Model: Ledger,
      filter,
      kinds: ['publish'],
      holder: 'job',
      concurrency: 3,
      policy: { attempts: 5, baseDelayMs: 5, maxDelayMs: 10 },
      run: async ({ key }) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        const left = failures.get(key);
        if (left > 0) {
          failures.set(key, left - 1);
          throw Object.assign(new Error('503'), { status: 503 });
        }
        return { key };
      },
    });
    expect(summary).toMatchObject({ done: true, total: 8, counts: { completed: 8 } });
    expect(peak).toBeLessThanOrEqual(3);
    expect((await task('publish:k2')).attempts).toBe(3);
  });

  it('leaves what did not settle before the deadline for the next run', async () => {
    await ensureTasks(Ledger, filter, [{ kind: 'publish', key: 'slow' }]);
    const summary = await runTasks({
      Model: Ledger,
      filter,
      kinds: ['publish'],
      holder: 'job',
      deadlineMs: 50,
      policy: { attempts: 10, baseDelayMs: 1000, maxDelayMs: 1000 },
      run: async () => {
        throw Object.assign(new Error('timed out'), { retryable: true });
      },
    });
    expect(summary.done).toBe(false);
    expect(summary.counts.retry).toBe(1);
  });
});
