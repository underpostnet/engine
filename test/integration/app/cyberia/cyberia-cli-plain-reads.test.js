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

  it.skipIf(!fs.existsSync(new URL(CYBERIA_CLI, repoRoot)))(
    'keeps an argument whose value is the CLI name through the reroute',
    () => {
      // Regression: the reroute dropped every argv token equal to `underpost`, so an option value
      // that happens to be the CLI name was removed and the parse failed on a missing argument.
      // A redundant name can only precede the command; everything after it is an argument.
      let output = '';
      try {
        output = execFileSync(
          process.execPath,
          [
            CYBERIA_CLI,
            'fs',
            'src/client/public/underpost',
            '--deploy-id',
            'dd-cyberia',
            '--pull',
            '--tracked',
            '--storage-id',
            'underpost',
          ],
          { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        );
      } catch (error) {
        output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      }

      // Whatever the run goes on to do, it must not fail on the argument it was given.
      expect(output).to.not.include('argument missing');
      expect(output).to.include('Rerouting to underpost cli');
    },
    60000,
  );
});
