'use strict';

import { expect } from 'chai';
import SystemdService, {
  homeDirectoryPathFactory,
  journalctlCommandFactory,
  nodeCandidatesFactory,
  nodeProbeCommandFactory,
  scriptProbeCommandFactory,
} from '../src/server/systemd.js';

describe('nodeCandidatesFactory', () => {
  // systemd cannot enter /root or /home on an SELinux host, so a unit pointed at
  // an nvm install there restarts on 203/EXEC forever while every ordinary
  // permission check on the binary passes.
  it('keeps a home-directory interpreter for last', () => {
    expect(nodeCandidatesFactory({ execPath: '/root/.nvm/versions/node/v24.15.0/bin/node' })).to.deep.equal([
      ...SystemdService.NODE_PATHS,
      '/root/.nvm/versions/node/v24.15.0/bin/node',
    ]);
  });

  it('prefers the running interpreter when it is not in a home directory, without duplicating it', () => {
    expect(nodeCandidatesFactory({ execPath: '/opt/node/bin/node' })).to.deep.equal([
      '/opt/node/bin/node',
      ...SystemdService.NODE_PATHS,
    ]);
    expect(nodeCandidatesFactory({ execPath: '/usr/bin/node' })).to.deep.equal([...SystemdService.NODE_PATHS]);
  });

  it('distinguishes a home directory from a lookalike', () => {
    expect(homeDirectoryPathFactory('/home/dd/engine')).to.equal(true);
    expect(homeDirectoryPathFactory('/root')).to.equal(true);
    expect(homeDirectoryPathFactory('/opt/underpost/engine')).to.equal(false);
    expect(homeDirectoryPathFactory('/homelab/engine')).to.equal(false);
  });
});

describe('service probes', () => {
  it('probes an interpreter through a transient unit, under the same constraints', () => {
    expect(nodeProbeCommandFactory('/usr/bin/node', 'root')).to.equal(
      'sudo systemd-run --quiet --collect --wait --uid=root --property=Type=oneshot /usr/bin/node --version',
    );
  });

  it('probes a script from its working directory, which is what catches an unreadable checkout', () => {
    expect(
      scriptProbeCommandFactory({
        nodePath: '/usr/bin/node',
        scriptPath: '/home/dd/engine/bin/index.js',
        user: 'root',
        workingDirectory: '/home/dd/engine',
      }),
    ).to.equal(
      'sudo systemd-run --quiet --collect --wait --uid=root --property=Type=oneshot ' +
        '--property=WorkingDirectory=/home/dd/engine /usr/bin/node /home/dd/engine/bin/index.js --version',
    );
  });
});

describe('journalctlCommandFactory', () => {
  it('reads the tail a failure report needs', () => {
    expect(journalctlCommandFactory({ name: 'underpost-event.service', lines: 30 })).to.equal(
      'journalctl -u underpost-event.service -n 30',
    );
    expect(journalctlCommandFactory({ name: 'underpost-event.service' })).to.equal(
      'journalctl -u underpost-event.service',
    );
  });
});
