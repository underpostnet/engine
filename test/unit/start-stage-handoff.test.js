'use strict';

import { expect } from 'chai';
import { program } from '../../src/cli/index.js';
import { startFlagsFactory } from '../../src/server/runtime/start.js';

const startCommand = () => program.commands.find((command) => command.name() === 'start');

describe('start two-stage handoff', () => {
  it('always marks the re-entry as stage two', () => {
    // The stage-1 branch is guarded by `!skipPullBase`, so this flag is the only thing
    // stopping a container from pulling, linking and re-execing itself forever.
    for (const options of [{}, { build: true }, { build: true, run: true }, { skipPullBase: false }])
      expect(startFlagsFactory(options), JSON.stringify(options)).to.include('--skip-pull-base');
  });

  it('carries the stage-1 selection across the handoff', () => {
    expect(startFlagsFactory({ build: true, run: true })).to.equal('--build --run --skip-pull-base');
    expect(startFlagsFactory({ build: true, run: true, pullBundle: true, skipFullBuild: true })).to.equal(
      '--build --run --skip-full-build --pull-bundle --skip-pull-base',
    );
    expect(startFlagsFactory({ build: true, privateTestRepo: true, underpostQuicklyInstall: true })).to.equal(
      '--build --underpost-quickly-install --private-test-repo --skip-pull-base',
    );
  });

  it('omits flags that were not selected', () => {
    expect(startFlagsFactory({ build: true })).to.equal('--build --skip-pull-base');
    expect(startFlagsFactory({ build: false, run: false })).to.equal('--skip-pull-base');
    // Only an explicit `true` counts; a truthy string from an env round-trip must not leak.
    expect(startFlagsFactory({ run: 'yes' })).to.equal('--skip-pull-base');
  });

  it('emits only flags the start command actually registers', () => {
    const registered = new Set(startCommand().options.map((option) => option.long));
    const emitted = startFlagsFactory({
      build: true,
      run: true,
      underpostQuicklyInstall: true,
      skipFullBuild: true,
      pullBundle: true,
      privateTestRepo: true,
    }).split(' ');
    for (const flag of emitted) expect(registered.has(flag), `${flag} is not a start option`).to.equal(true);
  });
});
