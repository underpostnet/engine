/**
 * Module for process and shell command management.
 * Provides utilities for executing shell commands, managing signals, and
 * handling environment details.
 *
 * Execution semantics:
 *   - `shellExec(cmd)` throws `ShellExecError` on non-zero exit (fail-fast
 *     is the default). CI/CD chains observe the failure end-to-end.
 *   - `shellExec(cmd, { silentOnError: true })` opts out — returns the
 *     `ShellString` result with `.code/.stdout/.stderr` so callers can
 *     branch on the exit code themselves. Use for existence checks
 *     (`test -x …`, `command -v …`, `kubectl get` when "missing" is a
 *     normal answer).
 *   - `shellExec(cmd, { cwd: "..." })` runs hermetically in `cwd` without
 *      touching shelljs's global state.
 *   - All children spawned by `shellExec` register in
 *     `ProcessController.children` so SIGINT/SIGTERM forwarding can reach
 *     them before the parent exits.
 *
 * @module src/server/runtime/process.js
 * @namespace Process
 */
// https://nodejs.org/api/process
import shell from 'shelljs';
import fs from 'fs-extra';
import nodePath from 'node:path';
import { loggerFactory, redactSensitiveText } from '../ops/logger.js';
import clipboard from 'clipboardy';
import Underpost from '../../index.js';
import { latchRuntimeError } from './runtime-status.js';
import { executionDecisionFactory } from '../build/execution.js';
const logger = loggerFactory(import.meta);
/**
 * Gets the current working directory, replacing backslashes with forward slashes for consistency.
 * @memberof Process
 * @returns {string} The root directory path.
 */
const getRootDirectory = () => process.cwd().replace(/\\/g, '/');
/**
 * Controls and manages process-level events and signals.
 *
 * Subprocess registry: any child process tracked here will receive
 * SIGTERM (followed by SIGKILL after a short grace period) when the
 * parent receives SIGINT or SIGTERM. This prevents orphaned children
 * during Ctrl+C in dev and during pod-termination in K8S.
 *
 * @namespace ProcessController
 */
class ProcessController {
  /**
   * List of signals to listen for for graceful shutdown/handling.
   * @memberof ProcessController
   * @type {string[]}
   */
  static SIG = [
    'SIGPIPE',
    'SIGHUP',
    'SIGTERM',
    'SIGINT',
    'SIGBREAK',
    'SIGWINCH',
    // 'SIGKILL',
    // 'SIGSTOP',
    'SIGBUS',
    'SIGFPE',
    'SIGSEGV',
    'SIGILL',
  ];

  /**
   * Registry of currently running tracked child processes.
   * Populated when callers spawn via the streaming Node-native path
   * (future expansion). The sets are exposed so signal handlers and
   * test harnesses can introspect / clean up the registry.
   */
  static children = new Set();

  /** Internal: forward terminating signals to all tracked children. */
  static _forwardToChildren(sig) {
    if (ProcessController.children.size === 0) return;
    for (const child of [...ProcessController.children]) {
      try {
        if (!child.killed) child.kill(sig);
      } catch (_) {
        // child may already have exited; ignore.
      }
    }
    // Hard SIGKILL after 5s grace if any child is still alive.
    setTimeout(() => {
      for (const child of [...ProcessController.children]) {
        try {
          if (!child.killed) child.kill('SIGKILL');
        } catch (_) {
          /* noop */
        }
      }
    }, 5000).unref();
  }

  /**
   * Sets up listeners for various process signals defined in {@link ProcessController.SIG}.
   * Handles graceful exit on 'SIGINT' (Ctrl+C) — but first forwards the
   * signal to every tracked child so they get a chance to clean up.
   * @memberof ProcessController
   * @returns {Array<process.Process>} An array of process listener handles.
   */
  static onSigListen() {
    return ProcessController.SIG.map((sig) =>
      process.on(sig, (...args) => {
        ProcessController.logger.info(`process on ${sig}`, args);
        switch (sig) {
          case 'SIGINT':
          case 'SIGTERM':
          case 'SIGHUP':
            ProcessController._forwardToChildren('SIGTERM');
            // Give children a moment to exit cleanly before our own exit.
            if (sig === 'SIGINT') {
              setTimeout(() => process.exit(130), 200).unref();
            }
            break;
          default:
            break;
        }
      }),
    );
  }
  /**
   * Initializes the ProcessController.
   * Sets up signal listeners, registers a listener for the 'exit' event, and cleans up temporary deployment environment variables.
   * @memberof ProcessController
   * @param {Object} logger - The logger instance to use for internal logging.
   * @returns {void}
   */
  static init(logger) {
    ProcessController.logger = logger;
    process.on('exit', (...args) => {
      ProcessController.logger.info(`process on exit`, args);
      // Last-chance reap: any tracked child still alive at exit time
      // gets a hard kill so the parent does not leak orphans into the
      // pod / shell session.
      ProcessController._forwardToChildren('SIGKILL');
    });
    ProcessController.onSigListen();
  }
}
/**
 * Quotes one value as a single shell argument.
 *
 * Single source of that quoting: a composed command reaches `sh -c`, so any
 * value carrying spaces, commas or quotes has to survive one more parse than
 * the caller wrote it for. Single quotes are literal in POSIX shells, and an
 * embedded single quote is closed, escaped and reopened.
 * @memberof Process
 * @param {*} value - Value to pass as one argument.
 * @returns {string} The value, quoted.
 */
const shellArgumentFactory = (value) => `'${`${value ?? ''}`.replaceAll("'", `'\\''`)}'`;

/**
 * Error thrown by `shellExec` on a non-zero exit, with structured process output.
 */
class ShellExecError extends Error {
  constructor(cmd, code, stdout, stderr) {
    super(`shellExec failed (exit=${code}): ${redactSensitiveText(cmd)}`);
    this.name = 'ShellExecError';
    this.cmd = redactSensitiveText(cmd);
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}
/**
 * Executes a shell command using shelljs.
 *
 * **Default behaviour is fail-fast**: a non-zero exit code throws
 * `ShellExecError`. Callers that need to branch on the exit code
 * (existence checks, optional commands) must pass `silentOnError: true`
 * to opt out of throwing.
 *
 * The async-callback path is exempt from the throw — shelljs delivers
 * `(code, stdout, stderr)` to the callback, which owns its own error
 * handling.
 *
 * @memberof Process
 * @param {string} cmd - The command string to execute.
 * @param {Object} [options] - Options for execution.
 * @param {boolean} [options.silent=false] - Suppress child stdout/stderr to the parent terminal.
 * @param {boolean} [options.async=false] - Run the command asynchronously (use with `callback`).
 * @param {boolean} [options.stdout=false] - Return stdout string instead of the `ShellString` result object.
 * @param {boolean} [options.disableLog=false] - Skip the `[process] cmd …` info log line.
 * @param {Function} [options.callback=null] - Async callback `(code, stdout, stderr) => void` when `async: true`.
 * @param {boolean} [options.silentOnError=false] - When `true`, swallow non-zero exits and return the `ShellString` instead of throwing. Inverse of the previous `throwOnError` flag.
 * @param {string} [options.cwd] - Hermetic working directory (snapshotted + restored — does NOT leak).
 * @returns {string|shelljs.ShellString} `ShellString` by default; the stdout string when `stdout: true`.
 * @throws {ShellExecError} On non-zero exit when `silentOnError` is not set.
 */
/**
 * The result a denied read hands back.
 *
 * Shaped as a `ShellString` so an elided command is indistinguishable from one that ran
 * and found nothing — which is the answer the `silentOnError` call sites already handle.
 * @returns {shelljs.ShellString} Empty successful result.
 * @memberof Process
 */
const neutralShellResult = () => {
  const result = shell.ShellString('');
  result.code = 0;
  result.stdout = '';
  result.stderr = '';
  return result;
};

/**
 * Applies the active execution profile to one command.
 *
 * This is the single gate the profile system rests on: because every external
 * invocation reaches it, an offline stage needs no per-call-site opt-out.
 * @param {string} cmd - The command about to run.
 * @param {Object} options - The `shellExec` options.
 * @returns {null|{elided: true, result: *}} `null` when the command may run.
 * @memberof Process
 */
const executionGate = (cmd, options) => {
  const decision = executionDecisionFactory(cmd);
  if (decision.permitted) return null;
  logger.info(`[${decision.profile}] elided ${decision.capability}`, redactSensitiveText(cmd));
  return { elided: true, result: options.stdout ? '' : neutralShellResult() };
};

const shellExec = (cmd, options = {}) => {
  const gated = executionGate(cmd, options);
  if (gated) {
    if (options.callback) return options.callback(0, '', '');
    return gated.result;
  }
  if (!options.disableLog) logger.info(`cmd`, redactSensitiveText(cmd));

  // Whitelist exactly the keys `shelljs.exec` understands. Passing our own
  // bookkeeping keys through (or a literal `cwd: undefined`) makes shelljs
  // call `path.resolve(undefined)` and crash with ERR_INVALID_ARG_TYPE.
  const shellOpts = {};
  if (options.silent !== undefined) shellOpts.silent = options.silent;
  if (options.async !== undefined) shellOpts.async = options.async;
  if (options.env !== undefined) shellOpts.env = options.env;

  // Hermetic cwd. shelljs.cd mutates a process-wide global; instead we
  // snapshot the current cwd here, switch for the duration of this call,
  // and restore in `finally`. We deliberately do NOT forward `cwd` to
  // shelljs — leaving its `cwd` unset means it inherits our just-changed
  // `process.cwd()`, and we keep full control of restore semantics.
  const previousCwd = options.cwd ? process.cwd() : null;
  if (options.cwd) {
    try {
      process.chdir(options.cwd);
    } catch (err) {
      latchRuntimeError();
      throw new ShellExecError(cmd, -1, '', `chdir(${options.cwd}) failed: ${err.message}`);
    }
  }
  try {
    if (options.callback) {
      // Async path. shelljs invokes the callback with (code, stdout, stderr).
      // The callback owns its own error handling; the throw default does
      // not apply here.
      return shell.exec(cmd, shellOpts, options.callback);
    }
    const result = shell.exec(cmd, shellOpts);

    if (!options.silentOnError && result && typeof result.code === 'number' && result.code !== 0) {
      latchRuntimeError();
      throw new ShellExecError(cmd, result.code, result.stdout || '', result.stderr || '');
    }

    return options.stdout ? result.stdout : result;
  } finally {
    if (previousCwd) {
      try {
        process.chdir(previousCwd);
      } catch (_) {
        /* best-effort restore */
      }
    }
  }
};
/**
 * Runs a command as a child process and resolves when it exits, without blocking the event loop.
 *
 * Same contract as {@link shellExec}: a non-zero exit throws {@link ShellExecError} unless
 * `silentOnError`, and `stdout` returns the captured output. The difference is that timers and
 * sockets keep running while the child does — which is what lets the in-pod status endpoint
 * answer during a build instead of going silent for its whole duration.
 *
 * @memberof Process
 * @param {string} cmd - The command to run.
 * @param {Object} [options] - Options.
 * @param {boolean} [options.silent] - Suppress child output on the parent stdio.
 * @param {boolean} [options.silentOnError] - Resolve instead of throwing on a non-zero exit.
 * @param {boolean} [options.stdout] - Resolve with the captured stdout rather than the result.
 * @param {boolean} [options.disableLog] - Suppress the command log line.
 * @param {string} [options.cwd] - Directory to run in.
 * @param {NodeJS.ProcessEnv} [options.env] - Environment passed only to the child process.
 * @returns {Promise<*>} Resolves with the result, or the stdout when `stdout` is set.
 */
const shellExecAsync = (cmd, options = {}) =>
  new Promise((resolve, reject) => {
    const gated = executionGate(cmd, options);
    if (gated) return resolve(options.stdout ? '' : { code: 0, stdout: '', stderr: '' });
    if (!options.disableLog) logger.info(`cmd`, redactSensitiveText(cmd));
    const shellOpts = { async: true };
    if (options.silent !== undefined) shellOpts.silent = options.silent;
    if (options.cwd) shellOpts.cwd = options.cwd;
    if (options.env !== undefined) shellOpts.env = options.env;
    shell.exec(cmd, shellOpts, (code, stdout, stderr) => {
      if (code !== 0 && !options.silentOnError) {
        latchRuntimeError();
        return reject(new ShellExecError(cmd, code, stdout || '', stderr || ''));
      }
      resolve(options.stdout ? stdout : { code, stdout, stderr });
    });
  });

/**
 * Blocks the calling thread for `ms` milliseconds.
 *
 * Retry backoff around the synchronous `shellExec` chains (kubectl exec, pod
 * readiness polling) has no async boundary to await on, so the wait has to
 * block. `Atomics.wait` keeps the CPU idle instead of spinning.
 *
 * @memberof Process
 * @param {number} ms - Milliseconds to block for. Non-positive values are a no-op.
 * @returns {void}
 */
const sleepSync = (ms) => {
  if (!(typeof ms === 'number') || !(ms > 0)) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};
/**
 * Changes the current working directory using shelljs.
 *
 * Note: `shellCd` mutates global state. Prefer `shellExec(cmd, { cwd })`
 * for one-shot directory-scoped commands; use `shellCd` only for the
 * outermost shell where the cwd should persist across many calls.
 *
 * @memberof Process
 * @param {string} cd - The path to change the directory to.
 * @param {Object} [options] - Options for the CD operation.
 * @param {boolean} [options.disableLog=false] - Prevent logging of the CD command.
 * @returns {shelljs.ShellString} The result of the shelljs cd command.
 */
const shellCd = (cd, options = { disableLog: false }) => {
  if (!options.disableLog) logger.info(`cd`, cd);
  return shell.cd(cd);
};
/**
 * Wraps a command to run it as a daemon process in a shell (keeping the process alive/terminal open).
 *
 * NB: callers must ensure `cmd` does not contain unescaped single quotes —
 * the wrapper uses `bash -c '<cmd>; …'`. For arbitrary user input prefer
 * a heredoc or a temporary script file.
 *
 * @memberof Process
 * @param {string} cmd - The command to daemonize.
 * @returns {string} The shell command string for the daemon process.
 */
const daemonProcess = (cmd) => `exec bash -c '${cmd}; exec tail -f /dev/null'`;

/**
 * Installs a root-owned host file at an explicit mode, reporting whether it changed.
 *
 * Staged then installed rather than written in place: the caller may run
 * unprivileged while the destination is root-owned, and `install -m` sets the
 * mode as it copies, so a 0600 file is never briefly readable at the default
 * umask. Returning the changed flag is what lets callers restart a service only
 * when its unit actually differs.
 *
 * @param {object} params
 * @param {string} params.target - Destination path.
 * @param {string} params.content - File contents.
 * @param {string} [params.mode] - Octal mode.
 * @param {boolean} [params.dryRun] - Report the destination instead of writing.
 * @returns {boolean} True when the file changed.
 * @memberof ProcessService
 */
const installRootFile = ({ target, content, mode = '0644', dryRun = false }) => {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === content) return false;
  if (dryRun) {
    logger.info(`[dry-run] write ${target} (mode ${mode})`, { bytes: content.length });
    return true;
  }
  const staged = nodePath.join('/tmp', `underpost-root-file-${nodePath.basename(target)}-${process.pid}`);
  fs.writeFileSync(staged, content, { mode: 0o600 });
  shellExec(`sudo mkdir -p ${nodePath.dirname(target)}`, { silent: true });
  shellExec(`sudo install -m ${mode} -o root -g root ${staged} ${target}`, { silent: true });
  fs.removeSync(staged);
  return true;
};
/**
 * Retrieves the process ID (PID) of the most recently created gnome-terminal instance.
 * Note: This function is environment-specific (GNOME/Linux) and uses `pgrep -n`.
 * @memberof Process
 * @returns {number|null} The PID of the last gnome-terminal process, or null if none running.
 */
// list all terminals: pgrep gnome-terminal
// list last terminal: pgrep -n gnome-terminal
const getTerminalPid = () => {
  const raw = shellExec(`pgrep -n gnome-terminal`, { stdout: true, silent: true, silentOnError: true });
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
/**
 * Copies text content to the system clipboard using clipboardy.
 * Logs the copied content for confirmation.
 * @memberof Process
 * @param {string} [data='🦄'] - The data to copy. Defaults to '🦄'.
 * @returns {void}
 */
function pbcopy(data) {
  clipboard.writeSync(data || '🦄');
  logger.info(`copied to clipboard`, clipboard.readSync());
}
export {
  installRootFile,
  ProcessController,
  ShellExecError,
  getRootDirectory,
  shellArgumentFactory,
  shellExec,
  shellExecAsync,
  shellCd,
  sleepSync,
  pbcopy,
  getTerminalPid,
  daemonProcess,
};
