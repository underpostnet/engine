'use strict';

import { expect } from 'chai';
import Underpost from '../../src/index.js';
import { hostAddressesFactory } from '../../src/cli/wireguard.js';

const syncPrivateConfMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/server/runtime/conf.js', async (importOriginal) => ({
  ...(await importOriginal()),
  syncPrivateConf: syncPrivateConfMock,
}));

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

  it('runs locally from where it is, when the deploy path is not on this machine', async () => {
    // A CI container checks the engine out under /__w/<repo>, so entering the deploy path is
    // impossible there; that chdir failing reported a perfectly runnable command as a failed
    // remediation.
    const output = await Underpost.ssh.sshRemoteRunner('echo local-remediation-ok', {
      cd: '/underpost/absent-deploy-path',
      remote: false,
      silent: true,
    });
    expect(`${output}`).to.include('local-remediation-ok');
  });
});

describe('wireguard sync never switches the checkout it runs from', () => {
  const originalTargets = Underpost.wireguard.syncTargets;
  const originalRunCommand = Underpost.event.runCommand;
  const originalGetDefaultBranch = Underpost.repo.getDefaultBranch;

  afterEach(() => {
    Underpost.wireguard.syncTargets = originalTargets;
    Underpost.event.runCommand = originalRunCommand;
    Underpost.repo.getDefaultBranch = originalGetDefaultBranch;
    syncPrivateConfMock.mockReset();
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

  // Dispatch fixtures use RFC 5737 documentation addresses on purpose: the guard skips any node
  // registered at an address this machine holds, so a fixture that names a real fleet address —
  // the control plane's LAN address, or its 10.0.0.x tunnel address — stops being a remote node
  // on the very hosts the suite runs on.
  const remote = { nodeName: 'vultr', user: 'root', host: '203.0.113.10', via: 'root@203.0.113.10:22' };

  it('skips a node registered at an address this machine holds', async () => {
    // The peer list is keyed by managementHost because it is unique; a hostname is not, and
    // the control plane and this workstation are both `localhost.localdomain`.
    const [ownAddress] = [...hostAddressesFactory()];
    expect(ownAddress, 'this host must have a routable address to exercise the guard').to.be.a('string');
    const self = { nodeName: 'control', user: 'admin', host: ownAddress, via: 'ssh' };
    const dispatched = stub([self, remote]);

    await Underpost.wireguard.sync({ cmd: 'echo fleet' });

    expect(dispatched.map(({ host }) => host)).to.deep.equal(['203.0.113.10']);
  });

  it('skips a target that resolved to local execution', async () => {
    const local = { nodeName: 'control', user: '', host: '', via: 'local' };
    const dispatched = stub([local, remote]);

    await Underpost.wireguard.sync({ cmd: 'echo fleet' });

    expect(dispatched).to.have.lengthOf(1);
    expect(dispatched[0].host).to.equal('203.0.113.10');
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
    // The reported case: the control plane and this workstation are both
    // `localhost.localdomain`, so the remote one must still be reached, not skipped.
    const sameName = { nodeName: 'localhost.localdomain', user: 'admin', host: '198.51.100.85', via: 'ssh' };
    const dispatched = stub([sameName]);
    await Underpost.wireguard.sync({ cmd: 'echo fleet' });
    expect(dispatched.map(({ host }) => host)).to.deep.equal(['198.51.100.85']);
  });

  it('publishes an associated deploy private repo before updating remote nodes', async () => {
    const order = [];
    Underpost.repo.getDefaultBranch = () => 'main';
    Underpost.wireguard.syncTargets = () => [remote];
    syncPrivateConfMock.mockImplementation((deployId) => order.push(`publish:${deployId}`));
    Underpost.event.runCommand = async () => {
      order.push('update');
      return { ok: true, output: '' };
    };

    await Underpost.wireguard.sync({ repoEngine: 'fixture-org/engine-test-cyberia' });

    expect(order).to.deep.equal(['publish:dd-cyberia', 'update']);
  });

  it('does not publish a deploy private repo for the base engine, a custom command, or a dry run', async () => {
    const published = [];
    Underpost.repo.getDefaultBranch = () => 'main';
    syncPrivateConfMock.mockImplementation((deployId) => published.push(deployId));
    stub([remote]);

    await Underpost.wireguard.sync({ repoEngine: 'fixture-org/engine' });
    await Underpost.wireguard.sync({ repoEngine: 'fixture-org/engine-cyberia', cmd: 'echo fleet' });
    await Underpost.wireguard.sync({ repoEngine: 'fixture-org/engine-cyberia', dryRun: true });

    expect(published).to.deep.equal([]);
  });
});
