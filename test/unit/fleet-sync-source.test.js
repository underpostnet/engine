'use strict';

import { expect } from 'chai';
import Underpost from '../../src/index.js';
import { hostAddressesFactory } from '../../src/cli/wireguard.js';

describe('a fleet command cannot fall back to local execution', () => {
  it('refuses when a remote target resolved no SSH identity', async () => {
    let thrown;
    try {
      await Underpost.event.runCommand('echo should-not-run', { requireRemote: true, host: '10.0.0.9' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown, 'runCommand should have thrown').to.be.an('error');
    expect(thrown.message).to.include('refusing to run locally');
  });

  it('still runs locally for remediation, which has no such requirement', async () => {
    const result = await Underpost.event.runCommand('echo local-remediation-ok', { silent: true });
    expect(result.ok).to.equal(true);
    expect(`${result.output}`).to.include('local-remediation-ok');
  });
});

describe('wireguard sync never switches the checkout it runs from', () => {
  const originalTargets = Underpost.wireguard.syncTargets;
  const originalRunCommand = Underpost.event.runCommand;

  afterEach(() => {
    Underpost.wireguard.syncTargets = originalTargets;
    Underpost.event.runCommand = originalRunCommand;
  });

  const stub = (targets) => {
    const dispatched = [];
    Underpost.wireguard.syncTargets = () => targets;
    Underpost.event.runCommand = async (command, options) => {
      dispatched.push({ host: options.host, requireRemote: options.requireRemote });
      return { ok: true, output: '' };
    };
    return dispatched;
  };

  const remote = { nodeName: 'vultr', user: 'root', host: '64.176.25.136', via: 'root@64.176.25.136:22' };

  it('skips a node registered at an address this machine holds', async () => {
    // The peer list is keyed by managementHost because it is unique; a hostname is not, and
    // the control plane and this workstation are both `localhost.localdomain`.
    const [ownAddress] = [...hostAddressesFactory()];
    expect(ownAddress, 'this host must have a routable address to exercise the guard').to.be.a('string');
    const self = { nodeName: 'control', user: 'admin', host: ownAddress, via: 'ssh' };
    const dispatched = stub([self, remote]);

    await Underpost.wireguard.sync({ cmd: 'echo fleet' });

    expect(dispatched.map(({ host }) => host)).to.deep.equal(['64.176.25.136']);
  });

  it('skips a target that resolved to local execution', async () => {
    const local = { nodeName: 'control', user: '', host: '', via: 'local' };
    const dispatched = stub([local, remote]);

    await Underpost.wireguard.sync({ cmd: 'echo fleet' });

    expect(dispatched).to.have.lengthOf(1);
    expect(dispatched[0].host).to.equal('64.176.25.136');
  });

  it('marks every dispatch remote-only', async () => {
    const dispatched = stub([remote]);
    await Underpost.wireguard.sync({ cmd: 'echo fleet' });
    expect(dispatched.every(({ requireRemote }) => requireRemote === true)).to.equal(true);
  });

  it('fails instead of reporting success when every node is this machine', async () => {
    stub([{ nodeName: 'control', user: '', host: '', via: 'local' }]);
    let thrown;
    try {
      await Underpost.wireguard.sync({ cmd: 'echo fleet' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown, 'an all-local selection must not look like a successful sync').to.be.an('error');
    expect(thrown.message).to.include('sync source');
  });

  it('still syncs a remote node that merely shares this machine hostname', async () => {
    // The reported case: the control plane at .85 and this workstation are both
    // `localhost.localdomain`, so the remote one must still be reached, not skipped.
    const sameName = { nodeName: 'localhost.localdomain', user: 'git_super_admin', host: '192.168.1.85', via: 'ssh' };
    const dispatched = stub([sameName]);
    await Underpost.wireguard.sync({ cmd: 'echo fleet' });
    expect(dispatched.map(({ host }) => host)).to.deep.equal(['192.168.1.85']);
  });
});
