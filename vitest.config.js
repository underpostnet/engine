import { defineConfig } from 'vitest/config';
import { UNDERPOST_TESTING, testProjectsFactory } from './src/server/testing.js';

const allureResultsDirectory = process.env[UNDERPOST_TESTING.allureResultsEnvKey];

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
      // Left to the loaded set rather than all of `src`: the client bundles and
      // generated assets under it are shipped, not executed by any suite, and
      // instrumenting them would report a coverage floor no test can move.
      // Keep `test` segment-bound: a checkout named `engine-test-test` must not
      // make the pattern match the repository directory and exclude all source.
      exclude: ['src/client/public/**', 'src/client/sw/**', '**/test/**'],
    },
    projects: testProjectsFactory(projectDefaults),
  },
});
