'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { EXECUTION_PROFILE_ENV_KEY, withExecutionProfile } from '../../src/server/build/execution.js';
import { shellExec } from '../../src/server/runtime/process.js';

const readSource = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

describe('shellExec enforces the active execution profile', () => {
  const originalProfile = process.env[EXECUTION_PROFILE_ENV_KEY];

  afterEach(() => {
    if (originalProfile === undefined) delete process.env[EXECUTION_PROFILE_ENV_KEY];
    else process.env[EXECUTION_PROFILE_ENV_KEY] = originalProfile;
  });

  it('runs local build work under HERMETIC_BUILD', () => {
    withExecutionProfile('HERMETIC_BUILD', () => {
      expect(`${shellExec('echo hermetic', { stdout: true, silent: true, disableLog: true })}`.trim()).to.equal(
        'hermetic',
      );
    });
  });

  it('elides a cluster write and reports success rather than throwing', () => {
    withExecutionProfile('HERMETIC_BUILD', () => {
      // The gate must not look like a failure: the manifest build calls this on a box with
      // no apiserver, and a throw here is exactly the breakage the profile exists to remove.
      const result = shellExec('kubectl delete secret underpost-config -n default --ignore-not-found');
      expect(result.code).to.equal(0);
      expect(result.stderr).to.equal('');
    });
  });

  it('answers an elided cluster read with the empty result callers already handle', () => {
    withExecutionProfile('HERMETIC_BUILD', () => {
      expect(shellExec('kubectl get svc x -n default', { stdout: true })).to.equal('');
      expect(`${shellExec('kubectl get svc x -n default')}`).to.equal('');
    });
  });

  it('runs the same cluster command under LIVE_CLUSTER', () => {
    withExecutionProfile('LIVE_CLUSTER', () => {
      // Reaches the shell; without a cluster it exits non-zero, which is the live contract.
      const result = shellExec('kubectl get svc definitely-absent -n default', {
        silentOnError: true,
        silent: true,
        disableLog: true,
      });
      expect(result.code).to.not.equal(0);
    });
  });
});

describe('e2e-build runs without a cluster', () => {
  const runSource = readSource('src/cli/run.js');
  const runner = runSource.slice(
    runSource.indexOf(`'build-cluster-deployment-manifests':`),
    runSource.indexOf('@method monitor-ui'),
  );

  it('declares HERMETIC_BUILD instead of appending bypass flags', () => {
    expect(runner).to.include(`withExecutionProfile('HERMETIC_BUILD'`);
    expect(runner).to.not.include('--disable-update-underpost-config');
  });

  it('still builds both environments through the resolved CLI', () => {
    const deployCommands = runner.match(/\$\{underpost\} deploy [^`]*/g) ?? [];
    expect(deployCommands).to.have.lengthOf(2);
    expect(runner).to.include('dd development');
    expect(runner).to.include('dd production --cert');
  });

  it('re-enters this checkout rather than any globally installed underpost', () => {
    // Regression: auto-resolution prefers a global install, which on a root shell runs a
    // different package against this repo's cwd — it failed on a missing dd.router.
    expect(runner).to.include(`cli('underpost', { local: true })`);
    expect(runner).to.not.match(/\bcli\(\)/);
  });
});

describe('binary resolution is centralized', () => {
  it('leaves no hand-rolled underpost/node-bin branch behind', () => {
    for (const file of ['src/cli/run.js', 'src/cli/db.js', 'src/cli/monitor.js']) {
      expect(readSource(file), file).to.not.include(`'node bin' : 'underpost'`);
    }
  });

  it('re-enters the executing package from every multi-stage runner', () => {
    // Regression: `run dev-cluster` resolved to whatever underpost was globally installed.
    // A stale one looked for credential seeds under engine-private/ after this version moved
    // them to engine-private/deploy/, so MongoDB bootstrapped with empty root credentials and
    // died on "not authorized". A re-entrant stage must run the code its parent runs.
    for (const file of ['src/cli/run.js', 'src/cli/monitor.js']) {
      const source = readSource(file);
      expect(source, file).to.not.match(/cli\('underpost',\s*\{\s*local:\s*options\.dev/);
      expect(source, file).to.not.match(/\bcli\(\)/);
    }
  });

  it('never shells out to a bare global underpost from the cyberia CLI', () => {
    const shelledOut = readSource('bin/cyberia.js').match(
      /(?<!\$\{cli\(\)\} )\bunderpost (?=clone|pull|push|cmt|run|start|deploy|secret)/g,
    );
    expect(shelledOut, `unresolved underpost invocations: ${shelledOut}`).to.equal(null);
  });

  it('exposes the profile as one root-level flag rather than per-command bypasses', () => {
    const cliSource = readSource('src/cli/index.js');
    expect(cliSource).to.include(`program.option(\n  '--profile <profile>'`);
    expect(cliSource).to.include(`program.hook('preAction'`);
  });
});
