'use strict';

/**
 * @module deploy-log-table.test
 * @description Covers the run_quiet filter in `deploy/lib/github-actions-logging.sh`: how a
 * deployment monitor's stream is parsed into the live pod table (one row per
 * pod, titled with the iteration and its clock, monitor JSON emits folded into
 * the cells) and how it degrades when stdout is not a terminal. Drives the real shell helper — no cluster, no root.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const loggingLib = path.join(repoRoot, 'deploy/lib/github-actions-logging.sh');

const ESC = '\u001b';
const POD_A = 'dd-test-production-green-644cbdf488-j7drh';
const POD_B = 'dd-test-production-green-644cbdf488-abcde';

const podLine = (pod, k8s, runtime) =>
  `Target pod: ${ESC}[42;30;1m${pod}${ESC}[0m | Pod status: ${ESC}[33;1m${k8s}${ESC}[0m` +
  ` | Runtime status: ${ESC}[36;1m${runtime}${ESC}[0m`;

const emit = (clock, phase, state, status) =>
  [
    `[monitor.js] 2026-08-25 ${clock}:911 info deploy-monitor: {`,
    '  "deployId": "dd-test-production-green",',
    `  "phase": "${phase}",`,
    `  "state": "${state}",`,
    `  "status": ${status ? `"${status}"` : 'null'},`,
    '  "timestamp": "2026-08-25T12:09:11.891Z"',
    '}',
  ].join('\n');

// The table is padded into columns and painted; both are presentation, so the
// content assertions compare cells rather than the drawn line.
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
const cells = (line) =>
  stripAnsi(line)
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())
    .join(' | ');

// The iteration and its clock title the table rather than occupying two columns
// of every row, so a row is any line whose first cell is a pod name.
const isPodRow = (line) => /^\| dd-test/.test(stripAnsi(line));
const podRows = (out) => out.split('\n').filter(isPodRow).map(cells);
const titles = (out) =>
  out
    .split('\n')
    .map((line) => stripAnsi(line).trim())
    .filter((line) => line.startsWith('Sync dd-test cluster (refresh #'));

const PROGRESS_LINE = '[monitor.js] info [dd-test-production-green] | rollout still in progress';
const READY_LINE = '[monitor.js] info [dd-test-production-green] | Deployment ready (K8S Ready + runtime)';
const CHATTER_LINE = '[process.js] info cmd: "kubectl get service dd-test-production-traffic-service -n default"';

// POD_B joins one iteration late; every iteration carries its own monitor clock.
const stream = [
  emit('08:09:11', 'kubernetes', 'pod_scheduled'),
  emit('08:09:11', 'runtime', 'runtime_booting', 'build-deployment'),
  podLine(POD_A, 'ContainerCreating', 'waiting for status (pending)'),
  PROGRESS_LINE,
  emit('08:10:22', 'kubernetes', 'pod_scheduled'),
  emit('08:10:22', 'runtime', 'runtime_booting', 'build-deployment'),
  podLine(POD_A, 'Running', 'build-deployment (pending)'),
  podLine(POD_B, 'ContainerCreating', 'waiting for status (pending)'),
  emit('08:11:33', 'kubernetes', 'pod_ready'),
  podLine(POD_A, 'Running', 'running-deployment'),
  podLine(POD_B, 'Running', 'running-deployment'),
  // The monitor confirms both phases only after the last report of the iteration.
  emit('08:11:33', 'runtime', 'runtime_ready', 'running-deployment'),
  READY_LINE,
  CHATTER_LINE,
].join('\n');

let workDir;
let streamPath;

const runQuiet = ({ tty = false, plain = false, ci = false, exitCode = 0 } = {}) => {
  const command = `exit ${exitCode}`;
  const script = [
    'status=0',
    `source ${JSON.stringify(loggingLib)}`,
    `run_quiet "Sync dd-test cluster" "Target pod:" 14 bash -c 'cat ${JSON.stringify(streamPath)}; ${command}' || status=$?`,
    'exit $status',
  ].join('\n');
  const scriptPath = path.join(workDir, 'run.sh');
  fs.writeFileSync(scriptPath, script);

  const env = { ...process.env, TERM: 'xterm', COLUMNS: '140', LINES: '40' };
  delete env.NO_COLOR;
  if (plain) env.RUN_QUIET_PLAIN = '1';
  else delete env.RUN_QUIET_PLAIN;
  // The helper picks its rendering from the environment, so a run on a GitHub
  // runner would otherwise answer these cases in CI mode and a run on a laptop
  // would not. Every case names the mode it means to exercise.
  delete env.GITHUB_ACTIONS;
  delete env.RUN_QUIET_CI;
  if (ci) env.RUN_QUIET_CI = 'github';

  const [file, args] = tty ? ['script', ['-qec', `bash ${scriptPath}`, '/dev/null']] : ['bash', [scriptPath]];
  return execFileSync(file, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
};

// `script` (util-linux) is the only way to hand the helper a real pty here.
const hasScript = (() => {
  try {
    execFileSync('script', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('deploy failure propagation (run_quiet exit status)', () => {
  let failDir;

  /**
   * Runs the helper against an arbitrary stream and reports the exit status rather than
   * throwing, so a failing step is an assertion rather than a caught exception.
   */
  const runWith = (lines, exitCode = 0) => {
    const logPath = path.join(failDir, 'stream.log');
    fs.writeFileSync(logPath, `${lines.join('\n')}\n`);
    const scriptPath = path.join(failDir, 'run.sh');
    fs.writeFileSync(
      scriptPath,
      [
        'set -euo pipefail',
        `source ${JSON.stringify(loggingLib)}`,
        `run_quiet "Deploy dd-test" "Target pod:" 14 bash -c 'cat ${JSON.stringify(logPath)}; exit ${exitCode}'`,
        'echo REACHED_NEXT_STEP',
      ].join('\n'),
    );
    const env = { ...process.env, RUN_QUIET_PLAIN: '1' };
    delete env.GITHUB_ACTIONS;
    delete env.RUN_QUIET_CI;
    try {
      const stdout = execFileSync('bash', [scriptPath], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { status: 0, stdout, stderr: '' };
    } catch (error) {
      return { status: error.status, stdout: `${error.stdout ?? ''}`, stderr: `${error.stderr ?? ''}` };
    }
  };

  beforeEach(() => {
    failDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-quiet-fail-'));
  });

  afterEach(() => fs.removeSync(failDir));

  it('propagates a non-zero command status so `set -e` stops the deployment', () => {
    const result = runWith([podLine(POD_A, 'Running', 'running-deployment')], 7);
    expect(result.status).to.equal(7);
    expect(result.stdout).to.not.include('REACHED_NEXT_STEP');
  });

  it('keeps the exit code and both log paths when the log carries no error marker', () => {
    // Regression: `run_quiet_error_trace` greps the log for a marker, and grep exits 1 when it
    // matches nothing. Under the `set -euo pipefail` every deploy script runs, that aborted the
    // helper before it could report anything — the step failed as a bare 1 with no exit code,
    // no error trace path, and no debug log path, which is the whole diagnostic.
    const result = runWith([podLine(POD_A, 'Running', 'running-deployment')], 7);
    expect(result.status).to.equal(7);
    expect(result.stderr).to.include('failed (exit 7)');
    expect(result.stderr).to.include('error trace:');
    expect(result.stderr).to.include('debug log:');
  });

  it('fails a step that latched a fatal runtime state but exited 0', () => {
    // The in-pod lifecycle sets `container-status=error` and deliberately does not crash the
    // container, so the exit status alone would report a failed deployment as a green step —
    // and a green step is a green GitHub Actions job.
    const result = runWith([podLine(POD_A, 'Running', 'error')], 0);
    expect(result.status).to.equal(1);
    expect(result.stdout).to.not.include('REACHED_NEXT_STEP');
    expect(result.stderr).to.include('fatal runtime state but exited 0');
    expect(result.stderr).to.include(POD_A);
  });

  it('fails on a fatal runtime status carried by a monitor event rather than a pod row', () => {
    const result = runWith(
      [
        podLine(POD_A, 'Running', 'waiting for status (pending)'),
        emit('08:11:33', 'runtime', 'runtime_error', 'error'),
      ],
      0,
    );
    expect(result.status).to.equal(1);
    expect(result.stderr).to.include('runtime event: status=error');
  });

  it('never hands off to the traffic switch on a pod reporting the fatal state', () => {
    // `error` used to satisfy all_pods_running(), so the filter announced the hand-off and the
    // deployment switched traffic onto a runtime that had already failed.
    const result = runWith([podLine(POD_A, 'Running', 'error')], 0);
    expect(result.stdout).to.not.include('Switch traffic');
  });

  it('leaves a healthy deployment green and still hands off', () => {
    const result = runWith(
      [
        podLine(POD_A, 'Running', 'running-deployment'),
        emit('08:11:33', 'kubernetes', 'pod_ready'),
        emit('08:11:33', 'runtime', 'runtime_ready', 'running-deployment'),
        CHATTER_LINE,
      ],
      0,
    );
    expect(result.status).to.equal(0);
    expect(result.stdout).to.include('REACHED_NEXT_STEP');
    expect(result.stdout).to.include('Switch traffic');
  });

  it('does not read a namespaced phase that merely contains the fatal word as fatal', () => {
    const result = runWith([podLine(POD_A, 'Running', 'dd-test-production-error-handler-deployment')], 0);
    expect(result.status).to.equal(0);
    expect(result.stdout).to.include('REACHED_NEXT_STEP');
  });
});

describe('deploy log table (run_quiet filter)', () => {
  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-quiet-'));
    streamPath = path.join(workDir, 'stream.log');
    fs.writeFileSync(streamPath, `${stream}\n`);
  });

  afterEach(() => fs.removeSync(workDir));

  it('never prints the monitor JSON emits', () => {
    const out = runQuiet();
    expect(out).to.not.include('deploy-monitor');
    expect(out).to.not.include('"phase"');
    expect(out).to.not.include('"timestamp"');
  });

  it('appends one row per pod state change, carrying only the three pod cells', () => {
    expect(podRows(runQuiet())).to.deep.equal([
      `${POD_A} | ContainerCreating | waiting for status (pending)`,
      `${POD_A} | Running | build-deployment (pending)`,
      `${POD_B} | ContainerCreating | waiting for status (pending)`,
      // Readiness arrives as an event, before the iteration that reports it,
      // and only annotates a pod whose own phase already agrees.
      `${POD_A} | Running (ready) | build-deployment (pending)`,
      `${POD_A} | Running (ready) | running-deployment`,
      `${POD_B} | Running (ready) | running-deployment`,
    ]);
  });

  it('titles each iteration from its own monitor clock, never the UTC emit field', () => {
    const out = runQuiet();

    expect(out).to.not.include('12:09:11');
    expect(titles(out)).to.deep.equal([
      'Sync dd-test cluster (refresh #1, 08:09:11)',
      'Sync dd-test cluster (refresh #2, 08:10:22)',
      'Sync dd-test cluster (refresh #3, 08:11:33)',
    ]);
  });

  // Colour is SGR only, which a log viewer that is not a terminal still renders.
  it('paints the appended rows unless colour is turned off', () => {
    expect(runQuiet()).to.include('\u001b[');
    expect(runQuiet({ plain: true })).to.not.include('\u001b[');
  });

  it('heads the appended rows once and keeps non-monitor lines', () => {
    const out = runQuiet();
    const headers = out.split('\n').filter((line) => line.includes('POD NAME'));

    expect(headers).to.have.lengthOf(1);
    expect(cells(headers[0])).to.equal('POD NAME | K8S STATUS | RUNTIME STATUS');
    expect(out).to.include(PROGRESS_LINE);
  });

  // GitHub renders no cursor motion, so the live region becomes a collapsed
  // section and the settled table is reprinted outside it. This is the mode CI
  // actually runs in, and it is reached only through the environment.
  it('folds the frames into a CI group and reprints the settled table after it', () => {
    const out = runQuiet({ ci: true });
    const lines = out.split('\n');

    expect(out).to.not.include('\u001b[A');
    expect(lines.filter((line) => line === '::group::Sync dd-test cluster monitor frames')).to.have.lengthOf(2);
    expect(lines.filter((line) => line === '::endgroup::')).to.have.lengthOf(2);

    const settled = lines.slice(lines.lastIndexOf('::endgroup::') + 1);

    expect(settled.filter(isPodRow).map(cells)).to.deep.equal([
      `${POD_A} | Running (ready) | running-deployment`,
      `${POD_B} | Running (ready) | running-deployment`,
    ]);
    expect(settled.map(stripAnsi)).to.include('Sync dd-test cluster (refresh #3, 08:11:33)');
  });

  it('opens no CI group when nothing is there to collapse one', () => {
    expect(runQuiet()).to.not.include('::group::');
    expect(runQuiet({ ci: true, plain: true })).to.not.include('::group::');
  });

  it('labels the traffic switch once every pod runs, and drops the chatter after it', () => {
    const out = runQuiet();
    const lines = out.trimEnd().split('\n');

    expect(lines.filter((line) => line.includes('▶ Switch traffic'))).to.have.lengthOf(1);
    expect(lines[lines.length - 1]).to.include('▶ Switch traffic');
    expect(out).to.not.include(READY_LINE);
    expect(out).to.not.include(CHATTER_LINE);
  });

  it('falls back to plain rows on a terminal when RUN_QUIET_PLAIN is set', function () {
    if (!hasScript) return this.skip();
    const out = runQuiet({ tty: true, plain: true });

    expect(out).to.not.include('\u001b[');
    expect(podRows(out)).to.include(`${POD_A} | Running (ready) | running-deployment`);
    expect(titles(out)).to.include('Sync dd-test cluster (refresh #3, 08:11:33)');
    expect(out).to.not.include('deploy-monitor');
  });

  it('redraws a single aligned table in place on a terminal', function () {
    if (!hasScript) return this.skip();
    const out = runQuiet({ tty: true });
    const rendered = render(out, 140, 40);
    const rows = rendered.filter(isPodRow);

    // Every repaint but the first is preceded by a cursor-up over the title, the
    // two header lines and the rows it replaces.
    expect(out).to.include('\u001b[5A');
    expect(rows).to.have.lengthOf(2);
    expect(rows[0]).to.include(POD_A).and.to.include('Running (ready)');
    expect(rows[1]).to.include(POD_B);
    expect(rendered.map(stripAnsi)).to.include('Sync dd-test cluster (refresh #3, 08:11:33)');
    expect(rendered.filter((line) => line.includes('POD NAME'))).to.have.lengthOf(1);
    expect(rendered.some((line) => line.includes(PROGRESS_LINE))).to.equal(true);
    // The handoff label closes the run below the last frame of the table.
    expect(rendered[rendered.length - 1]).to.include('▶ Switch traffic');
  });

  it('opens a fresh table for a later monitor in the same command', () => {
    const second = [
      emit('08:20:00', 'kubernetes', 'pod_scheduled'),
      podLine('dd-test-production-blue-77d9f4c6b8-kkq2z', 'Running', 'build-deployment (pending)'),
      PROGRESS_LINE,
      emit('08:21:00', 'kubernetes', 'pod_ready'),
      podLine('dd-test-production-blue-77d9f4c6b8-kkq2z', 'Running', 'running-deployment'),
      emit('08:21:00', 'runtime', 'runtime_ready', 'running-deployment'),
      CHATTER_LINE,
    ].join('\n');
    fs.writeFileSync(streamPath, `${stream}\n${second}\n`);

    const out = runQuiet();
    const rows = podRows(out);

    expect(out.match(/▶ Switch traffic/g)).to.have.lengthOf(2);
    expect(rows[rows.length - 1]).to.equal(
      'dd-test-production-blue-77d9f4c6b8-kkq2z | Running (ready) | running-deployment',
    );
    // The second table counts its own iterations, from its own clock.
    expect(titles(out)).to.include('Sync dd-test cluster (refresh #2, 08:21:00)');
    expect(out).to.not.include(CHATTER_LINE);
  });

  it('propagates the command status and keeps the debug paths on failure', () => {
    let thrown;
    try {
      runQuiet({ exitCode: 7 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown, 'run_quiet must fail the deployment').to.not.equal(undefined);
    expect(thrown.status).to.equal(7);

    const report = thrown.stderr.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
    expect(report).to.include('failed (exit 7)');
    expect(report).to.include('error trace:');
    expect(report).to.include('debug log:');

    const debugLog = report.match(/debug log:\s+(\S+)/)[1];
    // The unfiltered stream survives for debugging even though it never printed.
    expect(fs.readFileSync(debugLog, 'utf8')).to.include('deploy-monitor');
    fs.removeSync(debugLog);
    fs.removeSync(report.match(/error trace:\s+(\S+)/)[1]);
  });
});

/**
 * @function render
 * @description Replays the captured pty stream onto a virtual screen: cursor
 * ups, erase-to-end-of-line and erase-to-end-of-screen only, which is all the
 * filter emits.
 * @param {string} output - Raw stream captured from the pty.
 * @param {number} columns - Screen width.
 * @param {number} lines - Screen height.
 * @returns {string[]} Non-empty screen rows, top to bottom.
 */
function render(output, columns, lines) {
  const screen = Array.from({ length: lines }, () => '');
  let row = 0;
  let column = 0;
  const write = (text) => {
    const line = screen[row] ?? '';
    screen[row] = (line.padEnd(column, ' ') + text).slice(0, columns);
    column = screen[row].length;
  };

  for (let i = 0; i < output.length; i++) {
    const character = output[i];
    if (character === '\u001b' && output[i + 1] === '[') {
      const sequence = /^\u001b\[([0-9;]*)([A-Za-z])/.exec(output.slice(i));
      if (sequence) {
        const [match, parameters, command] = sequence;
        if (command === 'A') row = Math.max(0, row - (Number(parameters) || 1));
        if (command === 'K') screen[row] = (screen[row] ?? '').slice(0, column);
        if (command === 'J') {
          screen[row] = (screen[row] ?? '').slice(0, column);
          for (let below = row + 1; below < lines; below++) screen[below] = '';
        }
        i += match.length - 1;
        continue;
      }
    }
    if (character === '\n') {
      row = Math.min(lines - 1, row + 1);
      column = 0;
      continue;
    }
    if (character === '\r') {
      column = 0;
      continue;
    }
    write(character);
  }

  return screen.filter((line) => line.trim().length > 0);
}
