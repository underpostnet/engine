import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Underpost from '../../../src/index.js';
import { MongoBootstrap } from '../../../src/db/mongo/mongo-bootstrap.js';
import { isOciRuntime } from '../../../src/server/runtime/environment.js';
import { openLifecycleStore, reachDeployDb } from '../../../bin/cyberia.js';
import { NODE_ROLES, roleHasCapability } from '../../../src/server/network/node-capability.js';
import {
  parseShareHandle,
  shareClient,
  shareHandleFactory,
  shareState,
  shareView,
} from '../../../src/projects/cyberia/content/content-lifecycle-share.js';
import {
  CONTEXT_POLICY,
  CONTEXT_REQUIREMENTS,
  EXECUTION_CONTEXTS,
  LIFECYCLE_APIS,
  LIFECYCLE_STAGE_ORDER,
  LIFECYCLE_STAGES,
  SHARE_ENV,
  TARGET_KINDS,
  assertOperationReady,
  assertStageReady,
  cycleIdFactory,
  deploymentTarget,
  executionTarget,
  handoffText,
  hostContexts,
  lifecyclePlan,
  runsTargetKind,
  stageExecution,
  stageStates,
} from '../../../src/projects/cyberia/content/content-lifecycle.js';
import { CYCLE_ID_PATTERN } from '../../../src/api/cyberia-content-lifecycle/cyberia-content-lifecycle.model.js';

// The rules of a content lifecycle that need no database: which host may take which context, when an
// execution of a stage is complete or stale for its target, and what the plan of the next host says.
const host = (role, environment, { sources = true, targets = {} } = {}) => ({
  node: { nodeName: `${role || 'unenrolled'}-node`, role },
  environment,
  actor: 'operator@test',
  contexts: hostContexts({ role, environment, sources }),
  targets,
});

/** A Development Sandbox of a workstation: a recreated cluster has another kube-system uid. */
const sandbox = (node, uid = `${node}-uid`, databases) => ({
  ...executionTarget('sandbox', `${node}/kind`, { sandboxId: 'kind', kubeSystemUid: uid, replicaSetId: `${node}-rs` }),
  ...(databases && { databases }),
});

/** A cyberia-content checkout of a workstation at a revision. */
const checkout = (node, revision = 'r1') => ({
  ...executionTarget('source', `${node}/home/dd/engine/cyberia-content`, { branch: 'master' }),
  revision,
  changed: false,
});

const control = host('control', 'production');
const workstation = (targets) => ({
  ...host('workstation', 'development', { targets }),
  node: { nodeName: 'workstation-node', role: 'workstation' },
});

const cycleWith = (fields = {}) => ({
  cycleId: 'dd-test-202611050000-abcdef',
  deployId: 'dd-test',
  environment: 'production',
  status: 'in-progress',
  stageOrder: LIFECYCLE_STAGE_ORDER,
  scope: { sagas: ['frontier'] },
  references: {},
  executions: [],
  ...fields,
});

/** Records a completed stage for a host as recordStage projects it, without a database. */
const recordFor = (cycle, stageId, recorder, evidence = { of: stageId }) => {
  const { execution } = stageExecution(cycle, stageId, recorder, { status: 'succeeded', evidence });
  cycle.executions = [
    ...cycle.executions.filter((stored) => !(stored.stage === stageId && stored.targetId === execution.targetId)),
    { ...execution, eventId: `event-${stageId}@${execution.targetId}`, node: recorder.node, at: new Date() },
  ];
  return cycle;
};

const DEPLOYMENT_HEAD = ['preflight', 'infrastructure-backup', 'baseline-capture', 'baseline-verify'];
const SANDBOX_STAGES = ['baseline-restore', 'workspace-reset'];
const SOURCE_STAGES = ['source-export', 'source-review', 'source-release'];

/** A cycle recorded in order up to and with `last`, the development stages on one workstation. */
const recorded = (last, recorder = workstation({ sandbox: sandbox('ws-a'), source: checkout('ws-a') })) => {
  const cycle = cycleWith();
  for (const { id, target } of LIFECYCLE_STAGES) {
    recordFor(cycle, id, target === 'deployment' ? control : recorder, {
      of: id,
      ...(id === 'source-review' && { contentRevision: recorder.targets.source?.revision }),
    });
    if (id === last) break;
  }
  return cycle;
};

const statesOf = (cycle, targets) =>
  Object.fromEntries(stageStates(cycle, targets).map(({ id, state }) => [id, state]));

describe('the hosts of a content lifecycle', () => {
  it('gives each node role only the contexts of the stage execution policy', () => {
    const matrix = Object.fromEntries(
      NODE_ROLES.flatMap((role) =>
        ['production', 'development'].map((environment) => [
          `${role} ${environment}`,
          host(role, environment).contexts,
        ]),
      ),
    );
    expect(matrix).toEqual({
      'hub production': [],
      'hub development': [],
      'control production': ['infrastructure-control', 'production-deployment'],
      'control development': ['infrastructure-control'],
      'worker production': [],
      'worker development': [],
      'workstation production': ['source-authoring'],
      'workstation development': ['content-development', 'source-authoring'],
    });
  });

  it('grants nothing to a host with no node document or an unknown role, whatever its environment', () => {
    for (const role of ['', 'developer', 'incubation'])
      for (const environment of ['production', 'development', 'test'])
        expect(host(role, environment).contexts, `${role} ${environment}`).toEqual([]);
  });

  it('takes source authoring only with a cyberia-content checkout', () => {
    expect(host('workstation', 'development', { sources: false }).contexts).toEqual(['content-development']);
  });

  it('derives each context from an Underpost role and a capability that role holds', () => {
    for (const [context, { role, capability }] of Object.entries(CONTEXT_POLICY)) {
      expect(NODE_ROLES, context).toContain(role);
      expect(roleHasCapability(role, capability), context).toBe(true);
    }
    expect(Object.keys(CONTEXT_REQUIREMENTS)).toEqual([...EXECUTION_CONTEXTS]);
    expect(CONTEXT_REQUIREMENTS['content-development']).toBe(
      'a workstation node, in the development environment (--dev)',
    );
  });

  it('gives each reference of a cycle one stage that sets it', () => {
    const keys = LIFECYCLE_STAGES.flatMap(({ references }) => references);
    expect(new Set(keys).size).toBe(keys.length);
    expect(LIFECYCLE_STAGES.find(({ id }) => id === 'baseline-capture').references).toEqual([
      'baselineId',
      'baselineReleaseId',
    ]);
  });

  it('gives a host the target kinds of the stages it runs: a control node with a checkout runs no source stage', () => {
    const kinds = (role, environment, sources) =>
      Object.keys(TARGET_KINDS).filter((kind) => runsTargetKind(hostContexts({ role, environment, sources }), kind));
    expect(kinds('control', 'production', true)).toEqual(['deployment']);
    expect(kinds('workstation', 'development', true)).toEqual(['deployment', 'sandbox', 'source']);
    expect(kinds('workstation', 'development', false)).toEqual(['deployment', 'sandbox']);
  });

  it('runs each stage on one role', () => {
    for (const { id, contexts } of LIFECYCLE_STAGES)
      expect(new Set(contexts.map((context) => CONTEXT_POLICY[context].role)).size, id).toBeLessThanOrEqual(1);
  });

  it('names a share by a URL whose user part is its token, so log redaction treats it as a credential', () => {
    const token = 'a'.repeat(43);
    const handle = shareHandleFactory({ token, address: '10.0.0.2', port: 7735 });
    expect(handle).toBe(`http://${token}@10.0.0.2:7735`);
    expect(parseShareHandle(handle)).toEqual({ token, address: '10.0.0.2', port: 7735 });
    for (const value of [
      '',
      '10.0.0.2:27017',
      `${token}@10.0.0.2:7735`,
      `http://${token}@host.example:7735`,
      'http://short@10.0.0.2:7735',
      `http://${token}:pass@10.0.0.2:7735`,
      `https://${token}@10.0.0.2:7735`,
    ])
      expect(() => parseShareHandle(value), value).toThrow('CYBERIA_LIFECYCLE_SHARE is not a share');
  });

  it('ends a share when its lease lapses or its expiry passes, before any host records it', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    const open = {
      shareId: 's',
      tokenDigest: 'sha256:x',
      leaseUntil: new Date('2026-11-06T12:01:00Z'),
      expiresAt: new Date('2026-11-06T18:00:00Z'),
      closedAt: null,
      closeReason: '',
    };
    expect(shareState(open, now)).toBe('open');
    expect(shareState({ ...open, leaseUntil: new Date('2026-11-06T11:59:00Z') }, now)).toBe('expired');
    expect(shareState({ ...open, expiresAt: new Date('2026-11-06T11:00:00Z') }, now)).toBe('expired');
    expect(shareState({ ...open, closedAt: now, closeReason: 'revoked' }, now)).toBe('revoked');
    expect(shareView(open, now)).not.toHaveProperty('tokenDigest');
  });
});

describe('the stages of a content lifecycle', () => {
  it('runs each stage for one kind of execution target', () => {
    expect(Object.fromEntries(LIFECYCLE_STAGES.map(({ id, target }) => [id, target]))).toEqual({
      preflight: 'deployment',
      'infrastructure-backup': 'deployment',
      'baseline-capture': 'deployment',
      'baseline-verify': 'deployment',
      'baseline-restore': 'sandbox',
      'workspace-reset': 'sandbox',
      'source-export': 'source',
      'source-review': 'source',
      'source-release': 'source',
      'production-deploy': 'deployment',
      'runtime-verify': 'deployment',
    });
    expect(deploymentTarget(cycleWith())).toMatchObject({ kind: 'deployment', id: 'deployment:dd-test/production' });
  });

  it('completes the stages recorded in order, and leaves the rest pending', () => {
    expect(Object.values(statesOf(recorded('infrastructure-backup')))).toEqual([
      'completed',
      'completed',
      ...Array(LIFECYCLE_STAGES.length - 2).fill('pending'),
    ]);
  });

  it('makes every later execution stale when an earlier stage records new evidence', () => {
    const cycle = recorded('baseline-verify');
    recordFor(cycle, 'infrastructure-backup', control, { backupId: 'a newer backup' });
    expect(Object.values(statesOf(cycle)).slice(0, 4)).toEqual(['completed', 'completed', 'stale', 'stale']);
  });

  it('completes a restore for sandbox A only: sandbox B stays pending, and both keep their own execution', () => {
    const a = { sandbox: sandbox('ws-a') };
    const b = { sandbox: sandbox('ws-b') };
    const cycle = recorded('baseline-verify');
    recordFor(cycle, 'baseline-restore', workstation(a));
    expect(statesOf(cycle, a)['baseline-restore']).toBe('completed');
    expect(statesOf(cycle, b)['baseline-restore']).toBe('pending');
    expect(() => assertStageReady(cycle, 'baseline-restore', workstation(b), { rerun: false })).not.toThrow();
    recordFor(cycle, 'baseline-restore', workstation(b));
    const [restore] = stageStates(cycle, b).filter(({ id }) => id === 'baseline-restore');
    expect(restore.executions.map(({ targetId, state }) => [targetId, state])).toEqual(
      expect.arrayContaining([
        ['sandbox:ws-a/kind', 'completed'],
        ['sandbox:ws-b/kind', 'completed'],
      ]),
    );
  });

  it('refuses a second restore of an unchanged sandbox, unless it is a new attempt', () => {
    const a = workstation({ sandbox: sandbox('ws-a') });
    const cycle = recordFor(recorded('baseline-verify'), 'baseline-restore', a);
    expect(() => assertStageReady(cycle, 'baseline-restore', a, { rerun: false })).toThrow(
      'is complete for sandbox:ws-a/kind (event event-baseline-restore@sandbox:ws-a/kind): pass --new-attempt',
    );
    expect(() => assertStageReady(cycle, 'baseline-restore', a, { rerun: true })).not.toThrow();
    expect(stageExecution(cycle, 'baseline-restore', a, { status: 'succeeded' }).execution.attempts).toBe(2);
  });

  it('gives a recreated cluster another fingerprint, so it inherits no restore', () => {
    const before = sandbox('ws-a', 'uid-before');
    const after = sandbox('ws-a', 'uid-after');
    expect(after.id).toBe(before.id);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    const cycle = recordFor(recorded('baseline-verify'), 'baseline-restore', workstation({ sandbox: before }));
    expect(statesOf(cycle, { sandbox: before })['baseline-restore']).toBe('completed');
    expect(statesOf(cycle, { sandbox: after })['baseline-restore']).toBe('stale');
    expect(() =>
      assertStageReady(cycle, 'source-export', workstation({ sandbox: after, source: checkout('ws-a') })),
    ).toThrow('waits for Development baseline restore (baseline-restore) for sandbox:ws-a/kind: it is stale');
    expect(
      stageExecution(cycle, 'baseline-restore', workstation({ sandbox: after }), { status: 'succeeded' }).execution
        .attempts,
    ).toBe(1);
  });

  it('makes a restore stale where this host sees its release database gone', () => {
    const restored = sandbox('ws-a', 'uid', ['example-content-r1']);
    const cycle = recordFor(recorded('baseline-verify'), 'baseline-restore', workstation({ sandbox: restored }), {
      database: 'example-content-r1',
    });
    expect(statesOf(cycle, { sandbox: restored })['baseline-restore']).toBe('completed');
    expect(statesOf(cycle, { sandbox: { ...restored, databases: [] } })['baseline-restore']).toBe('stale');
    // A host that does not observe the sandbox reads the state it was recorded with.
    expect(statesOf(cycle)['baseline-restore']).toBe('completed');
  });

  it('binds a source review to the reviewed revision: a later commit makes it and the release stale', () => {
    const reviewed = workstation({ sandbox: sandbox('ws-a'), source: checkout('ws-a', 'r1') });
    const cycle = recorded('source-release', reviewed);
    expect(statesOf(cycle, reviewed.targets)['source-release']).toBe('completed');
    const committed = { ...reviewed.targets, source: checkout('ws-a', 'r2') };
    expect(statesOf(cycle, committed)).toMatchObject({ 'source-review': 'stale', 'source-release': 'stale' });
  });

  it('keeps a stage for the target of another workstation apart from the targets of this one', () => {
    const cycle = recorded('source-release', workstation({ sandbox: sandbox('ws-a'), source: checkout('ws-a') }));
    const other = { sandbox: sandbox('ws-b'), source: checkout('ws-b') };
    const states = statesOf(cycle, other);
    expect(states).toMatchObject({
      'baseline-verify': 'completed',
      'baseline-restore': 'pending',
      'source-release': 'pending',
    });
    // Without targets of its own, a host follows the newest current execution of each stage.
    expect(statesOf(cycle)['source-release']).toBe('completed');
    const plan = lifecyclePlan(cycle, workstation(other));
    expect(plan.next).toMatchObject({ id: 'baseline-restore', targetId: 'sandbox:ws-b/kind' });
  });

  it('plans the next stage with the host and target it needs and its commands, the baseline the cycle keeps among them', () => {
    const cycle = recorded('baseline-verify');
    cycle.references = { baselineId: '20261105T000000Z-abcdef' };
    const here = workstation({ sandbox: sandbox('workstation-node') });
    const plan = lifecyclePlan(cycle, here);
    expect(plan).toMatchObject({
      status: 'in-progress',
      next: { id: 'baseline-restore', target: 'sandbox', here: true, role: 'workstation' },
    });
    expect(plan.next.requirements).toEqual([CONTEXT_REQUIREMENTS['content-development']]);
    expect(plan.next.commands).toEqual([
      'node bin/cyberia content baseline restore 20261105T000000Z-abcdef --confirm 20261105T000000Z-abcdef --cycle dd-test-202611050000-abcdef --dev',
    ]);
    const nosandbox = lifecyclePlan(cycle, workstation({}));
    expect(nosandbox.next).toMatchObject({ here: false, reason: 'this host observes no Development Sandbox' });
    const controlPlan = lifecyclePlan(cycle, control);
    expect(controlPlan.next).toMatchObject({ here: false, reason: 'this host is not content-development' });
    expect(handoffText(controlPlan)).toContain('This host:\n  this host is not content-development');
    expect(handoffText(controlPlan)).toContain(
      'Completed:\n  Preflight for deployment:dd-test/production\n  Infrastructure backup for deployment:dd-test/production',
    );
    expect(handoffText(controlPlan)).toContain('Baseline: 20261105T000000Z-abcdef');
    expect(handoffText(controlPlan, { hubHost: '203.0.113.10' })).toContain(
      'Enrolled workstation nodes:\n  none on hub 203.0.113.10: enroll one with\n' +
        '  node bin wireguard --node-config --node-role workstation --hub-host 203.0.113.10 --peer-id <peer-id>',
    );
    const enrolled = handoffText(controlPlan, {
      hubHost: '203.0.113.10',
      hosts: [{ nodeName: 'dev-laptop', peerId: 'ws-dev', address: '10.0.0.9' }],
    });
    expect(enrolled).toContain('Enrolled workstation nodes:\n  dev-laptop: peer ws-dev, tunnel address 10.0.0.9');
    expect(enrolled).toContain(
      'Connect that host first:\n  On the control node: node bin/cyberia content lifecycle share dd-test-202611050000-abcdef --peer-id ws-dev',
    );
    expect(enrolled).toContain('On that host: export CYBERIA_LIFECYCLE_SHARE=<the value the share prints>');
    expect(enrolled).toContain(
      'needs a Development Sandbox session that serves the development MongoDB (underpost sandbox up)',
    );
    expect(handoffText(plan)).toContain('for sandbox:workstation-node/kind');
    expect(handoffText(plan)).not.toContain('Connect that host first');
  });

  it('completes the cycle once the runtime convergence is current through its whole chain', () => {
    const cycle = recorded('runtime-verify');
    expect(lifecyclePlan(cycle)).toMatchObject({ status: 'completed', next: null });
    expect(handoffText(lifecyclePlan(cycle))).toContain('Every stage is complete.');
    recordFor(cycle, 'baseline-verify', control, { verifiedAt: 'again' });
    expect(lifecyclePlan(cycle).status).toBe('in-progress');
  });

  it('refuses a stage on a host without its context or target, before its earlier stage, twice without rerun, and in a closed cycle', () => {
    const cycle = recorded('preflight');
    const blocked = (fn) => expect(fn).toThrow(expect.objectContaining({ outcome: 'blocked' }));
    blocked(() => assertStageReady(cycle, 'infrastructure-backup', host('worker', 'development')));
    blocked(() => assertStageReady(cycle, 'baseline-capture', control));
    expect(() => assertStageReady(cycle, 'infrastructure-backup', control)).not.toThrow();
    blocked(() => assertStageReady(cycle, 'preflight', control, { rerun: false }));
    blocked(() => assertStageReady({ ...cycle, status: 'cancelled' }, 'infrastructure-backup', control));
    const verified = recorded('baseline-verify');
    expect(() =>
      assertStageReady(verified, 'baseline-restore', { ...workstation({}), unobserved: { sandbox: 'no session' } }),
    ).toThrow('Development baseline restore runs for one Development Sandbox; this host observes none: no session');
    blocked(() => assertOperationReady(cycle, 'workspace.drop', host('worker', 'development')));
    expect(() => assertOperationReady(cycle, 'workspace.drop', host('workstation', 'development'))).not.toThrow();
    expect(() => assertStageReady(cycle, 'no-such-stage', control)).toThrow('Unknown stage');
  });

  it('exports the baseline to source before it resets the workspace, and reviews the source after the reset', () => {
    expect(LIFECYCLE_STAGE_ORDER.slice(4, 8)).toEqual([
      'baseline-restore',
      'source-export',
      'workspace-reset',
      'source-review',
    ]);
    const commands = (id) =>
      LIFECYCLE_STAGES.find((entry) => entry.id === id)
        .commands({ cycleId: 'c', deployId: 'dd-test', baselineId: 'b' })
        .map(({ run }) => run);
    expect(commands('workspace-reset')).toEqual([
      'git -C cyberia-content commit  # the export, with the Baseline: line it prints',
      '(cd cyberia-content && node bin/cyberia-content.js build)',
      'node bin/cyberia content workspace reset --confirm dd-test --cycle c --dev',
    ]);
    expect(commands('source-review')[0]).toBe(
      'node bin/cyberia instance snapshot <instance-code> --export --dev  # each world edited in the Studio',
    );
  });

  it('prints each command as the operator runs it: a control node command names the deploy of the cycle', () => {
    const start = lifecyclePlan(cycleWith(), control);
    expect(start.next.commands).toEqual([
      'node bin/cyberia content lifecycle doctor dd-test-202611050000-abcdef --env-path ./engine-private/conf/dd-test/.env.production',
    ]);
    const released = recorded('source-release');
    released.references = { baselineReleaseId: 'v3-5-0-abc' };
    expect(lifecyclePlan(released, control).next.commands).toEqual([
      'DISCARD_LIVE_CHANGES=v3-5-0-abc DISCARD_REASON="exported in cycle dd-test-202611050000-abcdef" ./deploy/dd-test/sync-deploy.sh',
      'node bin/cyberia content lifecycle verify production-deploy --cycle dd-test-202611050000-abcdef --env-path ./engine-private/conf/dd-test/.env.production',
    ]);
  });

  it('lists the commands of a stage left to run: an operation counts once it succeeded after the one before it', () => {
    const here = workstation({ sandbox: sandbox('ws-a'), source: checkout('ws-a') });
    const cycle = recorded('source-review', here);
    const reviewed = new Date(cycle.executions.find(({ stage }) => stage === 'source-review').at).getTime();
    const outcome = (operation, status, seconds) => ({ operation, status, at: new Date(reviewed + seconds * 1000) });
    const run = (operation) => `node bin/cyberia release ${operation} --commit --cycle ${cycle.cycleId}`;
    const publish = `node bin/cyberia release publish --private --cycle ${cycle.cycleId}`;
    const verify = `node bin/cyberia content lifecycle verify source-release --cycle ${cycle.cycleId}`;
    const progress = (...operations) => {
      const { done, commands } = lifecyclePlan({ ...cycle, operations }, here).next;
      return { done, commands };
    };

    expect(progress()).toEqual({ done: [], commands: [run('build'), run('lock'), publish, verify] });
    // Before the review they ran for another revision; a failed one never counts.
    expect(progress(outcome('source.build', 'succeeded', -5), outcome('source.lock', 'succeeded', -4))).toEqual(
      progress(),
    );
    expect(
      progress(
        outcome('source.build', 'succeeded', 1),
        outcome('source.lock', 'succeeded', 2),
        outcome('source.publish', 'failed', 3),
      ),
    ).toEqual({ done: [run('build'), run('lock')], commands: [publish, verify] });
    const published = [
      outcome('source.build', 'succeeded', 1),
      outcome('source.lock', 'succeeded', 2),
      outcome('source.publish', 'succeeded', 3),
    ];
    expect(progress(...published)).toEqual({ done: [run('build'), run('lock'), publish], commands: [verify] });
    expect(handoffText(lifecyclePlan({ ...cycle, operations: published }, here))).toContain(
      `Done:\n  ${run('build')}\n  ${run('lock')}\n  ${publish}\n\nCommands:\n  ${verify}`,
    );
    // A new build after the lock makes the lock and the publication run again.
    expect(progress(...published.slice(1), outcome('source.build', 'succeeded', 4))).toEqual({
      done: [run('build')],
      commands: [run('lock'), publish, verify],
    });
  });

  it('keeps the export current after a new reset, and makes it stale when the restore it read changes', () => {
    const here = workstation({ sandbox: sandbox('ws-a'), source: checkout('ws-a') });
    const cycle = recorded('source-review', here);
    recordFor(cycle, 'workspace-reset', here, { sourceRevision: 'a rebuilt artifact' });
    expect(statesOf(cycle, here.targets)).toMatchObject({
      'source-export': 'completed',
      'workspace-reset': 'completed',
      'source-review': 'stale',
    });
    expect(() => assertStageReady(cycle, 'source-review', here)).not.toThrow();
    recordFor(cycle, 'baseline-restore', here, { database: 'a new restore' });
    expect(statesOf(cycle, here.targets)).toMatchObject({
      'source-export': 'stale',
      'workspace-reset': 'stale',
      'source-review': 'stale',
    });
    expect(() => assertStageReady(cycle, 'workspace-reset', here)).toThrow(
      'waits for Live content export to source (source-export)',
    );
  });

  it.each(['baseline-restore', 'source-export', 'workspace-reset', 'source-review'])(
    'runs a failed %s again without a new attempt, and holds the stage after it',
    (stageId) => {
      const here = workstation({ sandbox: sandbox('ws-a'), source: checkout('ws-a') });
      const index = LIFECYCLE_STAGE_ORDER.indexOf(stageId);
      const cycle = recorded(LIFECYCLE_STAGE_ORDER[index - 1], here);
      const { execution } = stageExecution(cycle, stageId, here, { status: 'failed', error: 'interrupted' });
      cycle.executions.push({ ...execution, eventId: 'event-failed', node: here.node, at: new Date() });
      expect(lifecyclePlan(cycle, here)).toMatchObject({ status: 'failed', next: { id: stageId, state: 'failed' } });
      expect(() => assertStageReady(cycle, stageId, here, { rerun: false })).not.toThrow();
      expect(() => assertStageReady(cycle, LIFECYCLE_STAGE_ORDER[index + 1], here)).toThrow(
        `(${stageId}) for ${execution.targetId}: it is failed`,
      );
    },
  );

  it('refuses a cycle that started under another stage order, and shows it superseded instead of reading it under this one', () => {
    const here = workstation({ sandbox: sandbox('ws-a'), source: checkout('ws-a') });
    const earlier = { ...recorded('source-export', here), stageOrder: undefined };
    const plan = lifecyclePlan(earlier, here);
    expect(plan).toMatchObject({ status: 'superseded', next: null });
    expect(handoffText(plan)).toContain('It started under an earlier stage order: cancel it and start a new cycle.');
    for (const check of [
      () => assertStageReady(earlier, 'workspace-reset', here),
      () => assertOperationReady(earlier, 'workspace.drop', here),
    ])
      expect(check).toThrow(
        expect.objectContaining({ outcome: 'blocked', message: expect.stringContaining('earlier stage order') }),
      );
    expect(lifecyclePlan({ ...earlier, stageOrder: [...LIFECYCLE_STAGE_ORDER].reverse() }).status).toBe('superseded');
    expect(lifecyclePlan({ ...earlier, status: 'completed' }).status).toBe('completed');
    expect(lifecyclePlan({ ...earlier, status: 'cancelled' }).status).toBe('cancelled');
  });

  it('names a cycle by its deployment and the minute it started', () => {
    const cycleId = cycleIdFactory('dd-cyberia', new Date('2026-11-05T12:34:56Z'));
    expect(cycleId).toMatch(/^dd-cyberia-202611051234-[0-9a-f]{6}$/);
    expect(cycleId).toMatch(CYCLE_ID_PATTERN);
  });
});

describe('the client of a share', () => {
  const token = 'a'.repeat(43);
  let server;
  let connections;

  beforeEach(async () => {
    connections = 0;
    server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const allowed = req.headers.authorization === `Bearer ${token}`;
        res.writeHead(allowed ? 200 : 401, { 'content-type': 'application/json' });
        res.end(JSON.stringify(allowed ? { cycleId: 'dd-test-1' } : { error: 'wrong token', code: 'unauthorized' }));
      });
    });
    server.on('connection', () => connections++);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterEach(() => {
    server.close();
    server.closeAllConnections();
  });

  it('opens a connection of its own for each call, so a long build never leaves it a dead one', async () => {
    const client = shareClient(`http://${token}@127.0.0.1:${server.address().port}`);
    expect(await client.read('dd-test-1')).toEqual({ cycleId: 'dd-test-1' });
    await client.events(5);
    await client.note({ host: control, cycleId: 'dd-test-1', operation: 'source.build' });
    expect(connections).toBe(3);
  });

  it('keeps the refusal of the share, and names a share that does not answer', async () => {
    const { port } = server.address();
    await expect(shareClient(`http://${'b'.repeat(43)}@127.0.0.1:${port}`).read()).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
      message: 'wrong token',
    });
    server.close();
    server.closeAllConnections();
    await expect(shareClient(`http://${token}@127.0.0.1:${port}`).read()).rejects.toMatchObject({
      outcome: 'blocked',
      code: 'unreachable',
      message: expect.stringContaining(`The share at 127.0.0.1:${port} does not answer (ECONNREFUSED)`),
    });
  });
});

describe('how a host reaches the deploy database', () => {
  const saved = {};
  let cwd;
  let pod;

  beforeEach(() => {
    cwd = process.cwd();
    pod = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-reach-'));
    fs.mkdirSync(path.join(pod, 'engine-private/conf/dd-x'), { recursive: true });
    fs.writeFileSync(
      path.join(pod, 'engine-private/conf/dd-x/conf.server.json'),
      JSON.stringify({
        h: { '/': { db: { provider: 'mongoose', host: 'mongodb://127.0.0.1:27017', name: 'cyberia' } } },
      }),
    );
    for (const key of ['DEFAULT_DEPLOY_ID', 'DEFAULT_DEPLOY_HOST', 'DEFAULT_DEPLOY_PATH', SHARE_ENV])
      saved[key] = process.env[key];
    Object.assign(process.env, { DEFAULT_DEPLOY_ID: 'dd-x', DEFAULT_DEPLOY_HOST: 'h', DEFAULT_DEPLOY_PATH: '/' });
    delete process.env[SHARE_ENV];
    process.chdir(pod);
  });

  afterEach(() => {
    process.chdir(cwd);
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    fs.rmSync(pod, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('connects a development command and a named member as they are', async () => {
    const forward = vi.spyOn(Underpost.kubectl, 'portForward');
    for (const options of [{ dev: true }, { mongoHost: '10.0.0.15:27017' }])
      expect((await reachDeployDb(options)).options).toBe(options);
    expect(forward).not.toHaveBeenCalled();
  });

  it.skipIf(isOciRuntime())(
    'reaches the primary through a forward from a production host outside the cluster',
    async () => {
      vi.spyOn(Underpost.db, 'databasePlan').mockReturnValue([
        { provider: 'mongoose', user: 'admin', password: 'secret' },
      ]);
      const primary = vi.spyOn(MongoBootstrap, 'getPrimaryPodName').mockReturnValue('mongodb-1');
      const close = vi.fn();
      const forward = vi.spyOn(Underpost.kubectl, 'portForward').mockResolvedValue({ localPort: 40123, close });
      const reach = await reachDeployDb({ cycle: 'dd-x-202611051200-a1b2c3' });
      expect(primary).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: 'default', podName: 'mongodb-0', username: 'admin', password: 'secret' }),
      );
      expect(forward).toHaveBeenCalledWith({ resource: 'pod/mongodb-1', namespace: 'default', remotePort: 27017 });
      expect(reach.options).toEqual({
        cycle: 'dd-x-202611051200-a1b2c3',
        mongoHost: '127.0.0.1:40123',
        mongoDirect: true,
      });
      reach.close();
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it.skipIf(isOciRuntime())('fails when no primary answers, and names the share for the cycle records', async () => {
    fs.writeFileSync(
      path.join(pod, 'engine-private/conf/dd-x/conf.server.json'),
      JSON.stringify({
        h: {
          '/': {
            apis: LIFECYCLE_APIS,
            db: { provider: 'mongoose', host: 'mongodb://127.0.0.1:27017', name: 'cyberia' },
          },
        },
      }),
    );
    vi.spyOn(Underpost.db, 'databasePlan').mockReturnValue([{ provider: 'mongoose' }]);
    vi.spyOn(MongoBootstrap, 'getPrimaryPodName').mockReturnValue('');
    const forward = vi.spyOn(Underpost.kubectl, 'portForward');
    await expect(reachDeployDb({})).rejects.toThrow('No MongoDB primary answers in namespace default from this host');
    await expect(openLifecycleStore({ cycle: 'dd-x-202611051200-a1b2c3' })).rejects.toMatchObject({
      outcome: 'blocked',
      message: expect.stringContaining(
        '"cyberia content lifecycle share dd-x-202611051200-a1b2c3 --peer-id <peer-id>" opens the cycle',
      ),
    });
    expect(forward).not.toHaveBeenCalled();
  });

  it('refuses a deploy host without the lifecycle APIs before it reaches a database', async () => {
    const primary = vi.spyOn(MongoBootstrap, 'getPrimaryPodName');
    const forward = vi.spyOn(Underpost.kubectl, 'portForward');
    await expect(openLifecycleStore({})).rejects.toMatchObject({
      outcome: 'blocked',
      message: expect.stringContaining('dd-x (h/) holds no content lifecycle: name the Cyberia deploy with --env-path'),
    });
    expect(primary).not.toHaveBeenCalled();
    expect(forward).not.toHaveBeenCalled();
  });
});
