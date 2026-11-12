import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataBaseProviderService } from '../../../src/db/database-provider.js';
import {
  applyCandidate,
  canonicalPackage,
  createWorkflow,
  diffCandidate,
  packageDigest,
  readCandidate,
  readWorkflow,
  saveCandidate,
  setExclusion,
  validateCandidate,
  workflowModels,
} from '../../../src/projects/cyberia/saga/saga-workflow.js';
import {
  cancelGeneration,
  claimGeneration,
  drainGenerations,
  readGeneration,
  retryGeneration,
  runGeneration,
  startGeneration,
} from '../../../src/projects/cyberia/saga/saga-generation.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import { STUB_STEPS, stubPackage, writeSagaContent } from '../../support/saga-content.js';

// Saga workflows on a real MongoDB, with the real child-process bridge over a stub cyberia-content
// CLI: durable generations under a lease, resumable failed stages, cancellation, append-only
// candidates, checks with JSON paths, and the application to the content source.
const options = { host: 'saga-workflow-test', path: '/' };
const actor = 'moderator-1';
let models;
let root;

const sagaFile = (code) => path.join(root, 'src', 'content', 'sagas', `${code}.json`);
const startNew = (prompt, code = 'ash-relay') =>
  createWorkflow({ models, body: { context: { prompt, saga: { code } } }, actor });
const drain = () => drainGenerations({ models, holder: 'worker-1' });

describe.skipIf(!mongodBinary)('saga workflows on a real MongoDB', () => {
  let mongod;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    mongod = await startMongod('cyberia-saga-workflow');
    await DataBaseProviderService.load({
      apis: ['cyberia-saga-workflow'],
      ...options,
      db: { provider: 'mongoose', host: mongod.host, name: 'cyberia-saga-workflow' },
    });
    models = workflowModels(options);
  });

  afterAll(async () => {
    await DataBaseProviderService.getProvider(options)
      ?.close()
      .catch(() => {});
    delete DataBaseProviderService.instance[`${options.host}${options.path}`];
    await mongod?.stop();
    delete process.env.CYBERIA_CONTENT_ROOT;
  });

  beforeEach(async () => {
    await models.CyberiaSagaWorkflow.deleteMany({});
    root = writeSagaContent(fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-saga-content-')));
    process.env.CYBERIA_CONTENT_ROOT = root;
  });

  it('opens a saga of the content source as its first candidate', async () => {
    const view = await createWorkflow({ models, body: { sagaCode: 'frontier' }, actor });
    expect(view).toMatchObject({ sagaCode: 'frontier', stage: 'draft', base: { source: 'content' } });
    expect(view.candidates).toEqual([expect.objectContaining({ revision: 1, kind: 'content', sagaCode: 'frontier' })]);
    expect(view.package).toEqual(stubPackage());
    expect(view.base.digest).toBe(packageDigest(stubPackage()));
    await expect(createWorkflow({ models, body: { sagaCode: 'nowhere' }, actor })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('runs a durable generation step by step into a new candidate, with its provenance and logs', async () => {
    const { _id } = await startNew('A relay keeper');
    const queued = await startGeneration({ models, id: _id, actor });
    expect(queued.generations).toEqual([expect.objectContaining({ attempt: 1, status: 'queued' })]);
    await expect(startGeneration({ models, id: _id, actor })).rejects.toMatchObject({ status: 409 });

    expect(await drain()).toBe(1);
    const view = await readWorkflow(models, _id);
    const [generation] = view.generations;
    expect(generation).toMatchObject({ status: 'completed', candidate: 1 });
    expect(generation.request).toEqual({
      prompt: 'A relay keeper',
      saga: { code: 'ash-relay', name: '', description: '' },
    });
    expect(generation.steps.map(({ id, status, attempts }) => [id, status, attempts])).toEqual(
      STUB_STEPS.map((id) => [id, 'done', 1]),
    );
    expect(generation.steps[2].log).toEqual(['Stage maps']);
    expect(view.candidates).toEqual([expect.objectContaining({ revision: 1, kind: 'generated', generation: 1 })]);
    expect(view.package.saga).toEqual({
      code: 'ash-relay',
      name: 'Generated ash-relay',
      description: 'A generated saga.',
    });
    expect(view.sagaCode).toBe('ash-relay');
    expect((await readGeneration(models, _id, 1)).state.done).toEqual(STUB_STEPS);
    expect(view.history.map(({ action }) => action)).toEqual(
      expect.arrayContaining(['generation.queued', 'generation.step_done', 'generation.completed']),
    );
  });

  it('runs a failed stage again without the stages it stored', async () => {
    const { _id } = await startNew('fail-once:maps');
    await startGeneration({ models, id: _id, actor });
    await drain();
    const [generation] = (await readWorkflow(models, _id)).generations;
    expect(generation.status).toBe('completed');
    const attempts = Object.fromEntries(generation.steps.map(({ id, attempts: count }) => [id, count]));
    expect(attempts).toMatchObject({ theme: 1, composition: 1, maps: 2, quests: 1 });
  });

  it('fails a refused request for good: a retry refuses it', async () => {
    const { _id } = await startNew('refuse');
    await startGeneration({ models, id: _id, actor });
    await drain();
    const [generation] = (await readWorkflow(models, _id)).generations;
    expect(generation).toMatchObject({
      status: 'failed',
      error: { message: 'theme: Unknown definitions to reuse: weapon.nothing', retryable: false },
    });
    await expect(retryGeneration({ models, id: _id, attempt: 1, actor })).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await startGeneration({ models, id: _id, actor, body: { context: { prompt: 'A relay keeper' } } })
      ).generations.at(-1),
    ).toMatchObject({
      attempt: 2,
      status: 'queued',
    });
  });

  it('gives a generation whose lease expired to another worker, and stores nothing of the worker that lost it', async () => {
    const { _id } = await startNew('A relay keeper');
    await startGeneration({ models, id: _id, actor });
    const now = Date.now();
    const first = await claimGeneration({ models, holder: 'worker-a', now: new Date(now), leaseMs: 1000 });
    expect(first).toEqual({ id: String(_id), attempt: 1 });
    expect(await claimGeneration({ models, holder: 'worker-b', now: new Date(now + 500) })).toBe(null);

    const lost = await runGeneration({
      models,
      ...first,
      holder: 'worker-a',
      heartbeatMs: 60000,
      runStep: async (state) => {
        expect(await claimGeneration({ models, holder: 'worker-b', now: new Date(now + 2000) })).toEqual(first);
        return { ...state, steps: STUB_STEPS, done: ['theme'] };
      },
    });
    expect(lost).toBe('lost');
    expect((await readGeneration(models, _id, 1)).state.done).toEqual([]);

    expect(await runGeneration({ models, ...first, holder: 'worker-b' })).toBe('completed');
    expect((await readGeneration(models, _id, 1)).state.done).toEqual(STUB_STEPS);
  });

  it('cancels a running step at once, stores nothing more, and resumes on a retry', async () => {
    const { _id } = await startNew('A relay keeper');
    await startGeneration({ models, id: _id, actor });
    const claimed = await claimGeneration({ models, holder: 'worker-a' });
    let started;
    const running = new Promise((resolve) => (started = resolve));
    const outcome = runGeneration({
      models,
      ...claimed,
      holder: 'worker-a',
      heartbeatMs: 20,
      runStep: (state, { signal }) =>
        new Promise((resolve, reject) => {
          started();
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    await running;
    const requested = await cancelGeneration({ models, id: _id, attempt: 1, actor });
    expect(requested.generations[0].cancelRequestedAt).toBeTruthy();
    expect(await outcome).toBe('cancelled');
    const view = await readWorkflow(models, _id);
    expect(view.generations[0].status).toBe('cancelled');
    expect(view.candidates).toEqual([]);

    await retryGeneration({ models, id: _id, attempt: 1, actor });
    await drain();
    expect((await readWorkflow(models, _id)).generations[0]).toMatchObject({ status: 'completed', candidate: 1 });
  });

  it('cancels a generation that waits at once', async () => {
    const { _id } = await startNew('A relay keeper');
    await startGeneration({ models, id: _id, actor });
    const view = await cancelGeneration({ models, id: _id, attempt: 1, actor });
    expect(view.generations[0].status).toBe('cancelled');
    expect(await drain()).toBe(0);
  });

  it('keeps every candidate: an edit adds a revision, an equal package adds none, and a diff pairs definitions by id', async () => {
    const { _id } = await createWorkflow({ models, body: { sagaCode: 'frontier' }, actor });
    const edited = stubPackage();
    edited.definitions[0].description = 'Talk to the merchant twice.';
    let view = await saveCandidate({ models, id: _id, body: { package: edited, parent: 1 }, actor });
    expect(view.candidates.map(({ revision, kind, parent }) => [revision, kind, parent])).toEqual([
      [1, 'content', null],
      [2, 'edited', 1],
    ]);
    view = await saveCandidate({ models, id: _id, body: { package: edited, parent: 2 }, actor });
    expect(view.candidates).toHaveLength(2);
    expect((await readCandidate(models, _id, 1)).package).toEqual(stubPackage());

    const diff = await diffCandidate({ models, id: _id, body: { package: edited, revision: 1 } });
    expect(diff.entries).toEqual([
      {
        path: ['definitions', 'quest.relay-first', 'description'],
        op: 'change',
        before: 'Talk to the merchant.',
        after: 'Talk to the merchant twice.',
      },
    ]);
  });

  it('checks a candidate with the JSON path of each finding and applies it only once it is clean', async () => {
    const { _id } = await createWorkflow({ models, body: { sagaCode: 'frontier' }, actor });
    const broken = stubPackage('frontier', [{ id: 'quest.broken', name: 'Broken', provider: 'character.nobody' }]);
    await saveCandidate({ models, id: _id, body: { package: broken }, actor });
    let view = await validateCandidate({ models, id: _id, revision: 2, actor });
    expect(view.validation).toMatchObject({ revision: 2, ok: false });
    expect(view.validation.findings).toEqual([
      {
        id: 'quest.broken',
        message: 'provider names unknown definition character.nobody',
        path: ['definitions', 1, 'provider'],
      },
    ]);
    expect(view.stage).toBe('findings');
    await expect(applyCandidate({ models, id: _id, revision: 2, actor })).rejects.toMatchObject({ status: 409 });

    const fixed = stubPackage('frontier', [{ id: 'quest.mended', name: 'Mended' }]);
    await saveCandidate({ models, id: _id, body: { package: fixed }, actor });
    await validateCandidate({ models, id: _id, revision: 3, actor });
    view = await applyCandidate({ models, id: _id, revision: 3, actor });
    expect(view.applied).toMatchObject({
      revision: 3,
      digest: packageDigest(fixed),
      file: 'src/content/sagas/frontier.json',
    });
    expect(view.stage).toBe('applied');
    expect(fs.readFileSync(sagaFile('frontier'), 'utf8')).toBe(canonicalPackage(fixed));
  });

  it('refuses to apply over a content file that changed outside the workflow', async () => {
    const { _id } = await createWorkflow({ models, body: { sagaCode: 'frontier' }, actor });
    const edited = stubPackage('frontier', [{ id: 'quest.next', name: 'Next' }]);
    await saveCandidate({ models, id: _id, body: { package: edited }, actor });
    await validateCandidate({ models, id: _id, revision: 2, actor });
    fs.writeFileSync(
      sagaFile('frontier'),
      canonicalPackage(stubPackage('frontier', [{ id: 'quest.other', name: 'Other' }])),
    );
    await expect(applyCandidate({ models, id: _id, revision: 2, actor })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('changed outside this workflow'),
    });
  });

  it('leaves a report row out with its reason, and takes it back', async () => {
    const { _id } = await startNew('A relay keeper');
    let view = await setExclusion({ models, id: _id, body: { key: 'item:pistol', reason: 'Lore only' }, actor });
    expect(view.exclusions).toEqual([expect.objectContaining({ key: 'item:pistol', reason: 'Lore only', actor })]);
    view = await setExclusion({ models, id: _id, body: { key: 'item:pistol', reason: '' }, actor });
    expect(view.exclusions).toEqual([]);
    expect(view.history.map(({ action }) => action).slice(0, 2)).toEqual(['exclusion.removed', 'exclusion.set']);
  });
});
