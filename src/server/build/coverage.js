/**
 * The coverage HTML reports as build artifacts: which reports a deploy declares, where a run
 * leaves each, where an assembled deploy artifact carries them, and what is published when
 * one was not carried.
 *
 * A deploy declares its reports in `conf.server.json` under `docs.coverage`, one entry per
 * report it publishes at `/docs/coverage/<id>`:
 *
 * - `{ id, label, suite }` — a test tier selection run by `node bin test <suite>`, whose HTML
 *   report the runner writes under `coverage/<key>` (see `coverageReportKey`). A deploy shows
 *   the run it names, never the last run a host happened to make.
 * - `{ id, label, path }` — a report another tree produces on its own (Hardhat's Solidity
 *   coverage), read from that tree's `coverage/` output.
 *
 * Reports are produced by the test stage and bundled into the deploy artifact under
 * {@link COVERAGE_BUNDLE_DIRECTORY}. A workload container only ever copies them: running a
 * test runner inside a pod costs minutes of the build phase, needs the dev dependency tree,
 * and — because a suite's expected non-zero exits latch the runtime status contract —
 * publishes a false `error` to the deployment monitor.
 *
 * @module src/server/build/coverage.js
 * @namespace UnderpostCoverage
 */

import fs from 'fs-extra';
import { UNDERPOST_TESTING, coverageReportKey } from './testing.js';

/**
 * @constant COVERAGE_BUNDLE_DIRECTORY
 * @description Path, relative to a source tree root, under which an assembled deploy
 * artifact carries each report as `<id>/`. Deliberately not under `coverage/`, which every
 * engine `.gitignore` excludes, so the bundled artifact is publishable source rather than a
 * local run's output.
 * @memberof UnderpostCoverage
 */
const COVERAGE_BUNDLE_DIRECTORY = 'docs/coverage';

const normalizeRoot = (root) => `${root ?? ''}`.replace(/\/+$/, '');

/**
 * @method coverageReportsFactory
 * @description The reports a deploy's `docs` conf declares, validated: every entry names an
 * id and exactly one source, and no two entries publish under the same id.
 * @param {object} [docs] - The `docs` block of one `conf.server.json` route.
 * @returns {Array<{id: string, label: string, suite?: string, path?: string}>} Declared reports.
 * @throws {Error} When an entry is malformed or an id repeats.
 * @memberof UnderpostCoverage
 */
const coverageReportsFactory = (docs = {}) => {
  const reports = docs.coverage ?? [];
  const ids = new Set();
  for (const report of reports) {
    const { id, suite, path } = report;
    if (!id || !/^[a-z0-9-]+$/.test(id)) throw new Error(`[coverage] report id must be a slug, got '${id}'`);
    if (ids.has(id)) throw new Error(`[coverage] report id '${id}' is declared twice`);
    if (!suite === !path) throw new Error(`[coverage] report '${id}' needs exactly one of 'suite' or 'path'`);
    ids.add(id);
  }
  return reports.map(({ id, label = id, suite, path }) => ({ id, label, suite, path }));
};

/**
 * @method deployCoverageReports
 * @description Every report a deploy declares across its routes, once each: two routes may
 * publish the same report, never the same id with different sources.
 * @param {object} confServer - A parsed `conf.server.json`.
 * @returns {Array<{id: string, label: string, suite?: string, path?: string}>} Declared reports.
 * @throws {Error} When an id is declared with two different sources.
 * @memberof UnderpostCoverage
 */
const deployCoverageReports = (confServer) => {
  const reports = new Map();
  for (const routes of Object.values(confServer)) {
    for (const { docs } of Object.values(routes)) {
      for (const report of coverageReportsFactory(docs)) {
        const known = reports.get(report.id);
        if (known && (known.suite !== report.suite || known.path !== report.path))
          throw new Error(`[coverage] report id '${report.id}' is declared with two different sources`);
        reports.set(report.id, report);
      }
    }
  }
  return [...reports.values()];
};

/**
 * @method coverageReportCandidates
 * @description Every place one report can live, most local first: the output of the run
 * that produces it, then the bundled artifact a deploy artifact carries.
 * @param {{id: string, suite?: string, path?: string}} report - A declared report.
 * @returns {string[]} Candidate report directories.
 * @memberof UnderpostCoverage
 */
const coverageReportCandidates = ({ id, suite, path }) => {
  const bundled = `${COVERAGE_BUNDLE_DIRECTORY}/${id}`;
  if (suite) return [`${UNDERPOST_TESTING.coverageDirectory}/${coverageReportKey(suite)}`, bundled];
  const coverage = `${normalizeRoot(path)}/${UNDERPOST_TESTING.coverageDirectory}`;
  return [`${coverage}/html`, `${coverage}/lcov-report`, coverage, bundled];
};

/**
 * @method resolveCoverageReportPath
 * @description First candidate that actually carries an HTML index. A directory holding
 * only `lcov.info` is not a report and is not published.
 * @param {{id: string, suite?: string, path?: string}} report - A declared report.
 * @returns {string|undefined} Report directory, or undefined when none is available.
 * @memberof UnderpostCoverage
 */
const resolveCoverageReportPath = (report) =>
  coverageReportCandidates(report).find((candidate) => fs.existsSync(`${candidate}/index.html`));

/**
 * @method coverageReportCommand
 * @description The command that produces a report, for the operator who finds it missing.
 * @param {{suite?: string, path?: string}} report - A declared report.
 * @returns {string} Shell command.
 * @memberof UnderpostCoverage
 */
const coverageReportCommand = ({ suite, path }) =>
  suite ? `node bin test ${suite}` : `npm run coverage --prefix ${normalizeRoot(path)}`;

/**
 * @method bundleCoverageReports
 * @description Copies each declared report into `toRoot`'s bundle directory, so the
 * assembled artifact carries it into every container started from that source.
 * @param {Array<{id: string, suite?: string, path?: string}>} reports - Declared reports.
 * @param {string} toRoot - Assembled artifact root.
 * @returns {Array<{id: string, bundled: boolean, from?: string, to: string}>} What was bundled, and where.
 * @memberof UnderpostCoverage
 */
const bundleCoverageReports = (reports, toRoot) =>
  reports.map((report) => {
    const to = `${normalizeRoot(toRoot)}/${COVERAGE_BUNDLE_DIRECTORY}/${report.id}`;
    const from = resolveCoverageReportPath(report);
    if (!from) return { id: report.id, bundled: false, to };
    fs.emptyDirSync(to);
    fs.copySync(from, to);
    return { id: report.id, bundled: true, from, to };
  });

/**
 * @method coverageUnavailablePage
 * @description The page served where a report was expected but none was bundled. A static
 * document, never an invitation to generate one at runtime.
 * @param {{id: string, suite?: string, path?: string}} report - The missing report.
 * @returns {string} HTML document.
 * @memberof UnderpostCoverage
 */
const coverageUnavailablePage = (report) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Coverage report unavailable</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; display: grid; place-items: center; min-height: 100vh;
             font: 16px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      main { max-width: 34rem; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 .75rem; }
      p { margin: 0 0 .75rem; opacity: .8; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
    </style>
  </head>
  <body>
    <main>
      <h1>Coverage report unavailable</h1>
      <p>This build carried no <code>${report.id}</code> coverage report. The report is generated
      by the test stage and bundled into the deploy artifact under
      <code>${COVERAGE_BUNDLE_DIRECTORY}/${report.id}</code>.</p>
      <p>Run <code>${coverageReportCommand(report)}</code> in the build environment, then assemble
      and publish the artifact again.</p>
    </main>
  </body>
</html>
`;

export {
  COVERAGE_BUNDLE_DIRECTORY,
  bundleCoverageReports,
  coverageReportCandidates,
  coverageReportCommand,
  coverageReportsFactory,
  coverageUnavailablePage,
  deployCoverageReports,
  resolveCoverageReportPath,
};
