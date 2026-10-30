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
import shell from 'shelljs';
import { vi } from 'vitest';
import { program } from '../../../src/cli/index.js';
import Underpost from '../../../src/index.js';

const startCommand = () => program.commands.find((command) => command.name() === 'start');
const camelCase = (flag) => flag.replace(/^--/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

describe('start receives every flag its command registers', () => {
  const source = fs.readFileSync(new URL('../../../src/server/runtime/start.js', import.meta.url), 'utf8');
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

  it('withdraws the ephemeral engine-private clone once a production container is serving', () => {
    // Regression: the domain-split withdraw passed `force: false` to every domain, and only
    // `host clean --force` removes `engine-private` — the clone outlived the boot in the pod.
    const runStart = source.indexOf('async run(');
    const withdraw = source.slice(
      source.indexOf('for (const domain of', runStart),
      source.indexOf('setTimeout', runStart),
    );
    expect(withdraw).to.include('[Underpost.secret, Underpost.host, Underpost.app]');
    expect(withdraw).to.include('force: domain === Underpost.host');
  });

  it('runs the container in one phase, with no re-entry through the global CLI', () => {
    // The pod's own bootstrap replaces the checkout and links the CLI before `start` is
    // invoked, so re-execing `underpost start` here only pulled and installed a second time.
    expect(source).to.not.include('startFlagsFactory');
    expect(source).to.not.match(/shellExec\(`underpost start /);
  });
});

describe('the build phase of a pod', () => {
  const REFERENCE = `v3-5-0-abc1234/client-20261030151234567-4242@sha256:${'a'.repeat(64)}`;
  afterEach(() => vi.restoreAllMocks());

  /** Runs the build phase with every shell command recorded, none executed. */
  const build = async (options) => {
    const commands = [];
    vi.spyOn(process, 'chdir').mockImplementation(() => {});
    vi.spyOn(shell, 'exec').mockImplementation((command, shellOptions, callback) => {
      commands.push(command);
      callback?.(0, '', '');
      return { code: 0, stdout: '', stderr: '' };
    });
    await Underpost.start.build('dd-test', 'production', {
      skipPullRepoBase: true,
      skipPullPrivateRepo: true,
      ...options,
    });
    return commands;
  };

  it('restores the exact bundle and never builds the client', async () => {
    const commands = await build({ bundle: REFERENCE });
    expect(commands).to.include(`node bin run pull-bundle --deploy-id dd-test --bundle '${REFERENCE}'`);
    expect(commands.some((command) => /bin client|typedoc/.test(command))).to.equal(false);
    expect(await build({ pullBundle: true })).to.include('node bin run pull-bundle --deploy-id dd-test');
  });

  it('builds the client from source only without a bundle', async () => {
    expect(await build({})).to.include('node bin client dd-test --env production');
  });
});
