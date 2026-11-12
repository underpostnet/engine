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
 *   - All children spawned by `shellSpawn` register in
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
import os from 'node:os';
import childProcess, { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { loggerFactory, redactSensitiveText } from '../ops/logger.js';
import clipboard from 'clipboardy';
import { latchRuntimeError } from './runtime-status.js';
import {
  activeExecutionProfile,
  activeExecutionTarget,
  EXECUTION_TARGET_ENV_KEY,
  executionDecisionFactory,
  targetDecisionFactory,
  targetIdentityRefusal,
  VERIFIED_TARGET_ENV_KEY,
} from '../build/execution.js';
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
   * Populated by {@link shellSpawn}. The set is exposed so signal handlers and
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
  const decision = executionDecisionFactory(cmd, { privileged: Boolean(options.privileged) });
  if (decision.refusal) throw Object.assign(new Error(decision.refusal), { expected: true });
  if (decision.permitted) {
    targetGate(cmd, decision);
    return null;
  }
  logger.info(`[${decision.profile}] elided ${decision.capability}`, redactSensitiveText(cmd));
  return { elided: true, result: options.stdout ? '' : neutralShellResult() };
};

/**
 * What the context of a target reaches: its name, its API server and the UID of `kube-system`. These reads
 * name the context and run outside {@link targetGate}.
 * @param {Object} target
 * @returns {{context:string, server:string, fingerprint:string}} '' for a value the cluster does not give.
 * @memberof Process
 */
const liveClusterOf = (target) => {
  const read = (args) =>
    `${shell.exec(`kubectl${target.context ? ` --context ${shellArgumentFactory(target.context)}` : ''} ${args}`, { silent: true }).stdout ?? ''}`.trim();
  return {
    context: target.context || read('config current-context'),
    server: read(`config view --minify -o jsonpath='{.clusters[0].cluster.server}'`),
    fingerprint: read(`get namespace kube-system --request-timeout=10s -o jsonpath='{.metadata.uid}'`),
  };
};

/**
 * Verifies the cluster of the target once per process tree and context, then prints the environment, the
 * context and its source, the API server, the cluster fingerprint and the execution profile.
 * @throws {Error} An expected error when the cluster is not the one the target declares.
 */
const verifyTarget = (target) => {
  const verified = process.env[VERIFIED_TARGET_ENV_KEY];
  if (verified && JSON.parse(verified).context === target.context) return;
  const live = liveClusterOf(target);
  const refusal = targetIdentityRefusal(target, live);
  if (refusal) throw Object.assign(new Error(refusal), { expected: true });
  process.env[VERIFIED_TARGET_ENV_KEY] = JSON.stringify({ ...live, context: target.context });
  process.stderr.write(
    [
      `Environment  ${target.environment}`,
      `Context      ${live.context || '(none)'} (${target.source})`,
      `Cluster      ${live.server || 'unknown server'}` +
        `${live.fingerprint ? ` (kube-system ${live.fingerprint})` : ', not answering'}` +
        `${target.cluster ? ', verified' : ', identity not declared'}`,
      `Profile      ${activeExecutionProfile().name}`,
      '',
    ].join('\n'),
  );
};

/**
 * Applies the cluster target of this process to one permitted command: a refused target refuses each
 * cluster command that does not name its own context, a target with blockers refuses a change, and the
 * first change verifies the cluster.
 * @throws {Error} An expected error with the refusal of the target.
 */
const targetGate = (cmd, { capability }) => {
  const { refusal, verify } = targetDecisionFactory(cmd, capability);
  if (refusal) throw Object.assign(new Error(refusal), { expected: true });
  if (verify) verifyTarget(activeExecutionTarget());
};

/**
 * What a privileged command keeps of its environment through `sudo`, which resets the rest: the cluster
 * target, and the kubeconfig of the invoking user, so root never reads its own.
 */
const PRIVILEGED_ENV_KEYS = Object.freeze(['KUBECONFIG', EXECUTION_TARGET_ENV_KEY, VERIFIED_TARGET_ENV_KEY]);

/**
 * How this process runs a privileged command: `root` runs it as it is, `interactive` lets `sudo` ask for a
 * password on the terminal, and `non-interactive` runs `sudo -n`, which refuses instead of asking, in CI and
 * without a terminal.
 * @returns {'root'|'interactive'|'non-interactive'}
 * @memberof Process
 */
const elevationFactory = () => {
  if (process.getuid() === 0) return 'root';
  const ci = !['', '0', 'false'].includes(`${process.env.CI ?? ''}`.toLowerCase());
  return process.stdin.isTTY && process.stderr.isTTY && !ci ? 'interactive' : 'non-interactive';
};

/**
 * The privilege boundary of an unprivileged process: the `sudo` prefix of {@link elevationFactory}, with the
 * {@link PRIVILEGED_ENV_KEYS} of the environment of the command. Nothing else elevates.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 * @memberof Process
 */
const sudoArgv = (env = process.env) => {
  const carried = { ...env, KUBECONFIG: env.KUBECONFIG || nodePath.join(os.homedir(), '.kube', 'config') };
  return [
    'sudo',
    ...(elevationFactory() === 'interactive' ? [] : ['-n']),
    '--',
    'env',
    ...PRIVILEGED_ENV_KEYS.filter((key) => carried[key]).map((key) => `${key}=${carried[key]}`),
  ];
};

/**
 * A shell command through the privilege boundary of {@link sudoArgv}.
 * @param {string} cmd
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} The command to run.
 * @memberof Process
 */
const privilegedShellCommand = (cmd, env) =>
  elevationFactory() === 'root' ? cmd : [...sudoArgv(env), '/bin/sh', '-c', cmd].map(shellArgumentFactory).join(' ');

/** What `sudo` prints when it refuses, and what the operator does about it. */
const SUDO_REFUSALS = Object.freeze([
  [
    /a password is required|a terminal is required/,
    'sudo cannot ask for a password in this session. Run it as root, on a terminal, or grant this user passwordless sudo for it.',
  ],
  [
    /is not in the sudoers file|is not allowed to execute|may not run sudo|incorrect password attempt/,
    'sudo refuses this user. Run it as root, or grant this user sudo for it.',
  ],
  [/sudo: (command )?not found|spawn sudo ENOENT/, 'sudo is not installed. Run it as root.'],
]);

/**
 * The error of a privileged command `sudo` refused: what needed root, and how to grant it.
 * @returns {ShellExecError|null} null when the command itself failed.
 */
const privilegeError = (cmd, reason, result) => {
  const [, remedy] = SUDO_REFUSALS.find(([pattern]) => pattern.test(result.stderr || '')) ?? [];
  if (!remedy) return null;
  return Object.assign(new ShellExecError(cmd, result.code, result.stdout || '', result.stderr || ''), {
    message: `${reason}: this needs root, and ${remedy}`,
  });
};

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
 * @param {string} [options.privileged] - Why the command needs root: it then runs through
 *   {@link privilegedShellCommand}, as a host write that never reaches the Kubernetes API.
 * @returns {string|shelljs.ShellString} `ShellString` by default; the stdout string when `stdout: true`.
 * @throws {ShellExecError} On non-zero exit when `silentOnError` is not set.
 */
const shellExec = (cmd, options = {}) => {
  const gated = executionGate(cmd, options);
  if (gated) {
    if (options.callback) return options.callback(0, '', '');
    return gated.result;
  }
  if (!options.disableLog) logger.info(`cmd`, redactSensitiveText(cmd));
  if (options.privileged) logger.info('privileged', { reason: options.privileged, elevation: elevationFactory() });
  const command = options.privileged ? privilegedShellCommand(cmd, options.env) : cmd;

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
      return shell.exec(command, shellOpts, options.callback);
    }
    const result = shell.exec(command, shellOpts);

    if (!options.silentOnError && result && typeof result.code === 'number' && result.code !== 0) {
      latchRuntimeError();
      throw (
        (options.privileged && privilegeError(cmd, options.privileged, result)) ||
        new ShellExecError(cmd, result.code, result.stdout || '', result.stderr || '')
      );
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
 * Runs a command as a child process with its stdin and stdout as streams: the transport of a dump
 * or a restore that never lands on disk.
 *
 * The execution profile gates it as it gates {@link shellExec}. A stream has no neutral value, so
 * an elided command throws instead of reading as an empty stream.
 *
 * @memberof Process
 * @param {string} cmd - The command to run.
 * @param {Object} [options] - Options.
 * @param {boolean} [options.disableLog] - Suppress the command log line.
 * @param {string} [options.cwd] - Directory to run in.
 * @param {NodeJS.ProcessEnv} [options.env] - Environment passed only to the child process.
 * @returns {{child: import('node:child_process').ChildProcess, stdin: import('node:stream').Writable,
 *   stdout: import('node:stream').Readable, exited: Promise<{code:number, stderr:string}>}}
 *   `exited` rejects with {@link ShellExecError} on a non-zero exit.
 * @throws {Error} When the execution profile elides the command.
 */
const shellSpawn = (cmd, options = {}) => {
  const decision = executionDecisionFactory(cmd);
  if (!decision.permitted)
    throw new Error(`[${decision.profile}] elided ${decision.capability}: a stream has no neutral value`);
  targetGate(cmd, decision);
  if (!options.disableLog) logger.info(`spawn`, redactSensitiveText(cmd));
  const child = spawn('/bin/sh', ['-c', cmd], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  ProcessController.children.add(child);
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 16384) stderr += chunk;
  });
  const exited = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      ProcessController.children.delete(child);
      if (code === 0) return resolve({ code, stderr });
      latchRuntimeError();
      reject(new ShellExecError(redactSensitiveText(cmd), code ?? -1, '', redactSensitiveText(stderr)));
    });
  });
  // A caller that has not awaited `exited` yet must not see an unhandled rejection.
  exited.catch(() => {});
  return { child, stdin: child.stdin, stdout: child.stdout, exited };
};

/**
 * Runs one program with an argument list and no shell, and resolves when it exits. No argument is
 * parsed by a shell, so a value cannot inject a command. Use {@link shellExec} only where the
 * command needs shell syntax.
 *
 * The execution profile gates it as it gates {@link shellExec}: an elided command resolves with
 * empty output and `elided: true`. A non-zero exit, a timeout and an abort reject with {@link ShellExecError}, unless
 * `silentOnError` resolves the result.
 * @memberof Process
 * @param {string} command - The program, resolved on PATH.
 * @param {string[]} [args] - Its arguments, passed as they are.
 * @param {Object} [options]
 * @param {string} [options.cwd]
 * @param {NodeJS.ProcessEnv} [options.env] - The environment of the child; this process's by default.
 * @param {string} [options.input] - Written to the stdin of the child, which then closes.
 * @param {number} [options.timeoutMs] - Stops the child with SIGTERM after this time.
 * @param {AbortSignal} [options.signal] - Stops the child with SIGTERM when it aborts.
 * @param {boolean} [options.silentOnError] - Resolve on a non-zero exit instead of rejecting.
 * @param {boolean} [options.disableLog] - Suppress the command log line.
 * @param {string} [options.privileged] - Why the program needs root: it runs after {@link sudoArgv}
 *   unless this process is root.
 * @returns {Promise<{code:number, stdout:string, stderr:string, elided?:boolean}>}
 */
const runCommand = (command, args = [], options = {}) => {
  const line = [command, ...args].map(shellArgumentFactory).join(' ');
  const [program, ...argv] =
    options.privileged && elevationFactory() !== 'root'
      ? [...sudoArgv(options.env), command, ...args]
      : [command, ...args];
  const decision = executionDecisionFactory([command, ...args], { privileged: Boolean(options.privileged) });
  if (decision.refusal) return Promise.reject(Object.assign(new Error(decision.refusal), { expected: true }));
  if (!decision.permitted) {
    logger.info(`[${decision.profile}] elided ${decision.capability}`, redactSensitiveText(line));
    return Promise.resolve({ code: 0, stdout: '', stderr: '', elided: true });
  }
  try {
    targetGate([command, ...args], decision);
  } catch (error) {
    return Promise.reject(error);
  }
  if (!options.disableLog) logger.info('run', redactSensitiveText(line));
  if (options.privileged) logger.info('privileged', { reason: options.privileged, elevation: elevationFactory() });
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(program, argv, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeoutMs,
      signal: options.signal,
    });
    ProcessController.children.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const fail = (code, reason) => {
      latchRuntimeError();
      reject(
        (options.privileged && privilegeError(line, options.privileged, { code, stdout, stderr: reason || stderr })) ||
          new ShellExecError(line, code, stdout, redactSensitiveText(reason || stderr)),
      );
    };
    child.on('error', (error) => {
      ProcessController.children.delete(child);
      fail(-1, error.name === 'AbortError' ? 'aborted' : error.message);
    });
    child.on('close', (code, signal) => {
      ProcessController.children.delete(child);
      if (code === 0 || (options.silentOnError && code !== null)) return resolve({ code, stdout, stderr });
      if (code === null)
        return fail(-1, `stopped by ${signal}${options.timeoutMs ? ` (timeout ${options.timeoutMs}ms)` : ''}`);
      fail(code);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(options.input ?? '');
  });
};

/** One entry of a host account database, as its fields. */
const getent = (database, name) =>
  childProcess.execFileSync('getent', [database, name], { encoding: 'utf8' }).trim().split(':');

/**
 * A user of this host, read from the system user database, never assumed.
 * @memberof Process
 * @param {string} name
 * @returns {{name:string, uid:number, gid:number, home:string}} `gid` is the primary group.
 * @throws {Error} When the database has no entry for the user.
 */
const hostAccount = (name) => {
  const self = os.userInfo();
  if (name === self.username) return { name, uid: self.uid, gid: self.gid, home: self.homedir };
  const [, , uid, gid, , home] = getent('passwd', name);
  return { name, uid: Number(uid), gid: Number(gid), home };
};

/**
 * The ids of an owner as `chown` takes it: `user`, with its primary group, or `user:group`.
 * @memberof Process
 * @param {string} owner
 * @returns {{uid:number, gid:number}}
 * @throws {Error} When the host databases have no entry for the user or the group.
 */
const hostOwner = (owner) => {
  const [user, group] = `${owner}`.split(':');
  const { uid, gid } = hostAccount(user);
  return { uid, gid: group ? Number(getent('group', group)[2]) : gid };
};

/**
 * The user a command acts for: the user who ran `sudo` when this process runs as root through it,
 * else the user of this process.
 * @memberof Process
 * @returns {{name:string, uid:number, gid:number, home:string}}
 * @throws {Error} When the system user database has no entry for the sudo user.
 */
const invokingUser = () =>
  hostAccount(process.getuid() === 0 && process.env.SUDO_USER ? process.env.SUDO_USER : os.userInfo().username);

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
 * Changes the current working directory of this process.
 *
 * Note: `shellCd` mutates global state. Prefer `shellExec(cmd, { cwd })`
 * for one-shot directory-scoped commands; use `shellCd` only for the
 * outermost shell where the cwd should persist across many calls.
 * The path is taken literally; a missing directory throws.
 *
 * @memberof Process
 * @param {string} cd - The path to change the directory to.
 * @param {Object} [options] - Options for the CD operation.
 * @param {boolean} [options.disableLog=false] - Prevent logging of the CD command.
 * @returns {void}
 */
const shellCd = (cd, options = { disableLog: false }) => {
  if (!options.disableLog) logger.info(`cd`, cd);
  process.chdir(cd);
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
 * Runs one file operation on a host path the invoking user may not write: natively in a root process, else
 * as a shell command through the privilege boundary. The execution profile gates both as a host write.
 * @param {string} reason - Why the operation needs root.
 * @param {{native: Function, elevated: string}} operation - The file system call, and the command for `sudo`.
 * @memberof Process
 */
const hostFileOperation = (reason, { native, elevated }) => {
  if (elevationFactory() !== 'root') return void shellExec(elevated, { silent: true, privileged: reason });
  const profile = activeExecutionProfile();
  if (!profile.permits.includes('host:write')) return void logger.info(`[${profile.name}] elided host:write`, reason);
  logger.info('privileged', { reason, elevation: 'root' });
  native();
};

/**
 * Installs a file as a root-owned host file at an explicit mode. The copy lands under a temporary name, then
 * replaces the file, so a reader never sees half of it.
 * @param {object} params
 * @param {string} params.source - The file to install.
 * @param {string} params.target - Destination path.
 * @param {string} [params.mode] - Octal mode.
 * @memberof Process
 */
const installHostFile = ({ source, target, mode = '0644' }) =>
  hostFileOperation(`installs the root-owned file ${target}`, {
    native: () => {
      const sibling = `${target}.underpost-${process.pid}`;
      fs.mkdirSync(nodePath.dirname(target), { recursive: true });
      fs.copyFileSync(source, sibling);
      fs.chmodSync(sibling, Number.parseInt(mode, 8));
      fs.chownSync(sibling, 0, 0);
      fs.renameSync(sibling, target);
    },
    elevated: `install -D -m ${mode} -o root -g root ${shellArgumentFactory(source)} ${shellArgumentFactory(target)}`,
  });

/**
 * Writes a root-owned host file at an explicit mode, and reports whether it changed. The content is staged
 * at 0600, so it is never readable at the default umask.
 * @param {object} params
 * @param {string} params.target - Destination path.
 * @param {string|Buffer} params.content - File contents.
 * @param {string} [params.mode] - Octal mode.
 * @param {boolean} [params.dryRun] - Report the destination instead of writing.
 * @returns {boolean} True when the file changed.
 * @memberof Process
 */
const writeHostFile = ({ target, content, mode = '0644', dryRun = false }) => {
  const bytes = Buffer.from(content);
  let current = null;
  try {
    current = fs.readFileSync(target);
  } catch {
    // Missing, or unreadable by this user: written either way.
  }
  if (current !== null && Buffer.from(current).equals(bytes)) return false;
  if (dryRun) {
    logger.info(`[dry-run] write ${target} (mode ${mode})`, { bytes: bytes.length });
    return true;
  }
  const staging = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-host-file-'));
  const source = nodePath.join(staging, 'content');
  fs.writeFileSync(source, bytes, { mode: 0o600 });
  try {
    installHostFile({ source, target, mode });
  } finally {
    fs.removeSync(staging);
  }
  return true;
};

/** System trees that a recursive host file operation never takes as its target. */
const PROTECTED_HOST_PATHS = new Set(
  [
    '/',
    '/bin',
    '/boot',
    '/dev',
    '/etc',
    '/home',
    '/lib',
    '/lib64',
    '/media',
    '/mnt',
    '/opt',
    '/proc',
    '/root',
    '/run',
    '/sbin',
    '/srv',
    '/sys',
    '/tmp',
    '/usr',
    '/usr/bin',
    '/usr/lib',
    '/usr/lib64',
    '/usr/local',
    '/usr/local/bin',
    '/usr/sbin',
    '/var',
    '/var/lib',
    '/var/log',
    '/var/tmp',
  ].flatMap((path) => [path, fs.existsSync(path) ? fs.realpathSync(path) : path]),
);

/**
 * Checks the target of a recursive host file operation: an absolute path, no system tree, and inside `within`
 * when one is given. Its parent directories are resolved; its last component is not, so a link is the link.
 * @param {string} target
 * @param {{operation: string, within?: string}} options
 * @returns {{path: string, root: string, link: boolean}} `path` is the checked path, `root` the resolved
 *   `within`.
 * @throws {Error} Before the operation does anything.
 * @memberof Process
 */
const hostTreeTarget = (target, { operation, within = '' }) => {
  const refuse = (why) => new Error(`${operation} refuses ${target}: ${why}`);
  if (typeof target !== 'string' || !nodePath.isAbsolute(target)) throw refuse('give an absolute path below /');
  const real = (path) => {
    try {
      return fs.realpathSync(path);
    } catch {
      return path;
    }
  };
  const resolved = nodePath.resolve(target);
  const path = resolved === '/' ? '/' : nodePath.join(real(nodePath.dirname(resolved)), nodePath.basename(resolved));
  if (PROTECTED_HOST_PATHS.has(path)) throw refuse(`${path} is a system tree`);
  const root = within ? real(nodePath.resolve(within)) : '';
  if (within && (!nodePath.isAbsolute(within) || (path !== root && !path.startsWith(root === '/' ? '/' : `${root}/`))))
    throw refuse(`it is outside ${within}`);
  let link = false;
  try {
    link = fs.lstatSync(path).isSymbolicLink();
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EACCES') throw error;
  }
  return { path, root, link };
};

/**
 * Removes a host path the invoking user may not own, as `rm -rf` does: a missing path is no error, and a link
 * goes, never what it points at. See {@link hostTreeTarget} for the checks.
 * @param {string} target - Absolute path.
 * @param {object} options
 * @param {string} options.reason - Why the removal needs root.
 * @param {boolean} [options.contents] - Empty the directory, hidden entries included, and keep it.
 * @param {string} [options.within] - The directory the target lies in; it stays.
 * @memberof Process
 */
const removeHostPath = (target, { reason, contents = false, within = '' }) => {
  const { path, root, link } = hostTreeTarget(target, { operation: 'removeHostPath', within });
  if (contents && link) throw new Error(`removeHostPath refuses ${target}: it is a symbolic link`);
  if (!contents && path === root) throw new Error(`removeHostPath refuses ${target}: ${within} stays`);
  const quoted = shellArgumentFactory(path);
  const entries = () => (contents ? (fs.existsSync(path) ? fs.readdirSync(path) : []) : ['']);
  hostFileOperation(reason, {
    native: () => entries().forEach((entry) => fs.rmSync(nodePath.join(path, entry), { recursive: true, force: true })),
    elevated: contents
      ? `[ ! -d ${quoted} ] || find ${quoted} -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +`
      : `rm -rf -- ${quoted}`,
  });
};

/**
 * Creates a host directory and its parents when it is missing, with its mode and owner. An existing directory
 * keeps both: a workload may have set them.
 * @param {string} target - Absolute path.
 * @param {object} options
 * @param {string} options.reason - Why the directory needs root.
 * @param {string} [options.mode] - Octal mode.
 * @param {{uid:number, gid:number}} [options.owner] - Root by default.
 * @memberof Process
 */
const makeHostDirectory = (target, { reason, mode = '0755', owner }) => {
  if (!nodePath.isAbsolute(`${target}`)) throw new Error(`makeHostDirectory refuses ${target}: give an absolute path`);
  if (fs.existsSync(target)) return;
  const quoted = shellArgumentFactory(target);
  hostFileOperation(reason, {
    native: () => {
      fs.mkdirSync(target, { recursive: true });
      fs.chmodSync(target, Number.parseInt(mode, 8));
      if (owner) fs.chownSync(target, owner.uid, owner.gid);
    },
    elevated: `install -d -m ${mode}${owner ? ` -o ${owner.uid} -g ${owner.gid}` : ''} ${quoted}`,
  });
};

/**
 * Gives a host tree to an owner as `chown -R` does, on its own file system only, so a mount below it stays as it
 * is. `mode` sets the mode of the tree root; `modes` sets the mode of every directory and every file. See
 * {@link hostTreeTarget} for the checks.
 * @param {string} target - Absolute path.
 * @param {object} options
 * @param {string} options.reason - Why the change needs root.
 * @param {{uid:number, gid:number}} [options.owner] - The user of this process by default.
 * @param {string} [options.mode] - Octal mode of the tree root.
 * @param {{directory: string, file: string}} [options.modes] - Octal modes of the entries, by type.
 * @param {string} [options.within] - The directory the target lies in.
 * @memberof Process
 */
const chownHostPath = (
  target,
  { reason, owner = { uid: process.getuid(), gid: process.getgid() }, mode = '', modes = null, within = '' },
) => {
  const { path } = hostTreeTarget(target, { operation: 'chownHostPath', within });
  const quoted = shellArgumentFactory(path);
  const find = `find ${quoted} -xdev`;
  hostFileOperation(reason, {
    native: () => {
      if (!fs.existsSync(path)) return;
      const { dev } = fs.lstatSync(path);
      const visit = (entry) => {
        const stat = fs.lstatSync(entry);
        if (stat.dev !== dev) return;
        fs.lchownSync(entry, owner.uid, owner.gid);
        const entryMode = modes
          ? stat.isDirectory()
            ? modes.directory
            : stat.isFile()
              ? modes.file
              : ''
          : entry === path && !stat.isSymbolicLink()
            ? mode
            : '';
        if (entryMode) fs.chmodSync(entry, Number.parseInt(entryMode, 8));
        if (stat.isDirectory()) for (const name of fs.readdirSync(entry)) visit(nodePath.join(entry, name));
      };
      visit(path);
    },
    elevated: `[ ! -e ${quoted} ] || { ${[
      `${find} -exec chown -h ${owner.uid}:${owner.gid} {} +`,
      ...(modes
        ? [`${find} -type d -exec chmod ${modes.directory} {} +`, `${find} -type f -exec chmod ${modes.file} {} +`]
        : mode
          ? [`chmod ${mode} ${quoted}`]
          : []),
    ].join(' && ')}; }`,
  });
};

/**
 * Moves a host path the invoking user may not own, as `mv` does, across file systems too. The target must not
 * exist. See {@link hostTreeTarget} for the checks.
 * @param {string} source - Absolute path.
 * @param {string} target - Absolute path.
 * @param {{reason: string}} options
 * @memberof Process
 */
const moveHostPath = (source, target, { reason }) => {
  const from = hostTreeTarget(source, { operation: 'moveHostPath' });
  const to = hostTreeTarget(target, { operation: 'moveHostPath' });
  if (fs.existsSync(to.path)) throw new Error(`moveHostPath refuses ${target}: it exists`);
  hostFileOperation(reason, {
    native: () => fs.moveSync(from.path, to.path),
    elevated: `mv -T -- ${shellArgumentFactory(from.path)} ${shellArgumentFactory(to.path)}`,
  });
};

/**
 * Points a host symbolic link at a source, replacing what the link path held.
 * @param {string} source - What the link points at.
 * @param {string} link - The link path.
 * @param {{reason: string}} options
 * @memberof Process
 */
const linkHostPath = (source, link, { reason }) =>
  hostFileOperation(reason, {
    native: () => {
      fs.rmSync(link, { force: true });
      fs.symlinkSync(source, link);
    },
    elevated: `ln -sfn -- ${shellArgumentFactory(source)} ${shellArgumentFactory(link)}`,
  });

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
 * The manifest of an installed package, as the tree that depends on it resolves it.
 * @memberof Process
 * @param {string} name - Package name.
 * @param {string} [root] - Tree whose `node_modules` holds the package.
 * @returns {{path: string, manifest: object}} The `package.json` path and its content.
 */
const packageManifestFactory = (name, root = process.cwd()) => {
  const path = createRequire(`${root}/package.json`).resolve(`${name}/package.json`);
  return { path, manifest: fs.readJsonSync(path) };
};

/**
 * The command-line entry of an installed package, so a runner starts it with its own Node binary
 * and no `npx` process stands between the runner and the package.
 * @memberof Process
 * @param {string} name - Package name.
 * @param {string} [root] - Tree whose `node_modules` holds the package.
 * @returns {string} Absolute path of the entry.
 */
const packageBinPath = (name, root = process.cwd()) => {
  const {
    path,
    manifest: { bin },
  } = packageManifestFactory(name, root);
  return nodePath.resolve(nodePath.dirname(path), typeof bin === 'string' ? bin : bin[name]);
};

/**
 * Fetches a package with `npm exec` and gives its command-line entry, so a runner uses a tool that
 * no `package.json` lists. npm keeps the fetched tree, with its peer dependencies, in its cache.
 * @memberof Process
 * @param {string} spec - npm package spec: a version, a dist-tag or a directory.
 * @param {string} name - Package name. The package gives a command with the same name.
 * @param {Object} [options] - Options of {@link runCommand}, such as `signal` and `timeoutMs`.
 * @returns {Promise<{path: string, version: string}>} Absolute path of the entry, and the fetched version.
 * @throws {ShellExecError} When npm cannot fetch the package.
 */
const fetchPackageBin = async (spec, name, options = {}) => {
  const { stdout } = await runCommand(
    'npm',
    ['exec', '--yes', `--package=${spec}`, '-c', `command -v ${name}`],
    options,
  );
  const link = stdout.trim();
  if (!link) throw new Error(`npm exec ${spec} gave no ${name} command`);
  // The link is <tree>/node_modules/.bin/<name>.
  const root = nodePath.resolve(link, '../../..');
  return { path: packageBinPath(name, root), version: packageManifestFactory(name, root).manifest.version };
};
/**
 * Copies text content to the system clipboard using clipboardy.
 * Logs only the copied length: the content is often a password or a command carrying one.
 * @memberof Process
 * @param {string} [data='🦄'] - The data to copy. Defaults to '🦄'.
 * @returns {void}
 */
function pbcopy(data) {
  const content = data || '🦄';
  clipboard.writeSync(content);
  logger.info(`copied to clipboard`, { characters: `${content}`.length });
}
export {
  chownHostPath,
  hostAccount,
  hostOwner,
  installHostFile,
  linkHostPath,
  makeHostDirectory,
  moveHostPath,
  ProcessController,
  removeHostPath,
  writeHostFile,
  ShellExecError,
  getRootDirectory,
  fetchPackageBin,
  packageBinPath,
  packageManifestFactory,
  invokingUser,
  liveClusterOf,
  runCommand,
  shellArgumentFactory,
  shellExec,
  shellExecAsync,
  shellSpawn,
  shellCd,
  sleepSync,
  pbcopy,
  getTerminalPid,
  daemonProcess,
};
