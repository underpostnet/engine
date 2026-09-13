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
  bundleCoverageReports,
  coverageReportCandidates,
  coverageReportCommand,
  coverageReportsFactory,
  coverageUnavailablePage,
  deployCoverageReports,
  resolveCoverageReportPath,
} from '../../src/server/build/coverage.js';
import { EXECUTION_PROFILE_ENV_KEY } from '../../src/server/build/execution.js';
import { isTestRuntime, runtimeStatusWritable } from '../../src/server/runtime/runtime-status.js';

describe('coverage report declaration', () => {
  it('reads each declared report with its label defaulting to the id', () => {
    expect(coverageReportsFactory({ coverage: [{ id: 'engine', suite: 'unit' }] })).to.deep.equal([
      { id: 'engine', label: 'engine', suite: 'unit', path: undefined },
    ]);
  });

  it('declares nothing for a deploy without coverage', () => {
    expect(coverageReportsFactory({})).to.deep.equal([]);
    expect(coverageReportsFactory(undefined)).to.deep.equal([]);
  });

  it('rejects an entry without exactly one source, a non-slug id, or a repeated id', () => {
    expect(() => coverageReportsFactory({ coverage: [{ id: 'x' }] })).to.throw("exactly one of 'suite' or 'path'");
    expect(() => coverageReportsFactory({ coverage: [{ id: 'x', suite: 'unit', path: './' }] })).to.throw(
      'exactly one',
    );
    expect(() => coverageReportsFactory({ coverage: [{ id: 'Bad Id', suite: 'unit' }] })).to.throw('slug');
    expect(() =>
      coverageReportsFactory({
        coverage: [
          { id: 'x', suite: 'unit' },
          { id: 'x', suite: 'app' },
        ],
      }),
    ).to.throw('declared twice');
  });

  it("collects a deploy's reports across routes once each", () => {
    const route = { docs: { coverage: [{ id: 'engine', suite: 'unit' }] } };
    const confServer = { 'a.test': { '/': route, '/store': route }, 'b.test': { '/': {} } };
    expect(deployCoverageReports(confServer).map(({ id }) => id)).to.deep.equal(['engine']);
  });

  it('refuses one id declared with two sources', () => {
    const confServer = {
      'a.test': {
        '/': { docs: { coverage: [{ id: 'engine', suite: 'unit' }] } },
        '/store': { docs: { coverage: [{ id: 'engine', suite: 'app' }] } },
      },
    };
    expect(() => deployCoverageReports(confServer)).to.throw('two different sources');
  });

  it('names the command that produces each kind of report', () => {
    expect(coverageReportCommand({ suite: 'unit,infra,app' })).to.equal('node bin test unit,infra,app');
    expect(coverageReportCommand({ path: './hardhat/' })).to.equal('npm run coverage --prefix ./hardhat');
  });
});

describe('coverage report resolution', () => {
  let fixturePath;
  let cwd;

  // The bundled candidate is cwd-relative, and a published deploy artifact (the tree a
  // downstream CI runs this suite in) carries real reports under it; resolve against the
  // fixture, never the tree.
  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-artifact-');
    cwd = process.cwd();
    process.chdir(fixturePath);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.removeSync(fixturePath);
  });

  it("looks for a suite's own run output first and the bundled artifact last", () => {
    expect(coverageReportCandidates({ id: 'engine', suite: 'unit,infra,app' })).to.deep.equal([
      'coverage/unit-infra-app',
      `${COVERAGE_BUNDLE_DIRECTORY}/engine`,
    ]);
  });

  it("looks through an external tree's report layouts before the bundled artifact", () => {
    expect(coverageReportCandidates({ id: 'hardhat', path: '/src/' })).to.deep.equal([
      '/src/coverage/html',
      '/src/coverage/lcov-report',
      '/src/coverage',
      `${COVERAGE_BUNDLE_DIRECTORY}/hardhat`,
    ]);
  });

  it('ignores a coverage directory that carries no HTML index', () => {
    fs.outputFileSync(`${fixturePath}/coverage/lcov.info`, 'TN:\n');
    expect(resolveCoverageReportPath({ id: 'x', path: fixturePath })).to.equal(undefined);
  });

  it('resolves the report of the selection the deploy names, not the last run made', () => {
    fs.outputFileSync(`${fixturePath}/coverage/unit-infra-app-cyberia/index.html`, '<!doctype html>');
    fs.outputFileSync(`${fixturePath}/coverage/cyberia/index.html`, '<!doctype html>');
    expect(resolveCoverageReportPath({ id: 'x', suite: 'cyberia' })).to.equal('coverage/cyberia');
    expect(resolveCoverageReportPath({ id: 'x', suite: 'unit,infra,app' })).to.equal(undefined);
  });

  it('falls back to the report a deploy artifact already carries', () => {
    fs.outputFileSync(`${fixturePath}/${COVERAGE_BUNDLE_DIRECTORY}/hardhat/index.html`, '<!doctype html>');
    expect(resolveCoverageReportPath({ id: 'hardhat', path: `${fixturePath}/hardhat` })).to.equal(
      `${COVERAGE_BUNDLE_DIRECTORY}/hardhat`,
    );
  });
});

describe('coverage bundling into a deploy artifact', () => {
  let fixturePath;
  let cwd;

  // The bundled candidate is cwd-relative, and a published deploy artifact (the tree a
  // downstream CI runs this suite in) carries real reports under it; resolve against the
  // fixture, never the tree.
  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-artifact-');
    cwd = process.cwd();
    process.chdir(fixturePath);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.removeSync(fixturePath);
  });

  it('carries each report into the artifact under its own id', () => {
    fs.outputFileSync(`${fixturePath}/hardhat/coverage/html/index.html`, '<!doctype html><title>report</title>');
    fs.outputFileSync(`${fixturePath}/hardhat/coverage/html/base.css`, 'body {}');

    const [result] = bundleCoverageReports(
      [{ id: 'hardhat', path: `${fixturePath}/hardhat` }],
      `${fixturePath}/template`,
    );

    expect(result.bundled).to.equal(true);
    expect(result.to).to.equal(`${fixturePath}/template/${COVERAGE_BUNDLE_DIRECTORY}/hardhat`);
    expect(fs.readFileSync(`${result.to}/index.html`, 'utf8')).to.include('report');
    expect(fs.existsSync(`${result.to}/base.css`)).to.equal(true);
  });

  it('replaces a previously bundled report rather than merging into it', () => {
    fs.outputFileSync(`${fixturePath}/template/${COVERAGE_BUNDLE_DIRECTORY}/hardhat/stale.html`, 'stale');
    fs.outputFileSync(`${fixturePath}/hardhat/coverage/index.html`, '<!doctype html><title>fresh</title>');

    const [{ to }] = bundleCoverageReports(
      [{ id: 'hardhat', path: `${fixturePath}/hardhat` }],
      `${fixturePath}/template`,
    );

    expect(fs.existsSync(`${to}/stale.html`)).to.equal(false);
    expect(fs.readFileSync(`${to}/index.html`, 'utf8')).to.include('fresh');
  });

  it('reports what was not bundled without creating its directory', () => {
    const [result] = bundleCoverageReports(
      [{ id: 'hardhat', path: `${fixturePath}/hardhat` }],
      `${fixturePath}/template`,
    );

    expect(result).to.deep.equal({
      id: 'hardhat',
      bundled: false,
      to: `${fixturePath}/template/${COVERAGE_BUNDLE_DIRECTORY}/hardhat`,
    });
    expect(fs.existsSync(result.to)).to.equal(false);
  });

  it('renders a static unavailable page naming the report and the run that produces it', () => {
    const page = coverageUnavailablePage({ id: 'engine', suite: 'unit,infra,app' });
    expect(page).to.include('Coverage report unavailable');
    expect(page).to.include('node bin test unit,infra,app');
    expect(page).to.include(`${COVERAGE_BUNDLE_DIRECTORY}/engine`);
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
