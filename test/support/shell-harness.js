'use strict';

import shell from 'shelljs';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';

/**
 * Deterministic stand-in for the host commands `shellExec` shells out to and `runCommand` runs.
 *
 * `shellExec` resolves `shell.exec` off the shelljs module object on every call,
 * so replacing that one property reaches every caller — the CLI entrypoints, the
 * nftables statics, the WireGuard sync steps — without any of them taking an
 * injection seam they do not otherwise need.
 *
 * @module test/support/shell-harness.js
 */

/**
 * Builds a shelljs `ShellString`-shaped result.
 *
 * `shellExec` branches on `.code` and returns either `.stdout` or the object
 * itself, and callers that skip `{ stdout: true }` interpolate the result
 * directly — so the object has to stringify to its stdout the way shelljs does.
 */
const shellResult = ({ code = 0, stdout = '', stderr = '' } = {}) => ({
  code,
  stdout,
  stderr,
  toString: () => stdout,
});

/**
 * The command a call runs as root: the shell command inside a `sudo … /bin/sh -c` call of the privilege
 * boundary, else the call itself.
 */
const privilegedCommand = (command) => {
  const wrapped = /^'sudo' (?:'-n' )?'--' (?:'env' (?:'[^']*' )*)?'\/bin\/sh' '-c' '(.*)'$/s.exec(`${command}`);
  return wrapped ? wrapped[1].replaceAll(`'\\''`, `'`) : `${command}`;
};

/** Whether a call matches, as it is or as the command it runs as root. */
const matches = (command, match) =>
  [...new Set([`${command}`, privilegedCommand(command)])].some((candidate) => {
    if (typeof match === 'function') return match(candidate);
    if (match instanceof RegExp) return match.test(candidate);
    return `${candidate}`.includes(match);
  });

/** A child process that answers a route: its output, then its exit, after its stdin closes. */
const routedChild = (route, input) => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    write: (chunk, _encoding, done) => (input.push(chunk), done()),
    final: (done) => {
      done();
      setImmediate(() => {
        if (route.throws)
          return child.emit('error', route.throws instanceof Error ? route.throws : new Error(`${route.throws}`));
        child.stdout.end(route.stdout ?? '');
        child.stderr.end(route.stderr ?? '');
        child.emit('close', route.signal ? null : (route.code ?? 0), route.signal ?? null);
      });
    },
  });
  return child;
};

/**
 * Installs the `shell.exec` and the `runCommand` stubs for one test, and the user of the process. An
 * unprivileged user is the default: a root process writes protected host files with the file system API,
 * so a test asks for root only with file operations under a scratch directory.
 *
 * @param {object[]} [routes] - `{ match, code, stdout, stderr, throws, signal }` in
 *   priority order; the first whose `match` (substring, RegExp or predicate)
 *   hits decides the result. Unmatched commands succeed with empty output.
 * @param {object} [options]
 * @param {object} [options.fallback] - Result for a command no route matched.
 * @param {number} [options.uid] - What `process.getuid()` returns.
 * @returns {{calls: string[], inputs: Object<number,string>, ran: Function, count: Function, route: Function,
 *   restore: Function}} `calls` holds a `runCommand` call as its program and arguments joined by spaces;
 *   `inputs` holds what such a call wrote to stdin, by its index in `calls`.
 */
const shellHarness = (routes = [], { fallback = {}, uid = 1000 } = {}) => {
  const calls = [];
  const user = vi.spyOn(process, 'getuid').mockReturnValue(uid);
  const inputs = {};
  const table = [...routes];

  const spawned = vi.spyOn(childProcess, 'spawn').mockImplementation((command, args = []) => {
    const line = [command, ...args].join(' ');
    const input = [];
    const index = calls.push(line) - 1;
    const child = routedChild(table.find((entry) => matches(line, entry.match)) ?? fallback, input);
    child.on('close', () => (inputs[index] = Buffer.concat(input).toString()));
    return child;
  });

  const spy = vi.spyOn(shell, 'exec').mockImplementation((command, _options, callback) => {
    calls.push(command);
    const route = table.find((entry) => matches(command, entry.match));
    if (route?.throws) throw route.throws instanceof Error ? route.throws : new Error(`${route.throws}`);
    const result = shellResult(route ?? fallback);
    // shelljs hands the async path `(code, stdout, stderr)`; `shellExec` returns
    // whatever `shell.exec` returned without inspecting it in that mode.
    if (typeof callback === 'function') callback(result.code, result.stdout, result.stderr);
    return result;
  });

  return {
    calls,
    inputs,
    /** Whether any command matched. */
    ran: (match) => calls.some((command) => matches(command, match)),
    /** How many commands matched. */
    count: (match) => calls.filter((command) => matches(command, match)).length,
    /** Adds a route ahead of the existing ones, for a mid-test change of host state. */
    route: (entry) => table.unshift(entry),
    restore: () => {
      spy.mockRestore();
      spawned.mockRestore();
      user.mockRestore();
    },
  };
};

export { privilegedCommand, shellHarness, shellResult };
