'use strict';

import { expect } from 'chai';
import {
  TEST_FOOTPRINTS,
  TEST_PROJECTS,
  UNDERPOST_TESTING,
  coverageIncludeFactory,
  coverageThresholdFactory,
  githubAnnotationsFactory,
  impactSelector,
  staleTestRuns,
  testBatchStatus,
  testExecutionPlanFactory,
  testFailuresFactory,
  testFootprintFactory,
  testLogTail,
  testProjectsFactory,
  testRunFailureReportFactory,
  testRunIdFactory,
  testRunReportFactory,
  testRunStatus,
  vitestArgsFactory,
  vitestEnvFactory,
} from '../../../src/server/build/testing.js';

const names = (projects) => projects.map(({ name }) => name);
const vitestProjects = TEST_PROJECTS.filter(({ delegate }) => !delegate);
const delegatedProjects = TEST_PROJECTS.filter(({ delegate }) => delegate);

describe('test footprints', () => {
  it('runs the safe footprint when none is named', () => {
    expect(testFootprintFactory().name).to.equal('safe');
    expect(testFootprintFactory('').vitest).to.deep.equal({
      pool: 'forks',
      maxWorkers: 1,
      fileParallelism: false,
      maxConcurrency: 1,
    });
  });

  it('rejects a footprint that is not declared', () => {
    for (const name of ['fast', 'toString'])
      expect(() => testFootprintFactory(name), name).to.throw(/unknown footprint/);
  });

  // The machine count of cores is never a local default.
  it('sets a fixed worker limit in every footprint that runs one project per process', () => {
    for (const [name, { batch, vitest }] of Object.entries(TEST_FOOTPRINTS)) {
      if (batch !== 'project') continue;
      expect(vitest.pool, name).to.equal('forks');
      expect(vitest.maxWorkers, name).to.be.within(1, 2);
      expect(vitest.maxConcurrency, name).to.be.within(1, 2);
    }
  });

  it('runs one file and one test at a time in every project of the safe footprint', () => {
    for (const { test } of testProjectsFactory({}, [], testFootprintFactory('safe'))) {
      expect(test.fileParallelism, test.name).to.equal(false);
      expect(test.maxWorkers, test.name).to.equal(1);
      expect(test.maxConcurrency, test.name).to.equal(1);
      expect(test.pool, test.name).to.equal('forks');
    }
  });

  it('never starts file parallelism that a project sets off', () => {
    const declared = Object.fromEntries(vitestProjects.map(({ name, parallel = false }) => [name, parallel]));
    for (const { test } of testProjectsFactory({}, [], testFootprintFactory('balanced')))
      expect(test.fileParallelism, test.name).to.equal(declared[test.name]);
  });

  it('keeps the declared project settings in the ci footprint', () => {
    expect(testProjectsFactory({}, [], testFootprintFactory('ci'))).to.deep.equal(testProjectsFactory());
  });
});

describe('execution plan', () => {
  const inactive = [
    { deployId: 'dd-product', stripPaths: ['./test/cyberia', './hardhat'], missing: ['jimp'], active: false },
  ];

  it('runs every project in its own batch, in group order', () => {
    const { batches, projects, footprint } = testExecutionPlanFactory();
    expect(footprint).to.equal('safe');
    // No `--project` flags at the merge: the whole table is selected.
    expect(projects).to.be.empty;
    expect(batches.map(({ projects: members }) => members)).to.deep.equal(TEST_PROJECTS.map(({ name }) => [name]));
    expect(batches.map(({ index }) => index)).to.deep.equal(TEST_PROJECTS.map((_, index) => index + 1));
  });

  it('completes a lower group before a higher group starts', () => {
    const orders = testExecutionPlanFactory().batches.map(({ groupOrder }) => groupOrder);
    expect(orders).to.deep.equal([...orders].sort((a, b) => a - b));
  });

  it('gives each Vitest batch its own report and a delegated batch none', () => {
    const { batches } = testExecutionPlanFactory();
    const reports = batches.filter(({ delegated }) => !delegated).map(({ report }) => report);
    expect(new Set(reports).size).to.equal(vitestProjects.length);
    for (const report of reports)
      expect(report).to.match(new RegExp(`^${UNDERPOST_TESTING.runs.reportDirectory}/batch-\\d{3}\\.blob$`));
    for (const batch of batches.filter(({ delegated }) => delegated)) expect(batch).to.not.have.property('report');
    expect(batches.filter(({ delegated }) => delegated).map(({ projects }) => projects[0])).to.deep.equal(
      names(delegatedProjects),
    );
  });

  it('plans one domain', () => {
    const { batches, projects } = testExecutionPlanFactory({ selector: 'cyberia' });
    const cyberia = names(TEST_PROJECTS.filter(({ name }) => name.startsWith('cyberia:')));
    expect(projects).to.deep.equal(cyberia);
    expect(batches.map(({ projects: members }) => members)).to.deep.equal(cyberia.map((name) => [name]));
  });

  it('plans one project and measures only its sources', () => {
    const { batches, projects, coverageInclude } = testExecutionPlanFactory({
      selector: 'underpost:integration:ingress',
    });
    expect(batches).to.deep.equal([
      {
        index: 1,
        groupOrder: 7,
        projects: ['underpost:integration:ingress'],
        report: `${UNDERPOST_TESTING.runs.reportDirectory}/batch-001.blob`,
        results: `${UNDERPOST_TESTING.runs.resultsDirectory}/batch-001.json`,
        log: `${UNDERPOST_TESTING.runs.logDirectory}/batch-001.log`,
      },
    ]);
    expect(coverageInclude).to.deep.equal(coverageIncludeFactory(['--project', ...projects]));
  });

  it('plans the selection a change makes', () => {
    const selector = impactSelector(['src/projects/cyberia/stat-balance.js']);
    expect(testExecutionPlanFactory({ selector })).to.deep.equal(testExecutionPlanFactory({ selector: 'cyberia' }));
  });

  // Every batch measures the whole selection, so a source that another project loads counts as in one process.
  it('gives every batch the coverage scope of the whole selection', () => {
    const { coverageInclude } = testExecutionPlanFactory({ selector: 'underpost:integration' });
    const areas = TEST_PROJECTS.filter(({ name }) => name.startsWith('underpost:integration'));
    expect(coverageInclude).to.have.members([...new Set(areas.flatMap(({ sources }) => sources))]);
  });

  it('runs a delegated project last, and gives it no coverage scope of its own', () => {
    const { batches } = testExecutionPlanFactory({ selector: 'item-ledger' });
    expect(batches.at(-1)).to.include({ delegated: true });
    expect(batches.at(-1).projects).to.deep.equal(['item-ledger:contract']);
    const alone = testExecutionPlanFactory({ selector: 'item-ledger:contract' });
    expect(alone.batches).to.have.length(1);
    expect(alone.coverageInclude).to.be.empty;
  });

  it('leaves a product project to its context, and records why', () => {
    const { batches, excluded } = testExecutionPlanFactory({ contexts: inactive });
    const owned = names(TEST_PROJECTS.filter(({ directory }) => /^(test\/cyberia|hardhat)/.test(directory)));
    expect(excluded.map(({ name }) => name)).to.deep.equal(owned);
    for (const entry of excluded) expect(entry).to.deep.include({ deployId: 'dd-product', missing: ['jimp'] });
    for (const { projects } of batches) expect(owned).to.not.include(projects[0]);
  });

  it('plans no batch when every selected project belongs to an inactive product', () => {
    const { batches, excluded } = testExecutionPlanFactory({ selector: 'cyberia', contexts: inactive });
    expect(batches).to.be.empty;
    expect(excluded).to.not.be.empty;
  });

  it('runs the whole selection in one process in the ci footprint', () => {
    const { batches } = testExecutionPlanFactory({ footprint: 'ci' });
    expect(batches[0].projects).to.deep.equal(names(vitestProjects));
    expect(batches[0].groupOrder).to.equal(1);
    expect(batches.slice(1).map(({ projects }) => projects[0])).to.deep.equal(names(delegatedProjects));
  });

  it('rejects an unknown selector or footprint', () => {
    expect(() => testExecutionPlanFactory({ selector: 'not-a-domain' })).to.throw(/unknown selector/);
    expect(() => testExecutionPlanFactory({ footprint: 'fast' })).to.throw(/unknown footprint/);
  });
});

describe('batch arguments', () => {
  const batch = { coverageDirectory: '/run/coverage', coverageInclude: ['src/a.js', 'src/b/*.js'] };

  it('measures the selection in a batch and leaves the reports to the merge', () => {
    expect(vitestArgsFactory({ projects: ['underpost:unit'], batch })).to.deep.equal([
      'run',
      '--project',
      'underpost:unit',
      '--coverage',
      '--passWithNoTests',
      '--coverage.reporter=none',
      '--coverage.reportsDirectory=/run/coverage',
      '--coverage.include=src/a.js',
      '--coverage.include=src/b/*.js',
    ]);
  });

  it('gives a batch without coverage no coverage options', () => {
    expect(vitestArgsFactory({ projects: ['underpost:unit'], coverage: false, batch })).to.deep.equal([
      'run',
      '--project',
      'underpost:unit',
      '--coverage.enabled=false',
      '--passWithNoTests',
    ]);
  });

  it('merges the run with the selection flags, and never filters the merged results', () => {
    expect(vitestArgsFactory({ projects: ['cyberia:unit'], grep: 'shape', mergeReports: '/run/blobs' })).to.deep.equal([
      'run',
      '--merge-reports=/run/blobs',
      '--project',
      'cyberia:unit',
      '--coverage',
    ]);
  });

  it('keeps a single run as it was', () => {
    expect(vitestArgsFactory({ projects: ['cyberia:unit'], grep: 'shape', watch: true })).to.deep.equal([
      'watch',
      '--project',
      'cyberia:unit',
      '--testNamePattern',
      'shape',
      '--coverage',
    ]);
  });

  it('logs the heap only on request', () => {
    expect(vitestArgsFactory()).to.not.include('--logHeapUsage');
    expect(vitestArgsFactory({ logHeapUsage: true })).to.include('--logHeapUsage');
  });
});

describe('batch environment', () => {
  const { footprintEnvKey, batchReportEnvKey, allureResultsEnvKey } = UNDERPOST_TESTING;
  const inherited = {
    PATH: '/usr/bin',
    NODE_ENV: 'production',
    COVERAGE_ENFORCE: '1',
    COVERAGE_MIN: '85',
    [footprintEnvKey]: 'ci',
    [batchReportEnvKey]: '/stale/batch-009.blob',
    [allureResultsEnvKey]: '/stale/allure',
  };

  it('never gates a batch on its partial coverage', () => {
    const env = vitestEnvFactory({
      env: inherited,
      footprint: 'safe',
      report: '/run/blobs/batch-001.blob',
      allureResultsDirectory: '/results',
    });
    expect(env).to.not.have.any.keys('COVERAGE_ENFORCE', 'COVERAGE_MIN');
    expect(coverageThresholdFactory(env)).to.equal(null);
    expect(env).to.include({
      PATH: '/usr/bin',
      NODE_ENV: 'test',
      [footprintEnvKey]: 'safe',
      [batchReportEnvKey]: '/run/blobs/batch-001.blob',
      [allureResultsEnvKey]: '/results',
    });
  });

  it('gates the merge once, and writes no batch report or Allure result there', () => {
    const env = vitestEnvFactory({ env: inherited, footprint: 'safe' });
    expect(coverageThresholdFactory(env)).to.equal(85);
    expect(env).to.not.have.any.keys(batchReportEnvKey, allureResultsEnvKey);
    expect(env[footprintEnvKey]).to.equal('safe');
  });

  it('adds the coverage timings to the debug namespaces on request', () => {
    expect(vitestEnvFactory({ env: { DEBUG: 'app' } }).DEBUG).to.equal('app');
    expect(vitestEnvFactory({ env: { DEBUG: 'app' }, diagnose: true }).DEBUG).to.equal('app,vitest:coverage');
    expect(vitestEnvFactory({ diagnose: true }).DEBUG).to.equal('vitest:coverage');
  });
});

describe('batch status', () => {
  it('names each way a batch can end', () => {
    const cases = [
      [{ exitCode: 0 }, 'passed'],
      [{ exitCode: 1, reported: true }, 'failed'],
      [{ exitCode: 1, reported: false }, 'error'],
      // The process did not start.
      [{ exitCode: null, signal: null }, 'error'],
      [{ exitCode: null, signal: null, reported: true }, 'error'],
      [{ exitCode: null, signal: 'SIGKILL' }, 'killed'],
      [{ exitCode: null, signal: 'SIGTERM' }, 'signaled'],
      [{ exitCode: null, signal: 'SIGKILL', timedOut: true }, 'timeout'],
      [{ exitCode: 130, interrupted: true, reported: true }, 'interrupted'],
    ];
    for (const [outcome, status] of cases) expect(testBatchStatus(outcome), JSON.stringify(outcome)).to.equal(status);
  });
});

describe('run status', () => {
  const batch = (status) => ({ status });

  it('passes when every batch and the merge passed', () => {
    expect(testRunStatus({ batches: [batch('passed'), batch('passed')], merge: batch('passed') })).to.equal('passed');
  });

  // A killed batch writes no blob, so the merge of the others can pass.
  it('fails on one failed batch, even when the merge passed', () => {
    expect(testRunStatus({ batches: [batch('passed'), batch('killed')], merge: batch('passed') })).to.equal('failed');
  });

  it('fails on multiple failed batches', () => {
    expect(
      testRunStatus({ batches: [batch('failed'), batch('passed'), batch('error')], merge: batch('failed') }),
    ).to.equal('failed');
  });

  // A threshold the merged coverage does not reach fails the merge.
  it('fails on a failed merge alone', () => {
    expect(testRunStatus({ batches: [batch('passed')], merge: batch('failed') })).to.equal('failed');
    expect(testRunStatus({ batches: [batch('passed')], merge: batch('error') })).to.equal('failed');
  });

  it('accepts a skipped delegated project and a run with no merge', () => {
    expect(testRunStatus({ batches: [batch('skipped')] })).to.equal('passed');
    expect(testRunStatus({ batches: [] })).to.equal('passed');
  });

  it('reports a run the operator stopped', () => {
    expect(testRunStatus({ batches: [batch('passed'), batch('interrupted'), batch('pending')] })).to.equal(
      'interrupted',
    );
  });
});

describe('run report', () => {
  const manifest = {
    batches: [
      { index: 1, projects: ['underpost:audit'], status: 'passed', exitCode: 0, signal: null, durationMs: 1500 },
      { index: 2, projects: ['cyberia:unit'], status: 'killed', exitCode: null, signal: 'SIGKILL', durationMs: 12345 },
      { index: 3, projects: ['item-ledger:contract'], delegated: true, status: 'pending' },
    ],
    merge: { status: 'failed', exitCode: 1, signal: null, durationMs: 800 },
  };

  it('names the batch, project, status, exit code, signal and duration', () => {
    const lines = testRunReportFactory(manifest).split('\n');
    expect(lines[0].split(/\s+/)).to.deep.equal(['batch', 'projects', 'status', 'exit', 'signal', 'duration']);
    expect(lines[2].split(/\s+/)).to.deep.equal(['2', 'cyberia:unit', 'killed', '-', 'SIGKILL', '12.3s']);
    expect(lines[3].split(/\s+/)).to.deep.equal(['3', 'item-ledger:contract', 'pending', '-', '-', '-']);
    expect(lines[4].split(/\s+/)).to.deep.equal(['merge', 'failed', '1', '-', '0.8s']);
  });

  it('adds memory and CPU columns when the run recorded them', () => {
    const diagnosed = structuredClone(manifest);
    diagnosed.batches[0].diagnostics = { peakRssBytes: 512 * 1024 * 1024, cpuMs: 2500 };
    const lines = testRunReportFactory(diagnosed).split('\n');
    expect(lines[0]).to.match(/peak rss\s+cpu$/);
    expect(lines[1]).to.match(/512MB\s+2\.5s$/);
  });
});

describe('failure report', () => {
  const root = '/__w/engine';
  const results = {
    testResults: [
      {
        name: `${root}/test/a.test.js`,
        status: 'failed',
        message: '',
        assertionResults: [
          { fullName: 'a reads one', status: 'passed', failureMessages: [] },
          {
            fullName: 'a reads two',
            status: 'failed',
            failureMessages: [
              `\u001b[31mAssertionError: expected 1 to be 2\u001b[39m\n at ${root}/src/a.js:3:1\n at file://${root}/node_modules/vitest/run.js:1:1`,
            ],
          },
        ],
      },
      {
        name: `${root}/test/b.test.js`,
        status: 'failed',
        message: `Error: Cannot find module '${root}/x.js'`,
        assertionResults: [],
      },
      { name: `${root}/test/c.test.js`, status: 'passed', message: '', assertionResults: [] },
    ],
  };

  it('lists each failed test and each suite that did not load, with paths relative to the tree', () => {
    expect(testFailuresFactory(results, root)).to.deep.equal([
      { file: 'test/a.test.js', test: 'a reads two', message: 'AssertionError: expected 1 to be 2\n at src/a.js:3:1' },
      {
        file: 'test/b.test.js',
        test: '(the suite failed before a test ran)',
        message: "Error: Cannot find module 'x.js'",
      },
    ]);
    expect(testFailuresFactory({}, root)).to.deep.equal([]);
  });

  const manifest = {
    batches: [
      { index: 1, projects: ['underpost:audit'], status: 'passed', log: 'logs/batch-001.log' },
      { index: 2, projects: ['underpost:unit'], status: 'failed', log: 'logs/batch-002.log' },
      { index: 3, projects: ['cyberia:unit'], status: 'killed', log: 'logs/batch-003.log' },
    ],
    merge: { status: 'failed', log: 'logs/merge.log' },
  };

  it('names the failed tests, the batch that wrote no results and the gate that failed', () => {
    const report = testRunFailureReportFactory(manifest, {
      2: { failures: testFailuresFactory(results, root), tail: 'noise' },
      3: { failures: [], tail: 'Killed\nlast line' },
      merge: {
        tail: 'noise',
        thresholdLines: ['ERROR: Coverage for lines (79%) does not meet global threshold (80%)'],
      },
    });
    expect(report).to.include('Failed tests: 2 in 2 file(s)');
    expect(report).to.include('1) [underpost:unit] test/a.test.js\n   a reads two\n   | AssertionError');
    expect(report).to.include('2) [underpost:unit] test/b.test.js');
    expect(report).to.include('Batch 3 (cyberia:unit) killed: end of logs/batch-003.log\n   | Killed\n   | last line');
    expect(report).to.include('Merge failed: it replays the failed tests above, logs/merge.log');
    expect(report).to.include('| ERROR: Coverage for lines (79%) does not meet global threshold (80%)');
    expect(report).to.not.include('noise');
    expect(report).to.not.include('Batch 1');
  });

  it('shows the end of the merge log when no test failed', () => {
    const report = testRunFailureReportFactory(
      { batches: [], merge: { status: 'error', log: 'logs/merge.log' } },
      { merge: { tail: 'boom' } },
    );
    expect(report).to.equal('Merge error: end of its log, logs/merge.log\n   | boom');
    expect(testRunFailureReportFactory({ batches: [{ index: 1, projects: ['x'], status: 'passed' }] })).to.equal('');
  });

  it('clips a long message and keeps the end of a log', () => {
    const message = Array.from({ length: 40 }, (_, line) => `line ${line}`).join('\n');
    const report = testRunFailureReportFactory(
      { batches: [{ index: 1, projects: ['x'], status: 'failed' }] },
      { 1: { failures: [{ file: 'f.js', test: 't', message }] } },
    );
    expect(report).to.include('| line 13').and.not.include('| line 14');
    expect(report).to.include('| ... 26 more lines');
    expect(testLogTail(`${message}\n`, 2)).to.equal('line 38\nline 39');
    expect(testLogTail('\u001b[31mred\u001b[39m')).to.equal('red');
  });

  it('renders GitHub annotations with the escapes the workflow command needs', () => {
    expect(githubAnnotationsFactory([{ file: 'a,b.js', test: 'x: y', message: '100%\nnext' }])).to.deep.equal([
      '::error file=a%2Cb.js,title=x%3A y::100%25%0Anext',
    ]);
    const many = Array.from({ length: 12 }, () => ({ file: 'f', test: 't', message: 'm' }));
    expect(githubAnnotationsFactory(many)).to.have.length(10);
  });
});

describe('run directory', () => {
  it('names a run by its start time, so the names sort in run order', () => {
    expect(testRunIdFactory(new Date('2026-09-30T18:08:55.123Z'), 42)).to.equal('20260930T180855.123Z-42');
  });

  it('deletes the oldest runs and never touches another entry', () => {
    const entries = [
      '20260103T000000.000Z-7',
      'notes',
      '20260101T000000.000Z-1',
      '20260102T000000.000Z-3',
      'manifest.json',
    ];
    expect(staleTestRuns(entries, 3)).to.deep.equal(['20260101T000000.000Z-1']);
    expect(staleTestRuns(entries, 1)).to.deep.equal([
      '20260101T000000.000Z-1',
      '20260102T000000.000Z-3',
      '20260103T000000.000Z-7',
    ]);
    expect(staleTestRuns(entries, 5)).to.be.empty;
  });
});
