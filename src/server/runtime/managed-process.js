/**
 * Managed process runner: runs one external workload in its own process group, inside a budget,
 * and resolves with how it ended. It never runs a shell.
 *
 * The workload is independent of the runner. A budget sizes it and sets its priority; the runner
 * samples it, stops it when it holds more than its memory or the host falls below its reserve, and
 * kills what it leaves behind. A boundary (a kernel-enforced scope) adds the limits the kernel
 * applies and the counters it keeps for the whole workload. Every measurement names its source:
 * `kernel` read at exit, `kernel-sampled` read last while the workload ran, `sampled` from `/proc`.
 *
 * @module src/server/runtime/managed-process.js
 * @namespace ManagedProcess
 */
import fs from 'fs-extra';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { loggerFactory } from '../ops/logger.js';
import { processTreeUsage, systemdScopeBoundary, systemdScopeSupport } from './linux-resources.js';
import {
  RESOURCE_ISOLATION_ENV,
  admissionFactory,
  hostCapacityFactory,
  megabytes,
  memoryPressureFactory,
  resourceBudgetFactory,
  resourceIsolationFactory,
  workloadEnvFactory,
} from './resource-governor.js';

const logger = loggerFactory(import.meta);

/** Time a workload gets to hand over the output that is left in its pipes after it exits. */
const LOG_FLUSH_MS = 1000;

/** Time between two RESOURCE_SAMPLE events of a long workload. */
const SAMPLE_EVENT_INTERVAL_MS = 15000;

/** Time between two samples of a workload that runs without a budget. */
const DIAGNOSE_INTERVAL_MS = 250;

/** Signals an operator stops a run with; a supervisor forwards them to its workload. */
export const INTERRUPT_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);

/** Lifecycle events of a managed task an operator has to act on. */
export const WARNING_EVENTS = new Set([
  'TASK_DEFERRED',
  'TASK_REJECTED',
  'TASK_FAILED',
  'TASK_CANCEL_REQUESTED',
  'TASK_CANCELLED',
  'RESOURCE_THROTTLED',
  'RESOURCE_RESERVE_OVERRIDE',
]);

/**
 * Why a workload ended. `memory-limit`: the kernel or the runner stopped it at its memory limit.
 * `host-pressure`: the runner stopped it because the host fell below its reserve.
 * @param {{exitCode: number|null, timedOut: boolean, cancelled: string, stoppedFor: string, oomKilled: boolean}} outcome
 * @returns {'completed'|'failed'|'timeout'|'cancelled'|'memory-limit'|'host-pressure'}
 * @memberof ManagedProcess
 */
export const terminationReason = ({ exitCode, timedOut, cancelled, stoppedFor, oomKilled }) => {
  if (oomKilled) return 'memory-limit';
  if (stoppedFor) return stoppedFor;
  if (timedOut) return 'timeout';
  if (cancelled) return 'cancelled';
  return exitCode === 0 ? 'completed' : 'failed';
};

/**
 * The limits a workload runs under, as an operator reads them. A CPU quota counts only when the
 * kernel shows it; without one the workload runs at a lower priority, which is not a quota.
 * @param {{cgroup: string, memoryMaxBytes: number|null, cpus: number|null, cpuController: boolean}|null} enforced
 *   - The limits the kernel reports, null without a boundary.
 * @param {{memoryBytes: number, threads: number, nice: number}} budget
 * @returns {object}
 * @memberof ManagedProcess
 */
export const resourceLimitsReport = (enforced, budget) => ({
  memory: enforced?.memoryMaxBytes
    ? { enforcement: 'kernel', limitBytes: enforced.memoryMaxBytes, cgroup: enforced.cgroup }
    : { enforcement: 'monitor', limitBytes: budget.memoryBytes },
  cpu: enforced?.cpus
    ? { enforcement: 'kernel', cpus: enforced.cpus }
    : {
        enforcement: `priority (nice ${budget.nice})`,
        requestedCpus: budget.threads,
        quotaUnavailable: !enforced
          ? 'no kernel boundary'
          : enforced.cpuController
            ? 'the scope shows no CPU quota'
            : 'the cpu controller is not delegated to this systemd manager',
      },
});

/**
 * Whether a task of a profile may start now, and the kernel boundary it runs in. A task named by a
 * scope unit runs in a kernel scope where the isolation mode allows one: `off` runs it under the
 * monitor only, `required` refuses it without a kernel limit. A task without a unit runs under the
 * monitor only, so the tasks it starts measure the host and not its scope.
 * @param {object} params
 * @param {string} params.profile - Profile name.
 * @param {string} [params.unit] - Scope unit name, unique per task.
 * @param {number} [params.requiredBytes] - Memory the task is known to need.
 * @returns {{admitted: boolean, reason?: string, budget: object, capacity: object, boundary: object|null,
 *   enforcement: string, isolationRefusal: string}} `isolationRefusal` is empty when the isolation mode
 *   admits the task.
 * @memberof ManagedProcess
 */
export const taskAdmissionFactory = ({ profile, unit = '', requiredBytes = 0 }) => {
  const capacity = hostCapacityFactory();
  const admission = admissionFactory({ budget: resourceBudgetFactory({ profile, capacity }), capacity, requiredBytes });
  if (!unit) return { ...admission, capacity, boundary: null, enforcement: 'monitor', isolationRefusal: '' };
  const isolation = resourceIsolationFactory();
  const scope =
    isolation === 'off' ? { available: false, reason: `${RESOURCE_ISOLATION_ENV}=off` } : systemdScopeSupport();
  return {
    ...admission,
    capacity,
    boundary: scope.available ? systemdScopeBoundary({ unit, budget: admission.budget }) : null,
    enforcement: scope.available ? 'systemd-scope' : `monitor (${scope.reason})`,
    isolationRefusal:
      isolation === 'required' && !scope.available
        ? `${RESOURCE_ISOLATION_ENV}=required and no kernel limit is available: ${scope.reason}`
        : '',
  };
};

/**
 * What a run used, as an operator reads it: wall and CPU time with the average cores they give, the
 * peak memory with its source, and the limits it ran under. CPU time is a sum over every process,
 * not a utilization. `heapLimitBytes` is the V8 limit the budget set, not a measured heap.
 * @param {object} params
 * @param {object} params.outcome - From {@link runManagedProcess} with `diagnose`.
 * @param {{memoryBytes: number, threads: number, nice: number, heapBytes?: number}} params.budget
 * @returns {object}
 * @memberof ManagedProcess
 */
export const runMetricsFactory = ({ outcome, budget }) => {
  const { diagnostics } = outcome;
  return {
    durationMs: outcome.durationMs,
    cpuMs: diagnostics?.cpuMs ?? null,
    cpuSource: diagnostics?.cpuSource ?? null,
    averageCores:
      diagnostics && outcome.durationMs ? Number((diagnostics.cpuMs / outcome.durationMs).toFixed(2)) : null,
    peakBytes: diagnostics?.peakBytes ?? null,
    peakSource: diagnostics?.peakSource ?? 'unmeasured',
    peakRssBytes: diagnostics?.peakRssBytes ?? null,
    heapLimitBytes: budget.heapBytes ?? null,
    limits: resourceLimitsReport(outcome.limits, budget),
  };
};

/**
 * Runs a command in a new process group and resolves with how it ended.
 *
 * The group isolates the workload: a stop reaches every process of it, and the runner kills what
 * it leaves behind. `control.stop(signal)` forwards a signal to the group and kills it after
 * `graceMs`; a second call kills it at once.
 * @param {object} params
 * @param {string} params.command - Executable.
 * @param {string[]} [params.args] - Arguments.
 * @param {string} params.cwd - Working directory.
 * @param {NodeJS.ProcessEnv} [params.env] - Environment.
 * @param {number} [params.timeoutMs] - Time limit, 0 for none.
 * @param {number} [params.graceMs] - Time between a stop and SIGKILL.
 * @param {boolean} [params.diagnose] - Return the peak memory and the CPU time of the workload.
 * @param {object|null} [params.budget] - From the resource governor. Null runs the workload without limits.
 * @param {{wrap: Function, attach: Function, usage: Function}|null} [params.boundary] - Kernel boundary of the budget.
 * @param {() => number} [params.availableMemory] - Memory the host has available, in bytes.
 * @param {{stop?: Function}} [params.control] - Receives `stop` while the workload runs.
 * @param {string} [params.logPath] - File that keeps the output, which still reaches the console.
 * @param {(event: string, fields: object) => void} [params.onEvent] - Lifecycle events.
 * @returns {Promise<{exitCode: number|null, signal: string|null, timedOut: boolean, cancelled: string,
 *   overBudget: string, stoppedFor: string, oomKilled: boolean, durationMs: number, limits: object|null,
 *   diagnostics?: {peakBytes: number, peakSource: string, peakRssBytes: number, cpuMs: number, cpuSource: string}}>}
 *   `diagnostics` is null when nothing measured the workload, such as one that ended before the first sample.
 * @memberof ManagedProcess
 */
export const runManagedProcess = ({
  command,
  args = [],
  cwd,
  env = process.env,
  timeoutMs = 0,
  graceMs = 10000,
  diagnose = false,
  budget = null,
  boundary = null,
  availableMemory = () => process.availableMemory(),
  control = {},
  logPath = '',
  onEvent = () => {},
}) =>
  new Promise((resolve) => {
    const started = performance.now();
    const elapsedMs = () => Math.round(performance.now() - started);
    const launch = boundary ? boundary.wrap(command, args) : { command, args };
    const child = spawn(launch.command, launch.args, {
      cwd,
      env: budget ? workloadEnvFactory({ budget, env }) : env,
      stdio: ['ignore', logPath ? 'pipe' : 'inherit', logPath ? 'pipe' : 'inherit'],
      detached: true,
    });
    // The processes the workload starts inherit this priority.
    if (budget && child.pid)
      try {
        os.setPriority(child.pid, budget.nice);
      } catch {}
    const log = logPath ? fs.createWriteStream(logPath) : null;
    const closed = log ? new Promise((done) => child.once('close', done)) : null;
    if (log)
      for (const [stream, sink] of [
        [child.stdout, process.stdout],
        [child.stderr, process.stderr],
      ])
        stream.on('data', (chunk) => {
          sink.write(chunk);
          log.write(chunk);
        });
    let timedOut = false;
    let cancelled = '';
    let overBudget = '';
    let stoppedFor = '';
    let limits = null;
    let diagnostics = null;
    let kernel = null;
    let escalation = null;
    let lastSampleEvent = 0;
    let pressureState = 'normal';
    const pressure = budget ? memoryPressureFactory(budget.reserveBytes) : null;
    const signalGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
        return true;
      } catch {
        return false;
      }
    };
    const stopGroup = (signal) => {
      if (escalation) return signalGroup('SIGKILL');
      signalGroup(signal);
      escalation = setTimeout(() => signalGroup('SIGKILL'), graceMs);
    };
    control.stop = (signal = 'SIGTERM') => {
      cancelled ||= signal;
      onEvent('TASK_CANCEL_REQUESTED', { pid: child.pid, signal, elapsedMs: elapsedMs() });
      stopGroup(signal);
    };
    if (child.pid) {
      onEvent('TASK_START', { pid: child.pid, command, boundary: Boolean(boundary) });
      if (budget && !boundary) onEvent('RESOURCE_LIMITS', { pid: child.pid, ...resourceLimitsReport(null, budget) });
      boundary
        ?.attach(child.pid)
        .then((enforced) => {
          limits = enforced;
          onEvent('RESOURCE_LIMITS', {
            pid: child.pid,
            ...(budget ? resourceLimitsReport(enforced, budget) : { enforced: enforced ?? 'none' }),
          });
        })
        .catch(() => {});
    }
    // The kernel counters cover every process the workload started, also those that ended.
    const measure = (scoped, tree) => {
      if (scoped?.peakBytes != null) kernel = { ...kernel, peakBytes: scoped.peakBytes };
      if (scoped?.cpuMs != null) kernel = { ...kernel, cpuMs: scoped.cpuMs };
      if (scoped?.oomKills != null) kernel = { ...kernel, oomKills: scoped.oomKills };
      const peakRssBytes = Math.max(diagnostics?.peakRssBytes ?? 0, tree?.rssBytes ?? 0);
      const cpuMs = kernel?.cpuMs ?? Math.max(diagnostics?.cpuMs ?? 0, tree?.cpuMs ?? 0);
      if (!kernel?.peakBytes && !peakRssBytes) return;
      diagnostics = {
        peakBytes: kernel?.peakBytes ?? peakRssBytes,
        peakSource: kernel?.peakBytes ? 'kernel-sampled' : 'sampled',
        peakRssBytes,
        cpuMs,
        cpuSource: kernel?.cpuMs != null ? 'kernel-sampled' : 'sampled',
      };
    };
    const sample = () => {
      const tree = processTreeUsage(child.pid);
      const scoped = boundary?.usage();
      measure(scoped, tree);
      // A cgroup also counts the page cache of the files the workload writes; RSS is what it holds.
      const memoryBytes = scoped?.memoryBytes ?? tree?.rssBytes;
      const rssBytes = tree?.rssBytes ?? memoryBytes;
      const cpuMs = scoped?.cpuMs ?? tree?.cpuMs;
      if (!budget || overBudget) return;
      const available = availableMemory();
      const state = pressure(available);
      if (state === 'pressure' && pressureState === 'normal')
        onEvent('RESOURCE_THROTTLED', { pid: child.pid, availableMemoryBytes: available, memoryBytes });
      pressureState = state;
      if (performance.now() - lastSampleEvent >= SAMPLE_EVENT_INTERVAL_MS) {
        lastSampleEvent = performance.now();
        onEvent('RESOURCE_SAMPLE', {
          pid: child.pid,
          elapsedMs: elapsedMs(),
          memoryBytes,
          rssBytes,
          cpuMs,
          availableMemoryBytes: available,
        });
      }
      if (memoryBytes > budget.memoryBytes) {
        stoppedFor = 'memory-limit';
        overBudget = `the workload held ${megabytes(memoryBytes)}, its budget is ${megabytes(budget.memoryBytes)}`;
      } else if (state === 'critical') {
        stoppedFor = 'host-pressure';
        overBudget = `the host had ${megabytes(available)} available, its reserve is ${megabytes(budget.reserveBytes)}`;
      }
      // Memory can grow faster than a grace time: the workload stops at once.
      if (overBudget) signalGroup('SIGKILL');
    };
    const sampler = diagnose || budget ? setInterval(sample, budget?.sampleIntervalMs ?? DIAGNOSE_INTERVAL_MS) : null;
    const deadline =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            stopGroup('SIGTERM');
          }, timeoutMs)
        : null;
    let finished = false;
    const finish = (exitCode, signal) => {
      if (finished) return;
      finished = true;
      clearInterval(sampler);
      clearTimeout(deadline);
      clearTimeout(escalation);
      delete control.stop;
      if (child.pid && signalGroup(0)) {
        logger.warn('Killing the processes the workload left behind', { pid: child.pid });
        signalGroup('SIGKILL');
      }
      const final = boundary?.usage();
      measure(final, null);
      if (diagnostics && final?.peakBytes != null) diagnostics.peakSource = 'kernel';
      if (diagnostics && final?.cpuMs != null) diagnostics.cpuSource = 'kernel';
      const systemdResult = boundary?.result();
      const outcome = {
        exitCode,
        signal,
        timedOut,
        cancelled,
        overBudget,
        stoppedFor,
        oomKilled: kernel?.oomKills > 0 || systemdResult === 'oom-kill',
        durationMs: elapsedMs(),
        limits,
        ...(diagnose ? { diagnostics } : {}),
      };
      const reason = terminationReason(outcome);
      onEvent({ completed: 'TASK_COMPLETED', cancelled: 'TASK_CANCELLED' }[reason] ?? 'TASK_FAILED', {
        pid: child.pid ?? null,
        reason,
        exitCode,
        signal,
        durationMs: outcome.durationMs,
        overBudget,
        diagnostics,
      });
      if (!log) return resolve(outcome);
      // The pipes can hold output after the exit, and a process left behind can keep them open.
      Promise.race([closed, new Promise((wait) => setTimeout(wait, LOG_FLUSH_MS))]).then(() =>
        log.end(() => resolve(outcome)),
      );
    };
    child.once('error', (error) => {
      logger.error('Workload failed to start', { command: launch.command, message: error.message });
      finish(null, null);
    });
    child.once('exit', finish);
  });
