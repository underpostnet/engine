'use strict';

import { expect } from 'chai';
import { Dns, STATIC_IPV4 } from '../../../../src/server/network/dns.js';
import { shellHarness } from '../../../support/shell-harness.js';

// NetworkManager and systemd are the host boundary: the suite answers `nmcli -t` reads with
// fixture output and asserts the command vector, never the host's real network.
const DEVICE = 'eno1';
const UNIT = `${STATIC_IPV4.unitPrefix}-${DEVICE}`;
const DEVICE_OUTPUT = [
  `GENERAL.CONNECTION:${DEVICE}`,
  'IP4.ADDRESS[1]:192.168.1.85/24',
  'IP4.GATEWAY:192.168.1.1',
  'IP4.DNS[1]:200.28.4.130',
  'IP4.DNS[2]:200.28.4.129',
].join('\n');
const DHCP_PROFILE = 'ipv4.method:auto\nipv4.addresses:\nipv4.gateway:\nipv4.dns:\n';
const STATIC_PROFILE =
  'ipv4.method:manual\nipv4.addresses:192.168.1.85/24\nipv4.gateway:192.168.1.1\nipv4.dns:200.28.4.130,200.28.4.129\n';

const binding = (profile = {}) => ({
  device: DEVICE,
  connection: DEVICE,
  live: { addresses: ['192.168.1.85/24'], gateway: '192.168.1.1', dns: ['200.28.4.130', '200.28.4.129'] },
  profile: { method: 'auto', addresses: [], gateway: '', dns: [], ...profile },
});
const PINNED = binding({
  method: 'manual',
  addresses: ['192.168.1.85/24'],
  gateway: '192.168.1.1',
  dns: ['200.28.4.130', '200.28.4.129'],
});

describe('static IPv4 binding', () => {
  let harness;

  afterEach(() => {
    harness?.restore();
    harness = undefined;
    vi.restoreAllMocks();
  });

  describe('readIpv4Binding', () => {
    it('reads the live binding and its profile from terse nmcli output, in any field order', () => {
      harness = shellHarness([
        { match: 'device show', stdout: `${DEVICE_OUTPUT}\n` },
        { match: 'connection show', stdout: STATIC_PROFILE.split('\n').reverse().join('\n') },
      ]);
      expect(Dns.readIpv4Binding(DEVICE)).to.deep.equal(PINNED);
    });

    it('reports no connection for an interface NetworkManager does not manage', () => {
      harness = shellHarness([{ match: 'device show', stdout: 'GENERAL.CONNECTION:\n' }]);
      expect(Dns.readIpv4Binding(DEVICE).connection).to.equal('');
      expect(harness.ran('connection show')).to.equal(false);
    });
  });

  describe('staticIpv4PlanFactory', () => {
    it('pins the live lease and reverts to the exact previous profile', () => {
      const plan = Dns.staticIpv4PlanFactory(binding());
      expect(plan).to.include({ supported: true, changed: true, unit: UNIT });
      expect(plan.commands.apply).to.include("ipv4.method manual ipv4.addresses '\\''192.168.1.85/24'\\''");
      expect(plan.commands.apply).to.include("ipv4.dns '\\''200.28.4.130,200.28.4.129'\\''");
      expect(plan.commands.revert).to.include('ipv4.method auto');
      expect(plan.commands.arm).to.include(`--unit=${UNIT} --on-active=${STATIC_IPV4.revertSeconds}s`);
      expect(plan.commands.arm).to.not.include('--wait');
      expect(plan.commands.disarm).to.equal(`sudo systemctl stop ${UNIT}.timer`);
    });

    // `reapply` changes the running interface without a link drop, so the SSH session survives.
    it('applies the profile in place before it falls back to a reactivation', () => {
      expect(Dns.staticIpv4PlanFactory(binding()).commands.apply).to.include(
        "nmcli device reapply '\\''eno1'\\'' || nmcli connection up '\\''eno1'\\''",
      );
    });

    it('restores a previous static profile rather than DHCP', () => {
      const plan = Dns.staticIpv4PlanFactory(binding({ method: 'manual', addresses: ['192.168.1.9/24'] }));
      expect(plan.changed).to.equal(true);
      expect(plan.commands.revert).to.include("ipv4.method manual ipv4.addresses '\\''192.168.1.9/24'\\''");
    });

    it('changes nothing when the profile already pins the live binding', () => {
      expect(Dns.staticIpv4PlanFactory(PINNED).changed).to.equal(false);
    });

    it('refuses an unmanaged interface and a binding with no gateway', () => {
      expect(Dns.staticIpv4PlanFactory({ ...binding(), connection: '' })).to.include({ supported: false });
      const gatewayless = binding();
      gatewayless.live.gateway = '';
      expect(Dns.staticIpv4PlanFactory(gatewayless).reason).to.include('no IPv4 address and default gateway');
    });
  });

  describe('ensureStaticIpv4', () => {
    const pending = (code) => ({ match: `is-active --quiet ${UNIT}.timer`, code });
    const reads = (...bindings) => {
      const spy = vi.spyOn(Dns, 'readIpv4Binding');
      for (const entry of bindings) spy.mockReturnValueOnce(entry);
      return spy;
    };

    beforeEach(() => {
      vi.spyOn(Dns, 'isInternetConnection').mockResolvedValue(true);
      vi.spyOn(Dns, 'getMainInterfaceMac').mockReturnValue('aa:bb:cc:dd:ee:ff');
    });

    it('arms the revert, pins the binding, verifies it and disarms the revert', async () => {
      harness = shellHarness([pending(3)]);
      reads(binding(), PINNED);
      const plan = await Dns.ensureStaticIpv4({ timeoutMs: 0 });
      expect(plan.changed).to.equal(true);
      const order = ['systemd-run', 'ipv4.method manual', `stop ${UNIT}.timer`].map((match) =>
        harness.calls.findIndex((command) => command.includes(match)),
      );
      expect(order).to.deep.equal([...order].sort((left, right) => left - right));
      expect(order.every((index) => index >= 0)).to.equal(true);
      expect(
        harness.ran((command) => command.startsWith('sudo sh -c') && command.includes('ipv4.method auto')),
      ).to.equal(false);
    });

    it('reverts at once when the interface does not hold the pinned binding', async () => {
      harness = shellHarness([pending(3)]);
      reads(binding(), { ...binding(), live: { addresses: [], gateway: '', dns: [] } });
      await expect(Dns.ensureStaticIpv4({ timeoutMs: 0 })).rejects.toThrow('reverted to its previous IPv4 profile');
      expect(harness.calls.filter((command) => command.startsWith('sudo sh -c')).pop()).to.include('ipv4.method auto');
      expect(harness.ran(`stop ${UNIT}.timer`)).to.equal(true);
    });

    it('reverts when name resolution stops working after the change', async () => {
      harness = shellHarness([pending(3)]);
      reads(binding(), PINNED);
      Dns.isInternetConnection.mockResolvedValueOnce(true).mockResolvedValue(false);
      await expect(Dns.ensureStaticIpv4({ timeoutMs: 0 })).rejects.toThrow('name resolution stopped working');
    });

    it('reverts when NetworkManager refuses the profile', async () => {
      harness = shellHarness([pending(3), { match: 'ipv4.method manual', code: 1 }]);
      reads(binding());
      await expect(Dns.ensureStaticIpv4({ timeoutMs: 0 })).rejects.toThrow('reverted');
      expect(
        harness.ran((command) => command.startsWith('sudo sh -c') && command.includes('ipv4.method auto')),
      ).to.equal(true);
    });

    it('refuses to start while an earlier revert is still pending', async () => {
      harness = shellHarness([pending(0)]);
      reads(binding());
      await expect(Dns.ensureStaticIpv4()).rejects.toThrow('is pending');
      expect(harness.ran('nmcli connection modify')).to.equal(false);
    });

    it('prints the commands and touches nothing under a dry run', async () => {
      harness = shellHarness();
      reads(binding());
      await Dns.ensureStaticIpv4({ dryRun: true });
      expect(harness.calls).to.deep.equal([]);
    });

    it('leaves a pinned or unmanaged interface alone', async () => {
      harness = shellHarness();
      reads(PINNED, { ...binding(), connection: '' });
      expect((await Dns.ensureStaticIpv4()).changed).to.equal(false);
      expect((await Dns.ensureStaticIpv4()).supported).to.equal(false);
      expect(harness.calls).to.deep.equal([]);
    });

    it('is reached through the ip command', async () => {
      const ensure = vi.spyOn(Dns, 'ensureStaticIpv4').mockResolvedValue({ supported: false });
      await Dns.ipDispatcher('', { staticIpv4: true, dryRun: true });
      expect(ensure.mock.calls[0][0]).to.deep.equal({ dryRun: true });
    });
  });
});
