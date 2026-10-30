'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import {
  MEMORY_RESERVE_ENV,
  RESOURCE_ISOLATION_ENV,
  RESOURCE_PROFILES,
  RUN_CLASSES,
  admissionFactory,
  hostCapacityFactory,
  memoryPressureFactory,
  memoryRequirementFactory,
  reserveOverrideNotice,
  resourceBudgetFactory,
  resourceHistoryFactory,
  resourceIsolationFactory,
  resourceProfileFactory,
  workloadEnvFactory,
} from '../../../src/server/runtime/resource-governor.js';
import { cgroupEnforcedLimits, cgroupLimits, cgroupUsage } from '../../../src/server/runtime/linux-resources.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const host = { totalMemoryBytes: 16 * GB, cpus: 12 };

describe('resource governor', () => {
  it('gives each profile its share of the host', () => {
    expect(resourceBudgetFactory({ profile: 'heavy', capacity: host, env: {} })).to.deep.equal({
      profile: 'heavy',
      memoryBytes: Math.floor(16 * GB * 0.3),
      reserveBytes: Math.floor(16 * GB * 0.05),
      profileReserveBytes: Math.floor(16 * GB * 0.05),
      threads: 6,
      nice: 10,
      sampleIntervalMs: 1000,
    });
    for (const profile of Object.keys(RESOURCE_PROFILES)) {
      const budget = resourceBudgetFactory({ profile, capacity: host, env: {} });
      expect(budget.memoryBytes + budget.reserveBytes, profile).to.be.below(host.totalMemoryBytes);
      expect(budget.threads, profile).to.be.within(1, host.cpus);
    }
  });

  it('takes the reserve the operator sets, and says that it does not show the task fits', () => {
    const budget = resourceBudgetFactory({ profile: 'heavy', capacity: host, env: { [MEMORY_RESERVE_ENV]: '300' } });
    expect(budget).to.include({ reserveBytes: 300 * MB, profileReserveBytes: Math.floor(16 * GB * 0.05) });
    expect(reserveOverrideNotice(budget)).to.equal(
      `${MEMORY_RESERVE_ENV} lowers the host reserve from 819 MB to 300 MB; this does not show that the task fits`,
    );
    const raised = resourceBudgetFactory({ profile: 'heavy', capacity: host, env: { [MEMORY_RESERVE_ENV]: '2048' } });
    expect(reserveOverrideNotice(raised)).to.match(/raises the host reserve from 819 MB to 2048 MB/);
    expect(reserveOverrideNotice(resourceBudgetFactory({ profile: 'heavy', capacity: host, env: {} }))).to.equal('');
    expect(
      resourceBudgetFactory({ profile: 'heavy', capacity: host, env: { [MEMORY_RESERVE_ENV]: '' } }).reserveBytes,
    ).to.equal(Math.floor(16 * GB * 0.05));
  });

  it('rejects a reserve that is not a whole number of MB below the memory of the host', () => {
    for (const value of ['x', '-5', '0', '1.5', ' 400', '4e3', '16384', `${Number.MAX_SAFE_INTEGER}0`])
      expect(
        () => resourceBudgetFactory({ profile: 'heavy', capacity: host, env: { [MEMORY_RESERVE_ENV]: value } }),
        value,
      ).to.throw(`${MEMORY_RESERVE_ENV}='${value}': expected a whole number of MB from 1 to 16383`);
  });

  it('keeps one thread on a host with one CPU, and rejects an unknown profile', () => {
    expect(resourceBudgetFactory({ profile: 'standard', capacity: { ...host, cpus: 1 }, env: {} }).threads).to.equal(1);
    expect(() => resourceProfileFactory('fast')).to.throw(/Unknown resource profile 'fast'/);
  });

  it('admits a task with the memory the host can give above its reserve, and a heap below it', () => {
    const budget = resourceBudgetFactory({ profile: 'heavy', capacity: host, env: {} });
    const admission = admissionFactory({ budget, capacity: { availableMemoryBytes: 3 * GB } });
    expect(admission.admitted).to.equal(true);
    expect(admission.budget.memoryBytes).to.equal(3 * GB - budget.reserveBytes);
    expect(admission.budget.heapBytes).to.equal(Math.floor(admission.budget.memoryBytes * 0.8));

    const roomy = admissionFactory({ budget, capacity: { availableMemoryBytes: 15 * GB } });
    expect(roomy.budget.memoryBytes).to.equal(budget.memoryBytes);
  });

  it('refuses a task the host cannot give the memory it needs, and says how much it can give', () => {
    const budget = resourceBudgetFactory({ profile: 'heavy', capacity: host, env: {} });
    const short = admissionFactory({ budget, capacity: { availableMemoryBytes: 2 * GB }, requiredBytes: 1.5 * GB });
    expect(short.admitted).to.equal(false);
    expect(short.reason).to.equal(
      `the host has 2048 MB available and keeps a ${Math.round(budget.reserveBytes / MB)} MB reserve, ` +
        `so the task can get ${Math.round((2 * GB - budget.reserveBytes) / MB)} MB; its resource history asks for 1536 MB`,
    );
    const lowered = resourceBudgetFactory({ profile: 'heavy', capacity: host, env: { [MEMORY_RESERVE_ENV]: '64' } });
    const refused = admissionFactory({
      budget: lowered,
      capacity: { availableMemoryBytes: GB },
      requiredBytes: 2 * GB,
    });
    expect(refused.reason).to.match(/\(UNDERPOST_MEMORY_RESERVE_MB lowers the host reserve from 819 MB to 64 MB;/);
    const exhausted = admissionFactory({ budget, capacity: { availableMemoryBytes: budget.reserveBytes - 1 } });
    expect(exhausted).to.include({ admitted: false });
    expect(exhausted.budget.memoryBytes).to.equal(0);
  });

  it('gives no heap to a profile without a heap share', () => {
    const budget = resourceBudgetFactory({ profile: 'standard', capacity: host, env: {} });
    expect(admissionFactory({ budget, capacity: { availableMemoryBytes: 8 * GB } }).budget).not.to.have.property(
      'heapBytes',
    );
  });

  it('sizes the thread pools and the heap of a workload, and keeps what the operator set', () => {
    const budget = { threads: 3, heapBytes: 512 * MB };
    expect(workloadEnvFactory({ budget, env: { PATH: '/bin' } })).to.deep.equal({
      GOMAXPROCS: '3',
      PATH: '/bin',
      NODE_OPTIONS: '--max-old-space-size=512 --v8-pool-size=3',
    });
    const operator = workloadEnvFactory({ budget, env: { GOMAXPROCS: '1', NODE_OPTIONS: '--max-old-space-size=900' } });
    expect(operator.GOMAXPROCS).to.equal('1');
    // V8 reads its flags in order: the operator's comes last and wins.
    expect(operator.NODE_OPTIONS).to.equal('--max-old-space-size=512 --v8-pool-size=3 --max-old-space-size=900');
    expect(workloadEnvFactory({ budget: { threads: 2 }, env: {} })).to.deep.equal({ GOMAXPROCS: '2' });
  });

  it('enters pressure below twice the reserve and leaves it only well above', () => {
    const classify = memoryPressureFactory(1 * GB);
    expect([3, 1.9, 2.2, 2.6, 2.1, 0.9].map((gigabytes) => classify(gigabytes * GB))).to.deep.equal([
      'normal',
      'pressure',
      'pressure',
      'normal',
      'normal',
      'critical',
    ]);
  });

  it('reads the isolation the operator asks for', () => {
    expect(resourceIsolationFactory({})).to.equal('preferred');
    expect(resourceIsolationFactory({ [RESOURCE_ISOLATION_ENV]: 'required' })).to.equal('required');
    expect(() => resourceIsolationFactory({ [RESOURCE_ISOLATION_ENV]: 'strict' })).to.throw(
      /expected preferred, required, off/,
    );
  });

  describe('resource history', () => {
    const budget = { memoryBytes: GB };
    const run = (history, reason, extra = {}) =>
      resourceHistoryFactory({ history, workload: 'site-a', reason, budget, at: 'now', ...extra });
    const required = (history, workload = 'site-a') =>
      memoryRequirementFactory({ history, workload, profile: 'heavy' });

    it('asks for the measured peak of a completed run, with the margin of the profile', () => {
      const history = run(null, 'completed', { diagnostics: { peakBytes: 800 * MB, peakSource: 'kernel' } });
      expect(history).to.deep.equal({
        workload: 'site-a',
        peak: { bytes: 800 * MB, source: 'kernel', at: 'now' },
        last: { class: 'measured', at: 'now' },
      });
      expect(required(history)).to.equal(1000 * MB);
    });

    it('takes a memory-limit stop as a floor above its limit, never as a peak', () => {
      const measured = run(null, 'completed', { diagnostics: { peakBytes: 800 * MB, peakSource: 'kernel' } });
      const stopped = run(measured, 'memory-limit', { budget: { memoryBytes: 1.2 * GB } });
      expect(stopped.peak.bytes).to.equal(800 * MB);
      expect(stopped.exceeded).to.deep.equal({ bytes: 1.2 * GB, at: 'now' });
      expect(required(stopped)).to.equal(Math.ceil(1.2 * GB * 1.25));
      // A later measured run is the better measurement: it replaces the floor.
      const remeasured = run(stopped, 'completed', { diagnostics: { peakBytes: 1.3 * GB, peakSource: 'kernel' } });
      expect(remeasured).not.to.have.property('exceeded');
      expect(required(remeasured)).to.equal(Math.ceil(1.3 * GB * 1.25));
    });

    it('learns nothing about the memory from a run that ended for another reason', () => {
      const measured = run(null, 'completed', { diagnostics: { peakBytes: 800 * MB, peakSource: 'sampled' } });
      for (const [reason, runClass] of [
        ['host-pressure', 'host-pressure'],
        ['timeout', 'timeout'],
        ['cancelled', 'interrupted'],
        ['failed', 'failed'],
        ['completed', 'unmeasured'],
      ]) {
        const history = run(measured, reason, { diagnostics: null });
        expect(history.last.class, reason).to.equal(runClass);
        expect(required(history), reason).to.equal(1000 * MB);
      }
      expect(RUN_CLASSES).to.have.length(7);
      expect(() => run(null, 'resource')).to.throw("Unknown run outcome 'resource'");
    });

    it('keeps the history of one workload apart from another', () => {
      const history = run(null, 'memory-limit');
      expect(required(history, 'site-b')).to.equal(0);
      const other = resourceHistoryFactory({
        history,
        workload: 'site-b',
        reason: 'completed',
        diagnostics: { peakBytes: 100 * MB, peakSource: 'kernel' },
        budget,
        at: 'later',
      });
      expect(other.workload).to.equal('site-b');
      expect(required(other, 'site-b')).to.equal(125 * MB);
      expect(required(null)).to.equal(0);
    });
  });

  it('reads the memory available now and never more memory than the host has', () => {
    const capacity = hostCapacityFactory({ availableMemory: () => 123 });
    expect(capacity.availableMemoryBytes).to.equal(123);
    expect(capacity.totalMemoryBytes).to.be.at.most(os.totalmem());
    expect(capacity.cpus).to.be.within(1, os.availableParallelism());
  });
});

describe('cgroup limits', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-cgroup-'));
  });

  afterEach(() => {
    fs.removeSync(root);
  });

  const stage = (path, files) => {
    for (const [name, value] of Object.entries(files)) fs.outputFileSync(nodePath.join(root, path, name), value);
  };

  it('takes the tightest memory and CPU limit of a cgroup and its ancestors', () => {
    stage('/kubepods', { 'memory.max': `${4 * GB}\n`, 'cpu.max': '200000 100000\n' });
    stage('/kubepods/pod', { 'memory.max': `${2 * GB}\n`, 'cpu.max': 'max 100000\n' });
    stage('/kubepods/pod/container', { 'memory.max': 'max\n', 'cpu.max': '150000 100000\n' });
    expect(cgroupLimits('/kubepods/pod/container', root)).to.deep.equal({ memoryBytes: 2 * GB, cpus: 1.5 });
  });

  it('reports no limit where no cgroup sets one, or where the files are missing', () => {
    stage('/user.slice', { 'memory.max': 'max\n', 'cpu.max': 'max 100000\n' });
    expect(cgroupLimits('/user.slice', root)).to.deep.equal({ memoryBytes: null, cpus: null });
    expect(cgroupLimits('/absent/path', root)).to.deep.equal({ memoryBytes: null, cpus: null });
  });

  it('reports a CPU quota only where the cgroup has the controller that enforces it', () => {
    // A user manager that gets only the memory and pids controllers: no cpu.max at all.
    stage('/user/app.slice/task.scope', { 'cgroup.controllers': 'memory pids\n', 'memory.max': `${GB}\n` });
    expect(cgroupEnforcedLimits('/user/app.slice/task.scope', root)).to.deep.equal({
      cgroup: '/user/app.slice/task.scope',
      memoryMaxBytes: GB,
      cpus: null,
      cpuController: false,
    });
    stage('/system.slice/task.scope', {
      'cgroup.controllers': 'cpu memory pids\n',
      'memory.max': `${GB}\n`,
      'cpu.max': '200000 100000\n',
    });
    expect(cgroupEnforcedLimits('/system.slice/task.scope', root)).to.include({ cpus: 2, cpuController: true });
  });

  it('reads the kernel counters of a cgroup: memory now and at its peak, CPU time and out-of-memory kills', () => {
    stage('/task.scope', {
      'memory.current': `${100 * MB}\n`,
      'memory.peak': `${300 * MB}\n`,
      'cpu.stat': 'usage_usec 2500000\nuser_usec 2000000\n',
      'memory.events': 'low 0\nhigh 0\nmax 4\noom 1\noom_kill 1\noom_group_kill 0\n',
    });
    expect(cgroupUsage('/task.scope', root)).to.deep.equal({
      memoryBytes: 100 * MB,
      peakBytes: 300 * MB,
      cpuMs: 2500,
      oomKills: 1,
    });
    expect(cgroupUsage('/gone.scope', root)).to.deep.equal({
      memoryBytes: null,
      peakBytes: null,
      cpuMs: null,
      oomKills: null,
    });
  });
});
