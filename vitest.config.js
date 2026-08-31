import { defineConfig } from 'vitest/config';
import {
  UNDERPOST_TESTING,
  coverageIncludeFactory,
  coverageThresholdFactory,
  testProjectsFactory,
} from './src/server/build/testing.js';

const allureResultsDirectory = process.env[UNDERPOST_TESTING.allureResultsEnvKey];
const coverageThreshold = coverageThresholdFactory(process.env);
const coverageInclude = coverageIncludeFactory(process.argv);

// Spread into every tier: a Vitest project inherits nothing from the root
// `test` block, and only `coverage` and `reporters` are read from it.
const projectDefaults = {
  // Mocha's `describe`/`it` and the hooks stay global, so the suites read the
  // same either side of the migration and carry no runner import.
  globals: true,
  environment: 'node',
  // A tier is only meaningful if its failures are attributable to it, and a
  // suite that reads `dd.routes` or binds a fixed port cannot share a worker
  // with another doing the same.
  fileParallelism: false,
  ...(allureResultsDirectory ? { setupFiles: ['allure-vitest/setup'] } : {}),
};

export default defineConfig({
  test: {
    reporters: [
      'default',
      ...(allureResultsDirectory ? [['allure-vitest/reporter', { resultsDir: allureResultsDirectory }]] : []),
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: UNDERPOST_TESTING.coverageDirectory,
      // `lcov` is what Coveralls ingests, `json` is what a merged multi-job
      // report is assembled from, `text` is what a local run reads.
      reporter: ['text', 'lcov', 'json'],
      // Written even when the run fails: the coverage workflows upload the report
      // from a job the threshold step is meant to fail, and without it the badge
      // freezes at the last passing build instead of moving with the tree.
      reportOnFailure: true,
      // The tiers in the selection decide what is measured, so a partial run
      // reports the slice it drives and the whole run reports the whole of it —
      // rather than every module the CLI barrel drags into a worker on import.
      include: coverageInclude,
      // Only the suites themselves: an `include` whitelist already keeps
      // dependencies, bundles and generated assets out, and a directory pattern
      // here is not anchored to the root — `test/**` also excluded the API
      // surfaces named `test`, so the tier covering them reported nothing.
      exclude: ['**/*.{test,spec}.js'],
      // Absent unless the run opted in, so a single-tier run reports its slice
      // instead of failing against a number it never measured.
      ...(coverageThreshold === null ? {} : { thresholds: { lines: coverageThreshold } }),
    },
    projects: testProjectsFactory(projectDefaults),
  },
});
