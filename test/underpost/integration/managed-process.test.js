'use strict';

// Needs only Node on Linux. The scope cases also need a systemd manager that delegates the memory controller.

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import { runManagedProcess, terminationReason } from '../../../src/server/runtime/managed-process.js';
import { systemdScopeBoundary, systemdScopeSupport } from '../../../src/server/runtime/linux-resources.js';
import { alive } from '../../support/process.js';

const MB = 1024 * 1024;
const procfs = fs.existsSync('/proc/self/stat');

const until = async (condition, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
};

const node = (script, options = {}) =>
  runManagedProcess({ command: process.execPath, args: ['-e', script], cwd: os.tmpdir(), ...options });

const scratch = () => fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-managed-'));

const budget = {
  profile: 'standard',
  memoryBytes: 64 * MB,
  reserveBytes: 0,
  threads: 2,
  nice: 7,
  sampleIntervalMs: 50,
};

describe('managed process', () => {
  it('reports the exit code of a workload', async () => {
    const outcome = await node('process.exit(3)');
    expect(outcome).to.include({ exitCode: 3, signal: null, timedOut: false, cancelled: '', overBudget: '' });
    expect(outcome.durationMs).to.be.a('number');
    expect(terminationReason(outcome)).to.equal('failed');
  });

  it('reports a workload that a signal from outside stopped', async () => {
    const outcome = await node("process.kill(process.pid, 'SIGTERM')");
    expect(outcome).to.include({ exitCode: null, signal: 'SIGTERM' });
    expect(terminationReason(outcome)).to.equal('failed');
  });

  it('stops a workload at its time limit', async () => {
    const outcome = await node('setInterval(() => {}, 1000)', { timeoutMs: 500 });
    expect(outcome).to.include({ timedOut: true, signal: 'SIGTERM' });
    expect(terminationReason(outcome)).to.equal('timeout');
  });

  it('kills a workload that ignores SIGTERM after the grace time', async () => {
    const outcome = await node("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)", {
      timeoutMs: 1000,
      graceMs: 200,
    });
    expect(outcome).to.include({ timedOut: true, signal: 'SIGKILL' });
  });

  it('stops on request, gracefully first, and at once on a second request', async () => {
    const control = {};
    const graceful = node("process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000)", { control });
    await until(() => control.stop);
    await new Promise((resolve) => setTimeout(resolve, 200));
    control.stop('SIGTERM');
    const stopped = await graceful;
    expect(stopped).to.include({ exitCode: 0, cancelled: 'SIGTERM' });
    expect(terminationReason(stopped)).to.equal('cancelled');
    expect(control.stop).to.equal(undefined);

    const stubborn = node("process.on('SIGINT', () => {}); setInterval(() => {}, 1000)", { control, graceMs: 60000 });
    await until(() => control.stop);
    await new Promise((resolve) => setTimeout(resolve, 200));
    control.stop('SIGINT');
    control.stop('SIGINT');
    expect(await stubborn).to.include({ signal: 'SIGKILL', cancelled: 'SIGINT' });
  });

  it('kills the processes a workload leaves behind', async () => {
    const pidFile = nodePath.join(scratch(), 'orphan.pid');
    const outcome = await node(
      [
        "const orphan = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
        `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(orphan.pid));`,
        'orphan.unref();',
      ].join(' '),
    );
    expect(outcome.exitCode).to.equal(0);
    const orphan = Number(fs.readFileSync(pidFile, 'utf8'));
    await until(() => !alive(orphan), 5000);
    expect(alive(orphan)).to.equal(false);
    fs.removeSync(nodePath.dirname(pidFile));
  }, 20000);

  it('stops every descendant when a workload is cancelled', async () => {
    const pidFile = nodePath.join(scratch(), 'descendant.pid');
    const control = {};
    const running = node(
      [
        "const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
        `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
        'setInterval(() => {}, 1000);',
      ].join(' '),
      { control, graceMs: 500 },
    );
    await until(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8'));
    const descendant = Number(fs.readFileSync(pidFile, 'utf8'));
    control.stop('SIGTERM');
    expect(terminationReason(await running)).to.equal('cancelled');
    await until(() => !alive(descendant), 5000);
    expect(alive(descendant)).to.equal(false);
    fs.removeSync(nodePath.dirname(pidFile));
  }, 20000);

  it('keeps the output of a workload in its log, and shows it as well', async () => {
    const logPath = nodePath.join(scratch(), 'workload.log');
    const outcome = await node("console.log('to out'); console.error('to err')", { logPath });
    expect(outcome.exitCode).to.equal(0);
    expect(fs.readFileSync(logPath, 'utf8').split('\n').sort()).to.deep.equal(['', 'to err', 'to out']);
    fs.removeSync(nodePath.dirname(logPath));
  });

  it('reports a workload that cannot start', async () => {
    const outcome = await runManagedProcess({
      command: nodePath.join(os.tmpdir(), 'no-such-binary'),
      cwd: os.tmpdir(),
    });
    expect(outcome).to.include({ exitCode: null, signal: null });
    expect(terminationReason(outcome)).to.equal('failed');
  });

  it.skipIf(!procfs)('stops a workload that holds more than its memory budget', async () => {
    const outcome = await node(
      'const held = Buffer.alloc(160 * 1024 * 1024, 1); setInterval(() => held.length, 1000)',
      {
        budget,
      },
    );
    expect(outcome).to.include({ signal: 'SIGKILL', timedOut: false });
    expect(outcome.overBudget).to.match(/^the workload held \d+ MB, its budget is 64 MB$/);
    expect(outcome.stoppedFor).to.equal('memory-limit');
    expect(terminationReason(outcome)).to.equal('memory-limit');
  });

  it('stops a workload when the host runs below its reserve, and reports pressure before', async () => {
    const events = [];
    let available = 2.2 * 1024 * MB;
    const outcome = await node('setInterval(() => {}, 1000)', {
      budget: { ...budget, memoryBytes: Infinity, reserveBytes: 1024 * MB },
      availableMemory: () => (available -= 128 * MB),
      onEvent: (event) => events.push(event),
    });
    expect(outcome.signal).to.equal('SIGKILL');
    expect(outcome.overBudget).to.match(/^the host had \d+ MB available, its reserve is 1024 MB$/);
    expect(terminationReason(outcome)).to.equal('host-pressure');
    expect(events).to.include.members(['TASK_START', 'RESOURCE_LIMITS', 'RESOURCE_THROTTLED', 'TASK_FAILED']);
    expect(events.filter((event) => event === 'RESOURCE_THROTTLED')).to.have.length(1);
  });

  it('runs a workload at the priority, thread count and heap of its budget', async () => {
    // Only root can raise a priority, and this suite can itself run at the nice value of a budget.
    const nice = Math.min(19, os.getPriority() + 3);
    const logPath = nodePath.join(scratch(), 'workload.log');
    const outcome = await node(
      "setTimeout(() => console.log(require('node:os').getPriority(), process.env.GOMAXPROCS, require('node:v8').getHeapStatistics().heap_size_limit < 512 * 1024 * 1024), 300)",
      {
        budget: { ...budget, memoryBytes: Infinity, nice, heapBytes: 128 * MB },
        logPath,
        env: { PATH: process.env.PATH },
      },
    );
    expect(outcome).to.include({ exitCode: 0, overBudget: '' });
    expect(fs.readFileSync(logPath, 'utf8').trim()).to.equal(`${nice} 2 true`);
    fs.removeSync(nodePath.dirname(logPath));
  });

  it.skipIf(!procfs)('samples the memory and CPU of the workload', async () => {
    const outcome = await node('const held = Buffer.alloc(96 * 1024 * 1024, 1); setTimeout(() => held.length, 1500)', {
      diagnose: true,
    });
    expect(outcome.diagnostics.peakRssBytes).to.be.above(96 * 1024 * 1024);
    expect(outcome.diagnostics).to.include({ peakSource: 'sampled', cpuSource: 'sampled' });
    expect(outcome.diagnostics.peakBytes).to.equal(outcome.diagnostics.peakRssBytes);
    expect(outcome.diagnostics.cpuMs).to.be.at.least(0);
  });

  it('reports no measurement for a workload that ends before its first sample', async () => {
    const outcome = await node('0', {
      diagnose: true,
      budget: { ...budget, memoryBytes: Infinity, sampleIntervalMs: 60000 },
    });
    expect(outcome.diagnostics).to.equal(null);
  });
});

// The kernel boundary: a transient systemd scope. Not a mock — these cases read the real cgroup.
describe.skipIf(!systemdScopeSupport().available)('managed process in a systemd scope', () => {
  const scoped = (script, scopeBudget, options = {}) =>
    node(script, {
      budget: scopeBudget,
      boundary: systemdScopeBoundary({ unit: `underpost-test-${process.pid}-${Date.now()}`, budget: scopeBudget }),
      timeoutMs: 15000,
      ...options,
    });

  it('runs the workload under the memory limits the kernel reports', async () => {
    const events = [];
    const outcome = await scoped(
      'setTimeout(() => {}, 800)',
      { ...budget, memoryBytes: 256 * MB, sampleIntervalMs: 100 },
      {
        onEvent: (event, fields) => events.push({ event, fields }),
      },
    );
    expect(outcome.exitCode).to.equal(0);
    expect(outcome.limits.cgroup).to.match(/\.scope$/);
    expect(outcome.limits.memoryMaxBytes).to.equal(256 * MB);
    const { fields } = events.find(({ event }) => event === 'RESOURCE_LIMITS');
    expect(fields.memory).to.include({ enforcement: 'kernel', limitBytes: 256 * MB });
    // The CPU report follows what this host's manager delegates, never the request alone.
    const delegated = fs
      .readFileSync(`/sys/fs/cgroup${nodePath.dirname(outcome.limits.cgroup)}/cgroup.subtree_control`, 'utf8')
      .split(/\s+/)
      .includes('cpu');
    expect(outcome.limits.cpuController).to.equal(delegated);
    if (delegated) expect(fields.cpu).to.deep.equal({ enforcement: 'kernel', cpus: budget.threads });
    else
      expect(fields.cpu).to.deep.equal({
        enforcement: `priority (nice ${budget.nice})`,
        requestedCpus: budget.threads,
        quotaUnavailable: 'the cpu controller is not delegated to this systemd manager',
      });
  }, 20000);

  it('measures the peak of a workload too short for any sample from the kernel', async () => {
    const outcome = await scoped(
      'const held = Buffer.alloc(150 * 1024 * 1024, 1); setTimeout(() => held.length, 200)',
      { ...budget, memoryBytes: 512 * MB, sampleIntervalMs: 60000 },
      { diagnose: true },
    );
    expect(outcome.exitCode).to.equal(0);
    expect(outcome.diagnostics).to.include({ peakSource: 'kernel', cpuSource: 'kernel', peakRssBytes: 0 });
    expect(outcome.diagnostics.peakBytes).to.be.above(150 * MB);
  }, 20000);

  it('confines an out-of-memory kill to the workload', async () => {
    const outcome = await scoped(
      'const held = []; setInterval(() => held.push(Buffer.alloc(16 * 1024 * 1024, 1)), 10)',
      { ...budget, memoryBytes: 96 * MB },
      // The kernel acts first: no sample may stop the workload before it.
      { budget: undefined },
    );
    expect(outcome.signal).to.equal('SIGKILL');
    expect(outcome.oomKilled).to.equal(true);
    expect(terminationReason(outcome)).to.equal('memory-limit');
  }, 30000);
});
