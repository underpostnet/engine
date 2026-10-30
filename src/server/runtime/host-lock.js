/**
 * Host-wide locks: at most `slots` holders of one name across every process on the host.
 *
 * A slot is a Unix socket address, in the abstract namespace on Linux. Binding it is atomic, and the
 * kernel frees it when its holder ends in any way, so no process ever removes the hold of another.
 * Each holder also writes a record in the lock directory: it names the holder for the operator and,
 * once attached, the process group of the workload the holder started. A slot stays held while its
 * holder or that group lives, so a workload that outlives its supervisor keeps the lock.
 *
 * @module src/server/runtime/host-lock.js
 * @namespace HostLock
 */
import crypto from 'node:crypto';
import fs from 'fs-extra';
import net from 'node:net';
import os from 'node:os';
import nodePath from 'node:path';
import { bootId, processGroupRuns, processStartTicks, processState } from './linux-resources.js';

/** The directory of every host lock record. */
export const HOST_LOCK_DIRECTORY = nodePath.join(os.tmpdir(), 'underpost-locks');

const exists = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists and belongs to another user.
    return error.code === 'EPERM';
  }
};

const sameProcess = ({ pid, startTicks }) => {
  const current = processStartTicks(pid);
  return current === null || startTicks === null || current === startTicks;
};

// A zombie has ended.
const processAlive = (record) => exists(record.pid) && processState(record.pid) !== 'Z' && sameProcess(record);

// A group id names no other group while any of its processes lives; a new process with the
// leader's pid shows that the group ended before it started. A group of zombies has ended.
const groupAlive = ({ pgid, startTicks }) =>
  exists(-pgid) && (!exists(pgid) || sameProcess({ pid: pgid, startTicks })) && processGroupRuns(pgid) !== false;

const recordAlive = (record) =>
  record.bootId === bootId() && (processAlive(record) || Boolean(record.workload && groupAlive(record.workload)));

const recordsOf = (directory, prefix) => {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.json'))
    .map((entry) => {
      const path = nodePath.join(directory, entry);
      try {
        return { path, ...fs.readJsonSync(path) };
      } catch {
        // Records are written by rename: an unreadable one is not a holder.
        return { path };
      }
    });
};

const slotRecords = (directory, name, slot) => recordsOf(directory, `${name}.${slot}.`);

const writeRecord = (path, record) => {
  fs.writeJsonSync(`${path}.tmp`, record, { mode: 0o644 });
  fs.renameSync(`${path}.tmp`, path);
};

const slotAddress = (directory, name, slot) =>
  process.platform === 'linux'
    ? `\0underpost-lock-${crypto.createHash('sha256').update(directory).digest('hex').slice(0, 16)}-${name}.${slot}`
    : nodePath.join(directory, `${name}.${slot}.sock`);

const listen = (address) =>
  new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.end());
    server.once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(null) : reject(error)));
    server.listen(address, () => resolve(server.unref()));
  });

// A socket file outlives its holder: one that refuses connections is removed and bound again.
const bindSlot = async (address) => {
  const server = await listen(address);
  if (server || address.startsWith('\0')) return server;
  const answered = await new Promise((resolve) => {
    const probe = net.connect(address, () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
  });
  if (answered) return null;
  fs.removeSync(address);
  return listen(address);
};

/**
 * A lock name for a filesystem target: one target, one name, however its path is spelled. Symbolic
 * links resolve as far as the path exists.
 * @param {string} prefix - What the lock guards, such as `client`.
 * @param {string} target - Path of the target.
 * @returns {string}
 * @memberof HostLock
 */
export const hostLockName = (prefix, target) => {
  let existing = nodePath.resolve(target);
  const rest = [];
  while (!fs.existsSync(existing)) {
    rest.unshift(nodePath.basename(existing));
    existing = nodePath.dirname(existing);
  }
  const canonical = nodePath.join(fs.realpathSync(existing), ...rest);
  return `${prefix}-${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`;
};

/**
 * The holders of a lock that are alive: holders whose process lives, and holders that ended while
 * the workload they attached still runs.
 * @param {string} name
 * @param {number} [slots=1]
 * @param {string} [directory]
 * @returns {object[]} Holder records: pid, command, acquisition time, workload, and `holderAlive`.
 * @memberof HostLock
 */
export const hostLockHolders = (name, slots = 1, directory = HOST_LOCK_DIRECTORY) =>
  Array.from({ length: slots }, (_, slot) => slotRecords(directory, name, slot))
    .flat()
    .filter((record) => record.pid && recordAlive(record))
    .map(({ path, ...record }) => ({ ...record, holderAlive: processAlive(record) }));

const tryAcquire = async ({ name, slots, directory, owner }) => {
  for (let slot = 0; slot < slots; slot++) {
    const server = await bindSlot(slotAddress(directory, name, slot));
    if (!server) continue;
    const records = slotRecords(directory, name, slot);
    // The holder ended but its workload runs, or the holder runs in another network namespace.
    if (records.some((record) => record.pid && recordAlive(record))) {
      server.close();
      continue;
    }
    // Records of ended holders hold nothing, whatever their lock. A record another user left stays:
    // the sticky directory keeps it theirs.
    for (const { path } of recordsOf(directory, '').filter((record) => !record.pid || !recordAlive(record)))
      try {
        fs.removeSync(path);
      } catch {}
    const path = nodePath.join(directory, `${name}.${slot}.${crypto.randomUUID()}.json`);
    writeRecord(path, owner);
    return { server, path };
  }
  return null;
};

/**
 * Takes a slot of a host lock, waiting while every slot is held.
 *
 * The held slot can `attach` the process group of a workload its holder starts; the slot then stays
 * held until both have ended.
 * @param {object} params
 * @param {string} params.name - Lock name: letters, digits and dashes.
 * @param {number} [params.slots=1] - Holders allowed at once.
 * @param {number} [params.timeoutMs=0] - Longest wait, 0 to wait until a slot frees.
 * @param {number} [params.pollMs=1000] - Time between two attempts.
 * @param {(holders: object[]) => void} [params.onWait] - Called once, when the first attempt finds every slot held.
 * @param {AbortSignal} [params.signal] - Ends the wait.
 * @param {string} [params.directory]
 * @returns {Promise<{release: () => void, attach: (pid: number) => void}|null>} The held slot, or null
 *   when the wait timed out or was aborted.
 * @throws {Error} On an invalid name, or when the lock directory cannot be written.
 * @memberof HostLock
 */
export const acquireHostLock = async ({
  name,
  slots = 1,
  timeoutMs = 0,
  pollMs = 1000,
  onWait = () => {},
  signal,
  directory = HOST_LOCK_DIRECTORY,
}) => {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid host lock name '${name}'`);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    // Every user of the host shares it; the sticky bit keeps each holder's record its own.
    try {
      fs.chmodSync(directory, 0o1777);
    } catch (error) {
      if (error.code !== 'EPERM') throw error;
    }
  }
  const owner = {
    pid: process.pid,
    startTicks: processStartTicks(process.pid),
    bootId: bootId(),
    command: process.argv.slice(1).join(' '),
    acquiredAt: new Date().toISOString(),
  };
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Infinity;
  for (let attempt = 0; ; attempt++) {
    const held = await tryAcquire({ name, slots, directory, owner });
    if (held) {
      let released = false;
      return {
        attach: (pid) => {
          if (!released)
            writeRecord(held.path, { ...owner, workload: { pgid: pid, startTicks: processStartTicks(pid) } });
        },
        release: () => {
          if (released) return;
          released = true;
          fs.removeSync(held.path);
          held.server.close();
        },
      };
    }
    if (Date.now() >= deadline || signal?.aborted) return null;
    if (attempt === 0) onWait(hostLockHolders(name, slots, directory));
    await new Promise((wait) => setTimeout(wait, pollMs));
  }
};
