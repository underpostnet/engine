/**
 * Linux resource adapter: what the kernel reports and enforces for a process tree.
 *
 * It reads `/proc` and cgroup v2, and it starts a task in a transient systemd scope whose cgroup
 * limits the kernel enforces. A limit counts as active only when the scope's cgroup file shows it.
 * Every reader returns null where the host does not provide the data.
 *
 * @module src/server/runtime/linux-resources.js
 * @namespace LinuxResources
 */
import fs from 'fs-extra';
import nodePath from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const CGROUP_ROOT = '/sys/fs/cgroup';

/** Linux reports CPU time in USER_HZ ticks, fixed at 100 per second. */
const CLOCK_TICKS_PER_SECOND = 100;

/** Time a new scope gets to move its process into its cgroup. */
const SCOPE_ATTACH_TIMEOUT_MS = 2000;

const read = (path) => {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

const numberOf = (text) => (/^\d+$/.test(`${text}`.trim()) ? Number(`${text}`.trim()) : null);

// The fields of `/proc/<pid>/stat` after the command name: state, ppid, pgrp and on.
const statFields = (pid) => read(`/proc/${pid}/stat`).split(') ').pop().split(' ');

/**
 * The identity of the current boot: a process record from an earlier boot names no live process.
 * @returns {string|null}
 * @memberof LinuxResources
 */
export const bootId = () => read('/proc/sys/kernel/random/boot_id').trim() || null;

/**
 * The cgroup v2 path of a process.
 * @param {number|string} [pid='self']
 * @returns {string|null} Path below the cgroup root, or null outside cgroup v2.
 * @memberof LinuxResources
 */
export const cgroupPathOf = (pid = 'self') => {
  const line = read(`/proc/${pid}/cgroup`)
    .split('\n')
    .find((entry) => entry.startsWith('0::'));
  return line ? line.slice(3) : null;
};

/**
 * The tightest memory and CPU limits of a cgroup and of every ancestor.
 * @param {string} cgroupPath
 * @param {string} [root] - The cgroup v2 mount.
 * @returns {{memoryBytes: number|null, cpus: number|null}} Limits, null where none applies.
 * @memberof LinuxResources
 */
export const cgroupLimits = (cgroupPath, root = CGROUP_ROOT) => {
  let memoryBytes = Infinity;
  let cpus = Infinity;
  for (let path = cgroupPath; path && path !== '/'; path = nodePath.posix.dirname(path)) {
    memoryBytes = Math.min(memoryBytes, numberOf(read(`${root}${path}/memory.max`)) ?? Infinity);
    const [quota, period] = read(`${root}${path}/cpu.max`).trim().split(' ');
    if (numberOf(quota) && numberOf(period)) cpus = Math.min(cpus, numberOf(quota) / numberOf(period));
  }
  return {
    memoryBytes: Number.isFinite(memoryBytes) ? memoryBytes : null,
    cpus: Number.isFinite(cpus) ? cpus : null,
  };
};

/**
 * Resident memory and CPU time of a process and all its descendants, read from `/proc`.
 * @param {number} pid - Root of the process tree.
 * @returns {{rssBytes: number, cpuMs: number}|null} Usage, or null where `/proc` is not available.
 * @memberof LinuxResources
 */
export const processTreeUsage = (pid) => {
  if (!read(`/proc/${pid}/stat`)) return null;
  const pids = [pid];
  for (let position = 0; position < pids.length; position++) {
    let tasks = [];
    try {
      tasks = fs.readdirSync(`/proc/${pids[position]}/task`);
    } catch {}
    for (const task of tasks)
      pids.push(...read(`/proc/${pids[position]}/task/${task}/children`).split(' ').filter(Boolean).map(Number));
  }
  let rssBytes = 0;
  let ticks = 0;
  for (const id of pids) {
    const rss = /VmRSS:\s+(\d+) kB/.exec(read(`/proc/${id}/status`));
    if (rss) rssBytes += Number(rss[1]) * 1024;
    // After the command name: utime, stime, cutime and cstime are fields 12 to 15.
    ticks += statFields(id)
      .slice(11, 15)
      .reduce((sum, value) => sum + (Number(value) || 0), 0);
  }
  return { rssBytes, cpuMs: (ticks * 1000) / CLOCK_TICKS_PER_SECOND };
};

/**
 * The start time of a process in clock ticks after boot: with the pid, it names one process
 * across pid reuse.
 * @param {number} pid
 * @returns {number|null}
 * @memberof LinuxResources
 */
export const processStartTicks = (pid) => numberOf(statFields(pid)[19]);

/**
 * The state of a process: `R`, `S`, `Z` and the other letters of `/proc/<pid>/stat`.
 * @param {number} pid
 * @returns {string|null} Null where the process or `/proc` is not available.
 * @memberof LinuxResources
 */
export const processState = (pid) => statFields(pid)[0] || null;

/**
 * Whether a process group has a member that is not a zombie. Where PID 1 does not reap orphans, as
 * in a container, an ended member stays a zombie and still counts as a member of its group.
 * @param {number} pgid
 * @returns {boolean|null} Null where `/proc` shows no member of the group.
 * @memberof LinuxResources
 */
export const processGroupRuns = (pgid) => {
  let entries = [];
  try {
    entries = fs.readdirSync('/proc');
  } catch {}
  const states = entries
    .filter((entry) => /^\d+$/.test(entry))
    .map(statFields)
    .filter((fields) => fields[2] === `${pgid}`)
    .map(([state]) => state);
  return states.length ? states.some((state) => state !== 'Z') : null;
};

const managerArgs = () => (process.getuid?.() === 0 ? [] : ['--user']);

let scopeSupport;

/**
 * Whether this process can start a transient systemd scope: systemd manages the host and its
 * manager for this user answers. Probed once per process.
 * @returns {{available: boolean, reason?: string}}
 * @memberof LinuxResources
 */
export const systemdScopeSupport = () => {
  if (scopeSupport) return scopeSupport;
  if (process.platform !== 'linux' || !fs.existsSync('/run/systemd/system'))
    return (scopeSupport = { available: false, reason: 'systemd does not manage this host' });
  const probe = spawnSync('systemd-run', [...managerArgs(), '--scope', '--quiet', '--collect', 'true'], {
    stdio: 'ignore',
    timeout: 10000,
  });
  scopeSupport =
    probe.status === 0
      ? { available: true }
      : { available: false, reason: probe.error?.message ?? `systemd-run exited with ${probe.status ?? probe.signal}` };
  return scopeSupport;
};

/**
 * The limits the kernel applies to a cgroup, read from its files. `cpus` is null without a CPU
 * quota; `cpuController` says whether the cgroup has the controller that enforces one, which a
 * systemd manager has only when the controller is delegated to it.
 * @param {string} cgroupPath
 * @param {string} [root] - The cgroup v2 mount.
 * @returns {{cgroup: string, memoryMaxBytes: number|null, cpus: number|null, cpuController: boolean}}
 * @memberof LinuxResources
 */
export const cgroupEnforcedLimits = (cgroupPath, root = CGROUP_ROOT) => {
  const [quota, period] = read(`${root}${cgroupPath}/cpu.max`).trim().split(' ');
  return {
    cgroup: cgroupPath,
    memoryMaxBytes: numberOf(read(`${root}${cgroupPath}/memory.max`)),
    cpus: numberOf(quota) && numberOf(period) ? numberOf(quota) / numberOf(period) : null,
    cpuController: read(`${root}${cgroupPath}/cgroup.controllers`).split(/\s+/).includes('cpu'),
  };
};

/**
 * What the kernel counts for a cgroup and all its descendants: memory now and at its peak, CPU
 * time, and the out-of-memory kills. Null where the cgroup or the file is gone.
 * @param {string} cgroupPath
 * @param {string} [root] - The cgroup v2 mount.
 * @returns {{memoryBytes: number|null, peakBytes: number|null, cpuMs: number|null, oomKills: number|null}}
 * @memberof LinuxResources
 */
export const cgroupUsage = (cgroupPath, root = CGROUP_ROOT) => {
  const usec = /usage_usec (\d+)/.exec(read(`${root}${cgroupPath}/cpu.stat`));
  const oomKills = /^oom_kill (\d+)$/m.exec(read(`${root}${cgroupPath}/memory.events`));
  return {
    memoryBytes: numberOf(read(`${root}${cgroupPath}/memory.current`)),
    peakBytes: numberOf(read(`${root}${cgroupPath}/memory.peak`)),
    cpuMs: usec ? Number(usec[1]) / 1000 : null,
    oomKills: oomKills ? Number(oomKills[1]) : null,
  };
};

/**
 * A kernel-enforced boundary for one task: a transient systemd scope with the memory and CPU
 * limits of a budget. `wrap` gives the command that starts the task inside it, `attach` waits for
 * the task to enter its cgroup and reads the limits back, `usage` reads the cgroup counters, and
 * `result` reads how systemd saw the scope end, then clears the unit.
 *
 * systemd removes a scope once its processes end. A holder process joins the scope at `attach` and
 * keeps it, and its final counters, until `result`; it ends with the runner, whose pipe is its input.
 * A process keeps the memory it charged before it moved, so the holder adds next to nothing.
 * @param {object} params
 * @param {string} params.unit - Scope unit name, unique per task.
 * @param {{memoryBytes: number, threads: number}} params.budget
 * @returns {{wrap: Function, attach: Function, usage: Function, result: Function}}
 * @memberof LinuxResources
 */
export const systemdScopeBoundary = ({ unit, budget }) => {
  let cgroup = null;
  let holder = null;
  const hold = (path) => {
    const held = spawn('cat', [], { stdio: ['pipe', 'ignore', 'ignore'] });
    held.once('error', () => {});
    try {
      fs.writeFileSync(`${CGROUP_ROOT}${path}/cgroup.procs`, `${held.pid}`);
      return held;
    } catch {
      held.kill('SIGKILL');
      return null;
    }
  };
  return {
    wrap: (command, args) => ({
      command: 'systemd-run',
      args: [
        ...managerArgs(),
        '--scope',
        '--quiet',
        `--unit=${unit}`,
        `--property=MemoryMax=${budget.memoryBytes}`,
        '--property=MemorySwapMax=0',
        `--property=CPUQuota=${budget.threads * 100}%`,
        '--',
        command,
        ...args,
      ],
    }),
    attach: async (pid) => {
      const deadline = Date.now() + SCOPE_ATTACH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const path = cgroupPathOf(pid);
        if (path?.endsWith(`/${unit}.scope`)) {
          cgroup = path;
          holder = hold(path);
          return cgroupEnforcedLimits(path);
        }
        if (!path) return null;
        await new Promise((wait) => setTimeout(wait, 50));
      }
      return null;
    },
    usage: () => (cgroup ? cgroupUsage(cgroup) : null),
    result: () => {
      holder?.kill('SIGKILL');
      // systemd keeps a failed scope and its result after it ends.
      const show = spawnSync('systemctl', [...managerArgs(), 'show', '--property=Result', '--value', `${unit}.scope`], {
        encoding: 'utf8',
        timeout: 10000,
      });
      spawnSync('systemctl', [...managerArgs(), 'reset-failed', `${unit}.scope`], { stdio: 'ignore', timeout: 10000 });
      return show.stdout?.trim() || null;
    },
  };
};
