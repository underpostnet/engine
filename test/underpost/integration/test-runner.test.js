'use strict';

// Needs only Node and the installed Vitest: the runner suites run the real CLI on a fixture tree.

import { expect } from 'chai';
import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import { UNDERPOST_TESTING, testBatchStatus } from '../../../src/server/build/testing.js';
import { runTestProcess } from '../../../src/cli/test.js';

const engineRoot = process.cwd();

const until = async (condition, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
};

// A killed orphan stays a zombie where PID 1 does not reap it: it is dead.
const alive = (pid) => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    return !fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').pop().startsWith('Z');
  } catch {
    return true;
  }
};

const node = (script, options = {}) =>
  runTestProcess({ command: process.execPath, args: ['-e', script], cwd: os.tmpdir(), ...options });

describe('batch process', () => {
  it('reports the exit code of a batch', async () => {
    const outcome = await node('process.exit(3)');
    expect(outcome).to.include({ exitCode: 3, signal: null, timedOut: false });
    expect(outcome.durationMs).to.be.a('number');
    expect(testBatchStatus({ ...outcome, reported: true })).to.equal('failed');
  });

  it('reports a batch that SIGKILL stopped', async () => {
    const outcome = await node("process.kill(process.pid, 'SIGKILL')");
    expect(outcome).to.include({ exitCode: null, signal: 'SIGKILL' });
    expect(testBatchStatus(outcome)).to.equal('killed');
  });

  it('reports a batch that a signal from outside stopped', async () => {
    const outcome = await node("process.kill(process.pid, 'SIGTERM')");
    expect(outcome).to.include({ exitCode: null, signal: 'SIGTERM' });
    expect(testBatchStatus(outcome)).to.equal('signaled');
  });

  it('stops a batch at its time limit', async () => {
    const outcome = await node('setInterval(() => {}, 1000)', { timeoutMs: 500 });
    expect(outcome).to.include({ timedOut: true, signal: 'SIGTERM' });
    expect(testBatchStatus(outcome)).to.equal('timeout');
  });

  it('kills a batch that ignores SIGTERM after the grace time', async () => {
    const outcome = await node("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)", {
      timeoutMs: 1000,
      graceMs: 200,
    });
    expect(outcome).to.include({ timedOut: true, signal: 'SIGKILL' });
  });

  it('kills the processes a batch leaves behind', async () => {
    const pidFile = nodePath.join(fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-batch-')), 'orphan.pid');
    const outcome = await node(
      [
        "const orphan = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
        `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(orphan.pid));`,
        'orphan.unref();',
      ].join(' '),
    );
    expect(outcome.exitCode).to.equal(0);
    const orphan = Number(fs.readFileSync(pidFile, 'utf8'));
    await until(() => !alive(orphan), 5000);
    expect(alive(orphan)).to.equal(false);
    fs.removeSync(nodePath.dirname(pidFile));
  }, 20000);

  it('reports a batch that cannot start', async () => {
    const outcome = await runTestProcess({ command: nodePath.join(os.tmpdir(), 'no-such-binary'), cwd: os.tmpdir() });
    expect(outcome).to.include({ exitCode: null, signal: null });
    expect(testBatchStatus(outcome)).to.equal('error');
  });

  it.skipIf(!fs.existsSync('/proc/self/stat'))('samples the memory and CPU of the batch', async () => {
    const outcome = await node('const held = Buffer.alloc(96 * 1024 * 1024, 1); setTimeout(() => held.length, 1500)', {
      diagnose: true,
    });
    expect(outcome.diagnostics.peakRssBytes).to.be.above(96 * 1024 * 1024);
    expect(outcome.diagnostics.cpuMs).to.be.at.least(0);
  });
});

// Two projects of the engine table, in a tree of their own. Alone, the audit batch covers 5 of
// the 8 source lines and the unit batch 6. Together they cover 7.
describe('batch runner', { timeout: 120000 }, () => {
  const selection = 'underpost:audit,underpost:unit';
  let tree = '';

  beforeAll(() => {
    tree = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-test-runner-'));
    fs.symlinkSync(nodePath.join(engineRoot, 'node_modules'), nodePath.join(tree, 'node_modules'), 'dir');
    fs.writeJsonSync(nodePath.join(tree, 'package.json'), { name: 'fixture', type: 'module' });
    fs.writeFileSync(
      nodePath.join(tree, 'vitest.config.js'),
      fs
        .readFileSync(nodePath.join(engineRoot, 'vitest.config.js'), 'utf8')
        .replaceAll("'./src/", `'${engineRoot}/src/`),
    );
    const files = {
      'src/projects/underpost/fixture.js': ['one', 'two', 'three', 'four']
        .map((name, index) => `export const ${name} = () => {\n  return ${index + 1};\n};\n`)
        .join(''),
      'test/underpost/audit/audit.test.js': `import { one } from '../../../src/projects/underpost/fixture.js';
it('reads one', async () => {
  if (process.env.FIXTURE_SLOW) await new Promise((resolve) => setTimeout(resolve, 60000));
  if (process.env.FIXTURE_KILL) process.kill(process.ppid, 'SIGKILL');
  expect(one()).toBe(process.env.FIXTURE_FAIL ? 0 : 1);
});
`,
      'test/underpost/unit/unit.test.js': `import { three, two } from '../../../src/projects/underpost/fixture.js';
it('reads two and three', () => {
  expect(two() + three()).toBe(5);
});
`,
    };
    for (const [path, content] of Object.entries(files)) fs.outputFileSync(nodePath.join(tree, path), content);
  });

  afterAll(() => fs.removeSync(tree));

  const runsDirectory = () => nodePath.join(tree, UNDERPOST_TESTING.runs.directory);
  const runDirectory = (pid) =>
    nodePath.join(
      runsDirectory(),
      fs.readdirSync(runsDirectory()).find((entry) => entry.endsWith(`-${pid}`)),
    );
  const manifestOf = (pid) => fs.readJsonSync(nodePath.join(runDirectory(pid), 'manifest.json'));
  const lcovPath = () => nodePath.join(tree, UNDERPOST_TESTING.lcovPath);

  const start = (selector, args = [], env = {}) => {
    // The outer run must not reach the inner one.
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !/^(VITEST|TEST$|COVERAGE_|UNDERPOST_TEST_|NODE_V8_COVERAGE)/.test(key) &&
          key !== UNDERPOST_TESTING.allureResultsEnvKey,
      ),
    );
    const child = spawn(process.execPath, [nodePath.join(engineRoot, 'bin/index.js'), 'test', selector, ...args], {
      cwd: tree,
      // Isolates the global underpost store, which overrides the environment of the CLI.
      env: { ...inherited, npm_config_prefix: nodePath.join(tree, 'npm-global'), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const done = new Promise((resolve) => child.once('close', (code) => resolve({ code, output, pid: child.pid })));
    return { child, done };
  };
  const run = (...args) => start(...args).done;

  it('runs the batches in group order, keeps a failed batch and fails the run', async () => {
    const { code, output, pid } = await run(selection, [], { FIXTURE_FAIL: '1' });
    expect(code, output).to.equal(1);
    const { footprint, batches, merge, status } = manifestOf(pid);
    expect(footprint).to.equal('safe');
    expect(batches.map(({ projects, status: result, exitCode }) => [projects[0], result, exitCode])).to.deep.equal([
      ['underpost:audit', 'failed', 1],
      ['underpost:unit', 'passed', 0],
    ]);
    for (const { report } of batches) expect(fs.existsSync(nodePath.join(runDirectory(pid), report))).to.equal(true);
    // The merge replays the failed test.
    expect(merge.status).to.equal('failed');
    expect(status).to.equal('failed');
    expect(fs.readFileSync(lcovPath(), 'utf8')).to.include('SF:src/projects/underpost/fixture.js');
  });

  it('applies the coverage threshold once, to the merged coverage', async () => {
    const reached = await run(selection, [], { COVERAGE_MIN: '80' });
    expect(reached.code, reached.output).to.equal(0);
    expect(manifestOf(reached.pid).status).to.equal('passed');

    const missed = await run(selection, [], { COVERAGE_MIN: '90' });
    expect(missed.code, missed.output).to.equal(1);
    const { batches, merge } = manifestOf(missed.pid);
    expect(batches.map(({ status }) => status)).to.deep.equal(['passed', 'passed']);
    expect(merge.status).to.equal('failed');
  });

  it('measures the same coverage as one process', async () => {
    const lcov = async (args) => {
      const { code, output } = await run(selection, args);
      expect(code, output).to.equal(0);
      return fs.readFileSync(lcovPath(), 'utf8');
    };
    expect(await lcov([])).to.equal(await lcov(['--footprint', 'ci']));
  });

  it('records a killed batch, runs the others and never reports green', async () => {
    fs.removeSync(lcovPath());
    const { code, output, pid } = await run(selection, ['--no-coverage'], { FIXTURE_KILL: '1' });
    expect(code, output).to.equal(1);
    const { batches, merge, status } = manifestOf(pid);
    expect(batches[0]).to.include({ status: 'killed', signal: 'SIGKILL', exitCode: null });
    expect(batches[1].status).to.equal('passed');
    // The report of the other batch merges green; the run still fails.
    expect(merge.status).to.equal('passed');
    expect(status).to.equal('failed');
    expect(fs.existsSync(lcovPath())).to.equal(false);
  });

  it('fails the merge when no batch wrote a report', async () => {
    const { code, output, pid } = await run('underpost:audit', [], { FIXTURE_KILL: '1' });
    expect(code, output).to.equal(1);
    const { batches, merge, status } = manifestOf(pid);
    expect(batches.map(({ status: result }) => result)).to.deep.equal(['killed']);
    expect(merge.status).to.equal('error');
    expect(status).to.equal('failed');
  });

  it('stops at an operator signal and keeps the manifest', async () => {
    const { child, done } = start(selection, [], { FIXTURE_SLOW: '1' });
    await until(() => {
      try {
        return manifestOf(child.pid).batches[0].status === 'running';
      } catch {
        return false;
      }
    });
    child.kill('SIGINT');
    const { code, output, pid } = await done;
    expect(code, output).to.equal(1);
    const { batches, merge, status } = manifestOf(pid);
    expect(batches.map(({ status: result }) => result)).to.deep.equal(['interrupted', 'pending']);
    expect(merge.status).to.equal('pending');
    expect(status).to.equal('interrupted');
  });

  it('skips a delegated project this tree does not ship', async () => {
    const { code, output, pid } = await run('item-ledger:contract');
    expect(code, output).to.equal(0);
    const { batches, status } = manifestOf(pid);
    expect(batches).to.have.length(1);
    expect(batches[0]).to.include({ delegated: true, status: 'skipped' });
    expect(manifestOf(pid)).to.not.have.property('merge');
    expect(status).to.equal('passed');
  });

  it('deletes the oldest runs before a new run starts', async () => {
    for (let day = 1; day <= UNDERPOST_TESTING.runs.kept + 1; day++)
      fs.mkdirpSync(nodePath.join(runsDirectory(), `2020010${day}T000000.000Z-1`));
    fs.writeFileSync(nodePath.join(runsDirectory(), 'notes'), '');
    const { code, output, pid } = await run('item-ledger:contract');
    expect(code, output).to.equal(0);
    const entries = fs.readdirSync(runsDirectory());
    expect(entries).to.include('notes');
    expect(entries.filter((entry) => entry !== 'notes')).to.have.length(UNDERPOST_TESTING.runs.kept);
    expect(entries).to.not.include('20200101T000000.000Z-1');
    expect(fs.existsSync(runDirectory(pid))).to.equal(true);
  });
});
