'use strict';

import { expect } from 'chai';
import { TEST_TIERS, resolveTestSelection, testProjectsFactory, testSuiteNames } from '../../src/server/build/testing.js';

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
});
