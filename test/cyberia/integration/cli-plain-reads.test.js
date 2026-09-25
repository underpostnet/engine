'use strict';

import { expect } from 'chai';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';

// The reroute notice is diagnostic output, so it must not reach stdout: a caller reading a value
// out of `--plain` would otherwise parse the banner as the value. Spawning the real CLI is the
// only way to observe the two streams apart, and it belongs to this tier because the cyberia CLI
// boots on the native packages the product manifest pins — repositories that only run
// `unit,infra,app` never install them.
describe('rerouted plain reads stay machine-readable', () => {
  const CYBERIA_CLI = 'bin/cyberia.js';
  const repoRoot = new URL('../../..', import.meta.url);

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
      const { stdout, stderr } = spawnSync(
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
      const output = `${stdout}${stderr}`;

      // Whatever the run goes on to do, it must not fail on the argument it was given.
      expect(output).to.not.include('argument missing');
      expect(output).to.include('Rerouting to underpost cli');
    },
    60000,
  );

  it.skipIf(!fs.existsSync(new URL(CYBERIA_CLI, repoRoot)))(
    'keeps the reroute notice out of a captured command output',
    () => {
      // Regression: a commit step captured `cmt --changelog-msg` and committed the notice as its message.
      const { stdout, stderr } = spawnSync(
        process.execPath,
        [CYBERIA_CLI, 'cmt', '--changelog-msg', '--from-n-commit', '1', '--changelog-no-hash'],
        { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      expect(stdout).to.not.include('Rerouting to underpost cli');
      expect(stderr).to.include('Rerouting to underpost cli');
    },
    60000,
  );
});

// A pod has no env file: its environment arrives from a Secret, and the data commands read it there.
describe('data commands without an env file', () => {
  const cli = new URL('../../../bin/cyberia.js', import.meta.url).pathname;

  it.skipIf(!fs.existsSync(cli)).each([
    ['instance', 'TEST'],
    ['ol', 'x'],
  ])(
    '%s resolves the deploy from the process environment',
    (command, target) => {
      const pod = fs.mkdtempSync(`${os.tmpdir()}/cyberia-no-env-`);
      try {
        fs.outputJsonSync(`${pod}/engine-private/conf/dd-x/conf.server.json`, {
          h: { '/': { db: { provider: 'mongoose', host: 'mongodb://127.0.0.1:1', name: 'x' } } },
        });
        const { stdout, stderr } = spawnSync(process.execPath, [cli, command, target, '--import', '--release', 'r1'], {
          cwd: pod,
          encoding: 'utf8',
          env: {
            ...process.env,
            DEFAULT_DEPLOY_ID: 'dd-x',
            DEFAULT_DEPLOY_HOST: 'h',
            DEFAULT_DEPLOY_PATH: '/',
            // An empty global npm root: the host's underpost store `.env` overrides the process env.
            npm_config_prefix: `${pod}/npm-global`,
          },
          timeout: 50000,
        });
        const output = `${stdout}${stderr}`;
        expect(output).to.not.include('Env file not found');
        // The next check after env resolution: the minimal conf declares no content partition.
        expect(output).to.include('no "content" partition');
      } finally {
        fs.removeSync(pod);
      }
    },
    60000,
  );
});
