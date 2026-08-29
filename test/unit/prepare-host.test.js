'use strict';

/**
 * @module prepare-host.test
 * @description Covers the step order `prepare_host` in `deploy/lib/host.sh` emits. Drives the real
 * shell helper with `deploy_step` stubbed out, so nothing is executed — no host, no root.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hostLib = path.join(repoRoot, 'deploy/lib/host.sh');

const steps = () =>
  execFileSync(
    'bash',
    [
      '-c',
      `deploy_step() { printf '%s :: %s\\n' "$1" "${'$'}{*:2}"; }; source "${hostLib}"; ` +
        `prepare_host /home/dd/engine owner/engine owner/engine-private`,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n');

describe('prepare_host brings a node up in an order it can recover from', () => {
  const emitted = steps();
  const titles = emitted.map((line) => line.split(' :: ')[0]);

  it('installs dependencies before running anything from the checkout', () => {
    // Regression: the pull runs through this checkout's own CLI, so a tree whose node_modules
    // no longer match its package.json failed to import — and the step that would have replaced
    // the source never ran.
    expect(titles).to.deep.equal(['Install dependencies', 'Pull repository', 'Load host config']);
    expect(emitted[0]).to.include('npm install');
  });

  it('replaces the checkout through the engine CLI, with both repositories named', () => {
    expect(emitted[1]).to.include('node bin run pull owner/engine');
    expect(emitted[1]).to.include('--repo-engine-private owner/engine-private');
  });

  it('loads the host config through the one entry point for that store', () => {
    expect(emitted[2]).to.include('node bin host load');
  });
});
