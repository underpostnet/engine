'use strict';

/**
 * @module start-options.test
 * @description Covers the option contract of `underpost start`: every flag the command
 * registers must be a key the callback receives, since the pod's whole bootstrap is one
 * invocation of it.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import fs from 'fs-extra';
import { program } from '../../src/cli/index.js';

const startCommand = () => program.commands.find((command) => command.name() === 'start');
const camelCase = (flag) => flag.replace(/^--/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

describe('start receives every flag its command registers', () => {
  const source = fs.readFileSync(new URL('../../src/server/runtime/start.js', import.meta.url), 'utf8');
  const contract = source.slice(source.indexOf('async callback('), source.indexOf('Underpost.host.load'));
  const buildStart = source.indexOf('async build(');
  const buildContract = source.slice(buildStart, source.indexOf('async run(', buildStart));

  it('names each registered flag in the callback options', () => {
    // Regression: `--private-test-repo` selects the repository the base pull clones, and the
    // callback's option contract never named it — the flag reached a default that dropped it.
    for (const { long } of startCommand().options) expect(contract, long).to.include(`${camelCase(long)}:`);
  });

  it('gives build its own switch per source it can pull', () => {
    for (const flag of ['--skip-pull-repo-base', '--skip-pull-private-repo'])
      expect(buildContract, flag).to.include(`${camelCase(flag)}:`);
    expect(buildContract).to.include('if (options.skipPullRepoBase !== true) Underpost.start.pullRepoBase(');
    expect(buildContract).to.include('if (options.skipPullPrivateRepo !== true)');
    expect(buildContract).to.include('Underpost.repo.privateEngineRepoFactory(deployId,');
    expect(buildContract).to.include('{ force: Underpost.state.isInsideContainer() }');
  });

  it('runs the container in one phase, with no re-entry through the global CLI', () => {
    // The pod's own bootstrap replaces the checkout and links the CLI before `start` is
    // invoked, so re-execing `underpost start` here only pulled and installed a second time.
    expect(source).to.not.include('startFlagsFactory');
    expect(source).to.not.match(/shellExec\(`underpost start /);
  });
});
