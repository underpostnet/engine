'use strict';

import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';

// The reroute notice is diagnostic output, so it must not reach stdout: a caller reading a value
// out of `--plain` would otherwise parse the banner as the value. Spawning the real CLI is the
// only way to observe the two streams apart, and it belongs to this tier because the cyberia CLI
// boots on the native packages the product manifest pins — repositories that only run
// `unit,infra,app` never install them.
describe('rerouted plain reads stay machine-readable', () => {
  const CYBERIA_CLI = 'bin/cyberia.js';
  const repoRoot = new URL('../../../../', import.meta.url);

  it.skipIf(!fs.existsSync(new URL(CYBERIA_CLI, repoRoot)))(
    'prints nothing for a key the store lacks',
    () => {
      const stdout = execFileSync(
        process.execPath,
        [CYBERIA_CLI, 'host', 'get', '--plain', 'UNDERPOST_TEST_MISSING_KEY'],
        { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      expect(stdout.trim()).to.equal('');
      // A cold CLI start imports the whole command surface; the budget is for the import, not the
      // read, and is stated here rather than left to the runner default a loaded machine exceeds.
    },
    60000,
  );
});
