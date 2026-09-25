'use strict';

import { expect } from 'chai';
import fs from 'node:fs';
import {
  TEST_DOMAINS,
  TEST_PROJECTS,
  UNDERPOST_TESTING,
  coverageIncludeFactory,
  coverageReportKey,
  coverageThresholdFactory,
  resolveTestSelection,
  testDomainNames,
  testProjectsFactory,
  vitestProjectSelector,
} from '../../../src/server/build/testing.js';

// The table declares every project the platform ships. A product build slices the
// tree, so whether a project's directory is present here is a catalog question,
// asserted in catalog.test.js — these are about the table itself.
describe('test projects', () => {
  it('names every project uniquely', () => {
    const names = TEST_PROJECTS.map(({ name }) => name);
    expect(new Set(names).size).to.equal(names.length);
  });

  it('names every project after a declared domain and level', () => {
    // The name is the selector and the directory is the taxonomy: a project that
    // named a domain the tree does not document would be selectable but unowned.
    for (const { name, directory, delegate } of TEST_PROJECTS) {
      const [domain] = name.split(':');
      expect(Object.keys(TEST_DOMAINS), name).to.include(domain);
      if (!delegate) expect(directory, name).to.equal(`test/${name.split(':').join('/')}`);
    }
  });

  it('never leaves a project on group order 0', () => {
    // Vitest routes a single-worker project on the default 0 into a bucket it
    // appends after every ordered group, which would run that project last.
    for (const { name, groupOrder } of TEST_PROJECTS) expect(groupOrder, name).to.be.greaterThan(0);
  });

  it('declares projects in the order they run', () => {
    const orders = TEST_PROJECTS.map(({ groupOrder }) => groupOrder);
    expect(orders).to.deep.equal([...orders].sort((a, b) => a - b));
  });

  it('keeps delegated projects in the last group', () => {
    // They run after the Vitest pass, so an earlier group order would describe
    // an execution order that does not happen.
    const lastGroup = Math.max(...TEST_PROJECTS.map(({ groupOrder }) => groupOrder));
    for (const { name, groupOrder, delegate } of TEST_PROJECTS)
      if (delegate) expect(groupOrder, name).to.equal(lastGroup);
  });

  it('exposes only non-delegated projects to Vitest', () => {
    const projects = testProjectsFactory().map(({ test }) => test.name);
    expect(projects).to.deep.equal(TEST_PROJECTS.filter(({ delegate }) => !delegate).map(({ name }) => name));
  });

  it('runs files together only where the suites share no resource', () => {
    // A suite that binds a port, drives a database or spawns a process cannot
    // share a worker with another doing the same.
    const parallel = testProjectsFactory()
      .filter(({ test }) => test.fileParallelism)
      .map(({ test }) => test.name);
    expect(parallel).to.deep.equal(TEST_PROJECTS.filter(({ parallel: flag }) => flag).map(({ name }) => name));
    for (const name of parallel) expect(name, name).to.match(/:(unit|contract)$/);
  });

  it('collects every test file exactly once', () => {
    // Two projects over one file would report it twice and measure it twice; a
    // file under no project is a test nothing runs.
    const collected = new Map();
    for (const { test } of testProjectsFactory())
      for (const pattern of test.include)
        for (const file of fs.globSync(pattern)) collected.set(file, [...(collected.get(file) ?? []), test.name]);
    const twice = [...collected].filter(([, names]) => names.length > 1);
    expect(twice.map(([file, names]) => `${file}: ${names.join(', ')}`)).to.deep.equal([]);
    const orphans = fs.globSync('test/**/*.test.js').filter((file) => !collected.has(file));
    expect(orphans).to.deep.equal([]);
  });
});

describe('test selection', () => {
  it('runs every project when nothing is selected', () => {
    for (const selector of ['', 'all']) {
      const { projects, runVitest, delegated } = resolveTestSelection(selector);
      // No explicit project list: Vitest runs them all, and a product build
      // that strips one must not fail on a name it no longer ships.
      expect(projects, selector).to.be.empty;
      expect(runVitest, selector).to.equal(true);
      expect(
        delegated.map(({ name }) => name),
        selector,
      ).to.deep.equal(TEST_PROJECTS.filter(({ delegate }) => delegate).map(({ name }) => name));
    }
  });

  it('expands a domain into its projects', () => {
    expect(resolveTestSelection('cyberia').projects).to.deep.equal(
      TEST_PROJECTS.filter(({ name }) => name.startsWith('cyberia:')).map(({ name }) => name),
    );
  });

  it('expands a level into the areas it runs in order', () => {
    expect(resolveTestSelection('underpost:integration').projects).to.deep.equal(
      TEST_PROJECTS.filter(({ name }) => name.startsWith('underpost:integration')).map(({ name }) => name),
    );
  });

  it('takes one project by its own name', () => {
    expect(resolveTestSelection('underpost:integration:ingress').projects).to.deep.equal([
      'underpost:integration:ingress',
    ]);
  });

  it('skips the Vitest pass when only delegated projects are selected', () => {
    const { runVitest, delegated } = resolveTestSelection('item-ledger:contract');
    expect(runVitest).to.equal(false);
    expect(delegated.map(({ name }) => name)).to.deep.equal(['item-ledger:contract']);
  });

  it('rejects an unknown selector instead of reporting an empty green run', () => {
    expect(() => resolveTestSelection('not-a-domain')).to.throw(/unknown selector/);
    expect(() => resolveTestSelection('cyberia:audit')).to.throw(/unknown selector/);
  });

  it('offers every domain as a selector', () => {
    for (const domain of testDomainNames()) expect(() => resolveTestSelection(domain), domain).to.not.throw();
  });
});

describe('delegated project commands', () => {
  const delegated = TEST_PROJECTS.filter(({ delegate }) => delegate);

  it('ships at least one delegated project to assert against', () => {
    expect(delegated).to.not.be.empty;
  });

  it('writes results only when a destination is given', () => {
    for (const { name, delegate } of delegated) {
      expect(delegate({}), name).to.not.include('--test-reporter-destination=/');
      expect(delegate({ resultsPath: '/results/TEST-x.xml' }), name).to.include('/results/TEST-x.xml');
    }
  });

  it('passes a name filter through to its runner', () => {
    for (const { name, delegate } of delegated) expect(delegate({ grep: 'Burning' }), name).to.include('Burning');
  });

  // Under an outer `npm`, npx resolves the root project as the local prefix and
  // pulls its own copy of a nested tool from the registry, which Hardhat then
  // refuses to run as a non-local installation.
  it('runs nested tooling from the nested install rather than through npx', () => {
    for (const { name, delegate } of delegated) {
      expect(delegate({}), name).to.not.match(/\bnpx\b/);
      expect(delegate({}), name).to.include('./node_modules/.bin/');
    }
  });

  // A directory left behind by an interrupted install passes a `-d` probe while
  // holding none of the binaries the tier runs.
  it('probes the installed binary before skipping the install', () => {
    for (const { name, delegate } of delegated)
      expect(delegate({}), name).to.match(/\[ -x node_modules\/\.bin\/[\w.-]+ \] \|\| npm ci/);
  });
});

describe('coverage threshold', () => {
  it('reports without gating until a run opts in', () => {
    // A selection measures a slice of the tree, so the whole-suite number is
    // not the bar it should be held to.
    expect(coverageThresholdFactory({})).to.equal(null);
    expect(coverageThresholdFactory({ COVERAGE_ENFORCE: '0' })).to.equal(null);
  });

  it('gates an opted-in run on the shipped threshold', () => {
    for (const COVERAGE_ENFORCE of ['1', 'true'])
      expect(coverageThresholdFactory({ COVERAGE_ENFORCE }), COVERAGE_ENFORCE).to.equal(
        UNDERPOST_TESTING.coverageThreshold,
      );
  });

  it('lets a repository ratchet its own bar', () => {
    expect(coverageThresholdFactory({ COVERAGE_MIN: '25' })).to.equal(25);
    // An unset repository variable arrives as an empty string, not as absent.
    expect(coverageThresholdFactory({ COVERAGE_ENFORCE: '1', COVERAGE_MIN: '' })).to.equal(
      UNDERPOST_TESTING.coverageThreshold,
    );
  });

  it('refuses a bar that is not a percentage', () => {
    for (const COVERAGE_MIN of ['eighty', '-1', '101'])
      expect(() => coverageThresholdFactory({ COVERAGE_MIN }), COVERAGE_MIN).to.throw('COVERAGE_MIN');
  });
});

describe('coverage scope', () => {
  const vitestProjects = TEST_PROJECTS.filter(({ delegate }) => !delegate);

  it('makes every Vitest project accountable for the sources it drives', () => {
    for (const { name, sources } of vitestProjects) expect(sources, name).to.not.be.empty;
  });

  it('leaves a delegated project out of the Vitest report', () => {
    // Its runner measures its own coverage, and this table only feeds Vitest.
    for (const { name, sources, delegate } of TEST_PROJECTS) if (delegate) expect(sources, name).to.equal(undefined);
  });

  it('points every glob at something this tree ships', () => {
    // A source that moved leaves the project silently measuring nothing, which
    // reads as coverage rather than as the missing measurement it is. A product
    // build slices the tree, so only projects it kept are asserted.
    for (const { name, directory, sources } of vitestProjects) {
      if (!fs.existsSync(directory)) continue;
      for (const glob of sources) expect(fs.globSync(glob), `${name}: ${glob}`).to.not.be.empty;
    }
  });

  it('measures every project when the run selects none', () => {
    const everySource = new Set(vitestProjects.flatMap(({ sources }) => sources));
    expect(coverageIncludeFactory([])).to.have.members([...everySource]);
  });

  it('measures only the selected projects', () => {
    const unit = TEST_PROJECTS.find(({ name }) => name === 'underpost:unit').sources;
    for (const argv of [['--project', 'underpost:unit'], ['--project=underpost:unit']])
      expect(coverageIncludeFactory(['npx', 'vitest', 'run', ...argv, '--coverage']), argv.join(' ')).to.deep.equal(
        unit,
      );
  });

  it('counts a source two projects drive once', () => {
    const include = coverageIncludeFactory([
      '--project',
      'underpost:integration:cluster',
      '--project',
      'underpost:integration:ingress',
    ]);
    expect(new Set(include).size).to.equal(include.length);
    expect(include).to.include('src/server/runtime/conf.js');
  });

  it('rejects a selection that matches no project', () => {
    expect(() => coverageIncludeFactory(['--project', 'not-a-project'])).to.throw(/unknown selector/);
  });
});

describe('coverage report directory', () => {
  it('names the report after the domains the selection spans', () => {
    expect(coverageReportKey('underpost,ecosystem')).to.equal('underpost-ecosystem');
    expect(coverageReportKey('cyberia')).to.equal('cyberia');
    expect(coverageReportKey('underpost:integration:security,underpost:integration:network')).to.equal('underpost');
  });

  it('names a full run `all` and a delegated one nothing', () => {
    // Domain ids carry hyphens of their own, so a list of every one of them
    // would read as a name no selector produces.
    expect(coverageReportKey('')).to.equal('all');
    expect(coverageReportKey('all')).to.equal('all');
    expect(coverageReportKey('item-ledger:contract')).to.equal('');
  });

  // A deploy names its report by selector and the runner is handed the same projects
  // as `--project` flags; both must land on one directory.
  it('agrees between a selector and the projects the runner was handed', () => {
    const { projects } = resolveTestSelection('underpost,ecosystem');
    const argv = ['npx', 'vitest', 'run', ...projects.flatMap((project) => ['--project', project]), '--coverage'];
    expect(coverageReportKey(vitestProjectSelector(argv))).to.equal(coverageReportKey('underpost,ecosystem'));
    expect(vitestProjectSelector(['--project=cyberia:unit'])).to.equal('cyberia:unit');
  });
});
