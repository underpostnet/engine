'use strict';

// Runs TypeDoc tasks in their own processes, as a client build runs them. The real TypeDoc cases use
// a one-file fixture project. The failure cases use a stand-in `typedoc` package, so the runner, the
// kernel boundary, the locks and the publication meet a workload that fails on cue. Each task takes
// the host-wide TypeDoc locks: a TypeDoc that another process runs on this host makes them wait.

import { expect } from 'chai';
import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import { acquireHostLock } from '../../../src/server/runtime/host-lock.js';
import { alive } from '../../support/process.js';

const engineRoot = process.cwd();
const VERSION = '1.0.0';
const MB = 1024 * 1024;

const until = async (condition, timeoutMs = 60000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
};

// Reads its options like TypeDoc and acts as FAKE_TYPEDOC says; each start and end goes to FAKE_TYPEDOC_LOG.
const STAND_IN = `const fs = require('node:fs');
const options = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--options') + 1], 'utf8'));
const mark = (event) =>
  fs.appendFileSync(process.env.FAKE_TYPEDOC_LOG, JSON.stringify({ event, pid: process.pid, out: options.out, at: Date.now() }) + '\\n');
const site = (complete) => {
  fs.mkdirSync(options.out + '/assets', { recursive: true });
  fs.writeFileSync(options.out + '/index.html', '<title>' + options.name + '</title><link href="assets/style.css">');
  if (complete) for (const asset of ['style.css', 'main.js', 'search.js']) fs.writeFileSync(options.out + '/assets/' + asset, '/**/');
};
mark('start');
if (process.env.FAKE_TYPEDOC === 'partial-oom') {
  site(false);
  const held = [];
  setInterval(() => held.push(Buffer.alloc(16 * 1024 * 1024, 1)), 50);
} else if (process.env.FAKE_TYPEDOC === 'incomplete') site(false);
else setTimeout(() => (site(true), mark('end')), Number(process.env.FAKE_TYPEDOC_MS || 0));
`;

describe('TypeDoc task', { timeout: 120000 }, () => {
  let fixture;
  let standIn;
  let marks;
  const started = [];

  const site = (root, host, entry = VERSION) => nodePath.join(root, 'public', host, 'docs/engine', entry);
  const readMarks = () =>
    fs.existsSync(marks) ? fs.readFileSync(marks, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];

  // One task in its own process; its result is its last line.
  const task = (host, { mode = 'build', docs = {}, cwd = fixture, env = {} } = {}) => {
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `process.chdir(${JSON.stringify(cwd)});
         const { runTypedoc } = await import(${JSON.stringify(`${engineRoot}/src/client-builder/client-build-docs.js`)});
         const result = await runTypedoc(${JSON.stringify({ host, path: '/', docs, version: VERSION, mode, buildId: 'fixture' })});
         console.log('RESULT ' + JSON.stringify(result));
         process.exit(0);`,
      ],
      // A small reserve keeps admission deterministic on a busy host; the budget still bounds TypeDoc.
      {
        env: { ...process.env, UNDERPOST_MEMORY_RESERVE_MB: '64', NO_COLOR: '1', FAKE_TYPEDOC_LOG: marks, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    started.push(child);
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const result = new Promise((resolve) =>
      child.once('exit', () => {
        const line = output.split('\n').find((entry) => entry.startsWith('RESULT '));
        resolve({ ...(line ? JSON.parse(line.slice(7)) : { status: 'no result' }), output });
      }),
    );
    return { child, result, output: () => output };
  };
  const fake = (host, behaviour, env = {}) => task(host, { cwd: standIn, env: { FAKE_TYPEDOC: behaviour, ...env } });
  const record = (root, host) => fs.readJsonSync(site(root, host, '.typedoc-run.json'));

  const project = (root, { typedoc = 'link' } = {}) => {
    if (typedoc === 'link')
      fs.symlinkSync(nodePath.join(engineRoot, 'node_modules'), nodePath.join(root, 'node_modules'), 'dir');
    else {
      fs.outputJsonSync(nodePath.join(root, 'node_modules/typedoc/package.json'), { name: 'typedoc', bin: 'bin.js' });
      fs.outputFileSync(nodePath.join(root, 'node_modules/typedoc/bin.js'), STAND_IN);
    }
    fs.outputJsonSync(nodePath.join(root, 'package.json'), { name: 'fixture', type: 'module' });
    fs.outputJsonSync(nodePath.join(root, 'typedoc.json'), {
      name: 'Fixture',
      entryPoints: ['./src'],
      entryPointStrategy: 'expand',
      tsconfig: './tsconfig.docs.json',
      skipErrorChecking: true,
      logLevel: 'Error',
    });
    fs.outputJsonSync(nodePath.join(root, 'tsconfig.docs.json'), {
      compilerOptions: { allowJs: true, checkJs: false, noEmit: true, target: 'ES2022', module: 'ESNext' },
      include: ['src/**/*.js'],
    });
    fs.outputFileSync(
      nodePath.join(root, 'src/fixture.js'),
      '/**\n * Adds two numbers.\n * @param {number} a\n * @param {number} b\n * @returns {number}\n */\nexport const add = (a, b) => a + b;\n',
    );
    for (const host of ['a.fixture.test', 'b.fixture.test'])
      fs.outputFileSync(nodePath.join(root, 'public', host, 'favicon.ico'), '');
  };

  beforeAll(() => {
    fixture = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-typedoc-'));
    standIn = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-typedoc-stand-in-'));
    project(fixture);
    project(standIn, { typedoc: 'stand-in' });
    marks = nodePath.join(standIn, 'marks.jsonl');
  });

  beforeEach(() => fs.removeSync(marks));

  // A failed case must not leave a task or its workload holding the host-wide locks.
  afterEach(() => {
    for (const child of started.splice(0))
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    for (const { pid } of readMarks())
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {}
  });

  afterAll(() => {
    fs.removeSync(fixture);
    fs.removeSync(standIn);
  });

  it('publishes a checked site, and keeps it when the next run fails', async () => {
    const published = await task('a.fixture.test').result;
    expect(published.status, published.output).to.equal('published');
    expect(fs.readFileSync(nodePath.join(site(fixture, 'a.fixture.test'), 'index.html'), 'utf8')).to.include('Fixture');
    const { history, published: release } = record(fixture, 'a.fixture.test');
    expect(release.version).to.equal(VERSION);
    expect(history.last.class).to.be.oneOf(['measured', 'unmeasured']);
    expect(published.metrics.durationMs).to.be.above(0);

    const failed = await task('a.fixture.test', { docs: { typedoc: { entryPoints: ['./missing'] } } }).result;
    expect(failed.status, failed.output).to.equal('failed');
    expect(failed.reason).to.match(/^TypeDoc exited with /);
    expect(fs.existsSync(nodePath.join(site(fixture, 'a.fixture.test'), 'index.html'))).to.equal(true);
    expect(fs.readdirSync(nodePath.dirname(site(fixture, 'a.fixture.test'))).sort()).to.deep.equal([
      '.typedoc-run.json',
      VERSION,
    ]);
    expect(fs.readdirSync(fixture).filter((entry) => entry.startsWith('.typedoc.'))).to.deep.equal([]);
  });

  it('cancels TypeDoc while it compiles, and leaves no process and no staging behind', async () => {
    const published = fs.statSync(nodePath.join(site(fixture, 'a.fixture.test'), 'index.html')).mtimeMs;
    const running = task('a.fixture.test');
    await until(() => /TASK_START/.test(running.output()));
    running.child.kill('SIGINT');
    const cancelled = await running.result;
    expect(cancelled.status, cancelled.output).to.equal('cancelled');
    const typedoc = Number(/TASK_START[^]*?"pid": (\d+)/.exec(cancelled.output)[1]);
    expect(alive(typedoc)).to.equal(false);
    expect(fs.statSync(nodePath.join(site(fixture, 'a.fixture.test'), 'index.html')).mtimeMs).to.equal(published);
    expect(fs.readdirSync(nodePath.dirname(site(fixture, 'a.fixture.test'))).sort()).to.deep.equal([
      '.typedoc-run.json',
      VERSION,
    ]);
    expect(record(fixture, 'a.fixture.test').history.last.class).to.equal('interrupted');
  });

  it('waits while another heavy task holds the host, then runs', async () => {
    const held = await acquireHostLock({ name: 'resource-heavy' });
    const waiting = task('b.fixture.test');
    await until(() => waiting.output().includes('TASK_DEFERRED'));
    expect(fs.existsSync(site(fixture, 'b.fixture.test'))).to.equal(false);
    held.release();
    const result = await waiting.result;
    expect(result.status, result.output).to.equal('published');
    expect(result.output).to.include('resource-heavy');
  });

  it('rebuilds a preview until it is stopped, then removes it and leaves the published site alone', async () => {
    const published = fs.statSync(nodePath.join(site(fixture, 'a.fixture.test'), 'index.html')).mtimeMs;
    const preview = task('a.fixture.test', { mode: 'watch' });
    await until(() => fs.existsSync(nodePath.join(site(fixture, 'a.fixture.test', 'preview'), 'index.html')));
    expect(fs.existsSync(nodePath.join(site(fixture, 'a.fixture.test', 'preview'), 'index.html'))).to.equal(true);
    preview.child.kill('SIGINT');
    const stopped = await preview.result;
    expect(stopped.status, stopped.output).to.equal('stopped');
    expect(fs.statSync(nodePath.join(site(fixture, 'a.fixture.test'), 'index.html')).mtimeMs).to.equal(published);
    expect(fs.readdirSync(nodePath.dirname(site(fixture, 'a.fixture.test'))).sort()).to.deep.equal([
      '.typedoc-run.json',
      VERSION,
    ]);
  });

  it('keeps the published site when the memory limit stops TypeDoc after it wrote part of the site', async () => {
    const first = await fake('a.fixture.test', 'slow', { FAKE_TYPEDOC_MS: '300' }).result;
    expect(first.status, first.output).to.equal('published');
    // A reserve just under what the host has leaves the task a few hundred MB.
    const reserveMb = Math.floor(process.availableMemory() / MB) - 300;
    const stopped = await fake('a.fixture.test', 'partial-oom', { UNDERPOST_MEMORY_RESERVE_MB: `${reserveMb}` }).result;
    expect(stopped.status, stopped.output).to.equal('failed');
    expect(stopped.metrics.reason).to.equal('memory-limit');
    expect(stopped.output).to.include('RESOURCE_RESERVE_OVERRIDE');
    expect(fs.readFileSync(nodePath.join(site(standIn, 'a.fixture.test'), 'assets/main.js'), 'utf8')).to.equal('/**/');
    expect(fs.readdirSync(nodePath.dirname(site(standIn, 'a.fixture.test'))).sort()).to.deep.equal([
      '.typedoc-run.json',
      VERSION,
    ]);
    const { history } = record(standIn, 'a.fixture.test');
    expect(history.last.class).to.equal('memory-limit');
    expect(history.exceeded.bytes).to.be.above(0);
    expect(history.peak.bytes).to.be.below(history.exceeded.bytes);
  }, 60000);

  it('keeps the published site when TypeDoc writes a site that fails its checks', async () => {
    const result = await fake('a.fixture.test', 'incomplete').result;
    expect(result.status, result.output).to.equal('failed');
    expect(result.reason).to.match(/^TypeDoc wrote an incomplete site: assets\/style.css is missing/);
    expect(fs.existsSync(nodePath.join(site(standIn, 'a.fixture.test'), 'assets/main.js'))).to.equal(true);
    expect(record(standIn, 'a.fixture.test').history.last.class).to.be.oneOf(['measured', 'unmeasured']);
  });

  it('recovers what an interrupted publication left, and then publishes', async () => {
    const root = nodePath.dirname(site(standIn, 'b.fixture.test'));
    fs.removeSync(root);
    fs.outputFileSync(nodePath.join(root, `.backup-${VERSION}-1-1`, 'index.html'), 'published before');
    fs.outputFileSync(nodePath.join(root, `.staging-${VERSION}-2-2`, 'index.html'), 'half');
    fs.outputFileSync(nodePath.join(root, '.staging-0.9.0-3-3', 'index.html'), 'half');
    const result = await fake('b.fixture.test', 'complete').result;
    expect(result.status, result.output).to.equal('published');
    expect(result.output).to.match(/ARTIFACT_RECOVERED[^]*"restored": \[\s*"1\.0\.0"\s*\]/);
    expect(fs.readdirSync(root).sort()).to.deep.equal(['.typedoc-run.json', VERSION]);
    expect(fs.readFileSync(nodePath.join(root, VERSION, 'index.html'), 'utf8')).to.include('<title>Fixture</title>');
  });

  it('runs one TypeDoc at a time on the host, for one client and for another', async () => {
    const results = await Promise.all(
      ['a.fixture.test', 'a.fixture.test', 'b.fixture.test'].map(
        (host) => fake(host, 'slow', { FAKE_TYPEDOC_MS: '400' }).result,
      ),
    );
    for (const result of results) expect(result.status, result.output).to.equal('published');
    const runs = Object.values(Object.groupBy(readMarks(), ({ pid }) => pid)).map((events) => [
      events.find(({ event }) => event === 'start').at,
      events.find(({ event }) => event === 'end').at,
    ]);
    runs.sort(([a], [b]) => a - b);
    expect(runs).to.have.length(3);
    for (let index = 1; index < runs.length; index++) expect(runs[index][0]).to.be.at.least(runs[index - 1][1]);
  }, 60000);

  it('keeps the host for a TypeDoc that outlives its build, then recovers what it left', async () => {
    const orphaned = fake('b.fixture.test', 'slow', { FAKE_TYPEDOC_MS: '3000' });
    await until(() => readMarks().some(({ event }) => event === 'start'));
    const [{ pid: typedoc }] = readMarks();
    orphaned.child.kill('SIGKILL');
    await orphaned.result;
    expect(alive(typedoc)).to.equal(true);

    const next = fake('b.fixture.test', 'complete');
    await until(() => next.output().includes('TASK_DEFERRED'));
    expect(next.output()).to.match(/"holderAlive": false/);
    expect(alive(typedoc)).to.equal(true);
    const result = await next.result;
    expect(result.status, result.output).to.equal('published');
    expect(alive(typedoc)).to.equal(false);
    // The build ended before it published: the next run removes the staging directory its TypeDoc wrote.
    expect(result.output).to.include('ARTIFACT_RECOVERED');
    expect(fs.readdirSync(nodePath.dirname(site(standIn, 'b.fixture.test'))).sort()).to.deep.equal([
      '.typedoc-run.json',
      VERSION,
    ]);
  }, 60000);
});
