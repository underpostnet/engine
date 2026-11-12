/**
 * The cyberia-content commands the Saga Engine runs: one step of a semantic generation, and the
 * check of a saga package. Each call runs `bin/cyberia-content.js` of the content source checkout in
 * a child process, so the engine holds no generator, prompt or content rule. A host without a source
 * checkout runs none of them.
 *
 * @module src/projects/cyberia/saga/content-cli.js
 * @namespace CyberiaSagaContentCli
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contentRoot, hasContentSources } from '../content/content-artifact.js';

/** The exit code of a content command whose request cannot run. */
const REFUSED_EXIT = 2;
/** The longest one generation step runs: every Gemini attempt at its timeout, and the backoff. */
export const STEP_TIMEOUT_MS = 20 * 60 * 1000;
const CHECK_TIMEOUT_MS = 2 * 60 * 1000;

const httpError = (status, message) => Object.assign(new Error(message), { status, expected: true });

/**
 * Refuses an operation on a host without a content source checkout.
 * @throws {Error} 409 without one.
 * @memberof CyberiaSagaContentCli
 */
export function assertContentSources() {
  if (!hasContentSources())
    throw httpError(409, `${contentRoot()} is not a cyberia-content source checkout: this host cannot author sagas`);
}

/** Runs one content command; resolves its exit code and output. */
const runContent = (args, { signal, timeout, onLine }) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(contentRoot(), 'bin', 'cyberia-content.js'), ...args], {
      cwd: contentRoot(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
      timeout,
      killSignal: 'SIGKILL',
    });
    let out = '';
    let err = '';
    let partial = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (!onLine) return;
      const lines = (partial + chunk).split('\n');
      partial = lines.pop();
      for (const line of lines.filter(Boolean)) onLine(line);
    });
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code, killed) => resolve({ code, killed, out, err }));
  });

/** A scratch file for one command; the caller removes it. */
const scratchFile = (prefix, value) => {
  const file = path.join(os.tmpdir(), `${prefix}-${randomUUID()}.json`);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
};

const failureOf = ({ code, killed, out, err }, command) =>
  err.trim() ||
  out.trim().split('\n').pop() ||
  (killed ? `${command} stopped by ${killed}` : `${command} exited with ${code}`);

/**
 * Runs the next step of a generation state.
 * @param {Object} state - A generation state of cyberia-content.
 * @param {Object} [params]
 * @param {AbortSignal} [params.signal] - Stops the step.
 * @param {(line:string)=>void} [params.onLine] - Receives each line the step logs.
 * @returns {Promise<Object>} The state after the step.
 * @throws {RangeError} When the request cannot run: a retry meets the same refusal.
 * @memberof CyberiaSagaContentCli
 */
export async function runGenerationStep(state, { signal, onLine } = {}) {
  assertContentSources();
  const file = scratchFile('cyberia-saga-step', state);
  try {
    const result = await runContent(['saga', 'step', '--state', file], { signal, timeout: STEP_TIMEOUT_MS, onLine });
    if (result.code === 0) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const message = failureOf(result, 'The generation step');
    throw result.code === REFUSED_EXIT ? new RangeError(message) : new Error(message);
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.next`, { force: true });
  }
}

/**
 * Checks a saga package against the content source, as `validate` would after it is written. With
 * `write`, a valid package is written to its file in canonical form.
 * @param {Object} pkg - A saga package.
 * @param {{write?:boolean}} [params]
 * @returns {Promise<{findings:Array<{id:string,message:string}>, compiled?:Object, context?:Object, file:string|null}>}
 * @memberof CyberiaSagaContentCli
 */
export async function checkSagaPackage(pkg, { write = false } = {}) {
  assertContentSources();
  const file = scratchFile('cyberia-saga-check', pkg);
  try {
    const result = await runContent(['saga', 'check', '--file', file, ...(write ? ['--write'] : [])], {
      timeout: CHECK_TIMEOUT_MS,
    });
    if (result.code !== 0) throw new Error(failureOf(result, 'The saga check'));
    return JSON.parse(result.out);
  } finally {
    fs.rmSync(file, { force: true });
  }
}
