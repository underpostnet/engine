'use strict';

import { expect } from 'chai';
import { vi } from 'vitest';
import UnderpostWireguard from '../../../../src/cli/wireguard.js';

const ACTIONS = [
  'sync',
  'nodeExporter',
  'connectUri',
  'nodeConfig',
  'setup',
  'peerAdd',
  'peerRemove',
  'buildConf',
  'status',
  'reinstall',
  'reset',
  'install',
  'haproxySetup',
  'haproxySync',
  'stop',
  'start',
  'restart',
  'forwardProxyServer',
  'check',
];

// Every action the dispatcher can run, replaced by a recording double.
const actionsFactory = (answers = {}) => {
  const ran = [];
  for (const name of ACTIONS)
    vi.spyOn(UnderpostWireguard.API, name).mockImplementation((options) => {
      ran.push(name);
      return answers[name]?.(options);
    });
  return ran;
};

describe('wireguard command dispatch', () => {
  const exitCode = process.exitCode;
  let log;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = exitCode;
  });

  it('runs a fleet sync, or a fleet command, and fails the process when a node failed', async () => {
    const fleet = {
      ok: false,
      nodes: [
        { ok: true, nodeName: 'hub', via: 'ssh' },
        { ok: false, nodeName: 'spoke', via: 'ssh' },
      ],
    };
    const ran = actionsFactory({ sync: async () => fleet, nodeExporter: async () => ({ ok: true, nodes: [] }) });
    await UnderpostWireguard.API.callback({ sync: true, status: true });
    await UnderpostWireguard.API.callback({ cmd: 'uptime' });
    await UnderpostWireguard.API.callback({ nodeExporter: true });
    expect(ran).to.deep.equal(['sync', 'sync', 'nodeExporter']);
    expect(process.exitCode).to.equal(1);
    expect(log.mock.calls.map(([line]) => line).join('\n')).to.include('spoke');
  });

  it('prints one connect command bare, and a fleet listing by node', async () => {
    const single = [{ nodeName: 'hub', uri: 'ssh root@hub', via: 'ssh' }];
    const fleet = [...single, { nodeName: 'self', uri: '', via: 'local' }];
    actionsFactory({ connectUri: (options) => (options.fleet ? fleet : single) });
    await UnderpostWireguard.API.callback({ connectUri: true });
    expect(log).toHaveBeenLastCalledWith('ssh root@hub');
    await UnderpostWireguard.API.callback({ connectUri: true, fleet: true });
    const listing = log.mock.calls.at(-1)[0];
    expect(listing).to.include('hub').and.include('ssh root@hub');
    expect(listing).to.include('# self is this machine (local)');
  });

  it('builds the configuration only, whatever host action is also asked for', async () => {
    let ran = actionsFactory();
    await UnderpostWireguard.API.callback({ buildConf: true, wireguardStart: true, status: true });
    expect(ran).to.deep.equal(['buildConf', 'status']);
    vi.restoreAllMocks();
    ran = actionsFactory();
    await UnderpostWireguard.API.callback({ buildConf: true, wireguardSetup: true, peerAdd: 'a', peerRemove: 'b' });
    expect(ran).to.deep.equal(['setup', 'peerAdd', 'peerRemove']);
  });

  it('renders the node configuration alone, or before the host actions', async () => {
    let ran = actionsFactory();
    await UnderpostWireguard.API.callback({ nodeConfig: true });
    expect(ran).to.deep.equal(['nodeConfig']);
    vi.restoreAllMocks();
    ran = actionsFactory();
    await UnderpostWireguard.API.callback({ nodeConfig: true, check: true });
    expect(ran).to.deep.equal(['nodeConfig', 'check']);
  });

  it('runs a reinstall or a reset on its own', async () => {
    let ran = actionsFactory();
    await UnderpostWireguard.API.callback({ wireguardReinstall: true, status: true });
    expect(ran).to.deep.equal(['reinstall']);
    vi.restoreAllMocks();
    ran = actionsFactory();
    await UnderpostWireguard.API.callback({ wireguardReset: true, wireguardStart: true });
    expect(ran).to.deep.equal(['reset']);
  });

  it('runs the host actions in the order that works, the forward proxy after the tunnel', async () => {
    let ran = actionsFactory();
    await UnderpostWireguard.API.callback({
      wireguardInstall: true,
      wireguardSetup: true,
      peerAdd: 'a',
      peerRemove: 'b',
      haproxySetup: true,
      haproxySync: true,
      wireguardStop: true,
      wireguardStart: true,
      wireguardRestart: true,
      forwardProxyServer: true,
      check: true,
      status: true,
    });
    expect(ran).to.deep.equal([
      'install',
      'setup',
      'peerAdd',
      'peerRemove',
      'haproxySetup',
      'stop',
      'start',
      'restart',
      'forwardProxyServer',
      'check',
      'status',
    ]);
    vi.restoreAllMocks();
    ran = actionsFactory();
    // A sync of the proxy maps runs only without a full proxy setup.
    await UnderpostWireguard.API.callback({ haproxySync: true });
    expect(ran).to.deep.equal(['haproxySync']);
  });
});
