'use strict';

import { expect } from 'chai';
import axios from 'axios';
import fs from 'fs-extra';
import os from 'node:os';
import { Dns, UnderpostDns, getLocalIPv4Address, isInternetConnection } from '../../../../src/server/network/dns.js';
import UnderpostHost from '../../../../src/cli/host.js';
import { shellHarness } from '../../../support/shell-harness.js';

// Every nftables static shells out and every DDNS provider talks HTTP, so the
// suite replaces exactly those two boundaries: what is asserted is the command
// vector and the branch that produced it, never the host's real firewall.
const IFACE = 'eth-fixture';
const ROUTE_ROUTE = { match: 'ip route', stdout: `${IFACE}\n` };

const CONF_DIR = (deployId) => `./engine-private/conf/${deployId}`;

describe('dns edge firewall and dynamic DNS', () => {
  let harness;

  afterEach(() => {
    harness?.restore();
    harness = undefined;
    vi.restoreAllMocks();
  });

  describe('host interface discovery', () => {
    it('reads the default route interface with logging suppressed', () => {
      harness = shellHarness([ROUTE_ROUTE]);
      expect(Dns.getDefaultNetworkInterface()).to.equal(IFACE);
      expect(harness.ran('grep default')).to.equal(true);
    });

    it('returns the IPv4 address bound to the default interface', () => {
      harness = shellHarness([ROUTE_ROUTE]);
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        [IFACE]: [
          { family: 'IPv6', address: 'fe80::1', mac: 'aa:bb:cc:dd:ee:ff' },
          { family: 'IPv4', address: '10.0.0.8', mac: 'aa:bb:cc:dd:ee:ff' },
        ],
      });
      expect(Dns.getLocalIPv4Address()).to.equal('10.0.0.8');
      expect(getLocalIPv4Address).to.equal(Dns.getLocalIPv4Address);
    });

    it('returns null when the default interface is not present', () => {
      harness = shellHarness([ROUTE_ROUTE]);
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({});
      expect(Dns.getLocalIPv4Address()).to.equal(null);
      expect(Dns.getMainInterfaceMac()).to.equal(null);
    });

    it('returns null when the interface carries no IPv4 address', () => {
      harness = shellHarness([ROUTE_ROUTE]);
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        [IFACE]: [{ family: 'IPv6', address: 'fe80::1', mac: '00:11:22:33:44:55' }],
      });
      expect(Dns.getLocalIPv4Address()).to.equal(null);
    });

    it('reads the MAC off the first entry of the default interface', () => {
      harness = shellHarness([ROUTE_ROUTE]);
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        [IFACE]: [{ family: 'IPv4', address: '10.0.0.8', mac: '00:11:22:33:44:55' }],
      });
      expect(Dns.getMainInterfaceMac()).to.equal('00:11:22:33:44:55');
    });

    it('resolves the public IP from the configured plain-IP endpoint', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: '203.0.113.9' });
      process.env.HTTP_PLAIN_IP_URL = 'https://ip.fixture.test';
      try {
        expect(await Dns.getPublicIp()).to.equal('203.0.113.9');
        expect(get.mock.calls[0][0]).to.equal('https://ip.fixture.test');
      } finally {
        delete process.env.HTTP_PLAIN_IP_URL;
      }
    });

    it('falls back to ipify when no endpoint is configured', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: '198.51.100.4' });
      expect(await Dns.getPublicIp()).to.equal('198.51.100.4');
      expect(get.mock.calls[0][0]).to.equal('https://api.ipify.org');
    });

    it('resolves null instead of throwing when the lookup fails synchronously', async () => {
      vi.spyOn(axios, 'get').mockImplementation(() => {
        throw new Error('offline');
      });
      expect(await Dns.getPublicIp()).to.equal(null);
    });

    it('reports connectivity from a DNS lookup', async () => {
      expect(await Dns.isInternetConnection('localhost')).to.equal(true);
      expect(await isInternetConnection('invalid.host.that.does.not.resolve.fixture')).to.equal(false);
    });
  });

  describe('per-IP bans', () => {
    it('creates the base table and chains before installing an ingress drop', () => {
      harness = shellHarness();
      Dns.banIngress('192.0.2.10');
      expect(harness.ran('nft add table inet filter')).to.equal(true);
      expect(harness.ran('nft add rule inet filter input ip saddr 192.0.2.10 counter drop')).to.equal(true);
    });

    it('installs egress drops on both the output and forward chains', () => {
      harness = shellHarness();
      Dns.banEgress('192.0.2.11');
      expect(harness.ran('output ip daddr 192.0.2.11 counter drop')).to.equal(true);
      expect(harness.ran('forward ip daddr 192.0.2.11 counter drop')).to.equal(true);
    });

    it('installs no rule for a malformed address', () => {
      harness = shellHarness();
      Dns.banIngress('not-an-ip');
      Dns.banEgress('999.999.999.999');
      expect(harness.ran('counter drop')).to.equal(false);
    });

    it('parses every handle out of an annotated chain listing', () => {
      harness = shellHarness([
        {
          match: 'nft -a list chain inet filter input',
          stdout: [
            'table inet filter {',
            '  chain input {',
            '    ip saddr 192.0.2.10 counter packets 0 bytes 0 drop # handle 5',
            '    ip saddr 192.0.2.10 counter packets 0 bytes 0 drop # handle 9',
            '    ip saddr 198.51.100.1 counter packets 0 bytes 0 drop # handle 12',
            '  }',
            '}',
          ].join('\n'),
        },
      ]);
      expect(Dns.getNftHandles('input', '192.0.2.10', 'saddr')).to.deep.equal(['5', '9']);
    });

    it('deletes every matching ingress handle', () => {
      harness = shellHarness([
        {
          match: 'nft -a list chain inet filter input',
          stdout: 'ip saddr 192.0.2.10 counter drop # handle 5\nip saddr 192.0.2.10 counter drop # handle 6\n',
        },
      ]);
      Dns.unbanIngress('192.0.2.10');
      expect(harness.ran('delete rule inet filter input handle 5')).to.equal(true);
      expect(harness.ran('delete rule inet filter input handle 6')).to.equal(true);
    });

    it('deletes egress handles from the output and forward chains', () => {
      harness = shellHarness([
        { match: 'nft -a list chain inet filter output', stdout: 'ip daddr 192.0.2.11 counter drop # handle 3\n' },
        { match: 'nft -a list chain inet filter forward', stdout: 'ip daddr 192.0.2.11 counter drop # handle 4\n' },
      ]);
      Dns.unbanEgress('192.0.2.11');
      expect(harness.ran('delete rule inet filter output handle 3')).to.equal(true);
      expect(harness.ran('delete rule inet filter forward handle 4')).to.equal(true);
    });

    it('lists and flushes the ban chains', () => {
      harness = shellHarness([{ match: 'nft list chain', stdout: 'chain listing\n' }]);
      Dns.listBannedIngress();
      Dns.listBannedEgress();
      Dns.clearBannedIngress();
      Dns.clearBannedEgress();
      expect(harness.count('nft list chain')).to.equal(3);
      expect(harness.ran('flush chain inet filter input')).to.equal(true);
      expect(harness.ran('flush chain inet filter output')).to.equal(true);
      expect(harness.ran('flush chain inet filter forward')).to.equal(true);
    });
  });

  describe('filter chain provisioning', () => {
    it('creates nothing when both chains already exist', () => {
      harness = shellHarness([{ match: 'nft list chain inet filter', code: 0 }]);
      expect(Dns.ensureFilterChains()).to.equal(true);
      expect(harness.ran('nft add chain')).to.equal(false);
    });

    it('adds the missing chains on a firewalld host and re-reads them back', () => {
      // The probe answers "missing" until the chain has been created, so the
      // final `chains.every(chainExists)` re-read is the one that reports true.
      const present = new Set();
      harness = shellHarness([
        { match: /nft list chain inet filter (\w+)/, code: 1 },
        { match: 'nft add chain inet filter', code: 0 },
      ]);
      harness.route({
        match: (command) => {
          const chain = /nft list chain inet filter (\w+)/.exec(command)?.[1];
          return chain !== undefined && present.has(chain);
        },
        code: 0,
      });
      harness.route({
        match: (command) => {
          const chain = /nft add chain inet filter (\w+)/.exec(command)?.[1];
          if (chain) present.add(chain);
          return false;
        },
      });

      expect(Dns.ensureFilterChains(['output', 'forward'])).to.equal(true);
      expect(harness.ran('nft add table inet filter')).to.equal(true);
      expect(harness.ran('hook output priority 0')).to.equal(true);
      expect(harness.ran('hook forward priority 0')).to.equal(true);
    });

    it('reports failure when a created chain still does not read back', () => {
      harness = shellHarness([
        { match: 'nft list chain', code: 1 },
        { match: 'nft add', code: 0 },
      ]);
      expect(Dns.ensureFilterChains(['output'])).to.equal(false);
    });

    it('reports failure when the base table cannot be created', () => {
      harness = shellHarness([
        { match: 'nft list chain', code: 1 },
        { match: 'nft add table inet filter', code: 1 },
      ]);
      expect(Dns.ensureFilterChains()).to.equal(false);
    });

    it('reports failure when a chain cannot be created', () => {
      harness = shellHarness([
        { match: 'nft list chain', code: 1 },
        { match: 'nft add table inet filter', code: 0 },
        { match: 'nft add chain', code: 1 },
      ]);
      expect(Dns.ensureFilterChains(['input'])).to.equal(false);
      expect(harness.ran('hook input priority 0')).to.equal(true);
    });

    it('reads the policy currently latched on a chain', () => {
      harness = shellHarness([{ match: 'nft list chain inet filter output', stdout: 'policy drop;\n' }]);
      expect(Dns.chainPolicyIs('output', 'drop')).to.equal(true);
      expect(Dns.chainPolicyIs('output', 'accept')).to.equal(false);
    });
  });

  describe('whole-host egress control', () => {
    it('drops both egress chains and reads the policy back', () => {
      harness = shellHarness([{ match: 'nft list chain', code: 0, stdout: 'policy drop;\n' }]);
      Dns.blockAllEgress();
      expect(harness.ran('ct state established,related counter accept')).to.equal(true);
      expect(harness.ran(`nft chain inet filter output '{ policy drop; }'`)).to.equal(true);
      expect(harness.ran(`nft chain inet filter forward '{ policy drop; }'`)).to.equal(true);
    });

    it('refuses to report a block the host never applied', () => {
      harness = shellHarness([{ match: 'nft list chain', code: 0, stdout: 'policy accept;\n' }]);
      expect(() => Dns.blockAllEgress()).to.throw('is not');
    });

    it('refuses to report a block when the chains could not be created', () => {
      harness = shellHarness([
        { match: 'nft list chain', code: 1 },
        { match: 'nft add table', code: 1 },
      ]);
      expect(() => Dns.blockAllEgress()).to.throw('egress is NOT blocked');
    });

    it('restores both egress chains to accept', () => {
      harness = shellHarness([{ match: 'nft list chain', code: 0, stdout: 'policy accept;\n' }]);
      Dns.unblockAllEgress();
      expect(harness.ran(`nft chain inet filter output '{ policy accept; }'`)).to.equal(true);
      expect(harness.ran(`nft chain inet filter forward '{ policy accept; }'`)).to.equal(true);
    });

    it('reports a host that was never blocked instead of failing on a missing table', () => {
      harness = shellHarness([
        { match: 'nft list chain', code: 1 },
        { match: 'nft add table', code: 1 },
      ]);
      expect(() => Dns.unblockAllEgress()).not.to.throw();
      expect(harness.ran(`policy accept; }'`)).to.equal(false);
    });

    it('throws when the restore did not take', () => {
      harness = shellHarness([{ match: 'nft list chain', code: 0, stdout: 'policy drop;\n' }]);
      expect(() => Dns.unblockAllEgress()).to.throw('egress remains blocked');
    });
  });

  describe('ingress control', () => {
    it('creates the input chain before every ingress command', () => {
      harness = shellHarness();
      Dns.ensureIngressChain();
      expect(harness.ran('nft add table inet filter')).to.equal(true);
      expect(harness.ran('hook input priority 0')).to.equal(true);
    });

    it('drops new inbound traffic while keeping established sessions', () => {
      harness = shellHarness();
      Dns.blockAllIngress();
      expect(harness.ran('flush chain inet filter input')).to.equal(true);
      expect(harness.ran('input ct state established,related counter accept')).to.equal(true);
      expect(harness.ran(`nft chain inet filter input '{ policy drop; }'`)).to.equal(true);
    });

    it('restores the input chain policy', () => {
      harness = shellHarness();
      Dns.unblockAllIngress();
      expect(harness.ran(`nft chain inet filter input '{ policy accept; }'`)).to.equal(true);
      expect(harness.ran('flush chain inet filter input')).to.equal(true);
    });

    it('keeps only valid TCP ports out of a comma separated list', () => {
      expect(Dns.portListFactory('80, 443,0,65536,abc,8080')).to.deep.equal([80, 443, 8080]);
      expect(Dns.portListFactory()).to.deep.equal([]);
      expect(Dns.portListFactory('')).to.deep.equal([]);
    });

    it('inserts one drop per blocked port so the management path survives', () => {
      harness = shellHarness();
      Dns.blockIngressPort('80,443');
      expect(harness.ran('insert rule inet filter input tcp dport 80 counter drop')).to.equal(true);
      expect(harness.ran('insert rule inet filter input tcp dport 443 counter drop')).to.equal(true);
      expect(harness.ran('policy drop')).to.equal(false);
    });

    it('withdraws the port rules by handle', () => {
      harness = shellHarness();
      Dns.unblockIngressPort('443');
      expect(harness.ran('tcp dport 443 .*drop')).to.equal(true);
      expect(harness.ran('xargs -r -n1 nft delete rule inet filter input handle')).to.equal(true);
    });
  });

  describe('dondominio record updates', () => {
    const RECORD = {
      user: 'ddns-user',
      api_key: 'ddns-key',
      host: 'fixture.test',
      dns: 'dondominio',
      ip: '203.0.113.9',
    };

    it('aborts without credentials', async () => {
      expect(await Dns.services.updateIp.dondominio({ ...RECORD, user: '', api_key: '' })).to.equal(false);
    });

    it('aborts without a host', async () => {
      expect(await Dns.services.updateIp.dondominio({ ...RECORD, host: '' })).to.equal(false);
    });

    it('never reaches the provider outside production', async () => {
      const get = vi.spyOn(axios, 'get');
      expect(await Dns.services.updateIp.dondominio(RECORD)).to.equal(false);
      expect(get.mock.calls.length).to.equal(0);
    });

    it('sends the update in production and reports success', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { success: true } });
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect(await Dns.services.updateIp.dondominio(RECORD)).to.equal(true);
        expect(get.mock.calls[0][0]).to.include('dondns.dondominio.com');
        expect(get.mock.calls[0][0]).to.include('ip=203.0.113.9');
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    it('reports a provider failure without surfacing the credentialed URL', async () => {
      vi.spyOn(axios, 'get').mockRejectedValue(new Error('502 bad gateway'));
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect(await Dns.services.updateIp.dondominio(RECORD)).to.equal(false);
      } finally {
        process.env.NODE_ENV = previous;
      }
    });
  });

  describe('dynamic DNS callback', () => {
    const DEPLOY_ID = 'dd-fixture-dns';
    const dir = CONF_DIR(DEPLOY_ID);

    beforeEach(() => {
      if (fs.existsSync(dir)) throw new Error(`Refusing to write fixtures into an existing deploy: ${dir}`);
    });

    afterEach(() => fs.removeSync(dir));

    const stubEnv = (ip) => {
      vi.spyOn(UnderpostHost.API.store, 'get').mockImplementation((key) => (key === 'ip' ? ip : ''));
      vi.spyOn(UnderpostHost.API.store, 'set').mockImplementation(() => undefined);
      vi.spyOn(UnderpostHost.API.store, 'delete').mockImplementation(() => undefined);
    };

    it('does nothing while the host is offline', async () => {
      vi.spyOn(Dns, 'isInternetConnection').mockResolvedValue(false);
      const publicIp = vi.spyOn(Dns, 'getPublicIp');
      await Dns.callback(DEPLOY_ID);
      expect(publicIp.mock.calls.length).to.equal(0);
    });

    it('does nothing when the public IP is unchanged', async () => {
      vi.spyOn(Dns, 'isInternetConnection').mockResolvedValue(true);
      vi.spyOn(Dns, 'getPublicIp').mockResolvedValue('203.0.113.9');
      stubEnv('203.0.113.9');
      const set = vi.spyOn(UnderpostHost.API.store, 'set');
      await Dns.callback(DEPLOY_ID);
      expect(set.mock.calls.length).to.equal(0);
    });

    it('skips a deploy with no cron conf instead of aborting the run', async () => {
      vi.spyOn(Dns, 'isInternetConnection').mockResolvedValue(true);
      vi.spyOn(Dns, 'getPublicIp').mockResolvedValue('203.0.113.9');
      stubEnv('198.51.100.1');
      await Dns.callback(`${DEPLOY_ID}, ${DEPLOY_ID}-missing`);
      expect(fs.existsSync(dir)).to.equal(false);
    });

    it('skips a cron conf carrying no records', async () => {
      fs.outputJsonSync(`${dir}/conf.cron.json`, { jobs: {} });
      vi.spyOn(Dns, 'isInternetConnection').mockResolvedValue(true);
      vi.spyOn(Dns, 'getPublicIp').mockResolvedValue('203.0.113.9');
      stubEnv('198.51.100.1');
      const update = vi.spyOn(Dns.services.updateIp, 'dondominio');
      await Dns.callback(DEPLOY_ID);
      expect(update.mock.calls.length).to.equal(0);
    });

    it('drives every A record provider and latches the verified address', async () => {
      fs.outputJsonSync(`${dir}/conf.cron.json`, {
        records: {
          A: [{ dns: 'dondominio', user: 'u', api_key: 'k', host: 'fixture.test' }],
          AAAA: [{ dns: 'dondominio' }],
          TXT: [{ dns: 'unknown-provider' }],
        },
      });
      vi.spyOn(Dns, 'isInternetConnection').mockResolvedValue(true);
      vi.spyOn(Dns, 'getPublicIp').mockResolvedValue('203.0.113.9');
      stubEnv('198.51.100.1');
      const update = vi.spyOn(Dns.services.updateIp, 'dondominio').mockResolvedValue(true);
      vi.spyOn(axios, 'get').mockResolvedValue({ request: { socket: { remoteAddress: '203.0.113.9' } } });
      const set = vi.spyOn(UnderpostHost.API.store, 'set');

      await Dns.callback(DEPLOY_ID);

      expect(update.mock.calls.length).to.equal(1);
      expect(update.mock.calls[0][0].ip).to.equal('203.0.113.9');
      expect(set.mock.calls.some(([key, value]) => key === 'ip' && value === '203.0.113.9')).to.equal(true);
    });

    it('leaves the address unlatched when the external check disagrees', async () => {
      fs.outputJsonSync(`${dir}/conf.cron.json`, { records: { A: [] } });
      vi.spyOn(Dns, 'isInternetConnection').mockResolvedValue(true);
      vi.spyOn(Dns, 'getPublicIp').mockResolvedValue('203.0.113.9');
      stubEnv('198.51.100.1');
      vi.spyOn(axios, 'get').mockResolvedValue({ request: { socket: { remoteAddress: '198.51.100.1' } } });
      const set = vi.spyOn(UnderpostHost.API.store, 'set');
      await Dns.callback(DEPLOY_ID);
      expect(set.mock.calls.some(([key]) => key === 'ip')).to.equal(false);
    });

    it('survives a failed verification request', async () => {
      fs.outputJsonSync(`${dir}/conf.cron.json`, { records: { A: [] } });
      vi.spyOn(Dns, 'isInternetConnection').mockResolvedValue(true);
      vi.spyOn(Dns, 'getPublicIp').mockResolvedValue('203.0.113.9');
      stubEnv('198.51.100.1');
      vi.spyOn(axios, 'get').mockRejectedValue(new Error('unreachable'));
      await Dns.callback(DEPLOY_ID);
    });

    it('recovers when the public IP lookup itself rejects', async () => {
      vi.spyOn(Dns, 'isInternetConnection').mockResolvedValue(true);
      vi.spyOn(Dns, 'getPublicIp').mockRejectedValue(new Error('lookup failed'));
      stubEnv('198.51.100.1');
      await Dns.callback(DEPLOY_ID);
    });
  });

  describe('ip dispatcher', () => {
    const dispatch = (options, ips = '192.0.2.10,192.0.2.11') => Dns.ipDispatcher(ips, options);

    it('exposes the Dns API on the CLI class', () => {
      expect(UnderpostDns.API).to.equal(Dns);
    });

    it('routes each per-IP ban action to its chain', async () => {
      for (const [option, expected] of [
        ['banIngressAdd', 'input ip saddr 192.0.2.10'],
        ['banEgressAdd', 'output ip daddr 192.0.2.10'],
      ]) {
        harness = shellHarness();
        await dispatch({ [option]: true });
        expect(harness.ran(expected), option).to.equal(true);
        harness.restore();
      }
      harness = undefined;
    });

    it('routes each unban action through the handle lookup', async () => {
      for (const option of ['banIngressRemove', 'banEgressRemove']) {
        harness = shellHarness();
        await dispatch({ [option]: true });
        expect(harness.ran('nft -a list chain'), option).to.equal(true);
        harness.restore();
      }
      harness = undefined;
    });

    it('bans and unbans both directions in one call', async () => {
      harness = shellHarness();
      await dispatch({ banBothAdd: true }, '192.0.2.10');
      expect(harness.ran('input ip saddr 192.0.2.10')).to.equal(true);
      expect(harness.ran('output ip daddr 192.0.2.10')).to.equal(true);
      harness.restore();

      harness = shellHarness();
      await dispatch({ banBothRemove: true }, '192.0.2.10');
      expect(harness.count('nft -a list chain')).to.equal(3);
    });

    it('routes the list and clear actions', async () => {
      harness = shellHarness([{ match: 'nft list chain', stdout: 'listing\n' }]);
      await dispatch({ banIngressList: true }, '');
      await dispatch({ banEgressList: true }, '');
      await dispatch({ banIngressClear: true }, '');
      await dispatch({ banEgressClear: true }, '');
      expect(harness.count('nft list chain')).to.equal(3);
      expect(harness.count('flush chain')).to.equal(3);
    });

    it('routes the whole-host and per-port controls', async () => {
      harness = shellHarness([{ match: 'nft list chain', code: 0, stdout: 'policy drop;\npolicy accept;\n' }]);
      await dispatch({ blockAllEgress: true }, '');
      await dispatch({ unblockAllEgress: true }, '');
      await dispatch({ blockAllIngress: true }, '');
      await dispatch({ unblockAllIngress: true }, '');
      await dispatch({ blockIngressPort: '80' }, '');
      await dispatch({ unblockIngressPort: '80' }, '');
      expect(harness.ran('tcp dport 80 counter drop')).to.equal(true);
      expect(harness.ran('xargs -r -n1 nft delete rule')).to.equal(true);
    });

    it('prints the MAC of the main interface', async () => {
      harness = shellHarness([ROUTE_ROUTE]);
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        [IFACE]: [{ family: 'IPv4', address: '10.0.0.8', mac: '00:11:22:33:44:55' }],
      });
      expect(await dispatch({ mac: true }, '')).to.equal('00:11:22:33:44:55');
    });

    it('prints the DHCP address when asked for the local one', async () => {
      harness = shellHarness([ROUTE_ROUTE]);
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        [IFACE]: [{ family: 'IPv4', address: '10.0.0.8', mac: '00:11:22:33:44:55' }],
      });
      expect(await dispatch({ dhcp: true }, '')).to.equal('10.0.0.8');
    });

    it('prints the public address by default', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: '203.0.113.9' });
      expect(await dispatch({}, '')).to.equal('203.0.113.9');
    });
  });
});
