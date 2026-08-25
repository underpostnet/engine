'use strict';

import shell from 'shelljs';

/**
 * Deterministic stand-in for the host commands `shellExec` shells out to.
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

const matches = (command, match) => {
  if (typeof match === 'function') return match(command);
  if (match instanceof RegExp) return match.test(command);
  return `${command}`.includes(match);
};

/**
 * Installs the `shell.exec` stub for one test.
 *
 * @param {object[]} [routes] - `{ match, code, stdout, stderr, throws }` in
 *   priority order; the first whose `match` (substring, RegExp or predicate)
 *   hits decides the result. Unmatched commands succeed with empty output.
 * @param {object} [options]
 * @param {object} [options.fallback] - Result for a command no route matched.
 * @returns {{calls: string[], ran: Function, count: Function, route: Function, restore: Function}}
 */
const shellHarness = (routes = [], { fallback = {} } = {}) => {
  const calls = [];
  const table = [...routes];

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
    /** Whether any command matched. */
    ran: (match) => calls.some((command) => matches(command, match)),
    /** How many commands matched. */
    count: (match) => calls.filter((command) => matches(command, match)).length,
    /** Adds a route ahead of the existing ones, for a mid-test change of host state. */
    route: (entry) => table.unshift(entry),
    restore: () => spy.mockRestore(),
  };
};

export { shellHarness, shellResult };
