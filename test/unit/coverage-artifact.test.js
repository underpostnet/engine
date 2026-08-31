'use strict';

/**
 * @module coverage-artifact.test
 * @description Covers the coverage report as a build artifact: where a run leaves it, where an
 * assembled deploy artifact carries it, and the guard that keeps a workload container from
 * writing the runtime status contract while a test runner is what is executing.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  COVERAGE_BUNDLE_DIRECTORY,
  bundleCoverageReport,
  coverageReportCandidates,
  coverageUnavailablePage,
  resolveCoverageReportPath,
} from '../../src/server/build/coverage.js';
import { EXECUTION_PROFILE_ENV_KEY } from '../../src/server/build/execution.js';
import { isTestRuntime, runtimeStatusWritable } from '../../src/server/runtime/runtime-status.js';

describe('coverage report resolution', () => {
  let fixturePath;

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-artifact-');
  });

  afterEach(() => {
    fs.removeSync(fixturePath);
  });

  it('looks for a run output first and the bundled artifact last', () => {
    expect(coverageReportCandidates('/src/')).to.deep.equal([
      '/src/coverage/html',
      '/src/coverage/lcov-report',
      '/src/coverage',
      `/src/${COVERAGE_BUNDLE_DIRECTORY}`,
    ]);
  });

  it('has nowhere to look without a source tree', () => {
    expect(coverageReportCandidates(undefined)).to.deep.equal([]);
    expect(resolveCoverageReportPath(undefined)).to.equal(undefined);
  });

  it('ignores a coverage directory that carries no HTML index', () => {
    fs.outputFileSync(`${fixturePath}/coverage/lcov.info`, 'TN:\n');
    expect(resolveCoverageReportPath(fixturePath)).to.equal(undefined);
  });

  it('resolves the bundled artifact when no run wrote a report', () => {
    fs.outputFileSync(`${fixturePath}/${COVERAGE_BUNDLE_DIRECTORY}/index.html`, '<!doctype html>');
    expect(resolveCoverageReportPath(fixturePath)).to.equal(`${fixturePath}/${COVERAGE_BUNDLE_DIRECTORY}`);
  });
});

describe('coverage bundling into a deploy artifact', () => {
  let fixturePath;

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-artifact-');
  });

  afterEach(() => {
    fs.removeSync(fixturePath);
  });

  it('carries the report into the artifact at the published path', () => {
    fs.outputFileSync(`${fixturePath}/engine/coverage/lcov-report/index.html`, '<!doctype html><title>report</title>');
    fs.outputFileSync(`${fixturePath}/engine/coverage/lcov-report/base.css`, 'body {}');

    const result = bundleCoverageReport(`${fixturePath}/engine`, `${fixturePath}/template`);

    expect(result.bundled).to.equal(true);
    expect(result.to).to.equal(`${fixturePath}/template/${COVERAGE_BUNDLE_DIRECTORY}`);
    expect(fs.readFileSync(`${result.to}/index.html`, 'utf8')).to.include('report');
    expect(fs.existsSync(`${result.to}/base.css`)).to.equal(true);
  });

  it('replaces a previously bundled report rather than merging into it', () => {
    fs.outputFileSync(`${fixturePath}/template/${COVERAGE_BUNDLE_DIRECTORY}/stale.html`, 'stale');
    fs.outputFileSync(`${fixturePath}/engine/coverage/html/index.html`, '<!doctype html><title>fresh</title>');

    const { to } = bundleCoverageReport(`${fixturePath}/engine`, `${fixturePath}/template`);

    expect(fs.existsSync(`${to}/stale.html`)).to.equal(false);
    expect(fs.readFileSync(`${to}/index.html`, 'utf8')).to.include('fresh');
  });

  it('reports that nothing was bundled without creating the directory', () => {
    const result = bundleCoverageReport(`${fixturePath}/engine`, `${fixturePath}/template`);

    expect(result.bundled).to.equal(false);
    expect(fs.existsSync(result.to)).to.equal(false);
  });

  it('renders a static unavailable page that never points at a runtime test run', () => {
    const page = coverageUnavailablePage();
    expect(page).to.include('Coverage report unavailable');
    expect(page).to.include('npm run test:coverage');
    expect(page).to.include(COVERAGE_BUNDLE_DIRECTORY);
    expect(page).not.to.include('<script');
  });
});

// Regression: a suite run inside a pod latched `container-status=error` on every expected
// non-zero exit, and the CD monitor failed the rollout on a deployment that was healthy.
describe('runtime status contract writability', () => {
  it('recognizes a test runner as the executing context', () => {
    expect(isTestRuntime()).to.equal(true);
  });

  it('refuses to write the contract from under a test runner', () => {
    expect(runtimeStatusWritable()).to.equal(false);
  });

  it('refuses to write the contract under a non-live execution profile', () => {
    const previous = process.env[EXECUTION_PROFILE_ENV_KEY];
    try {
      process.env[EXECUTION_PROFILE_ENV_KEY] = 'HERMETIC_BUILD';
      expect(runtimeStatusWritable()).to.equal(false);
    } finally {
      if (previous === undefined) delete process.env[EXECUTION_PROFILE_ENV_KEY];
      else process.env[EXECUTION_PROFILE_ENV_KEY] = previous;
    }
  });
});
