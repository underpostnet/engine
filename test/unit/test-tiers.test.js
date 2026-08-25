'use strict';

import { expect } from 'chai';
import fs from 'node:fs';
import {
  TEST_TIERS,
  UNDERPOST_TESTING,
  coverageIncludeFactory,
  coverageThresholdFactory,
  resolveTestSelection,
  testProjectsFactory,
  testSuiteNames,
} from '../../src/server/build/testing.js';

// The table declares every tier the platform ships. A product build slices the
// tree, so whether a tier's directory is present here is a catalog question,
// asserted in catalog.test.js — these are about the table itself.
describe('test tiers', () => {
  it('names every tier uniquely', () => {
    const names = TEST_TIERS.map(({ name }) => name);
    expect(new Set(names).size).to.equal(names.length);
  });

  it('never leaves a tier on group order 0', () => {
    // Vitest routes a single-worker project on the default 0 into a bucket it
    // appends after every ordered group, which would run that tier last.
    for (const { name, groupOrder } of TEST_TIERS) expect(groupOrder, name).to.be.greaterThan(0);
  });

  it('declares tiers in the order they run', () => {
    const orders = TEST_TIERS.map(({ groupOrder }) => groupOrder);
    expect(orders).to.deep.equal([...orders].sort((a, b) => a - b));
  });

  it('keeps delegated tiers in the last group', () => {
    // They run after the Vitest pass, so an earlier group order would describe
    // an execution order that does not happen.
    const lastGroup = Math.max(...TEST_TIERS.map(({ groupOrder }) => groupOrder));
    for (const { name, groupOrder, delegate } of TEST_TIERS) if (delegate) expect(groupOrder, name).to.equal(lastGroup);
  });

  it('exposes only non-delegated tiers as Vitest projects', () => {
    const projects = testProjectsFactory().map(({ test }) => test.name);
    expect(projects).to.deep.equal(TEST_TIERS.filter(({ delegate }) => !delegate).map(({ name }) => name));
  });
});

describe('test tier selection', () => {
  it('runs every tier when nothing is selected', () => {
    for (const selector of ['', 'all']) {
      const { projects, runVitest, delegated } = resolveTestSelection(selector);
      // No explicit project list: Vitest runs them all, and a product build
      // that strips one must not fail on a name it no longer ships.
      expect(projects, selector).to.be.empty;
      expect(runVitest, selector).to.equal(true);
      expect(
        delegated.map(({ name }) => name),
        selector,
      ).to.deep.equal(TEST_TIERS.filter(({ delegate }) => delegate).map(({ name }) => name));
    }
  });

  it('expands a suite into its tiers', () => {
    expect(resolveTestSelection('infra').projects).to.deep.equal(
      TEST_TIERS.filter(({ name }) => name.startsWith('infra:')).map(({ name }) => name),
    );
  });

  it('skips the Vitest pass when only delegated tiers are selected', () => {
    const { runVitest, delegated } = resolveTestSelection('contracts');
    expect(runVitest).to.equal(false);
    expect(delegated.map(({ name }) => name)).to.deep.equal(['contracts']);
  });

  it('rejects an unknown selector instead of reporting an empty green run', () => {
    expect(() => resolveTestSelection('not-a-suite')).to.throw(/unknown suite/);
  });

  it('offers every suite prefix as a selector', () => {
    for (const suite of testSuiteNames()) expect(() => resolveTestSelection(suite), suite).to.not.throw();
  });
});

describe('delegated tier commands', () => {
  const delegated = TEST_TIERS.filter(({ delegate }) => delegate);

  it('ships at least one delegated tier to assert against', () => {
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
    // A tier selection measures a slice of the tree, so the whole-suite number is
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
  const vitestTiers = TEST_TIERS.filter(({ delegate }) => !delegate);

  it('makes every Vitest tier accountable for the sources it drives', () => {
    for (const { name, sources } of vitestTiers) expect(sources, name).to.not.be.empty;
  });

  it('leaves a delegated tier out of the Vitest report', () => {
    // Its runner measures its own coverage, and this table only feeds Vitest.
    for (const { name, sources, delegate } of TEST_TIERS) if (delegate) expect(sources, name).to.equal(undefined);
  });

  it('points every glob at something this tree ships', () => {
    // A source that moved leaves the tier silently measuring nothing, which
    // reads as coverage rather than as the missing measurement it is. A product
    // build slices the tree, so only tiers it kept are asserted.
    for (const { name, directory, sources } of vitestTiers) {
      if (!fs.existsSync(directory)) continue;
      for (const glob of sources) expect(fs.globSync(glob), `${name}: ${glob}`).to.not.be.empty;
    }
  });

  it('measures every tier when the run selects none', () => {
    const everySource = new Set(vitestTiers.flatMap(({ sources }) => sources));
    expect(coverageIncludeFactory([])).to.have.members([...everySource]);
  });

  it('measures only the selected tiers', () => {
    const unit = TEST_TIERS.find(({ name }) => name === 'unit').sources;
    for (const argv of [['--project', 'unit'], ['--project=unit']])
      expect(coverageIncludeFactory(['npx', 'vitest', 'run', ...argv, '--coverage']), argv.join(' ')).to.deep.equal(
        unit,
      );
  });

  it('counts a source two tiers drive once', () => {
    const include = coverageIncludeFactory(['--project', 'infra:3-cluster', '--project', 'infra:4-ingress']);
    expect(new Set(include).size).to.equal(include.length);
    expect(include).to.include('src/server/runtime/conf.js');
  });

  it('rejects a selection that matches no tier', () => {
    expect(() => coverageIncludeFactory(['--project', 'not-a-tier'])).to.throw(/unknown suite/);
  });
});
