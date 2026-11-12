// The privilege model of the LXD commands: the snap, the daemon, systemd and the firewall change the host as
// root through the process boundary; `lxc` runs as the invoking user, whom LXD authorizes; `lxc exec` runs as
// root in the guest, so guest commands carry no sudo. The shell harness stands in for every command and for
// the LXD daemon.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UnderpostLxd from '../../../src/cli/lxd.js';
import Underpost from '../../../src/index.js';
import { privilegedCommand, shellHarness } from '../../support/shell-harness.js';

const elevated = (call) => /^'?sudo'? /.test(call);
const lxcCalls = () => harness.calls.filter((call) => call.startsWith('lxc '));
const hostChanges = () => harness.calls.filter(elevated).map(privilegedCommand);
const instance = (name, status = 'Running', extra = {}) =>
  JSON.stringify([
    { name, status, type: 'virtual-machine', devices: {}, expanded_devices: {}, profiles: ['default'], ...extra },
  ]);
const lists = (name, stdout) => ({
  match: new RegExp(`^lxc (--project \\S+ )?'list' '${name}' '--format' 'json'`),
  stdout,
});
const SOCKET_DENIED =
  'Error: Get "http://unix.socket/1.0": dial unix /var/snap/lxd/common/lxd/unix.socket: connect: permission denied';

let harness;
beforeEach(() => vi.stubEnv('CI', 'true'));
afterEach(() => {
  harness?.restore();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const lxd = (vmId, options) => Underpost.lxd.callback(vmId, { dev: true, ...options });

describe('the LXD host', () => {
  it('installs the snap as root, and nothing elevates again in a root process', async () => {
    harness = shellHarness([{ match: /^snap list$/, stdout: 'Name  Version\ncore  16\n' }]);
    await lxd('', { install: true });
    expect(hostChanges()).toEqual(['snap install lxd']);
    harness.restore();

    harness = shellHarness([{ match: /^snap list$/, stdout: 'Name  Version\ncore  16\n' }], { uid: 0 });
    await lxd('', { install: true });
    expect(harness.calls).toEqual(['snap list', 'snap install lxd']);
  });

  it('starts the daemon as root, reads its status and initializes it as the user', async () => {
    harness = shellHarness([{ match: /'storage' 'list'/, stdout: '[]' }]);
    await lxd('', { init: true });
    expect(hostChanges()).toEqual(["systemctl start 'snap.lxd.daemon'"]);
    expect(harness.calls).toContain('systemctl status snap.lxd.daemon');
    const preseed = harness.calls.indexOf('lxd init --preseed');
    expect(preseed).toBeGreaterThan(-1);
    expect(harness.inputs[preseed]).not.toContain('127.0.0.1');
    expect(lxcCalls().at(-1)).toBe("lxc 'cluster' 'list'");
  });

  it('shuts the daemon down and removes the snap as root on a purge, and keeps the order', async () => {
    harness = shellHarness([
      { match: /^snap list$/, stdout: 'Name  Version\nlxd  5.21\n' },
      { match: /^lxc 'list' '--format' 'json'/, stdout: '[]' },
    ]);
    await lxd('', { purge: true });
    expect(hostChanges()).toEqual(['/snap/bin/lxd shutdown --timeout 60', 'snap remove lxd --purge']);
  });

  it('stops each VM as the user, then shuts the daemon down as root', async () => {
    harness = shellHarness([
      { match: /^snap list$/, stdout: 'Name  Version\nlxd  5.21\n' },
      { match: /^lxc 'list' '--format' 'json'/, stdout: instance('vm1') },
      lists('vm1', instance('vm1')),
      { match: /'exec' 'vm1' '--' 'bash' '-c'/, stdout: 'no\n' },
    ]);
    await lxd('', { shutdown: true });
    expect(lxcCalls()).toContain("lxc 'stop' 'vm1' '--timeout' '60'");
    expect(hostChanges()).toEqual(['/snap/bin/lxd shutdown --timeout 60']);
  });

  it('starts the daemon as root on a restore, then each stopped VM as the user', async () => {
    harness = shellHarness([
      { match: /^snap list$/, stdout: 'Name  Version\nlxd  5.21\n' },
      { match: /^lxc 'list' '--format' 'json'/, stdout: instance('vm1', 'Stopped') },
      lists('vm1', instance('vm1', 'Stopped')),
    ]);
    await lxd('', { restore: true });
    expect(hostChanges()).toEqual(['snap start lxd']);
    expect(lxcCalls()).toContain("lxc 'start' 'vm1'");
  });

  it('resets VMs, the profile and the bridge in order, and leaves the snap', async () => {
    harness = shellHarness([
      { match: /^lxc 'list' '--format' 'json'/, stdout: instance('vm1') },
      lists('vm1', instance('vm1')),
      { match: /'exec' 'vm1' '--' 'bash' '-c'/, stdout: 'no\n' },
      { match: /'profile' 'list'/, stdout: '[{"name":"admin-profile"}]' },
      { match: /'network' 'list'/, stdout: '[{"name":"lxdbr0"}]' },
    ]);
    await lxd('', { reset: true });
    const step = (command) => lxcCalls().indexOf(command);
    const order = [
      "lxc 'stop' 'vm1' '--timeout' '60'",
      "lxc 'delete' 'vm1'",
      "lxc 'profile' 'delete' 'admin-profile'",
      "lxc 'network' 'delete' 'lxdbr0'",
    ].map(step);
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(harness.ran('snap')).toBe(false);
    expect(hostChanges()).toEqual([]);
  });
});

describe('the LXD client', () => {
  it('runs as the user in the selected project, never through sudo', async () => {
    harness = shellHarness([lists('vm1', instance('vm1'))]);
    await lxd('vm1', { vmInfo: true, maasProject: 'k3s-cluster' });
    expect(lxcCalls().length).toBe(4);
    expect(lxcCalls().every((call) => call.startsWith("lxc --project k3s-cluster '"))).toBe(true);
    expect(hostChanges()).toEqual([]);
  });

  it('refuses a project or an instance name that is not an LXD name', async () => {
    harness = shellHarness();
    await expect(lxd('vm1;reboot', { vmInfo: true })).rejects.toThrow("Invalid LXD instance name: 'vm1;reboot'");
    await expect(lxd('vm1', { vmInfo: true, maasProject: 'a b' })).rejects.toThrow("Invalid LXD project name: 'a b'");
    await expect(lxd('', { expose: 'vm1:80;id' })).rejects.toThrow("Invalid port: '80;id'");
    expect(lxcCalls()).toEqual([]);
  });

  it('names the missing authorization when the LXD socket refuses the user, and never elevates lxc', async () => {
    harness = shellHarness([{ match: /^lxc /, code: 1, stderr: SOCKET_DENIED }]);
    await expect(lxd('vm1', { vmInfo: true })).rejects.toThrow(/may not use the LXD daemon/);
    expect(harness.ran('sudo')).toBe(false);
  });

  it('runs guest commands as guest root, with no sudo, when a worker joins', async () => {
    harness = shellHarness([
      lists('worker', instance('worker')),
      lists('control', instance('control')),
      { match: /'exec' 'control' '--' 'cat' '\/var\/lib\/rancher\/k3s\/server\/node-token'/, stdout: 'K10token\n' },
      { match: /'exec' 'control' '--' 'ip' '-4' '-o' 'route'/, stdout: 'default via 10.250.250.1 dev eth0\n' },
      { match: /'exec' 'control' '--' 'ip' '-4' '-o' 'addr'/, stdout: '2: eth0    inet 10.250.250.21/24 brd x\n' },
    ]);
    await lxd('', { joinNode: 'worker,control' });
    expect(harness.ran('sudo')).toBe(false);
    expect(lxcCalls()).toContain(
      "lxc 'exec' 'worker' '--' 'bash' '-s' '--' '--engine-root=/home/dd/engine' '--worker' " +
        "'--control-ip=10.250.250.21' '--token=K10token' < './scripts/k3s-node-setup.sh'",
    );
    const label = lxcCalls().find((call) => call.includes('kubectl label node worker'));
    expect(label).toMatch(/^lxc 'exec' 'control' '--' 'bash' '-c' 'for i in/);
  });
});

describe('the bridge firewall', () => {
  it('creates the bridge as the user and sets missing FORWARD rules as root', async () => {
    harness = shellHarness([
      { match: /'network' 'list'/, stdout: '[]' },
      { match: 'command -v firewall-cmd', code: 1 },
      { match: /iptables -C/, code: 1 },
    ]);
    await lxd('', { createVirtualNetwork: true });
    expect(lxcCalls()[1]).toMatch(/^lxc 'network' 'create' 'lxdbr0' 'ipv4\.dhcp=false' .*'raw\.dnsmasq=port=0'/);
    expect(hostChanges()).toEqual([
      "iptables -C 'FORWARD' '-i' 'lxdbr0' '-j' 'ACCEPT'",
      "iptables -I 'FORWARD' '1' '-i' 'lxdbr0' '-j' 'ACCEPT'",
      "iptables -C 'FORWARD' '-o' 'lxdbr0' '-j' 'ACCEPT'",
      "iptables -I 'FORWARD' '1' '-o' 'lxdbr0' '-j' 'ACCEPT'",
    ]);
  });

  it('keeps an existing FORWARD rule, skips a host without iptables, and fails on a refused insertion', () => {
    harness = shellHarness([{ match: /iptables -C/, code: 0 }]);
    UnderpostLxd._ensureBridgeForwardingAccept('lxdbr0');
    expect(harness.ran('iptables -I')).toBe(false);
    harness.restore();

    harness = shellHarness([{ match: 'command -v iptables', code: 1 }]);
    UnderpostLxd._ensureBridgeForwardingAccept('lxdbr0');
    expect(harness.ran('iptables -C')).toBe(false);
    harness.restore();

    harness = shellHarness([
      { match: /iptables -C/, code: 1 },
      { match: /iptables -I/, code: 4, stderr: "iptables: can't initialize iptables table `filter'" },
    ]);
    expect(() => UnderpostLxd._ensureBridgeForwardingAccept('lxdbr0')).toThrow(/exit=4/);
  });

  it('binds the bridge to the trusted zone once, as root, and fails when firewalld refuses', () => {
    harness = shellHarness([{ match: /--query-interface/, code: 0 }]);
    UnderpostLxd._ensureBridgeInTrustedZone('lxdbr0');
    expect(hostChanges()).toEqual(["firewall-cmd --permanent --zone=trusted --query-interface='lxdbr0'"]);
    harness.restore();

    harness = shellHarness([{ match: /--query-interface/, code: 1 }]);
    UnderpostLxd._ensureBridgeInTrustedZone('lxdbr0');
    expect(hostChanges().slice(1)).toEqual([
      "firewall-cmd --permanent --zone=trusted --add-interface='lxdbr0'",
      'firewall-cmd --reload',
    ]);
    harness.restore();

    harness = shellHarness([
      { match: /--query-interface/, code: 1 },
      { match: /--add-interface/, code: 252, stderr: 'FirewallD is not running' },
    ]);
    expect(() => UnderpostLxd._ensureBridgeInTrustedZone('lxdbr0')).toThrow(/exit=252/);
    expect(harness.ran('--reload')).toBe(false);
    harness.restore();

    harness = shellHarness([{ match: 'command -v firewall-cmd', code: 1 }]);
    UnderpostLxd._ensureBridgeInTrustedZone('lxdbr0');
    expect(harness.ran('--query-interface')).toBe(false);
  });
});
