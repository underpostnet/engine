'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import shell from 'shelljs';
import { COVERAGE_BUNDLE_DIRECTORY } from '../../../src/server/build/coverage.js';
import { buildCoverage, buildDocs, buildDocsReferences } from '../../../src/client-builder/client-build-docs.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;

// TypeDoc is the workload: the runner is replaced, reads the config TypeDoc would read, and plays
// the outcome a test stages. The host is fixed, so admission is deterministic.
const workload = vi.hoisted(() => ({ calls: [], run: null, availableBytes: 0 }));
vi.mock('../../../src/server/runtime/managed-process.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runManagedProcess: async (params) => {
    const config = (await import('fs-extra')).default.readJsonSync(params.args[2]);
    workload.calls.push({ params, config });
    const outcome = workload.run({ params, config });
    return {
      signal: null,
      timedOut: false,
      cancelled: '',
      overBudget: '',
      stoppedFor: '',
      oomKilled: false,
      durationMs: 2000,
      limits: null,
      diagnostics: {
        peakBytes: 700 * 1024 * 1024,
        peakSource: 'kernel',
        peakRssBytes: 650 * 1024 * 1024,
        cpuMs: 3000,
        cpuSource: 'kernel',
      },
      ...outcome,
    };
  },
}));
vi.mock('../../../src/server/runtime/resource-governor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  hostCapacityFactory: () => ({
    hostMemoryBytes: 16 * 1024 ** 3,
    cgroupMemoryBytes: null,
    totalMemoryBytes: 16 * 1024 ** 3,
    availableMemoryBytes: workload.availableBytes,
    cpus: 4,
    cgroupCpus: null,
  }),
}));
vi.mock('../../../src/server/runtime/linux-resources.js', async (importOriginal) => ({
  ...(await importOriginal()),
  systemdScopeSupport: () => ({ available: false, reason: 'fixture host' }),
}));

describe('client coverage build', () => {
  let fixturePath;
  let cwd;

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');
    // Suite reports resolve against the engine root, so the fixture stands in for it.
    cwd = process.cwd();
    process.chdir(fixturePath);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.removeSync(fixturePath);
    vi.restoreAllMocks();
  });

  it('publishes each declared report at its own coverage route', async () => {
    fs.outputFileSync(`${fixturePath}/coverage/cyberia/index.html`, '<!doctype html><title>cyberia</title>');
    fs.outputFileSync(`${fixturePath}/hardhat/coverage/html/index.html`, '<!doctype html><title>hardhat</title>');
    fs.outputFileSync(`${fixturePath}/hardhat/coverage/html/base.css`, 'body {}');
    const docsDestination = `${fixturePath}/public/docs/`;

    await buildCoverage({
      docs: {
        coverage: [
          { id: 'cyberia', suite: 'cyberia' },
          { id: 'hardhat', path: `${fixturePath}/hardhat` },
        ],
      },
      docsDestination,
    });

    expect(fs.readFileSync(`${docsDestination}coverage/cyberia/index.html`, 'utf8')).to.include('cyberia');
    expect(fs.readFileSync(`${docsDestination}coverage/hardhat/index.html`, 'utf8')).to.include('hardhat');
    expect(fs.existsSync(`${docsDestination}coverage/hardhat/base.css`)).to.equal(true);
    expect(fs.existsSync(`${docsDestination}coverage/hardhat/html`)).to.equal(false);
  });

  it('drops a previously published report the conf no longer declares', async () => {
    fs.outputFileSync(`${fixturePath}/out/coverage/legacy/index.html`, '<!doctype html>');
    fs.outputFileSync(`${fixturePath}/coverage/unit/index.html`, '<!doctype html><title>unit</title>');

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'underpost:unit' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.existsSync(`${fixturePath}/out/coverage/legacy`)).to.equal(false);
    expect(fs.existsSync(`${fixturePath}/out/coverage/engine/index.html`)).to.equal(true);
  });

  it("publishes the run a report names, never another selection's", async () => {
    fs.outputFileSync(`${fixturePath}/coverage/unit-infra-app-cyberia/index.html`, '<!doctype html><title>all</title>');

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'underpost,ecosystem' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    const page = fs.readFileSync(`${fixturePath}/out/coverage/engine/index.html`, 'utf8');
    expect(page).to.include('Coverage report unavailable');
    expect(page).to.include('node bin test underpost,ecosystem');
  });

  it('publishes the unavailable page for a coverage directory with no HTML index', async () => {
    fs.outputFileSync(`${fixturePath}/hardhat/coverage/lcov.info`, 'TN:\n');

    await buildCoverage({
      docs: { coverage: [{ id: 'hardhat', path: `${fixturePath}/hardhat` }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/hardhat/index.html`, 'utf8')).to.include(
      'Coverage report unavailable',
    );
  });

  it('publishes the report an assembled deploy artifact bundled', async () => {
    fs.outputFileSync(
      `${fixturePath}/${COVERAGE_BUNDLE_DIRECTORY}/engine/index.html`,
      '<!doctype html><title>bundled</title>',
    );

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'underpost:unit' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/engine/index.html`, 'utf8')).to.include('bundled');
  });

  it('prefers a freshly generated report over the bundled artifact', async () => {
    fs.outputFileSync(`${fixturePath}/coverage/underpost/index.html`, '<!doctype html><title>fresh</title>');
    fs.outputFileSync(
      `${fixturePath}/${COVERAGE_BUNDLE_DIRECTORY}/engine/index.html`,
      '<!doctype html><title>bundled</title>',
    );

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'underpost:unit' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/engine/index.html`, 'utf8')).to.include('fresh');
  });

  // Regression: the build used to shell out to `npm test` when no report was present. Inside a
  // pod that spent minutes of the build phase on a test runner, and the suite's expected
  // non-zero exits latched `container-status=error`, failing a healthy rollout.
  it('never runs a test runner to produce a missing report', async () => {
    fs.outputJsonSync(`${fixturePath}/package.json`, {
      scripts: { coverage: 'vitest run --coverage', test: 'vitest run' },
    });
    const exec = vi.spyOn(shell, 'exec');

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'underpost:unit' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(exec.mock.calls.length).to.equal(0);
    expect(fs.readFileSync(`${fixturePath}/out/coverage/engine/index.html`, 'utf8')).to.include(
      'Coverage report unavailable',
    );
  });

  it('publishes nothing for a deploy that declares no coverage report', async () => {
    await buildCoverage({ docs: {}, docsDestination: `${fixturePath}/out/` });

    expect(fs.existsSync(`${fixturePath}/out`)).to.equal(false);
  });
});

describe('docs build', () => {
  let fixturePath;
  let cwd;

  const PACKAGE_DATA = { version: 'v1.2.3' };
  const HOST = 'docs.fixture.test';
  const SITE = `./public/${HOST}/docs/engine`;

  // The default config and every output path resolve against the source tree root, so the
  // fixture stands in for it.
  const stageTypedocConfig = (config = {}) => {
    fs.outputFileSync(`${fixturePath}/tsconfig.docs.json`, '{}');
    fs.outputJsonSync(`${fixturePath}/typedoc.json`, { tsconfig: './tsconfig.docs.json', name: 'Base', ...config });
  };

  const stageSite = (directory, { complete = true } = {}) => {
    fs.outputFileSync(`${directory}/index.html`, '<title>Fixture</title><link href="assets/style.css">');
    if (complete)
      for (const asset of ['style.css', 'main.js', 'search.js'])
        fs.outputFileSync(`${directory}/assets/${asset}`, '/**/');
  };

  const runBuildDocs = async (overrides = {}) =>
    buildDocs({
      host: HOST,
      path: '/',
      metadata: { title: 'Fixture API', description: 'fixture docs' },
      packageData: PACKAGE_DATA,
      docs: {},
      references: true,
      typedoc: 'build',
      buildId: 'build-fixture',
      ...overrides,
    });

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-docs-');
    fs.symlinkSync(`${process.cwd()}/node_modules`, `${fixturePath}/node_modules`, 'dir');
    fs.outputJsonSync(`${fixturePath}/package.json`, { name: 'fixture' });
    cwd = process.cwd();
    process.chdir(fixturePath);
    workload.calls.length = 0;
    workload.run = ({ config }) => (stageSite(config.out), { exitCode: 0 });
    workload.availableBytes = 8 * GB;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(cwd);
    fs.removeSync(fixturePath);
  });

  it('runs TypeDoc as a managed task with the client options, without touching the default config', async () => {
    stageTypedocConfig({ entryPoints: ['./src'] });
    const baseConfig = fs.readJsonSync(`${fixturePath}/typedoc.json`);
    fs.outputFileSync(`${fixturePath}/references/reference-a.md`, '# a');

    const result = await runBuildDocs({ docs: { references: ['./references'] } });
    expect(result.status).to.equal('published');

    const [{ params, config }] = workload.calls;
    expect(result.metrics).to.include({
      reason: 'completed',
      durationMs: 2000,
      cpuMs: 3000,
      averageCores: 1.5,
      peakBytes: 700 * MB,
      peakSource: 'kernel',
      peakRssBytes: 650 * MB,
      heapLimitBytes: params.budget.heapBytes,
    });
    expect(result.metrics.limits.cpu).to.include({
      enforcement: 'priority (nice 10)',
      quotaUnavailable: 'no kernel boundary',
    });
    expect(params.command).to.equal(process.execPath);
    expect(params.args[0]).to.match(/node_modules\/typedoc\/bin\/typedoc$/);
    expect(params.budget).to.include({ profile: 'heavy', memoryBytes: Math.floor(16 * GB * 0.3) });
    expect(params.budget.heapBytes).to.equal(Math.floor(params.budget.memoryBytes * 0.8));
    expect(params.boundary).to.equal(null);
    expect(config.name).to.equal('Fixture API');
    expect(config.out).to.match(new RegExp(`/public/${HOST}/docs/engine/\\.staging-1\\.2\\.3-`));
    expect(config.favicon).to.equal(`./public/${HOST}/favicon.ico`);
    expect(config.tsconfig.startsWith('/')).to.equal(true);
    expect(config.projectDocuments).to.deep.equal(['./references/reference-a.md']);
    expect(fs.readJsonSync(`${fixturePath}/typedoc.json`)).to.deep.equal(baseConfig);
    expect(fs.readdirSync('.').filter((entry) => entry.startsWith('.typedoc.'))).to.deep.equal([]);
  });

  it('overrides the default config with the client typedoc block', async () => {
    stageTypedocConfig({ entryPoints: ['./src'], exclude: ['**/node_modules/**'] });

    await runBuildDocs({ metadata: {}, docs: { typedoc: { name: 'Product', entryPoints: ['./src/api'] } } });

    const [{ config }] = workload.calls;
    expect(config.name).to.equal('Product');
    expect(config.entryPoints).to.deep.equal(['./src/api']);
    expect(config.exclude).to.deep.equal(['**/node_modules/**']);
  });

  it('keeps the base name and drops the documents key when nothing resolves', async () => {
    stageTypedocConfig();

    await runBuildDocs({ metadata: {}, docs: { references: [] } });

    expect(workload.calls[0].config.name).to.equal('Base');
    expect(workload.calls[0].config).not.to.have.property('projectDocuments');
  });

  it('skips TypeDoc when the tree carries no default config', async () => {
    expect((await runBuildDocs()).status).to.equal('skipped');
    expect(workload.calls).to.have.length(0);
  });

  it('keeps the published site and starts no TypeDoc when the build skips it', async () => {
    stageTypedocConfig();
    stageSite(`${SITE}/1.2.3`);
    expect(await runBuildDocs({ typedoc: 'skip' })).to.deep.equal({ status: 'skipped' });
    expect(workload.calls).to.have.length(0);
    expect(fs.existsSync(`${SITE}/1.2.3/index.html`)).to.equal(true);
  });

  it('publishes a checked site, drops the older versions and records the peak its workload measured', async () => {
    stageTypedocConfig();
    stageSite(`${SITE}/1.2.2`);
    stageSite(`${SITE}/preview`);

    expect((await runBuildDocs()).status).to.equal('published');

    expect(fs.readdirSync(SITE).sort()).to.deep.equal(['.typedoc-run.json', '1.2.3', 'preview']);
    const { history, published } = fs.readJsonSync(`${SITE}/.typedoc-run.json`);
    expect(history.workload).to.match(/^[0-9a-f]{16}$/);
    expect(history.peak).to.include({ bytes: 700 * MB, source: 'kernel' });
    expect(history.last.class).to.equal('measured');
    expect(published).to.deep.equal({ version: '1.2.3', at: history.last.at });
  });

  it('keeps the published site when TypeDoc fails, and reports why', async () => {
    stageTypedocConfig();
    stageSite(`${SITE}/1.2.3`);
    fs.outputFileSync(`${SITE}/1.2.3/marker`, 'published');
    workload.run = ({ config, params }) => {
      fs.outputFileSync(`${config.out}/index.html`, 'half');
      fs.outputFileSync(params.logPath, 'Error: tsconfig not found\n');
      return { exitCode: 2 };
    };

    expect(await runBuildDocs()).to.include({
      status: 'failed',
      reason: 'TypeDoc exited with 2: Error: tsconfig not found',
    });
    expect(fs.readFileSync(`${SITE}/1.2.3/marker`, 'utf8')).to.equal('published');
    expect(
      fs.readdirSync(SITE).filter((entry) => entry.startsWith('.staging-') || entry.endsWith('.log')),
    ).to.deep.equal([]);
  });

  it('keeps the published site when TypeDoc writes an incomplete site', async () => {
    stageTypedocConfig();
    stageSite(`${SITE}/1.2.3`);
    workload.run = ({ config }) => (stageSite(config.out, { complete: false }), { exitCode: 0 });

    const result = await runBuildDocs();

    expect(result.status).to.equal('failed');
    expect(result.reason).to.match(/^TypeDoc wrote an incomplete site: assets\/style.css is missing/);
    expect(fs.existsSync(`${SITE}/1.2.3/assets/main.js`)).to.equal(true);
  });

  it('asks for more than the limit a run exceeded, and only for that workload', async () => {
    stageTypedocConfig();
    workload.availableBytes = 3 * GB;
    workload.run = ({ params }) => {
      fs.outputFileSync(params.logPath, 'FATAL ERROR: Reached heap limit - JavaScript heap out of memory\n');
      return { exitCode: null, signal: 'SIGABRT' };
    };

    const exhausted = await runBuildDocs();
    expect(exhausted.status).to.equal('failed');
    expect(exhausted.reason).to.match(/^TypeDoc used up its \d+ MB heap$/);
    const { history } = fs.readJsonSync(`${SITE}/.typedoc-run.json`);
    expect(history).not.to.have.property('peak');
    expect(history.exceeded.bytes).to.equal(workload.calls[0].params.budget.memoryBytes);
    expect(history.last.class).to.equal('memory-limit');

    const refused = await runBuildDocs();
    expect(refused.status).to.equal('rejected');
    expect(refused.reason).to.include(
      `its resource history asks for ${Math.round((history.exceeded.bytes * 1.25) / MB)} MB`,
    );
    expect(workload.calls).to.have.length(1);

    // Other options document other sources: that workload has no history yet.
    workload.run = ({ config }) => (stageSite(config.out), { exitCode: 0 });
    expect((await runBuildDocs({ docs: { typedoc: { entryPoints: ['./src/api'] } } })).status).to.equal('published');
  });

  it('learns nothing about the memory from a run that the host pressure or the operator stopped', async () => {
    stageTypedocConfig();
    workload.availableBytes = 3 * GB;
    for (const outcome of [
      { stoppedFor: 'host-pressure', overBudget: 'the host had 500 MB available, its reserve is 819 MB' },
      { cancelled: 'SIGINT', signal: 'SIGINT' },
      { timedOut: true, signal: 'SIGTERM' },
    ]) {
      workload.run = () => ({ exitCode: null, diagnostics: null, ...outcome });
      expect((await runBuildDocs()).status).not.to.equal('published');
      const { history } = fs.readJsonSync(`${SITE}/.typedoc-run.json`);
      expect(history).not.to.have.property('exceeded');
      expect(history).not.to.have.property('peak');
    }
    expect(fs.readJsonSync(`${SITE}/.typedoc-run.json`).history.last.class).to.equal('timeout');
    workload.run = ({ config }) => (stageSite(config.out), { exitCode: 0 });
    expect((await runBuildDocs()).status).to.equal('published');
    expect(workload.calls).to.have.length(4);
  });
});

describe('docs references build', () => {
  let fixturePath;
  let cwd;
  const DESTINATION = './public/docs.fixture.test/docs/';
  const SOURCE = './src/client/public/docs/demo';

  const publish = () =>
    buildDocsReferences({ docs: { references: [SOURCE] }, docsDestination: DESTINATION, proxyPath: '/', client: '' });

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-references-');
    cwd = process.cwd();
    process.chdir(fixturePath);
    fs.outputFileSync(`${SOURCE}/overview/index.md`, '---\ndomain: Demo\n---\n# Demo\n');
    fs.outputFileSync(`${SOURCE}/how-to/use.md`, '# Use\n');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(cwd);
    fs.removeSync(fixturePath);
  });

  it('replaces a domain whole, and keeps the published one when a write fails', async () => {
    expect((await publish()).documents).to.equal(2);
    expect(fs.readFileSync(`${DESTINATION}demo/how-to/use.md`, 'utf8')).to.equal('# Use\n');

    fs.outputFileSync(`${SOURCE}/how-to/use.md`, '# Use, revised\n');
    const write = fs.outputFileSync;
    vi.spyOn(fs, 'outputFileSync').mockImplementation((path, ...rest) => {
      if (path.endsWith('how-to/use.md')) throw Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' });
      return write(path, ...rest);
    });
    await expect(publish()).rejects.toThrow('ENOSPC');
    expect(fs.readFileSync(`${DESTINATION}demo/how-to/use.md`, 'utf8')).to.equal('# Use\n');
    expect(fs.readdirSync(DESTINATION).sort()).to.deep.equal(['demo', 'manifest.json']);

    vi.restoreAllMocks();
    await publish();
    expect(fs.readFileSync(`${DESTINATION}demo/how-to/use.md`, 'utf8')).to.equal('# Use, revised\n');
  });
});
