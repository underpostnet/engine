/**
 * Runs a Node script for development and restarts it when a watched source changes.
 * @module src/server/runtime/watch-runner.js
 * @namespace WatchRunner
 */
import fs from 'fs-extra';
import nodePath from 'node:path';
import { spawn } from 'node:child_process';
import { loggerFactory } from '../ops/logger.js';

const logger = loggerFactory(import.meta);

/**
 * @constant WATCH_RUNNER
 * @description Defaults every development watcher shares.
 * @memberof WatchRunner
 */
const WATCH_RUNNER = Object.freeze({
  extensions: Object.freeze(['.js', '.mjs', '.cjs', '.json']),
  ignoredDirectories: Object.freeze([
    '.git',
    '.nyc_output',
    '.sass-cache',
    'bower_components',
    'coverage',
    'node_modules',
  ]),
  debounceMs: 300,
  killTimeoutMs: 5000,
  rearmDelayMs: 1000,
});

/**
 * @function watchRunnerFactory
 * @description Runs a Node script and restarts it when a watched file changes.
 *
 * Changes are coalesced for `debounceMs`, and restarts run one at a time. A changed path stays
 * pending until a run of the script exits with code 0, so a restart that interrupts a run passes
 * its paths on to the next one. `onRestart` receives the pending paths after the previous run has
 * exited and before the next one starts, or `null` when a change arrived without a file name.
 *
 * The script runs in its own process group with the output of this process, which is never
 * cleared. A run stops with SIGINT, the signal the runtime `ProcessController` exits on, and with
 * SIGKILL after `killTimeoutMs`; both reach the processes the script started. When this process
 * exits by any other path, the running script and its processes are killed with it.
 * @memberof WatchRunner
 * @param {object} params
 * @param {string} params.script - Script passed to the current Node executable.
 * @param {string} [params.name] - Name of the script in the log; the script path otherwise.
 * @param {string[]} [params.args] - Script arguments.
 * @param {string} params.directory - Directory watched recursively.
 * @param {string[]} [params.ignoredPaths] - Paths relative to `directory` whose contents never trigger a restart.
 * @param {string[]} [params.extensions] - File extensions that trigger a restart.
 * @param {string[]} [params.ignoredDirectories] - Directory names whose contents never trigger one.
 * @param {number} [params.debounceMs] - Quiet time before a restart.
 * @param {number} [params.killTimeoutMs] - Wait after SIGINT before SIGKILL.
 * @param {number} [params.rearmDelayMs] - Wait before a failed watcher is created again.
 * @param {Function} [params.onRestart] - Receives the pending paths before each restart.
 * @returns {{start: Function, close: Function}} Runner.
 */
const watchRunnerFactory = (params) => {
  const {
    script,
    name = script,
    args = [],
    directory,
    ignoredPaths = [],
    extensions,
    ignoredDirectories,
    debounceMs,
    killTimeoutMs,
    rearmDelayMs,
    onRestart = () => {},
  } = { ...WATCH_RUNNER, ...params };
  const root = nodePath.resolve(directory);
  const changed = new Set();
  const pending = new Set();
  const stopping = new WeakSet();
  let fullBuildPending = false;
  let child = null;
  let watcher = null;
  let debounce = null;
  let rearm = null;
  let restarting = Promise.resolve();
  let queued = false;
  let closed = false;

  const signalGroup = (proc, signal) => {
    try {
      process.kill(-proc.pid, signal);
    } catch (_) {}
  };

  const stop = (proc) =>
    new Promise((resolve) => {
      if (!proc.pid || proc.exitCode !== null || proc.signalCode !== null) return resolve();
      stopping.add(proc);
      const force = setTimeout(() => signalGroup(proc, 'SIGKILL'), killTimeoutMs);
      proc.once('exit', () => {
        clearTimeout(force);
        resolve();
      });
      signalGroup(proc, 'SIGINT');
    });

  const run = () => {
    const proc = spawn(process.execPath, [script, ...args], { stdio: 'inherit', detached: true });
    child = proc;
    logger.info(`${name} started`, { pid: proc.pid, script, args });
    proc.on('error', (error) => logger.error(`${name} could not start`, { script, message: error.message }));
    proc.on('exit', (code, signal) => {
      if (child === proc) child = null;
      if (stopping.has(proc)) return;
      if (code === 0) {
        pending.clear();
        fullBuildPending = false;
        logger.info(`${name} exited`, { pid: proc.pid });
      } else logger.error(`${name} crashed; waiting for a change`, { pid: proc.pid, code, signal });
    });
  };

  const restart = () => {
    if (queued) return;
    queued = true;
    restarting = restarting.then(async () => {
      if (child) await stop(child);
      queued = false;
      if (closed) return;
      const paths = [...changed];
      for (const path of changed) pending.add(path);
      changed.clear();
      logger.info(`Source changed; restarting ${name}`, { paths });
      onRestart(fullBuildPending ? null : [...pending]);
      run();
    });
  };

  const ignored = (relative) =>
    relative.split(nodePath.sep).some((segment) => ignoredDirectories.includes(segment)) ||
    ignoredPaths.some((path) => relative === path || relative.startsWith(`${path}${nodePath.sep}`)) ||
    !extensions.includes(nodePath.extname(relative));

  const onChange = (eventType, filename) => {
    if (closed) return;
    if (!filename) fullBuildPending = true;
    else if (ignored(`${filename}`)) return;
    else changed.add(nodePath.join(root, `${filename}`));
    clearTimeout(debounce);
    debounce = setTimeout(restart, debounceMs);
  };

  const watch = () => {
    rearm = null;
    if (closed) return;
    try {
      watcher = fs.watch(root, { recursive: true }, onChange);
      watcher.on('error', (error) => {
        logger.error('Source watcher failed; re-creating it', { root, message: error.message });
        watcher.close();
        rearm = setTimeout(watch, rearmDelayMs);
      });
    } catch (error) {
      logger.error('Source watcher could not start; retrying', { root, message: error.message });
      rearm = setTimeout(watch, rearmDelayMs);
    }
  };

  const killOnExit = () => child && signalGroup(child, 'SIGKILL');

  return {
    start() {
      process.on('exit', killOnExit);
      watch();
      run();
    },
    async close() {
      closed = true;
      clearTimeout(debounce);
      clearTimeout(rearm);
      watcher?.close();
      await restarting;
      if (child) await stop(child);
      process.off('exit', killOnExit);
    },
  };
};

/**
 * @function exitOnSignals
 * @description Closes a runner on SIGINT, SIGTERM or SIGHUP, then exits this process.
 *
 * The handlers stay registered for every repeat: a terminal Ctrl+C reaches npm and this process
 * together, and npm forwards it once more. A repeat that found no handler would end this process
 * with the default action before the runner has stopped its script.
 * @memberof WatchRunner
 * @param {{close: Function}} runner - Runner to close.
 * @returns {void}
 */
const exitOnSignals = (runner) => {
  let closing = null;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(signal, () => {
      closing ??= runner.close().finally(() => process.exit(0));
    });
};

export { WATCH_RUNNER, exitOnSignals, watchRunnerFactory };
