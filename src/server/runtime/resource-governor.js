/**
 * Resource governor: how much of the host a managed task may use, and whether it may start now.
 *
 * A profile is the one resource policy of a workload: the test footprints and the build tasks name
 * one. Capacity distinguishes the host memory, the limit of this process's cgroup and its
 * ancestors, and the memory available now. A budget is the share of that capacity a profile allows;
 * an admission cuts it to what the host can give above its reserve.
 *
 * @module src/server/runtime/resource-governor.js
 * @namespace ResourceGovernor
 */
import os from 'node:os';
import { cgroupLimits, cgroupPathOf } from './linux-resources.js';

const MB = 1024 * 1024;

/** `required` refuses a task without kernel limits, `off` uses the portable monitor only. */
export const RESOURCE_ISOLATION_ENV = 'UNDERPOST_RESOURCE_ISOLATION';

/** Host memory, in MB, a task never takes; it replaces the reserve share of the profile. */
export const MEMORY_RESERVE_ENV = 'UNDERPOST_MEMORY_RESERVE_MB';

const ISOLATION_MODES = ['preferred', 'required', 'off'];

/**
 * @constant RESOURCE_PROFILES
 * @description The resource policy of each workload class. `memoryShare` of the memory is the most
 * a task may hold, and it stops when the host has less than `reserveShare` available. `cpuShare` of
 * the CPUs sizes the thread pools and the CPU quota, and the task runs at `nice`. The task is
 * sampled every `sampleIntervalMs`. A Node.js workload gets `heapShare` of its memory as V8 old
 * space, so V8 collects before the memory limit stops it. `concurrency` tasks of a profile run on
 * one host at a time, and a task stops after `maxRuntimeMs`. A task asks for `memoryMargin` more
 * than its resource history shows it needs.
 *
 * `heavy` comes from TypeDoc: the Cyberia site peaks at 1.35 GB RSS with a 1.2 GB old space. `build` is a
 * task that starts managed tasks of its own, such as the client build and its TypeDoc tasks: it may hold
 * what the host has above its reserve, and its tasks keep their own limits.
 * @memberof ResourceGovernor
 */
export const RESOURCE_PROFILES = Object.freeze({
  standard: {
    description: 'A background task beside an interactive desktop.',
    memoryShare: 0.3,
    reserveShare: 0.05,
    cpuShare: 0.5,
    nice: 10,
    sampleIntervalMs: 250,
  },
  balanced: {
    description: 'A task on a host with little other work.',
    memoryShare: 0.5,
    reserveShare: 0.03,
    cpuShare: 0.75,
    nice: 5,
    sampleIntervalMs: 250,
  },
  heavy: {
    description: 'One large Node.js workload per host at a time, such as TypeDoc.',
    memoryShare: 0.3,
    reserveShare: 0.05,
    cpuShare: 0.5,
    nice: 10,
    sampleIntervalMs: 1000,
    heapShare: 0.8,
    concurrency: 1,
    maxRuntimeMs: 30 * 60 * 1000,
    memoryMargin: 0.25,
  },
  build: {
    description: 'A build that runs managed tasks of its own, below the priority of the workloads the host serves.',
    memoryShare: 0.9,
    reserveShare: 0.05,
    cpuShare: 0.5,
    nice: 10,
    sampleIntervalMs: 1000,
  },
});

/**
 * @constant RUN_CLASSES
 * @description What one run of a workload shows about the memory it needs. Only a `measured` run,
 * one that completed with a peak, measures it. A `memory-limit` run shows only that the workload
 * needs more than the limit that stopped it. `unmeasured` (completed without a peak),
 * `host-pressure`, `timeout`, `interrupted` and `failed` runs show nothing about it.
 * @memberof ResourceGovernor
 */
export const RUN_CLASSES = Object.freeze([
  'measured',
  'unmeasured',
  'memory-limit',
  'host-pressure',
  'timeout',
  'interrupted',
  'failed',
]);

/**
 * A memory amount as an operator reads it.
 * @param {number} bytes
 * @returns {string} Whole megabytes, such as `512 MB`.
 * @memberof ResourceGovernor
 */
export const megabytes = (bytes) => `${Math.round(bytes / MB)} MB`;

/**
 * Resolves a profile by name.
 * @param {string} name
 * @returns {object} The profile, with its name.
 * @throws {Error} On an unknown profile.
 * @memberof ResourceGovernor
 */
export const resourceProfileFactory = (name) => {
  if (!Object.hasOwn(RESOURCE_PROFILES, name))
    throw new Error(`Unknown resource profile '${name}': expected ${Object.keys(RESOURCE_PROFILES).join(', ')}`);
  return { name, ...RESOURCE_PROFILES[name] };
};

/**
 * The isolation the operator asks for.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'preferred'|'required'|'off'}
 * @throws {Error} On an unknown mode.
 * @memberof ResourceGovernor
 */
export const resourceIsolationFactory = (env = process.env) => {
  const mode = env[RESOURCE_ISOLATION_ENV] || 'preferred';
  if (!ISOLATION_MODES.includes(mode))
    throw new Error(`${RESOURCE_ISOLATION_ENV}='${mode}': expected ${ISOLATION_MODES.join(', ')}`);
  return mode;
};

/**
 * The memory and CPUs this process can use: the host, the limits of its cgroup and of every
 * ancestor, and the memory available now.
 * @param {object} [options]
 * @param {() => number} [options.availableMemory] - Memory available to this process, in bytes.
 * @returns {{hostMemoryBytes: number, cgroupMemoryBytes: number|null, totalMemoryBytes: number,
 *   availableMemoryBytes: number, cpus: number, cgroupCpus: number|null}}
 * @memberof ResourceGovernor
 */
export const hostCapacityFactory = ({ availableMemory = () => process.availableMemory() } = {}) => {
  const cgroupPath = cgroupPathOf();
  const limits = cgroupPath ? cgroupLimits(cgroupPath) : { memoryBytes: null, cpus: null };
  const hostMemoryBytes = os.totalmem();
  return {
    hostMemoryBytes,
    cgroupMemoryBytes: limits.memoryBytes,
    // Without a constraint Node reports 0 or 2^64.
    totalMemoryBytes: Math.min(
      hostMemoryBytes,
      limits.memoryBytes ?? Infinity,
      process.constrainedMemory() || Infinity,
    ),
    availableMemoryBytes: availableMemory(),
    cpus: Math.max(1, Math.min(os.availableParallelism(), Math.ceil(limits.cpus ?? Infinity))),
    cgroupCpus: limits.cpus,
  };
};

/**
 * The host reserve the operator sets, in bytes.
 * @param {NodeJS.ProcessEnv} env
 * @param {number} totalMemoryBytes
 * @returns {number|null} Null when the operator sets none.
 * @throws {Error} On a value that is not a whole number of MB below the memory of the host.
 * @memberof ResourceGovernor
 */
export const memoryReserveOverrideOf = (env, totalMemoryBytes) => {
  const value = env[MEMORY_RESERVE_ENV];
  if (value === undefined || value === '') return null;
  const reserveMb = /^\d+$/.test(value) ? Number(value) : NaN;
  const maxMb = Math.floor(totalMemoryBytes / MB) - 1;
  if (!Number.isSafeInteger(reserveMb) || reserveMb < 1 || reserveMb > maxMb)
    throw new Error(`${MEMORY_RESERVE_ENV}='${value}': expected a whole number of MB from 1 to ${maxMb}`);
  return reserveMb * MB;
};

/**
 * The budget of a profile on one host. `profileReserveBytes` is the reserve of the profile, which an
 * operator reserve replaces.
 * @param {object} params
 * @param {string} params.profile - Profile name.
 * @param {{totalMemoryBytes: number, cpus: number}} params.capacity
 * @param {NodeJS.ProcessEnv} [params.env]
 * @returns {{profile: string, memoryBytes: number, reserveBytes: number, profileReserveBytes: number,
 *   threads: number, nice: number, sampleIntervalMs: number}}
 * @throws {Error} On an unknown profile or an invalid operator reserve.
 * @memberof ResourceGovernor
 */
export const resourceBudgetFactory = ({ profile, capacity, env = process.env }) => {
  const policy = resourceProfileFactory(profile);
  const profileReserveBytes = Math.floor(capacity.totalMemoryBytes * policy.reserveShare);
  return {
    profile,
    memoryBytes: Math.floor(capacity.totalMemoryBytes * policy.memoryShare),
    reserveBytes: memoryReserveOverrideOf(env, capacity.totalMemoryBytes) ?? profileReserveBytes,
    profileReserveBytes,
    threads: Math.max(1, Math.floor(capacity.cpus * policy.cpuShare)),
    nice: policy.nice,
    sampleIntervalMs: policy.sampleIntervalMs,
  };
};

/**
 * How an operator reserve changes the policy, in words; empty when the profile reserve applies.
 * @param {{reserveBytes: number, profileReserveBytes: number}} budget
 * @returns {string}
 * @memberof ResourceGovernor
 */
export const reserveOverrideNotice = ({ reserveBytes, profileReserveBytes }) =>
  reserveBytes === profileReserveBytes
    ? ''
    : `${MEMORY_RESERVE_ENV} ${reserveBytes < profileReserveBytes ? 'lowers' : 'raises'} the host reserve from ` +
      `${megabytes(profileReserveBytes)} to ${megabytes(reserveBytes)}; this does not show that the task fits`;

/**
 * Whether a task may start now. It gets its budget, cut to the memory the host has above its
 * reserve; a task that needs more than that does not start.
 * @param {object} params
 * @param {object} params.budget - From {@link resourceBudgetFactory}.
 * @param {{availableMemoryBytes: number}} params.capacity
 * @param {number} [params.requiredBytes] - Memory the task is known to need.
 * @returns {{admitted: boolean, reason?: string, budget: object}} The budget the task runs with,
 *   with `heapBytes` where its profile sets a heap share.
 * @memberof ResourceGovernor
 */
export const admissionFactory = ({ budget, capacity, requiredBytes = 0 }) => {
  const policy = resourceProfileFactory(budget.profile);
  const memoryBytes = Math.max(0, Math.min(budget.memoryBytes, capacity.availableMemoryBytes - budget.reserveBytes));
  const granted = {
    ...budget,
    memoryBytes,
    ...(policy.heapShare ? { heapBytes: Math.floor(memoryBytes * policy.heapShare) } : {}),
  };
  if (memoryBytes > 0 && memoryBytes >= requiredBytes) return { admitted: true, budget: granted };
  const notice = reserveOverrideNotice(budget);
  return {
    admitted: false,
    budget: granted,
    reason:
      `the host has ${megabytes(capacity.availableMemoryBytes)} available and keeps a ${megabytes(budget.reserveBytes)} ` +
      `reserve, so the task can get ${megabytes(memoryBytes)}` +
      (requiredBytes ? `; its resource history asks for ${megabytes(requiredBytes)}` : '') +
      (notice ? ` (${notice})` : ''),
  };
};

/**
 * The resource history of a workload after one more run. A measured run replaces the peak and drops
 * the limits that stopped earlier runs; a memory-limit run raises the limit the workload is known
 * to exceed. A history of another workload is dropped.
 * @param {object} params
 * @param {object|null} params.history - The history so far.
 * @param {string} params.workload - Identity of the workload: its runs are interchangeable.
 * @param {string} params.reason - How the run ended, as the managed process runner names it.
 * @param {{peakBytes: number, peakSource: string}|null} [params.diagnostics] - What the run measured.
 * @param {{memoryBytes: number}} params.budget - The budget the run had.
 * @param {string} params.at - When the run ended.
 * @returns {{workload: string, peak?: object, exceeded?: object, last: {class: string, at: string}}}
 *   `last.class` is one of {@link RUN_CLASSES}.
 * @throws {Error} On an unknown reason.
 * @memberof ResourceGovernor
 */
export const resourceHistoryFactory = ({ history, workload, reason, diagnostics, budget, at }) => {
  const runClass =
    { completed: diagnostics?.peakBytes ? 'measured' : 'unmeasured', cancelled: 'interrupted' }[reason] ?? reason;
  if (!RUN_CLASSES.includes(runClass)) throw new Error(`Unknown run outcome '${reason}'`);
  const kept = history?.workload === workload ? history : { workload };
  const last = { class: runClass, at };
  if (runClass === 'measured')
    return { workload, peak: { bytes: diagnostics.peakBytes, source: diagnostics.peakSource, at }, last };
  if (runClass === 'memory-limit')
    return { ...kept, exceeded: { bytes: Math.max(kept.exceeded?.bytes ?? 0, budget.memoryBytes), at }, last };
  return { ...kept, last };
};

/**
 * The memory a workload is known to need, with the margin of its profile: its measured peak, or
 * more than the largest limit that stopped it since. Zero without a history of this workload.
 * @param {object} params
 * @param {object|null} params.history - From {@link resourceHistoryFactory}.
 * @param {string} params.workload
 * @param {string} params.profile - Profile name.
 * @returns {number} Bytes.
 * @memberof ResourceGovernor
 */
export const memoryRequirementFactory = ({ history, workload, profile }) => {
  if (history?.workload !== workload) return 0;
  const { memoryMargin = 0 } = resourceProfileFactory(profile);
  return Math.ceil(Math.max(history.peak?.bytes ?? 0, history.exceeded?.bytes ?? 0) * (1 + memoryMargin));
};

/**
 * The environment that sizes a workload to its budget: Go and V8 thread pools, and the V8 old space
 * of a Node.js workload. A value the operator set wins.
 * @param {object} params
 * @param {{threads: number, heapBytes?: number}} params.budget
 * @param {NodeJS.ProcessEnv} params.env
 * @returns {NodeJS.ProcessEnv}
 * @memberof ResourceGovernor
 */
export const workloadEnvFactory = ({ budget, env }) => ({
  GOMAXPROCS: `${budget.threads}`,
  ...env,
  ...(budget.heapBytes
    ? {
        NODE_OPTIONS: [
          `--max-old-space-size=${Math.floor(budget.heapBytes / MB)}`,
          `--v8-pool-size=${budget.threads}`,
          env.NODE_OPTIONS,
        ]
          .filter(Boolean)
          .join(' '),
      }
    : {}),
});

/**
 * Classifies the memory the host has available against a reserve. Below the reserve is critical.
 * Pressure starts below twice the reserve and ends only above two and a half times it, so a value
 * near the line does not toggle the state.
 * @param {number} reserveBytes
 * @returns {(availableBytes: number) => 'normal'|'pressure'|'critical'}
 * @memberof ResourceGovernor
 */
export const memoryPressureFactory = (reserveBytes) => {
  let pressure = false;
  return (availableBytes) => {
    if (availableBytes < reserveBytes) return 'critical';
    pressure = availableBytes < reserveBytes * (pressure ? 2.5 : 2);
    return pressure ? 'pressure' : 'normal';
  };
};
