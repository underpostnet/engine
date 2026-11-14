import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Underpost from '../../../src/index.js';
import { MongooseDB } from '../../../src/db/mongo/mongoose-db.js';
import { MongoBootstrap } from '../../../src/db/mongo/mongo-bootstrap.js';
import { DR_BACKUP_PROFILE } from '../../../src/cli/db.js';
import { recordVerification, writeBackup } from '../../../src/server/storage/backup.js';
import { objectStore } from '../../../src/server/storage/object-store.js';
import { SOURCE_LOCK_FILE, writeSourceLockFile } from '../../../src/server/release/source-lock.js';
import { BASELINE_PROFILE, BASELINE_SCHEMA_VERSION } from '../../../src/projects/cyberia/content/content-baseline.js';
import {
  LIFECYCLE_APIS,
  LIFECYCLE_STAGE_ORDER,
  LIFECYCLE_STAGES,
  SHARE_ENV,
  assertStageReady,
  cancelLifecycle,
  executionTarget,
  hostContexts,
  lifecycleModels,
  lifecyclePlan,
  noteOperation,
  readLifecycle,
  recordStage,
  stageExecution,
  startLifecycle,
} from '../../../src/projects/cyberia/content/content-lifecycle.js';
import {
  STAGE_VERIFIERS,
  assertExportArtifact,
} from '../../../src/projects/cyberia/content/content-lifecycle-stages.js';
import {
  CONTENT_SCHEMA_VERSION,
  GLOBAL_CONTENT_DIR,
  exportSourceDir,
  treeDigest,
} from '../../../src/projects/cyberia/content/content-artifact.js';
import { DEFAULT_INSTANCE_CODE } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { parseShareHandle } from '../../../src/projects/cyberia/content/content-lifecycle-share.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import { installSandbox, mongoSandboxSession } from '../../support/sandbox.js';

// The host that runs the suite is never a container: a case stubs KUBERNETES_SERVICE_HOST to run in a pod.
vi.mock('../../../src/server/runtime/environment.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isOciRuntime: () => !!process.env.KUBERNETES_SERVICE_HOST,
}));
/** A child process reads the container of the host that runs the suite. */
const { isOciRuntime: insideContainer } = await vi.importActual('../../../src/server/runtime/environment.js');

// A content lifecycle on a real replica set: the journal, its projection, the stage verifiers on the
// records each domain owns, and the CLI on two nodes. Needs `mongod` (`UNDERPOST_MONGOD_BIN`) and git.
const host = (nodeName, role, environment, { sources = false, targets = {} } = {}) => ({
  node: { nodeName, role },
  environment,
  actor: `operator@${nodeName}`,
  contexts: hostContexts({ role, environment, sources }),
  targets,
});
const control = host('control-1', 'control', 'production');
const workstation = host('laptop-1', 'workstation', 'development', {
  sources: true,
  targets: { sandbox: executionTarget('sandbox', 'laptop-1/kind', { kubeSystemUid: 'uid-1' }) },
});
const DIGEST = `sha256:${'c'.repeat(64)}`;
const blocked = (message) => expect.objectContaining({ outcome: 'blocked', message: expect.stringContaining(message) });

describe.skipIf(!mongodBinary)('a content lifecycle on a real database', () => {
  let mongod;
  let connection;
  let models;
  let scratch;
  let store;

  /** Records a stage on a host as `--cycle` does: the readiness check first, then the evidence. */
  const runStage = async (cycleId, stageId, on, evidence = { stageId }, references = {}) => {
    const cycle = await readLifecycle(models, cycleId);
    assertStageReady(cycle, stageId, on);
    return recordStage(models, { cycle, stageId, host: on, status: 'succeeded', evidence, references });
  };
  const start = (scope = { sagas: ['frontier'] }) =>
    startLifecycle(models, { deployId: 'dd-test', environment: 'production', scope, host: control });
  const journal = (cycleId) => models.CyberiaContentLifecycleEvent.find({ cycleId }).sort({ seq: 1 }).lean();
  const states = async (cycleId) =>
    lifecyclePlan(await readLifecycle(models, cycleId)).stages.map(({ id, state }) => `${id}:${state}`);

  beforeAll(async () => {
    mongod = await startMongod('cyberia', { replSet: 'lifecycleset' });
    connection = await MongooseDB.connect({ host: mongod.host, name: 'cyberia', replicaSet: 'lifecycleset' });
    models = {
      ...(await lifecycleModels(connection)),
      CyberiaContentRelease: await MongooseDB.bindModel(connection, 'cyberia-content-release'),
      CyberiaServerRegistry: await MongooseDB.bindModel(connection, 'cyberia-server-registry'),
    };
    for (const model of Object.values(models)) await model.init();
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'content-lifecycle-'));
    store = objectStore(`file:${scratch}/store`);
    process.env.UNDERPOST_BACKUP_KEY = crypto.randomBytes(32).toString('hex');
  }, 60000);

  afterAll(async () => {
    await connection?.close();
    await mongod?.stop();
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
  });

  beforeEach(async () => {
    for (const model of Object.values(models)) await model.collection.deleteMany({});
  });

  describe('the journal and its projection', () => {
    it('spans hosts: each stage keeps the node that recorded it, and the journal holds every operation in order', async () => {
      const { cycleId } = await start();
      await runStage(cycleId, 'preflight', control);
      await runStage(cycleId, 'infrastructure-backup', control, { backupId: 'b1' }, { backupId: 'b1' });
      await runStage(cycleId, 'baseline-capture', control, { baselineId: 'c1' }, { baselineId: 'c1' });
      await runStage(cycleId, 'baseline-verify', control);
      // A stage keeps only the references it owns: the workstation cannot move the baseline of the cycle.
      await runStage(cycleId, 'baseline-restore', workstation, { stageId: 'baseline-restore' }, { baselineId: 'x' });
      await noteOperation(models, {
        cycleId,
        operation: 'content.import',
        host: workstation,
        status: 'succeeded',
        scope: { sagas: ['frontier', 'harbor'], instances: ['cyberia-main'] },
      });

      const events = await journal(cycleId);
      expect(events.map(({ seq }) => seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(events.map(({ stage, operation, node }) => `${stage || operation}@${node.nodeName}`)).toEqual([
        'lifecycle.start@control-1',
        'preflight@control-1',
        'infrastructure-backup@control-1',
        'baseline-capture@control-1',
        'baseline-verify@control-1',
        'baseline-restore@laptop-1',
        'content.import@laptop-1',
      ]);
      expect(events[5]).toMatchObject({
        environment: 'development',
        executionContext: workstation.contexts.join(','),
        executionTargetId: 'sandbox:laptop-1/kind',
        targetKind: 'sandbox',
        targetFingerprint: workstation.targets.sandbox.fingerprint,
        inputExecution: 'baseline-verify@deployment:dd-test/production',
      });
      const cycle = await readLifecycle(models, cycleId);
      expect(cycle.stageOrder).toEqual(LIFECYCLE_STAGE_ORDER);
      expect(cycle.operations).toEqual([
        { operation: 'content.import', status: 'succeeded', at: events[6].completedAt, eventId: events[6].eventId },
      ]);
      expect(cycle.references).toEqual({ backupId: 'b1', baselineId: 'c1' });
      expect(cycle.scope).toMatchObject({ sagas: ['frontier', 'harbor'], instances: ['cyberia-main'] });
      const plan = lifecyclePlan(cycle, workstation);
      expect(plan.stages.find(({ id }) => id === 'baseline-restore')).toMatchObject({
        state: 'completed',
        node: { nodeName: 'laptop-1', role: 'workstation' },
      });
      expect(plan.next).toMatchObject({
        id: 'source-export',
        here: false,
        reason: 'this host observes no cyberia-content checkout',
      });
    });

    it('keeps every event as written: the model refuses each update, and a new record leaves the old event', async () => {
      const { cycleId } = await start();
      await runStage(cycleId, 'preflight', control, { revision: 'one' });
      const [, first] = await journal(cycleId);
      const Event = models.CyberiaContentLifecycleEvent;
      const filter = { eventId: first.eventId };
      for (const write of [
        () => Event.updateOne(filter, { $set: { status: 'failed' } }),
        () => Event.updateMany(filter, { $set: { status: 'failed' } }),
        () => Event.findOneAndUpdate(filter, { $set: { status: 'failed' } }),
        () => Event.replaceOne(filter, { ...first, status: 'failed' }),
        async () => {
          const stored = await Event.findOne(filter);
          stored.status = 'failed';
          await stored.save();
        },
      ])
        await expect(write()).rejects.toThrow('append-only');

      await runStage(cycleId, 'preflight', control, { revision: 'two' });
      const events = await journal(cycleId);
      expect(events).toHaveLength(3);
      expect(events[1]).toEqual(first);
      const cycle = await readLifecycle(models, cycleId);
      expect(cycle.executions.find(({ stage }) => stage === 'preflight')).toMatchObject({
        evidence: { revision: 'two' },
        eventId: events[2].eventId,
      });
    });

    it('appends a stage once for one input and one evidence, also when two hosts record it at once', async () => {
      const { cycleId } = await start();
      const record = async (evidence, cycle) =>
        recordStage(models, {
          cycle: cycle ?? (await readLifecycle(models, cycleId)),
          stageId: 'preflight',
          host: control,
          status: 'succeeded',
          evidence,
        });
      const read = await readLifecycle(models, cycleId);
      const [a, b] = await Promise.all([record({ revision: 'one' }, read), record({ revision: 'one' }, read)]);
      expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
      expect(a.event.eventId).toBe(b.event.eventId);
      expect((await record({ revision: 'one' })).duplicate).toBe(true);
      expect((await journal(cycleId)).filter(({ stage }) => stage === 'preflight')).toHaveLength(1);

      await record({ revision: 'two' });
      const recorded = (await journal(cycleId)).filter(({ stage }) => stage === 'preflight');
      expect(recorded.map(({ attempt }) => attempt)).toEqual([1, 2]);
    });

    it('makes the later stages stale when an earlier stage records new evidence, and resumes from that stage', async () => {
      const { cycleId } = await start();
      await runStage(cycleId, 'preflight', control);
      await runStage(cycleId, 'infrastructure-backup', control, { backupId: 'b1' });
      await runStage(cycleId, 'baseline-capture', control, { baselineId: 'c1' }, { baselineId: 'c1' });
      await runStage(cycleId, 'baseline-verify', control);
      await runStage(cycleId, 'infrastructure-backup', control, { backupId: 'b2' });

      expect((await states(cycleId)).slice(0, 5)).toEqual([
        'preflight:completed',
        'infrastructure-backup:completed',
        'baseline-capture:stale',
        'baseline-verify:stale',
        'baseline-restore:pending',
      ]);
      const cycle = await readLifecycle(models, cycleId);
      expect(() => assertStageReady(cycle, 'baseline-restore', workstation)).toThrow(blocked('it is stale'));
      expect(lifecyclePlan(cycle).next).toMatchObject({ id: 'baseline-capture', state: 'stale' });

      await runStage(cycleId, 'baseline-capture', control, { baselineId: 'c1' });
      await runStage(cycleId, 'baseline-verify', control);
      expect((await states(cycleId)).slice(2, 4)).toEqual(['baseline-capture:completed', 'baseline-verify:completed']);
    });

    it('keeps a failed attempt in the journal only, while the stage it retried stays complete', async () => {
      const { cycleId } = await start();
      await runStage(cycleId, 'preflight', control);
      const cycle = await readLifecycle(models, cycleId);
      await recordStage(models, { cycle, stageId: 'preflight', host: control, status: 'failed', error: 'tunnel down' });
      expect((await journal(cycleId)).at(-1)).toMatchObject({ status: 'failed', error: 'tunnel down' });
      expect((await states(cycleId))[0]).toBe('preflight:completed');
    });

    it('takes no stage and no operation once cancelled', async () => {
      const { cycleId } = await start();
      await runStage(cycleId, 'preflight', control);
      await cancelLifecycle(models, { cycleId, reason: 'moved to the next cycle', host: control });
      const cycle = await readLifecycle(models, cycleId);
      expect(cycle.status).toBe('cancelled');
      expect(lifecyclePlan(cycle).next).toBeNull();
      expect(() => assertStageReady(cycle, 'infrastructure-backup', control)).toThrow(blocked('is cancelled'));
      await expect(
        noteOperation(models, { cycleId, operation: 'content.import', host: workstation, status: 'succeeded' }),
      ).rejects.toThrow(blocked('is cancelled'));
      await expect(cancelLifecycle(models, { cycleId, reason: 'again', host: control })).rejects.toThrow(
        blocked('cancelled already'),
      );
      expect((await journal(cycleId)).at(-1)).toMatchObject({
        operation: 'lifecycle.cancel',
        resultSummary: { reason: 'moved to the next cycle' },
      });
    });
  });

  describe('the stage verifiers', () => {
    const cycleOf = (references = {}) => ({
      cycleId: 'dd-test-202611050000-abcdef',
      deployId: 'dd-test',
      createdAt: new Date(Date.now() - 1000),
      references,
    });
    const stream = (name) => ({ name, kind: 'mongodb', open: async () => Readable.from([Buffer.from(name)]) });

    it('takes an infrastructure backup only with a passing restore drill', async () => {
      const cycle = cycleOf();
      const verify = (input) => STAGE_VERIFIERS['infrastructure-backup']({ cycle, store, input });
      await expect(verify()).rejects.toThrow(blocked('No backup of dd-test since the cycle started'));

      const placement = { environment: 'production', context: 'underpost-production', namespaces: { mongodb: 'data' } };
      const manifest = await writeBackup({
        store,
        deployId: 'dd-test',
        profile: DR_BACKUP_PROFILE,
        source: placement,
        streams: [stream('cyberia')],
      });
      await recordVerification({
        store,
        manifest,
        report: { ok: true, checkedAt: '2026-11-05T10:00:00.000Z', restoreTest: { ok: false } },
      });
      await expect(verify()).rejects.toThrow(blocked('no verification with a passing restore drill'));
      await expect(verify({ backup: '20990101T000000Z-000000' })).rejects.toThrow(blocked('No available backup'));

      await recordVerification({
        store,
        manifest,
        report: {
          ok: true,
          checkedAt: '2026-11-05T11:00:00.000Z',
          restoreTest: { ok: true, namespaces: 4, restoreMs: 120 },
        },
      });
      expect(await verify()).toEqual({
        evidence: {
          backupId: manifest.backupId,
          createdAt: expect.anything(),
          verifiedAt: '2026-11-05T11:00:00.000Z',
          placement,
          restoreDrill: { namespaces: 4, restoreMs: 120 },
        },
        references: { backupId: manifest.backupId },
      });
    });

    it('keeps one baseline per cycle and takes it only verified', async () => {
      const manifest = await writeBackup({
        store,
        deployId: 'dd-test',
        profile: BASELINE_PROFILE,
        streams: [stream('release-db')],
        meta: {
          schema: BASELINE_SCHEMA_VERSION,
          capturedAt: '2026-11-05T09:00:00.000Z',
          release: { releaseId: 'v1-0-0', source: { sourceRevision: 'a'.repeat(40) }, content: { digest: DIGEST } },
          scope: { files: 2, owned: 1 },
        },
      });
      const captured = await STAGE_VERIFIERS['baseline-capture']({
        cycle: cycleOf(),
        store,
        input: { baseline: manifest.backupId },
      });
      expect(captured).toEqual({
        evidence: {
          baselineId: manifest.backupId,
          capturedAt: '2026-11-05T09:00:00.000Z',
          releaseId: 'v1-0-0',
          sourceRevision: 'a'.repeat(40),
          contentDigest: DIGEST,
          files: 2,
          owned: 1,
        },
        references: { baselineId: manifest.backupId, baselineReleaseId: 'v1-0-0' },
      });
      const kept = cycleOf(captured.references);
      await expect(
        STAGE_VERIFIERS['baseline-capture']({ cycle: kept, store, input: { baseline: '20990101T000000Z-000000' } }),
      ).rejects.toThrow(
        blocked(`20990101T000000Z-000000 is not the baseline of cycle ${kept.cycleId}: it keeps ${manifest.backupId}`),
      );
      await expect(STAGE_VERIFIERS['baseline-capture']({ cycle: cycleOf(), store })).rejects.toThrow(
        blocked('Name the baseline'),
      );

      await expect(STAGE_VERIFIERS['baseline-verify']({ cycle: kept, store })).rejects.toThrow(
        blocked('has no passing verification'),
      );
      await recordVerification({ store, manifest, report: { ok: false, checkedAt: '2026-11-05T10:00:00.000Z' } });
      await expect(STAGE_VERIFIERS['baseline-verify']({ cycle: kept, store })).rejects.toThrow(
        blocked('has no passing verification'),
      );
      await recordVerification({ store, manifest, report: { ok: true, checkedAt: '2026-11-05T11:00:00.000Z' } });
      expect(await STAGE_VERIFIERS['baseline-verify']({ cycle: kept, store })).toEqual({
        evidence: { baselineId: manifest.backupId, verifiedAt: '2026-11-05T11:00:00.000Z' },
        references: {},
      });
    });

    describe('on the source checkouts', () => {
      const saved = {};
      const env = {
        ...process.env,
        GIT_AUTHOR_NAME: 'lifecycle',
        GIT_AUTHOR_EMAIL: 'lifecycle@test',
        GIT_COMMITTER_NAME: 'lifecycle',
        GIT_COMMITTER_EMAIL: 'lifecycle@test',
      };
      const git = (cwd, ...args) =>
        execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      let content;
      let deployment;

      beforeEach(() => {
        for (const key of ['CYBERIA_CONTENT_ROOT', 'CYBERIA_DEPLOYMENT_ROOT']) saved[key] = process.env[key];
        const root = fs.mkdtempSync(path.join(scratch, 'checkouts-'));
        content = path.join(root, 'cyberia-content');
        fs.mkdirSync(path.join(content, 'src'), { recursive: true });
        fs.writeFileSync(path.join(content, 'src/world.json'), '{}\n');
        git(root, 'init', '-q', content);
        git(content, 'add', '.');
        git(content, 'commit', '-qm', 'content');
        git(root, 'init', '-q', '--bare', 'deployment.git');
        git(root, 'clone', '-q', 'deployment.git', 'cyberia-deployment');
        deployment = path.join(root, 'cyberia-deployment');
        fs.writeFileSync(path.join(deployment, 'README.md'), 'deployment\n');
        git(deployment, 'add', '.');
        git(deployment, 'commit', '-qm', 'deployment');
        git(deployment, 'push', '-q', '-u', 'origin', 'HEAD');
        process.env.CYBERIA_CONTENT_ROOT = content;
        process.env.CYBERIA_DEPLOYMENT_ROOT = deployment;
      });

      afterEach(() => {
        for (const [key, value] of Object.entries(saved))
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
      });

      const lock = (revision) =>
        writeSourceLockFile(path.join(deployment, SOURCE_LOCK_FILE), {
          'cyberia-content': {
            repository: 'acme/cyberia-content',
            revision,
            artifact: { version: '1.2.3', digest: DIGEST },
          },
        });

      it('reviews only a committed content source, and releases only the reviewed revision, locked and pushed', async () => {
        fs.writeFileSync(path.join(content, 'src/world.json'), '{"changed":true}\n');
        await expect(STAGE_VERIFIERS['source-review']()).rejects.toThrow(blocked('not committed'));
        git(content, 'commit', '-qam', 'reviewed');
        const contentRevision = git(content, 'rev-parse', 'HEAD');
        expect(await STAGE_VERIFIERS['source-review']()).toEqual({
          evidence: { contentRevision },
          references: { contentRevision },
        });

        const cycle = cycleOf({ contentRevision });
        const release = () => STAGE_VERIFIERS['source-release']({ cycle });
        lock(git(content, 'rev-parse', 'HEAD~1'));
        await expect(release()).rejects.toThrow(blocked('not the reviewed'));
        lock(contentRevision);
        await expect(release()).rejects.toThrow(blocked('changes that are not committed'));
        git(deployment, 'add', SOURCE_LOCK_FILE);
        git(deployment, 'commit', '-qm', 'lock');
        await expect(release()).rejects.toThrow(blocked('not the lock commit'));
        // A publication pushes to a URL: the branch keeps no upstream, and no remote-tracking ref moves.
        git(deployment, 'branch', '--unset-upstream');
        git(deployment, 'push', '-q', path.join(deployment, '../deployment.git'), 'HEAD');
        const released = await release();
        expect(released).toEqual({
          evidence: {
            lockDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
            deploymentRevision: git(deployment, 'rev-parse', 'HEAD'),
            sources: { 'cyberia-content': contentRevision },
            contentVersion: '1.2.3',
            contentDigest: DIGEST,
          },
          references: { lockDigest: released.evidence.lockDigest, contentDigest: DIGEST },
        });
        git(deployment, 'remote', 'set-url', 'origin', path.join(deployment, '../missing.git'));
        await expect(release()).rejects.toThrow(blocked('answers no'));
      });

      it('reviews only a source whose release instances bind each item to one definition', async () => {
        const bind = (code, cid) => {
          const dir = path.join(content, 'src/content/instances', code, 'object-layers');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'hatchet.json'), JSON.stringify({ cid }));
        };
        bind(DEFAULT_INSTANCE_CODE, 'cid-a');
        bind('test', 'cid-b');
        bind('fallback', 'cid-x');
        git(content, 'add', '.');
        git(content, 'commit', '-qm', 'worlds');
        await expect(STAGE_VERIFIERS['source-review']()).rejects.toThrow(
          blocked(`hatchet: ${DEFAULT_INSTANCE_CODE} cid-a, test cid-b`),
        );
        bind('test', 'cid-a');
        git(content, 'commit', '-qam', 'one definition');
        expect(await STAGE_VERIFIERS['source-review']()).toMatchObject({
          evidence: { contentRevision: git(content, 'rev-parse', 'HEAD') },
        });
      });

      it('resets the workspace only from the build of the committed live export of the cycle', () => {
        const world = path.join(content, 'src/content/instances/test/maps');
        fs.mkdirSync(world, { recursive: true });
        fs.writeFileSync(path.join(world, 'outpost.json'), '{"code":"outpost"}');
        const names = ['test', GLOBAL_CONTENT_DIR];
        const cycle = {
          ...cycleOf(),
          executions: [
            {
              stage: 'source-export',
              targetId: 'source:workstation/cyberia-content',
              status: 'completed',
              evidence: {
                exported: names.map((name) => ({ name })),
                sourceDigest: treeDigest(names.map(exportSourceDir)),
              },
              at: new Date(),
            },
          ],
        };
        const artifact = (sourceRevision) => {
          fs.mkdirSync(path.join(content, 'dist'), { recursive: true });
          fs.writeFileSync(
            path.join(content, 'dist/manifest.json'),
            JSON.stringify({
              repository: 'acme/cyberia-content',
              schemaVersion: CONTENT_SCHEMA_VERSION,
              contentVersion: '1.0.0',
              sourceRevision,
              build: {},
              contentDigest: `sha256:${crypto.createHash('sha256').update('').digest('hex')}`,
              files: {},
              instances: [],
              sagas: [],
              global: [],
            }),
          );
        };
        const reset = () => assertExportArtifact(cycle, { targets: {} });
        expect(reset).toThrow(blocked('does not hold the live export of this cycle as a commit'));
        git(content, 'add', '.');
        git(content, 'commit', '-qm', 'the live export');
        artifact(git(content, 'rev-parse', 'HEAD~1'));
        expect(reset).toThrow(blocked('is not the build of the cyberia-content commit'));
        artifact(git(content, 'rev-parse', 'HEAD'));
        expect(reset).not.toThrow();
        fs.writeFileSync(path.join(world, 'outpost.json'), '{"code":"edited"}');
        git(content, 'commit', '-qam', 'an edit before the reset');
        artifact(git(content, 'rev-parse', 'HEAD'));
        expect(reset).toThrow(blocked('does not hold the live export'));
      });
    });

    it('closes on the release that serves the locked content, once every live server reports it', async () => {
      const Release = models.CyberiaContentRelease;
      const deploy = (references) => STAGE_VERIFIERS['production-deploy']({ cycle: cycleOf(references), models });
      await expect(deploy({ contentDigest: DIGEST })).rejects.toThrow(blocked('No content release is active'));
      await Release.collection.insertOne({
        releaseId: 'v2',
        database: 'cyberia-content-v2',
        status: 'active',
        content: { version: '1.2.3', digest: DIGEST },
        validation: { ok: false },
        promotedAt: new Date(),
        audit: [
          {
            at: new Date(),
            by: 'operator@control-1',
            action: 'discard-live-changes',
            detail: { discarded: 'v1', changes: ['cyberia-map'], reason: 'exported to source' },
          },
        ],
      });
      await expect(deploy({ contentDigest: `sha256:${'d'.repeat(64)}` })).rejects.toThrow(blocked('not the locked'));
      await expect(deploy({ contentDigest: DIGEST })).rejects.toThrow(blocked('no passing validation'));
      await Release.collection.updateOne({ releaseId: 'v2' }, { $set: { 'validation.ok': true } });
      expect(await deploy({ contentDigest: DIGEST })).toMatchObject({
        evidence: {
          releaseId: 'v2',
          contentDigest: DIGEST,
          discarded: [
            { release: 'v1', changes: ['cyberia-map'], reason: 'exported to source', by: 'operator@control-1' },
          ],
        },
        references: { releaseId: 'v2' },
      });

      const converge = (releaseId) => STAGE_VERIFIERS['runtime-verify']({ cycle: cycleOf({ releaseId }), models });
      await expect(converge('v3')).rejects.toThrow(blocked('the cycle deployed another one'));
      await expect(converge('v2')).rejects.toThrow(blocked('No live game server reports'));
      const server = (serverId, instanceCode, releaseId) => ({
        serverId,
        url: `wss://${serverId}`,
        instanceCode,
        state: 'ready',
        seq: 1,
        releaseId,
        startedAt: new Date(),
        lastSeen: new Date(),
      });
      await models.CyberiaServerRegistry.collection.insertMany([
        server('s1', 'cyberia-main', 'v2'),
        server('s2', 'test', 'v1'),
      ]);
      await expect(converge('v2')).rejects.toThrow(blocked('1 of 2 game server(s) serve another release: s2 v1'));
      await models.CyberiaServerRegistry.collection.updateOne({ serverId: 's2' }, { $set: { releaseId: 'v2' } });
      expect(await converge('v2')).toEqual({
        evidence: { releaseId: 'v2', servers: 2, instances: ['cyberia-main', 'test'] },
        references: {},
      });
    });
  });
});

// The real CLI on the nodes of one deployment, each a pod directory with the WireGuard topology and
// its own node document: a control node, a worker, a workstation and an unenrolled host. The control
// node keeps the cycles in the runtime database; the workstation reaches them through a share, and
// writes only to the MongoDB a Development Sandbox session of this host serves.
describe.skipIf(!mongodBinary)('the content lifecycle CLI across nodes', () => {
  const cli = new URL('../../../bin/cyberia.js', import.meta.url).pathname;
  const WORKSPACE = ['cyberia-map', 'cyberia-instance', 'cyberia-instance-conf', 'cyberia-saga'];
  const nodeName = os.hostname().split('.')[0];
  const HUB = '10.9.0.1';
  // Loopback addresses stand in for tunnel addresses: the share binds the control address, and a
  // connection to it leaves from 127.0.0.1, the workstation address.
  const PEERS = { control: '127.0.0.2', worker: '127.0.0.3', workstation: '127.0.0.1' };
  let mongod;
  let local;
  let client;
  let root;
  let sandbox;
  let served;
  let servedLocal;
  const pods = {};

  /** A pod directory: the deployment conf, the topology, and the node document of `role` named after this host. */
  const pod = (name, role) => {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, 'engine-private/conf/dd-x'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'engine-private/deploy/nodes'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'engine-private/conf/dd-x/conf.server.json'),
      JSON.stringify({
        h: {
          '/': {
            apis: [...WORKSPACE, ...LIFECYCLE_APIS],
            db: {
              provider: 'mongoose',
              host: mongod.host,
              name: 'cyberia',
              replicaSet: 'nodeset',
              partitions: { content: { name: 'cyberia-content', apis: WORKSPACE } },
            },
          },
        },
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'engine-private/deploy/conf.wireguard.json'),
      JSON.stringify({
        [HUB]: {
          address: '10.0.0.1/24',
          publicKey: 'hubPublicKeyFixture=',
          peers: Object.entries(PEERS).map(([peer, address]) => ({ id: `${peer}-peer`, address })),
        },
      }),
    );
    const document = (file, nodeRole) =>
      fs.writeFileSync(
        path.join(dir, `engine-private/deploy/nodes/${file}.json`),
        JSON.stringify({ role: nodeRole, hubHost: HUB, peerId: `${nodeRole}-peer` }),
      );
    if (role) document(nodeName, role);
    // The documents of the other nodes, under names this host does not have.
    for (const other of Object.keys(PEERS)) if (other !== role) document(`${other}-node`, other);
    return dir;
  };

  /**
   * Runs the CLI in a pod against `mongoHost` (the runtime database by default), with `env` added;
   * asynchronous, so this process keeps reading the mongod it started.
   */
  const runWith = (at, { mongoHost = mongod.host, env: added = {} }, ...args) =>
    new Promise((resolve) => {
      const env = {
        ...process.env,
        DEFAULT_DEPLOY_ID: 'dd-x',
        DEFAULT_DEPLOY_HOST: 'h',
        DEFAULT_DEPLOY_PATH: '/',
        CYBERIA_CONTENT_ROOT: path.join(root, 'no-content'),
        CYBERIA_DEPLOYMENT_ROOT: path.join(root, 'no-deployment'),
        UNDERPOST_OBJECT_STORE: `file:${path.join(root, 'store')}`,
        npm_config_prefix: path.join(root, 'npm-global'),
      };
      for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET', SHARE_ENV]) delete env[key];
      Object.assign(env, added);
      const child = spawn(process.execPath, [cli, ...args, '--mongo-host', mongoHost], { cwd: pods[at], env });
      let stdout = '';
      let output = '';
      child.stdout.on('data', (chunk) => ((stdout += chunk), (output += chunk)));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.on('close', (status) => resolve({ status, stdout, output }));
    });
  const run = (at, ...args) => runWith(at, {}, ...args);
  /** The JSON document a command prints last. */
  const json = ({ stdout }) => {
    const at = stdout.lastIndexOf('\n{\n') + 1;
    return JSON.parse(stdout.slice(at, stdout.indexOf('\n}', at) + 2));
  };
  const runtime = () => client.db('cyberia');
  const events = (cycleId) =>
    runtime().collection('cyberiacontentlifecycleevents').find({ cycleId }).sort({ seq: 1 }).toArray();

  beforeAll(async () => {
    mongod = await startMongod('cyberia', { replSet: 'nodeset' });
    local = await startMongod('cyberia', { replSet: 'nodeset' });
    client = await new mongoose.mongo.MongoClient(mongod.uri).connect();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-lifecycle-cli-'));
    for (const role of Object.keys(PEERS)) pods[role] = pod(role, role);
    pods.unenrolled = pod('unenrolled', '');
    sandbox = installSandbox();
    served = await mongoSandboxSession(sandbox, { sandboxId: 'kind', mongoHost: mongod.host });
    servedLocal = await mongoSandboxSession(sandbox, { sandboxId: 'local', mongoHost: local.host });
  }, 60000);

  afterAll(async () => {
    await served?.session.close();
    await servedLocal?.session.close();
    sandbox?.restore();
    await client?.close();
    await mongod?.stop();
    await local?.stop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('runs each stage only on the node that may run it, records every refusal, and keeps the records through a workspace drop', async () => {
    const started = await run('control', 'content', 'lifecycle', 'start', '--saga', 'frontier');
    expect(started.status, started.output).toBe(0);
    const { cycleId, next } = json(started);
    expect(next).toMatchObject({ id: 'preflight' });

    const doctor = await run('control', 'content', 'lifecycle', 'doctor', cycleId);
    expect(doctor.status, doctor.output).toBe(0);
    expect(json(doctor)).toMatchObject({
      node: { nodeName, role: 'control', peerId: 'control-peer', tunnel: { hubHost: HUB, address: PEERS.control } },
      execution: {
        deployId: 'dd-x',
        environment: 'production',
        contexts: ['infrastructure-control', 'production-deployment'],
        cycles: 'this host',
      },
      security: {
        kubernetesAdministration: 'available',
        contexts: {
          'content-development': 'refused: needs a workstation node, in the development environment (--dev)',
        },
      },
      sandbox: null,
      plan: { next: { id: 'infrastructure-backup', here: true } },
    });

    // --dev selects an environment; it never makes a worker a control node.
    const fromWorker = await run(
      'worker',
      'content',
      'lifecycle',
      'verify',
      'infrastructure-backup',
      '--cycle',
      cycleId,
      '--dev',
    );
    expect(fromWorker.status, fromWorker.output).toBe(3);
    expect(fromWorker.output).toContain('needs a host that is infrastructure-control');

    // A control node may run it, and the stage still needs its proof: no backup exists.
    const unproven = await run(
      'control',
      'content',
      'lifecycle',
      'verify',
      'infrastructure-backup',
      '--cycle',
      cycleId,
    );
    expect(unproven.status, unproven.output).toBe(3);
    expect(unproven.output).toContain('No backup of dd-x since the cycle started');

    // Neither a host with no node document nor a Kubernetes node takes a workstation stage.
    for (const at of ['unenrolled', 'worker']) {
      const reset = await run(at, 'content', 'workspace', 'reset', '--confirm', 'dd-x', '--cycle', cycleId, '--dev');
      expect(reset.status, reset.output).toBe(3);
      expect(reset.output).toContain('needs a host that is content-development; this one is none');
    }
    const workerDrop = await run(
      'worker',
      'content',
      'workspace',
      'drop',
      '--confirm',
      'dd-x',
      '--cycle',
      cycleId,
      '--dev',
    );
    expect(workerDrop.status, workerDrop.output).toBe(3);
    expect(workerDrop.output).toContain('needs a host that takes part in it; this one takes no context');

    // A workspace drop on the workstation, with the player records: the lifecycle records stay.
    await client.db('cyberia-content').collection('cyberiamaps').insertOne({ code: 'outpost' });
    const unconfirmed = await run('workstation', 'content', 'workspace', 'drop', '--cycle', cycleId, '--dev');
    expect(unconfirmed.status, unconfirmed.output).toBe(3);
    const counted = await run('workstation', 'content', 'workspace', 'drop', '--confirm', 'dd-x', '--dry-run', '--dev');
    expect(counted.status, counted.output).toBe(0);
    expect(json(counted)).toMatchObject({ dryRun: true, counts: { 'cyberia-map': 1 } });
    expect(await client.db('cyberia-content').collection('cyberiamaps').countDocuments()).toBe(1);
    // A drop outside a sandbox session refuses before it writes.
    const unserved = await run('workstation', 'content', 'workspace', 'drop', '--confirm', 'dd-x', '--dev');
    expect(unserved.status, unserved.output).toBe(3);
    expect(unserved.output).toContain('is not the MongoDB of a Development Sandbox session of this host');
    expect(await client.db('cyberia-content').collection('cyberiamaps').countDocuments()).toBe(1);
    const before = await events(cycleId);
    const dropped = await runWith(
      'workstation',
      { mongoHost: served.mongoHost },
      'content',
      'workspace',
      'drop',
      '--confirm',
      'dd-x',
      '--include-runtime',
      '--cycle',
      cycleId,
      '--dev',
    );
    expect(dropped.status, dropped.output).toBe(0);
    expect(json(dropped)).toMatchObject({ dryRun: false, dropped: { 'cyberia-map': 1 } });
    expect(await client.db('cyberia-content').collection('cyberiamaps').countDocuments()).toBe(0);
    const after = await events(cycleId);
    expect(after.slice(0, before.length)).toEqual(before);

    expect(
      after.map(({ stage, operation, status, node }) => `${stage || operation} ${status} ${node.role || 'none'}`),
    ).toEqual([
      'lifecycle.start succeeded control',
      'preflight succeeded control',
      'infrastructure-backup blocked worker',
      'infrastructure-backup blocked control',
      'workspace-reset blocked none',
      'workspace-reset blocked worker',
      'workspace.drop blocked workstation',
      'workspace.drop succeeded workstation',
    ]);
    expect(after.at(-1).node).toEqual({ nodeName, role: 'workstation', peerId: 'workstation-peer' });

    const handoff = await run('worker', 'content', 'lifecycle', 'handoff', cycleId, '--dev');
    expect(handoff.status, handoff.output).toBe(0);
    expect(handoff.stdout).toContain('Next:\n  Infrastructure backup (infrastructure-backup): blocked');
    expect(handoff.stdout).toContain(
      `Enrolled control nodes:\n  control-node: peer control-peer, tunnel address ${PEERS.control}`,
    );
    expect(handoff.stdout).toContain('This host:\n  this host is not infrastructure-control');
    expect(handoff.stdout).toContain(`cyberia content lifecycle verify infrastructure-backup --cycle ${cycleId}`);

    const cancelled = await run('control', 'content', 'lifecycle', 'cancel', cycleId, '--reason', 'end of the test');
    expect(cancelled.status, cancelled.output).toBe(0);
    const closed = await run('control', 'content', 'lifecycle', 'verify', 'infrastructure-backup', '--cycle', cycleId);
    expect(closed.status, closed.output).toBe(3);
    expect(closed.output).toContain('is cancelled');
    const inspected = await run('control', 'content', 'lifecycle', 'inspect', cycleId, '--events', '2');
    expect(inspected.status, inspected.output).toBe(0);
    expect(json(inspected)).toMatchObject({ cycle: { cycleId, status: 'cancelled' } });
    expect(json(inspected).events.map(({ operation, stage }) => stage || operation)).toEqual([
      'infrastructure-backup',
      'lifecycle.cancel',
    ]);
  }, 240000);

  it('refuses a development drop in the replica set the baseline of its cycle came from', async () => {
    const started = await run('control', 'content', 'lifecycle', 'start', '--instance', 'test');
    expect(started.status, started.output).toBe(0);
    const { cycleId } = json(started);
    process.env.UNDERPOST_BACKUP_KEY ??= crypto.randomBytes(32).toString('hex');
    const { config } = await client.db('admin').command({ replSetGetConfig: 1 });
    const baseline = await writeBackup({
      store: objectStore(`file:${path.join(root, 'store')}`),
      deployId: 'dd-x',
      profile: BASELINE_PROFILE,
      streams: [{ name: 'release-db', kind: 'mongodb', open: async () => Readable.from([Buffer.from('release')]) }],
      source: { mongodb: { replicaSetId: config.settings.replicaSetId.toHexString() } },
      meta: { schema: BASELINE_SCHEMA_VERSION },
    });
    await runtime()
      .collection('cyberiacontentlifecycles')
      .updateOne({ cycleId }, { $set: { 'references.baselineId': baseline.backupId } });
    const maps = client.db('cyberia-content').collection('cyberiamaps');
    await maps.insertOne({ code: 'served-map' });

    const refused = await runWith(
      'workstation',
      { mongoHost: served.mongoHost },
      ...['content', 'workspace', 'drop', '--confirm', 'dd-x', '--cycle', cycleId, '--dev'],
    );
    expect(refused.status, refused.output).toBe(3);
    expect(refused.output).toContain(`the one baseline ${baseline.backupId} was captured from`);
    expect(await maps.countDocuments({ code: 'served-map' })).toBe(1);
    expect((await events(cycleId)).at(-1)).toMatchObject({ operation: 'workspace.drop', status: 'blocked' });

    const doctor = await runWith(
      'workstation',
      { mongoHost: served.mongoHost },
      ...['content', 'lifecycle', 'doctor', cycleId, '--dev'],
    );
    expect(doctor.status, doctor.output).toBe(0);
    const report = json(doctor);
    expect(report.security).toMatchObject({ kubernetesAdministration: 'unavailable' });
    expect(report.sandbox).toMatchObject({
      target: {
        id: 'sandbox:workstation-peer/kind',
        identity: { sandboxId: 'kind', replicaSetId: config.settings.replicaSetId.toHexString() },
      },
      session: { sandboxId: 'kind', kubeContext: 'kind-kind' },
      services: [{ id: 'mongodb', endpoint: served.mongoHost, forward: 'ready', ready: true }],
      productionExclusion: expect.stringContaining(`the one baseline ${baseline.backupId} was captured from`),
      baselineRestore: 'not applicable: the cycle names no baseline release',
    });
  }, 120000);

  it('follows the source stages of the workstation on a control node that holds a content checkout', async () => {
    const started = await run('control', 'content', 'lifecycle', 'start', '--instance', 'test');
    expect(started.status, started.output).toBe(0);
    const { cycleId } = json(started);
    const cycles = runtime().collection('cyberiacontentlifecycles');
    const cycle = await cycles.findOne({ cycleId });
    const controlHost = { node: { nodeName: 'control-node', role: 'control' }, targets: {} };
    const laptop = {
      node: { nodeName: 'laptop', role: 'workstation' },
      targets: {
        sandbox: executionTarget('sandbox', 'laptop/kind', {}),
        source: executionTarget('source', 'laptop/cyberia-content', {}),
      },
    };
    for (const { id, target } of LIFECYCLE_STAGES.slice(0, LIFECYCLE_STAGE_ORDER.indexOf('production-deploy'))) {
      const recorder = target === 'deployment' ? controlHost : laptop;
      const { execution } = stageExecution(cycle, id, recorder, { status: 'succeeded', evidence: { of: id } });
      cycle.executions.push({ ...execution, eventId: `event-${id}`, node: recorder.node, at: new Date() });
    }
    await cycles.updateOne({ cycleId }, { $set: { executions: cycle.executions } });
    const checkout = path.join(root, 'control-content');
    fs.mkdirSync(path.join(checkout, 'src'), { recursive: true });

    const planned = await runWith(
      'control',
      { env: { CYBERIA_CONTENT_ROOT: checkout } },
      'content',
      'lifecycle',
      'plan',
      cycleId,
    );
    expect(planned.status, planned.output).toBe(0);
    expect(json(planned).next).toMatchObject({ id: 'production-deploy', here: true });
  }, 240000);

  describe('a share of one cycle with one workstation', () => {
    let cwd;
    let saved;
    let openLifecycleShare;

    // An import of the CLI loads the engine env into this process: the block puts it back.
    beforeAll(async () => {
      saved = { ...process.env };
      ({ openLifecycleShare } = await import('../../../bin/cyberia.js'));
    });

    afterAll(() => {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    });

    beforeEach(() => {
      cwd = process.cwd();
      for (const [key, value] of Object.entries({
        DEFAULT_DEPLOY_ID: 'dd-x',
        DEFAULT_DEPLOY_HOST: 'h',
        DEFAULT_DEPLOY_PATH: '/',
        DB_USER: '',
        DB_PASSWORD: '',
        DB_AUTH_SOURCE: '',
        DB_REPLICA_SET: '',
        [SHARE_ENV]: '',
      }))
        vi.stubEnv(key, value);
      vi.spyOn(Underpost.db, 'databasePlan').mockReturnValue([{ provider: 'mongoose' }]);
      vi.spyOn(MongoBootstrap, 'getPrimaryPodName').mockReturnValue('mongodb-1');
    });

    afterEach(() => {
      process.chdir(cwd);
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    /** A forward that reaches the runtime database the way the forward to the primary does. */
    const forwardTo = () => {
      const close = vi.fn();
      const forward = vi
        .spyOn(Underpost.kubectl, 'portForward')
        .mockResolvedValue({ localPort: Number(mongod.host.split(':')[1]), close, ended: new Promise(() => {}) });
      return { close, forward };
    };
    const post = (port, token, route, body) =>
      new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: PEERS.control,
            port,
            path: route,
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          },
          (response) => {
            let text = '';
            response.on('data', (chunk) => (text += chunk));
            response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
          },
        );
        req.on('error', reject);
        req.end(JSON.stringify(body));
      });
    const request = (port, { path: route = '/cycle', token, localAddress } = {}) =>
      new Promise((resolve, reject) =>
        http
          .get(
            { host: PEERS.control, port, path: route, localAddress, headers: { authorization: `Bearer ${token}` } },
            (response) => {
              let body = '';
              response.on('data', (chunk) => (body += chunk));
              response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
            },
          )
          .on('error', reject),
      );

    it('answers only its workstation peer, records only the stages of its role, and leaves no port when it closes', async () => {
      const started = await run('control', 'content', 'lifecycle', 'start', '--instance', 'test');
      const { cycleId } = json(started);
      forwardTo();
      process.chdir(pods.control);
      const share = await openLifecycleShare(cycleId, { port: '0' });
      try {
        expect(share).toMatchObject({
          deployId: 'dd-x',
          peer: { peerId: 'workstation-peer', nodeName: 'workstation-node' },
        });
        const { token, port } = parseShareHandle(share.handle);
        expect(share.address).toBe(`${PEERS.control}:${port}`);
        expect((await events(cycleId)).at(-1)).toMatchObject({
          operation: 'lifecycle.share.open',
          node: { role: 'control' },
          resultSummary: { shareId: share.shareId, peerId: 'workstation-peer', address: share.address },
        });
        const stored = await runtime().collection('cyberiacontentlifecycles').findOne({ cycleId });
        expect(stored.shares).toEqual([
          expect.objectContaining({ shareId: share.shareId, peerId: 'workstation-peer', closedAt: null }),
        ]);
        for (const written of [await events(cycleId), stored]) expect(JSON.stringify(written)).not.toContain(token);

        // Another peer, or the peer without the token, reads nothing; the peer reads no token digest.
        expect(await request(port, { token, localAddress: PEERS.worker })).toMatchObject({ status: 403 });
        expect(await request(port, { token: 'x'.repeat(43) })).toMatchObject({ status: 401 });
        const read = await request(port, { token });
        expect(read).toMatchObject({
          status: 200,
          body: { cycleId, shares: [{ shareId: share.shareId, state: 'open' }] },
        });
        expect(read.body.shares[0]).not.toHaveProperty('tokenDigest');

        // A peer records only for its own targets, and its node comes from the topology.
        const forged = await post(port, token, '/record', {
          stage: 'baseline-restore',
          status: 'succeeded',
          host: { environment: 'development', nodeName: 'control-node', role: 'control' },
          targets: { sandbox: { kind: 'sandbox', id: 'sandbox:other-peer/kind', fingerprint: 'sha256:x' } },
        });
        expect(forged).toMatchObject({ status: 403, body: { code: 'forbidden' } });

        // The workstation CLI reads and records through the share; its data stays in its own database.
        const localClient = await new mongoose.mongo.MongoClient(local.uri).connect();
        try {
          const maps = (database) => database.db('cyberia-content').collection('cyberiamaps');
          await maps(client).insertOne({ code: 'production-map' });
          await maps(localClient).insertOne({ code: 'local-map' });
          const shared = { mongoHost: servedLocal.mongoHost, env: { [SHARE_ENV]: share.handle } };
          const dropped = await runWith(
            'workstation',
            shared,
            ...['content', 'workspace', 'drop', '--confirm', 'dd-x', '--cycle', cycleId, '--dev'],
          );
          expect(dropped.status, dropped.output).toBe(0);
          expect(await maps(localClient).countDocuments()).toBe(0);
          expect(await maps(client).countDocuments({ code: 'production-map' })).toBe(1);
          // The share names the node from the topology, not from the caller.
          expect((await events(cycleId)).at(-1)).toMatchObject({
            operation: 'workspace.drop',
            status: 'succeeded',
            environment: 'development',
            node: { nodeName: 'workstation-node', role: 'workstation', peerId: 'workstation-peer' },
          });
          expect(await localClient.db('cyberia').collection('cyberiacontentlifecycleevents').countDocuments()).toBe(0);

          const doctor = await runWith('workstation', shared, 'content', 'lifecycle', 'doctor', cycleId, '--dev');
          expect(doctor.status, doctor.output).toBe(0);
          expect(json(doctor)).toMatchObject({
            node: { role: 'workstation', peerId: 'workstation-peer' },
            execution: { contexts: ['content-development'], cycles: `share ${share.address}` },
            security: { kubernetesAdministration: 'unavailable' },
          });
          const listed = await runWith('workstation', shared, 'content', 'lifecycle', 'list', '--dev');
          expect(listed.status, listed.output).toBe(3);
          expect(listed.output).toContain('runs where the cycles are, on the control node');
        } finally {
          await localClient.close();
        }

        // A production stage from the workstation: refused, and only a refusal reaches the journal.
        const capture = await runWith(
          'workstation',
          { env: { [SHARE_ENV]: share.handle } },
          ...['content', 'lifecycle', 'verify', 'baseline-capture', '--cycle', cycleId],
        );
        expect(capture.status, capture.output).toBe(3);
        expect((await events(cycleId)).at(-1)).toMatchObject({
          operation: 'stage.refused',
          status: 'blocked',
          resultSummary: { stage: 'baseline-capture' },
        });
        const cycle = await runtime().collection('cyberiacontentlifecycles').findOne({ cycleId });
        expect(cycle.executions.filter(({ stage }) => stage === 'baseline-capture')).toEqual([]);
      } finally {
        await share.close();
      }
      const [, port] = share.address.split(':');
      await expect(request(Number(port), { token: 'x' })).rejects.toThrow('ECONNREFUSED');
      expect((await events(cycleId)).at(-1)).toMatchObject({
        operation: 'lifecycle.share.close',
        resultSummary: { shareId: share.shareId, answered: expect.any(Number), refused: expect.any(Number) },
      });
      const closed = await runtime().collection('cyberiacontentlifecycles').findOne({ cycleId });
      expect(closed.shares[0]).toMatchObject({ closeReason: 'closed', closedAt: expect.any(Date) });
    }, 120000);

    /** What the monitor of an engine in a pod answers, run in a process of its own as the engine runs. */
    const monitorFrom = (at, cycleId, mongoHost, added) =>
      new Promise((resolve) => {
        const env = { ...process.env, CYCLE_ID: cycleId, ...added };
        for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete env[key];
        env.MONITOR_OPTIONS = JSON.stringify({
          host: 'monitor.test',
          path: '/',
          db: {
            provider: 'mongoose',
            host: mongoHost,
            name: 'cyberia',
            replicaSet: 'nodeset',
            partitions: { content: { name: 'cyberia-content', apis: WORKSPACE } },
          },
        });
        const module = (file) => JSON.stringify(new URL(file, import.meta.url).pathname);
        const child = spawn(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `const { DataBaseProviderService } = await import(${module('../../../src/db/database-provider.js')});
const monitor = await import(${module('../../../src/projects/cyberia/content/content-lifecycle-monitor.js')});
const identity = JSON.parse(process.env.MONITOR_OPTIONS);
await DataBaseProviderService.load({ apis: ${JSON.stringify(LIFECYCLE_APIS)}, ...identity });
const options = { host: identity.host, path: identity.path, services: { database: DataBaseProviderService.getDispatcher(identity) } };
const settle = (work) => work.then((value) => ({ value }), (error) => ({ error: { message: error.message, status: error.status } }));
console.log(JSON.stringify({
  runtime: await settle(monitor.monitorRuntime(options)),
  cycles: await settle(monitor.monitorCycles({ query: {} }, options)),
  plan: await settle(monitor.monitorPlan(process.env.CYCLE_ID, options)),
  events: await settle(monitor.monitorEvents({ cycleId: process.env.CYCLE_ID }, options)),
}));
process.exit(0);`,
          ],
          { cwd: pods[at], env },
        );
        let stdout = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.on('close', () => resolve({ raw: stdout, ...JSON.parse(stdout.slice(stdout.lastIndexOf('\n{') + 1)) }));
      });

    it('serves the shared cycle to the monitor of the workstation engine, and names why a share ends, never with its token', async (context) => {
      context.skip(insideContainer(), 'the monitor runs in a child process, which a container holds');
      const started = await run('control', 'content', 'lifecycle', 'start', '--instance', 'test');
      const { cycleId } = json(started);
      forwardTo();
      process.chdir(pods.control);
      const share = await openLifecycleShare(cycleId, { port: '0' });
      const { token } = parseShareHandle(share.handle);
      const monitor = () => monitorFrom('workstation', cycleId, servedLocal.mongoHost, { [SHARE_ENV]: share.handle });
      try {
        const connected = await monitor();
        expect(connected.runtime.value).toMatchObject({
          source: { kind: 'share' },
          node: { role: 'workstation', peerId: 'workstation-peer' },
          container: false,
          share: { state: 'connected', cycleId, address: share.address },
          sandbox: {
            state: 'ready',
            target: { id: 'sandbox:workstation-peer/local' },
            session: { sandboxId: 'local', kubeContext: 'kind-local' },
            services: [{ id: 'mongodb', endpoint: servedLocal.mongoHost, ready: true }],
          },
        });
        expect(connected.cycles.value.data).toEqual([expect.objectContaining({ cycleId })]);
        expect(connected.plan.value).toMatchObject({
          cycleId,
          targets: { sandbox: { id: 'sandbox:workstation-peer/local' } },
          shares: [{ shareId: share.shareId, state: 'open' }],
        });
        expect(connected.events.value.data.at(-1)).toMatchObject({ operation: 'lifecycle.start' });
        expect(connected.raw).not.toContain(token);

        const revoked = await run(
          'control',
          'content',
          'lifecycle',
          'revoke-share',
          cycleId,
          share.shareId,
          '--reason',
          'test',
        );
        expect(revoked.status, revoked.output).toBe(0);
        const ended = await monitor();
        expect(ended.runtime.value.share).toMatchObject({
          state: 'revoked',
          message: expect.stringContaining('new share'),
        });
        expect(ended.cycles.error).toEqual({
          status: 503,
          message: 'The share is revoked: ask the control node for a new share',
        });
        expect(ended.raw).not.toContain(token);
      } finally {
        await share.close();
      }
      // A share that no longer answers: the stand-in tunnel address is loopback, never an interface
      // address of a tunnel, so the monitor names the tunnel first.
      const closed = await monitor();
      expect(closed.runtime.value.share).toMatchObject({
        state: 'tunnel-down',
        message: `The tunnel address ${PEERS.workstation} is not on this host: bring the WireGuard tunnel up`,
      });
      expect(closed.cycles.error.status).toBe(503);
      expect(closed.raw).not.toContain(token);

      // Without a share, a workstation engine reads its own development database and says so.
      const local = await monitorFrom('workstation', cycleId, servedLocal.mongoHost, { [SHARE_ENV]: '' });
      expect(local.runtime.value).toMatchObject({ source: { kind: 'local' }, share: null });
      expect(local.plan.error).toMatchObject({ status: 404 });
    }, 120000);

    it('refuses every request once revoked, and records a share that ended without a close as expired', async () => {
      const started = await run('control', 'content', 'lifecycle', 'start', '--instance', 'test');
      const { cycleId } = json(started);
      forwardTo();
      process.chdir(pods.control);
      const share = await openLifecycleShare(cycleId, { port: '0' });
      const { token, port } = parseShareHandle(share.handle);
      try {
        const revoked = await run(
          'control',
          ...['content', 'lifecycle', 'revoke-share', cycleId, share.shareId, '--reason', 'laptop lost'],
        );
        expect(revoked.status, revoked.output).toBe(0);
        expect(json(revoked)).toMatchObject({ shareId: share.shareId, state: 'revoked' });
        expect(await request(port, { token })).toMatchObject({ status: 401, body: { code: 'revoked' } });
        expect((await events(cycleId)).at(-1)).toMatchObject({
          operation: 'lifecycle.share.revoke',
          resultSummary: { shareId: share.shareId, reason: 'laptop lost' },
        });
      } finally {
        await share.close();
      }

      // A share whose service died holds a lease nobody renews: the next control command expires it.
      const lapsed = new Date(Date.now() - 60000);
      await runtime()
        .collection('cyberiacontentlifecycles')
        .updateOne(
          { cycleId },
          {
            $push: {
              shares: {
                shareId: 'crashed',
                peerId: 'workstation-peer',
                nodeName: 'workstation-node',
                address: '',
                tokenDigest: 'sha256:x',
                openedAt: lapsed,
                expiresAt: new Date(Date.now() + 3600000),
                leaseUntil: lapsed,
                closedAt: null,
                closeReason: '',
              },
            },
          },
        );
      const listed = await run('control', 'content', 'lifecycle', 'list');
      expect(listed.status, listed.output).toBe(0);
      expect(listed.output).toContain('ended without a close: recorded as expired');
      expect((await events(cycleId)).at(-1)).toMatchObject({
        operation: 'lifecycle.share.expire',
        resultSummary: { shareId: 'crashed' },
      });
      const cycle = await runtime().collection('cyberiacontentlifecycles').findOne({ cycleId });
      expect(cycle.shares.find(({ shareId }) => shareId === 'crashed')).toMatchObject({ closeReason: 'expired' });
    }, 120000);

    it('runs only on a control node, for an enrolled workstation and an open cycle, and closes on a refusal', async () => {
      const { close, forward } = forwardTo();
      process.chdir(pods.worker);
      await expect(openLifecycleShare('dd-x-202611050000-abcdef', { port: '0' })).rejects.toMatchObject({
        outcome: 'blocked',
        message: 'A share runs on a control node; this one is worker',
      });

      process.chdir(pods.control);
      await expect(openLifecycleShare('dd-x-202611050000-abcdef', { port: '0' })).rejects.toThrow(
        'No content lifecycle dd-x-202611050000-abcdef',
      );
      const started = await run('control', 'content', 'lifecycle', 'start', '--instance', 'test');
      const { cycleId } = json(started);
      await expect(openLifecycleShare(cycleId, { port: '0', peerId: 'worker-peer' })).rejects.toThrow(
        `Peer worker-peer is not a workstation of hub ${HUB}; its workstation peers are workstation-peer (workstation-node)`,
      );
      await expect(openLifecycleShare(cycleId, { port: '0', dev: true })).rejects.toThrow('run it without --dev');
      expect(forward).toHaveBeenCalledTimes(3);
      expect(close).toHaveBeenCalledTimes(3);
    });
  });
});
