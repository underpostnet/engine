'use strict';

import { expect } from 'chai';
import http from 'node:http';
import net from 'node:net';
import Underpost from '../../../../src/index.js';
import {
  FORWARD_PROXY,
  fetchViaForwardProxy,
  forwardProxyAuthorizedFactory,
  forwardProxyCommandFactory,
  forwardProxyConfigFactory,
  forwardProxyConnectHandlerFactory,
  forwardProxyHeadersFactory,
  forwardProxyNodeCandidatesFactory,
  forwardProxyNodeProbeCommandFactory,
  forwardProxyRequestHandlerFactory,
  forwardProxyServiceCommandsFactory,
  forwardProxyStartProbeCommandFactory,
  forwardProxyTargetFactory,
  forwardProxyTunnelTargetFactory,
  forwardProxyUnitFactory,
} from '../../../../src/server/forward-proxy.js';
import { ShellExecError, redactCredentials } from '../../../../src/server/process.js';
import { probeGroupsFactory, prometheusConfFactory } from '../../../../src/server/monitoring.js';
import fs from 'node:fs';
import { Dns } from '../../../../src/server/dns.js';
import { homeDirectoryPathFactory } from '../../../../src/server/systemd.js';
import UnderpostWireguard, {
  ENGINE_SYNC_STEPS,
  UNDERPOST_EDGE,
  localPeerFactory,
  allowedIpsConflictsFactory,
  assertEdgeIdentity,
  backendNameFactory,
  defaultPeerFactory,
  deployListFactory,
  edgeContextFactory,
  edgeRouteTableFactory,
  endpointHostFactory,
  firewallCommandsFactory,
  haproxyConfFactory,
  haproxyMapsFactory,
  hostProxyEntriesFactory,
  hubFactory,
  instanceProxyEntriesFactory,
  mergeRouteTablesFactory,
  nodeIdentityFactory,
  nodeNameCandidatesFactory,
  peerFactory,
  quicForwardCommandsFactory,
  redirectHostFactory,
  topologyFactory,
  tunnelAddressFactory,
  tunnelNetworkCidrFactory,
  unregisteredPeersFactory,
  wireguardClientConfFactory,
  wireguardHealthFactory,
  wireguardServerConfFactory,
  wireguardStatusFactory,
} from '../../../../src/cli/wireguard.js';

// The conf shape the PRD names: two published sites, each fronted by a bare
// domain that only redirects to its `www` host.
const CONF_SERVER = {
  'dogmadual.com': {
    '/': {
      client: null,
      runtime: 'nodejs',
      apis: [],
      origins: [],
      proxy: [80, 443],
      redirect: 'https://www.dogmadual.com',
    },
  },
  'www.dogmadual.com': {
    '/': { client: 'dogmadual', runtime: 'nodejs', apis: ['user', 'file'], ws: 'core', peer: true, proxy: [80, 443] },
  },
  'nexodev.org': {
    '/': {
      client: null,
      runtime: 'nodejs',
      apis: [],
      origins: [],
      proxy: [80, 443],
      redirect: 'https://www.nexodev.org',
    },
  },
  'www.nexodev.org': {
    '/': { client: 'nexodev', runtime: 'nodejs', apis: ['default', 'user'], ws: 'core', peer: true, proxy: [80, 443] },
  },
};

const INSTANCES = [
  { id: 'mmo-server', templateId: 'mmo-server', host: 'server.cyberiaonline.com', path: '/' },
  { id: 'mmo-server-forest', templateId: 'mmo-server', host: 'server.cyberiaonline.com', path: '/FOREST' },
  { id: 'mmo-client', templateId: 'mmo-client', host: 'client.cyberiaonline.com', path: '/' },
];

const PEERS = [
  {
    id: 'homelab-a',
    address: '10.0.0.2',
    publicKey: 'AAA=',
    hosts: ['www.dogmadual.com'],
    allowedIPs: ['10.0.0.2/32', '192.168.10.0/24'],
  },
  { id: 'homelab-b', address: '10.0.0.3', publicKey: 'BBB=', hosts: ['www.nexodev.org'], instances: ['mmo-server'] },
];

describe('edge hub routing', () => {
  describe('hostProxyEntriesFactory', () => {
    it('extracts every domain that declares proxy ports, with its redirect target', () => {
      expect(hostProxyEntriesFactory({ confServer: CONF_SERVER })).to.deep.equal([
        { host: 'dogmadual.com', ports: [80, 443], redirects: ['www.dogmadual.com'] },
        { host: 'nexodev.org', ports: [80, 443], redirects: ['www.nexodev.org'] },
        { host: 'www.dogmadual.com', ports: [80, 443], redirects: [] },
        { host: 'www.nexodev.org', ports: [80, 443], redirects: [] },
      ]);
    });

    // The `proxy` array is the declaration that a hostname is reachable from
    // outside; without one the host is internal and must not reach the edge.
    it('skips a host whose sub-paths declare no proxy ports', () => {
      const entries = hostProxyEntriesFactory({
        confServer: { 'internal.test': { '/': { client: 'x' } }, 'public.test': { '/': { proxy: [443] } } },
      });
      expect(entries.map((entry) => entry.host)).to.deep.equal(['public.test']);
    });

    it('unions ports across sub-paths, because the edge routes a hostname rather than a path', () => {
      const [entry] = hostProxyEntriesFactory({
        confServer: { 'app.test': { '/': { proxy: [443] }, '/api': { proxy: [80, 443] } } },
      });
      expect(entry.ports).to.deep.equal([80, 443]);
    });

    it('reads a redirect target whether it is a URL or a bare hostname', () => {
      expect(redirectHostFactory('https://www.nexodev.org/path')).to.equal('www.nexodev.org');
      expect(redirectHostFactory('www.nexodev.org')).to.equal('www.nexodev.org');
      expect(redirectHostFactory('')).to.equal('');
      expect(redirectHostFactory('::not a url::')).to.equal('');
    });
  });

  describe('instanceProxyEntriesFactory', () => {
    it('collapses a variant family onto one hostname reachable by id and by template id', () => {
      expect(instanceProxyEntriesFactory({ instances: INSTANCES })).to.deep.equal([
        { host: 'client.cyberiaonline.com', ports: [80, 443], instances: ['mmo-client'] },
        {
          host: 'server.cyberiaonline.com',
          ports: [80, 443],
          instances: ['mmo-server', 'mmo-server-forest'],
        },
      ]);
    });
  });

  describe('edgeRouteTableFactory', () => {
    it('resolves each published hostname to the spoke its binding names, redirects included', () => {
      const { routes, unresolved } = edgeRouteTableFactory({ confServer: CONF_SERVER, peers: PEERS });
      expect(unresolved).to.deep.equal([]);
      expect(routes).to.deep.equal([
        { host: 'dogmadual.com', ports: [80, 443], peerId: 'homelab-a', address: '10.0.0.2', via: 'redirect' },
        { host: 'nexodev.org', ports: [80, 443], peerId: 'homelab-b', address: '10.0.0.3', via: 'redirect' },
        { host: 'www.dogmadual.com', ports: [80, 443], peerId: 'homelab-a', address: '10.0.0.2', via: 'host' },
        { host: 'www.nexodev.org', ports: [80, 443], peerId: 'homelab-b', address: '10.0.0.3', via: 'host' },
      ]);
    });

    it('resolves instance hostnames through the template id, covering every variant', () => {
      const { routes } = edgeRouteTableFactory({ instances: INSTANCES, peers: PEERS });
      const server = routes.find((route) => route.host === 'server.cyberiaonline.com');
      expect(server).to.include({ peerId: 'homelab-b', via: 'instance' });
    });

    it('prefers an explicit hostname binding over the instance binding', () => {
      const { routes } = edgeRouteTableFactory({
        instances: INSTANCES,
        peers: [
          ...PEERS,
          { id: 'homelab-c', address: '10.0.0.4', publicKey: 'CCC=', hosts: ['server.cyberiaonline.com'] },
        ],
      });
      expect(routes.find((route) => route.host === 'server.cyberiaonline.com')).to.include({
        peerId: 'homelab-c',
        via: 'host',
      });
    });

    it('sends an unmatched hostname to the default spoke', () => {
      const { routes, unresolved } = edgeRouteTableFactory({
        confServer: { 'orphan.test': { '/': { proxy: [443] } } },
        peers: [...PEERS, { id: 'fallback', address: '10.0.0.9', publicKey: 'DDD=', default: true }],
      });
      expect(unresolved).to.deep.equal([]);
      expect(routes).to.deep.equal([
        { host: 'orphan.test', ports: [443], peerId: 'fallback', address: '10.0.0.9', via: 'default' },
      ]);
    });

    it('treats a lone spoke as its own fallback', () => {
      const { routes } = edgeRouteTableFactory({
        confServer: { 'orphan.test': { '/': { proxy: [443] } } },
        peers: [{ id: 'only', address: '10.0.0.2', publicKey: 'AAA=' }],
      });
      expect(routes[0]).to.include({ peerId: 'only', via: 'default' });
    });

    // A dropped hostname answers nothing at all, and nothing about the deploy
    // reveals it — so an unbindable host is reported instead.
    it('reports a hostname that binds to nothing rather than dropping it', () => {
      const { routes, unresolved } = edgeRouteTableFactory({
        confServer: { 'orphan.test': { '/': { proxy: [443] } } },
        peers: PEERS,
      });
      expect(routes).to.deep.equal([]);
      expect(unresolved).to.deep.equal(['orphan.test']);
    });

    it('does not loop on redirects that point at each other', () => {
      const { routes, unresolved } = edgeRouteTableFactory({
        confServer: {
          'a.test': { '/': { proxy: [443], redirect: 'https://b.test' } },
          'b.test': { '/': { proxy: [443], redirect: 'https://a.test' } },
        },
        peers: PEERS,
      });
      expect(routes).to.deep.equal([]);
      expect(unresolved).to.deep.equal(['a.test', 'b.test']);
    });

    it('merges a hostname declared by both conf.server.json and an instance', () => {
      const { routes } = edgeRouteTableFactory({
        confServer: { 'server.cyberiaonline.com': { '/': { proxy: [443] } } },
        instances: INSTANCES,
        peers: PEERS,
      });
      const server = routes.find((route) => route.host === 'server.cyberiaonline.com');
      expect(server.ports).to.deep.equal([80, 443]);
      expect(server.via).to.equal('instance');
    });

    it('returns only the peers the routes reference, so no unused backend is emitted', () => {
      const { peers } = edgeRouteTableFactory({
        confServer: { 'www.dogmadual.com': CONF_SERVER['www.dogmadual.com'] },
        peers: PEERS,
      });
      expect(peers.map((peer) => peer.id)).to.deep.equal(['homelab-a']);
    });
  });

  describe('allowedIpsConflictsFactory', () => {
    it('is quiet when every peer claims a distinct CIDR', () => {
      expect(allowedIpsConflictsFactory({ peers: PEERS })).to.deep.equal([]);
    });

    // WireGuard picks one peer by longest-prefix match; the other silently
    // never receives that traffic. Two homelabs on 192.168.1.0/24 is the
    // ordinary way this happens.
    it('reports a LAN subnet two spokes both claim', () => {
      const conflicts = allowedIpsConflictsFactory({
        peers: [
          { id: 'homelab-a', address: '10.0.0.2', allowedIPs: ['10.0.0.2/32', '192.168.1.0/24'] },
          { id: 'homelab-b', address: '10.0.0.3', allowedIPs: ['10.0.0.3/32', '192.168.1.0/24'] },
        ],
      });
      expect(conflicts).to.deep.equal([{ cidr: '192.168.1.0/24', peers: ['homelab-a', 'homelab-b'] }]);
    });

    // An address with no explicit allowedIPs contributes its own /32, so the
    // same pass catches two spokes handed the same tunnel address.
    it('catches a duplicated tunnel address', () => {
      const conflicts = allowedIpsConflictsFactory({
        peers: [
          { id: 'homelab-a', address: '10.0.0.2' },
          { id: 'homelab-b', address: '10.0.0.2' },
        ],
      });
      expect(conflicts).to.deep.equal([{ cidr: '10.0.0.2/32', peers: ['homelab-a', 'homelab-b'] }]);
    });
  });

  // One rule for the catch-all, shared by hostname resolution, the HAProxy
  // default backends and the QUIC forward — so all three name the same spoke.
  describe('defaultPeerFactory', () => {
    it('nominates the peer marked default', () => {
      expect(defaultPeerFactory([...PEERS, { id: 'fallback', address: '10.0.0.9', default: true }]).id).to.equal(
        'fallback',
      );
    });

    it('treats a lone peer as its own fallback', () => {
      expect(defaultPeerFactory([PEERS[0]]).id).to.equal('homelab-a');
    });

    // Picking one arbitrarily would send every unmatched hostname and all of
    // UDP :443 to a spoke nobody nominated.
    it('nominates nothing when several peers exist and none is marked', () => {
      expect(defaultPeerFactory(PEERS)).to.equal(null);
      expect(defaultPeerFactory([])).to.equal(null);
    });
  });

  describe('deployListFactory', () => {
    it('expands the dd meta id through dd.routes', () => {
      const list = deployListFactory('dd');
      expect(list.length).to.be.above(0);
      for (const id of list) expect(id.startsWith('dd-')).to.equal(true);
    });

    // `dd` names every deploy; prefixing it would address a deploy that does
    // not exist and silently route nothing.
    it('never prefixes the dd meta id itself', () => {
      expect(deployListFactory('dd')).to.not.include('dd-dd');
    });

    it('accepts a comma-separated list and normalizes bare ids', () => {
      expect(deployListFactory('dd-core,cyberia')).to.deep.equal(['dd-core', 'dd-cyberia']);
    });

    it('resolves an empty id to no deploys rather than to everything', () => {
      expect(deployListFactory('')).to.deep.equal([]);
    });
  });

  describe('mergeRouteTablesFactory', () => {
    // The edge holds one pair of map files. Publishing one deploy's table alone
    // would overwrite them and take every other deploy off the internet.
    it('unions every deploy into one table, attributing each hostname', () => {
      const { routes } = mergeRouteTablesFactory({
        tables: [
          {
            deployId: 'dd-cyberia',
            routes: [{ host: 'www.cyberiaonline.com', ports: [80, 443], peerId: 'homelab-a', address: '10.0.0.2' }],
          },
          {
            deployId: 'dd-core',
            routes: [{ host: 'www.nexodev.org', ports: [80, 443], peerId: 'homelab-b', address: '10.0.0.3' }],
          },
        ],
      });
      expect(routes.map((route) => [route.host, route.deployId])).to.deep.equal([
        ['www.cyberiaonline.com', 'dd-cyberia'],
        ['www.nexodev.org', 'dd-core'],
      ]);
    });

    it('reports a hostname two deploys claim, and serves the first deterministically', () => {
      const { routes, conflicts } = mergeRouteTablesFactory({
        tables: [
          {
            deployId: 'dd-core',
            routes: [{ host: 'shared.test', ports: [443], peerId: 'homelab-a', address: '10.0.0.2' }],
          },
          {
            deployId: 'dd-test',
            routes: [{ host: 'shared.test', ports: [443], peerId: 'homelab-b', address: '10.0.0.3' }],
          },
        ],
      });
      expect(routes).to.have.lengthOf(1);
      expect(routes[0].peerId).to.equal('homelab-a');
      expect(conflicts).to.deep.equal([{ host: 'shared.test', claimed: ['dd-core', 'dd-test'], serving: 'homelab-a' }]);
    });

    it('does not report a duplicate that both deploys route identically', () => {
      const { conflicts } = mergeRouteTablesFactory({
        tables: [
          {
            deployId: 'dd-core',
            routes: [{ host: 'shared.test', ports: [443], peerId: 'homelab-a', address: '10.0.0.2' }],
          },
          {
            deployId: 'dd-test',
            routes: [{ host: 'shared.test', ports: [443], peerId: 'homelab-a', address: '10.0.0.2' }],
          },
        ],
      });
      expect(conflicts).to.deep.equal([]);
    });

    it('keeps unresolved hostnames attributed to the deploy that declared them', () => {
      const { unresolved } = mergeRouteTablesFactory({
        tables: [
          { deployId: 'dd-core', routes: [], unresolved: ['orphan.test'] },
          { deployId: 'dd-lampp', routes: [], unresolved: ['other.test'] },
        ],
      });
      expect(unresolved).to.deep.equal([
        { host: 'orphan.test', deployId: 'dd-core' },
        { host: 'other.test', deployId: 'dd-lampp' },
      ]);
    });

    it('deduplicates the peers every deploy shares, so one backend is emitted per spoke', () => {
      const { peers } = mergeRouteTablesFactory({
        tables: [
          { deployId: 'dd-core', routes: [], peers: [{ id: 'homelab-a', address: '10.0.0.2' }] },
          { deployId: 'dd-cyberia', routes: [], peers: [{ id: 'homelab-a', address: '10.0.0.2' }] },
        ],
      });
      expect(peers).to.have.lengthOf(1);
    });
  });

  describe('haproxyMapsFactory', () => {
    it('writes one map line per hostname and transport, keyed on the declared ports', () => {
      const { sni, http } = haproxyMapsFactory({
        routes: [
          { host: 'a.test', ports: [80, 443], peerId: 'homelab-a', address: '10.0.0.2' },
          { host: 'b.test', ports: [443], peerId: 'homelab-b', address: '10.0.0.3' },
          { host: 'c.test', ports: [80], peerId: 'homelab-b', address: '10.0.0.3' },
        ],
      });
      expect(sni).to.equal('a.test be_tls_homelab_a\nb.test be_tls_homelab_b\n');
      expect(http).to.equal('a.test be_http_homelab_a\nc.test be_http_homelab_b\n');
    });

    it('renders an empty map rather than a stray newline when nothing is routed', () => {
      expect(haproxyMapsFactory({ routes: [] })).to.deep.equal({ sni: '', http: '' });
    });

    it('keeps peer ids that are not valid proxy names out of the backend names', () => {
      expect(backendNameFactory('tls', 'home lab.a-1')).to.equal('be_tls_home_lab_a_1');
    });
  });

  describe('haproxyConfFactory', () => {
    const conf = haproxyConfFactory({ peers: PEERS.map(peerFactory), defaultPeerId: 'homelab-a' });

    // The whole point of the L4 edge: no certificate, no key, nothing to decrypt.
    it('never terminates TLS', () => {
      expect(conf).to.not.match(/bind\s+.*\bssl\b/);
      expect(conf).to.not.include('crt ');
      expect(conf).to.include('mode tcp');
    });

    it('selects the TLS backend from the ClientHello SNI', () => {
      expect(conf).to.include('tcp-request content accept if { req_ssl_hello_type 1 }');
      expect(conf).to.include(
        `use_backend %[req.ssl_sni,lower,map(${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.sniMapName},be_tls_default)]`,
      );
    });

    it('selects the cleartext backend from the Host header, ignoring an appended port', () => {
      expect(conf).to.include(
        `use_backend %[req.hdr(host),lower,word(1,:),map(${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.httpMapName},be_http_default)]`,
      );
    });

    it('emits both transports for every peer', () => {
      for (const peer of PEERS) {
        expect(conf).to.include(`backend be_http_${peer.id.replace(/-/g, '_')}`);
        expect(conf).to.include(`server ${peer.id} ${peer.address}:443 check`);
      }
    });

    it('points the default backends at the nominated spoke', () => {
      expect(conf).to.include('backend be_tls_default\n  mode tcp\n  server homelab-a 10.0.0.2:443 check');
    });

    it('refuses an unmatched hostname when no spoke is nominated as default', () => {
      const strict = haproxyConfFactory({ peers: [] });
      expect(strict).to.include('http-request deny deny_status 421');
      expect(strict).to.include('tcp-request content reject');
    });

    it('keeps long-lived streams alive past the idle timeouts', () => {
      expect(conf).to.include('timeout tunnel 1h');
    });

    it('hands listening sockets to the incoming process so a reload drops nothing', () => {
      expect(conf).to.include('expose-fd listeners');
    });
  });

  describe('wireguard interface configs', () => {
    const server = wireguardServerConfFactory({
      address: '10.0.0.1/24',
      keyPath: '/etc/wireguard/wg0.key',
      peers: PEERS,
    });

    // No rendered config, dry-run print or log line may ever carry the key.
    it('loads the private key from its own file instead of inlining it', () => {
      expect(server).to.not.include('PrivateKey =');
      expect(server).to.include('PostUp = wg set %i private-key /etc/wireguard/wg0.key');
    });

    it('writes one peer block per registered spoke, carrying its routed subnets', () => {
      expect(server).to.include('PublicKey = AAA=');
      expect(server).to.include('AllowedIPs = 10.0.0.2/32, 192.168.10.0/24');
      // A spoke that declares no subnets still gets its own tunnel address.
      expect(server).to.include('AllowedIPs = 10.0.0.3/32');
    });

    it('skips a peer that has no public key yet', () => {
      const partial = wireguardServerConfFactory({
        address: '10.0.0.1/24',
        keyPath: '/etc/wireguard/wg0.key',
        peers: [{ id: 'pending', address: '10.0.0.5' }],
      });
      expect(partial).to.not.include('[Peer]');
    });

    it('removes its own forwarding rules on teardown', () => {
      expect(server).to.include('PostUp = iptables -I FORWARD -i wg0 -j ACCEPT');
      expect(server).to.include('PostDown = iptables -D FORWARD -i wg0 -j ACCEPT');
    });

    const client = wireguardClientConfFactory({
      address: '10.0.0.2',
      keyPath: '/etc/wireguard/wg0.key',
      publicKey: 'HUB=',
      endpoint: 'vps.example.com:51820',
    });

    // A default route here would send a whole cluster's egress via the VPS.
    it('routes only the tunnel subnet through the hub, never a default route', () => {
      expect(client).to.include('AllowedIPs = 10.0.0.0/24');
      expect(client).to.not.include('0.0.0.0/0');
    });

    it('holds the outbound NAT mapping open across a CGNAT boundary', () => {
      expect(client).to.include(`PersistentKeepalive = ${UNDERPOST_EDGE.keepalive}`);
      expect(UNDERPOST_EDGE.keepalive).to.be.below(30);
    });

    it('gives a bare spoke address a host prefix', () => {
      expect(client).to.include('Address = 10.0.0.2/32');
    });

    it('masquerades pod traffic only when it enters the tunnel', () => {
      expect(client).to.include('PostUp = iptables -t nat -C POSTROUTING -o %i -d 10.0.0.0/24 -j MASQUERADE');
      expect(client).to.not.include('POSTROUTING -o %i -j MASQUERADE');
    });

    it('forwards tunnel requests and established replies for spoke workloads', () => {
      expect(client).to.include('PostUp = iptables -C FORWARD -o %i -d 10.0.0.0/24 -j ACCEPT');
      expect(client).to.include(
        'PostUp = iptables -C FORWARD -i %i -s 10.0.0.0/24 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT',
      );
    });

    it('withdraws every spoke forwarding rule with the interface', () => {
      expect(client).to.include(
        'PostDown = iptables -t nat -D POSTROUTING -o %i -d 10.0.0.0/24 -j MASQUERADE 2>/dev/null || true',
      );
      expect(client).to.include('PostDown = iptables -D FORWARD -o %i -d 10.0.0.0/24 -j ACCEPT');
    });
  });

  describe('quicForwardCommandsFactory', () => {
    const { ensure, remove } = quicForwardCommandsFactory({ target: '10.0.0.2' });

    // Flush-then-refill is what makes a re-run idempotent: no accumulating
    // near-duplicate rules, and no guessing what a previous run installed.
    it('flushes its own chains before adding rules', () => {
      expect(ensure.filter((command) => command.includes('-F UNDERPOST_WG_PRE'))).to.have.lengthOf(1);
      expect(ensure.indexOf('sudo iptables -t nat -F UNDERPOST_WG_PRE')).to.be.below(
        ensure.findIndex((command) => command.includes('DNAT')),
      );
    });

    it('adds the jump rules only when they are missing', () => {
      expect(ensure).to.include(
        'sudo iptables -t nat -C PREROUTING -j UNDERPOST_WG_PRE 2>/dev/null || sudo iptables -t nat -A PREROUTING -j UNDERPOST_WG_PRE',
      );
    });

    it('does not re-DNAT datagrams that already came through the tunnel', () => {
      expect(ensure.find((command) => command.includes('DNAT'))).to.include('! -i wg0');
    });

    it('renders the chains with no rules when there is no spoke to forward to', () => {
      const empty = quicForwardCommandsFactory({});
      expect(empty.ensure.some((command) => command.includes('DNAT'))).to.equal(false);
    });

    it('removes the jump rules before deleting the chains', () => {
      expect(remove.findIndex((command) => command.includes('-D PREROUTING'))).to.be.below(
        remove.findIndex((command) => command.includes('-X UNDERPOST_WG_PRE')),
      );
    });
  });

  describe('firewallCommandsFactory', () => {
    it('opens both transports and the tunnel port on the hub', () => {
      const commands = firewallCommandsFactory({ role: 'hub' }).join('\n');
      for (const port of ['80/tcp', '443/tcp', '443/udp', '51820/udp']) expect(commands).to.include(port);
    });

    // A spoke dials out; it publishes nothing. What it does need is for the
    // tunnel interface to sit in a zone that permits the forwarded traffic.
    it('opens nothing on a spoke beyond trusting the tunnel interface', () => {
      const commands = firewallCommandsFactory({ role: 'control' }).join('\n');
      expect(commands).to.include('--zone=trusted --add-interface=wg0');
      expect(commands).to.not.include('--add-port');
    });

    it('is a no-op where firewalld is not running', () => {
      for (const command of firewallCommandsFactory({ role: 'hub' }))
        expect(command).to.include('systemctl is-active --quiet firewalld');
    });

    // A reset that leaves the ports open has not returned the host to zero, and
    // the only way the two directions cannot drift is sharing one rule list.
    it('withdraws exactly the rules it opens, for either role', () => {
      const opened = firewallCommandsFactory({ role: 'hub', listenPort: 51821 });
      const withdrawn = firewallCommandsFactory({ role: 'hub', listenPort: 51821, remove: true });
      expect(withdrawn).to.have.lengthOf(opened.length);
      expect(withdrawn.join('\n')).to.equal(opened.join('\n').replace(/--add-/g, '--remove-'));
      expect(firewallCommandsFactory({ role: 'worker', remove: true }).join('\n')).to.include(
        '--zone=trusted --remove-interface=wg0',
      );
    });
  });

  describe('wireguardStatusFactory', () => {
    // One row per spoke carries both halves of its state: what topology
    // binds to it, and what the live interface reports — so there is no second
    // command to list peers.
    it('folds link state onto topology bindings', () => {
      const rows = wireguardStatusFactory({
        peers: PEERS,
        latestHandshakes: 'AAA=\t1000\nBBB=\t0',
        transfer: 'AAA=\t2048\t4096',
        endpoints: 'AAA=\t203.0.113.7:51820\nBBB=\t(none)',
        now: 1030,
      });
      expect(rows).to.deep.equal([
        {
          id: 'homelab-a',
          address: '10.0.0.2',
          managementHost: '',
          publicKey: 'AAA=',
          allowedIPs: ['10.0.0.2/32', '192.168.10.0/24'],
          hosts: ['www.dogmadual.com'],
          instances: [],
          default: false,
          endpoint: '203.0.113.7:51820',
          handshakeAgeSeconds: 30,
          rxBytes: 2048,
          txBytes: 4096,
          online: true,
        },
        {
          id: 'homelab-b',
          address: '10.0.0.3',
          managementHost: '',
          publicKey: 'BBB=',
          allowedIPs: ['10.0.0.3/32'],
          hosts: ['www.nexodev.org'],
          instances: ['mmo-server'],
          default: false,
          endpoint: '',
          handshakeAgeSeconds: null,
          rxBytes: 0,
          txBytes: 0,
          online: false,
        },
      ]);
    });

    it('treats a peer past the rekey window as down rather than idle', () => {
      const [row] = wireguardStatusFactory({
        peers: [PEERS[0]],
        latestHandshakes: 'AAA=\t1000',
        now: 1000 + UNDERPOST_EDGE.handshakeStaleSeconds + 1,
      });
      expect(row.online).to.equal(false);
    });
  });

  describe('topology normalization', () => {
    it('fills the defaults hand-written topology may omit', () => {
      const peer = peerFactory({ id: 'homelab-a', address: '10.0.0.2' });
      expect(peer.allowedIPs).to.deep.equal(['10.0.0.2/32']);
      expect(peer.hosts).to.deep.equal([]);
      expect(peer.instances).to.deep.equal([]);
      expect(peer.default).to.equal(false);
    });

    // The three routing bindings are the whole topology surface; anything else
    // a hand-edited file carries is not a binding the edge honours.
    it('keeps only the three routing bindings on a peer', () => {
      const peer = peerFactory({ id: 'a', address: '10.0.0.2', clients: ['legacy'], keepalive: 15 });
      expect(Object.keys(peer)).to.deep.equal([
        'id',
        'address',
        'managementHost',
        'publicKey',
        'allowedIPs',
        'hosts',
        'instances',
        'default',
      ]);
    });

    it('lower-cases bound hostnames so they match the map lookups', () => {
      expect(peerFactory({ id: 'a', address: '10.0.0.2', hosts: ['WWW.Nexodev.ORG'] }).hosts).to.deep.equal([
        'www.nexodev.org',
      ]);
    });

    it('drops topology peers with no id', () => {
      const hub = hubFactory({ peers: [{ address: '10.0.0.2' }, { id: 'ok', address: '10.0.0.3' }] });
      expect(hub.peers.map((peer) => peer.id)).to.deep.equal(['ok']);
    });

    it('keeps machine identity fields out of deployment topology', () => {
      const topology = topologyFactory({
        '64.176.25.136': {
          role: 'hub',
          nodeName: 'vultr',
          peerId: 'wrong',
          peers: [],
        },
      });
      expect(topology['64.176.25.136']).to.not.have.keys('role', 'nodeName', 'peerId');
    });

    it('derives a node runtime context without storing host identity in topology', () => {
      const context = edgeContextFactory({
        topology: {
          '64.176.25.136': {
            publicKey: 'HUB=',
            peers: [{ id: 'homelab-a', address: '10.0.0.2', publicKey: 'SPOKE=' }],
          },
        },
        identity: { nodeName: 'localhost.localdomain', role: 'control', hubHost: '64.176.25.136', peerId: 'homelab-a' },
      });
      expect(context.role).to.equal('control');
      expect(context.peerId).to.equal('homelab-a');
      expect(context.endpoint).to.equal('64.176.25.136:51820');
      expect(context.hubPublicKey).to.equal('HUB=');
    });

    it('keeps management routing separate from tunnel routing', () => {
      const peer = peerFactory({
        id: 'worker-a',
        address: '10.0.0.3',
        managementHost: '192.168.1.191',
      });
      expect(peer.managementHost).to.equal('192.168.1.191');
      expect(peer.allowedIPs).to.deep.equal(['10.0.0.3/32']);
    });

    it('extracts the public host from IPv4, DNS, and IPv6 endpoints', () => {
      expect(endpointHostFactory('64.176.25.136:51820')).to.equal('64.176.25.136');
      expect(endpointHostFactory('edge.example.com:51820')).to.equal('edge.example.com');
      expect(endpointHostFactory('[2001:db8::1]:51820')).to.equal('2001:db8::1');
    });

    it('requires a fresh hub handshake off the hub', () => {
      const context = {
        role: 'control',
        peerId: 'homelab-a',
        address: '10.0.0.2',
        hubPublicKey: 'HUB=',
      };
      expect(
        wireguardHealthFactory({ context, active: 'active', latestHandshakes: 'HUB=\t1000', now: 1030 }).ok,
      ).to.equal(true);
      expect(
        wireguardHealthFactory({ context, active: 'active', latestHandshakes: 'HUB=\t1000', now: 1200 }).ok,
      ).to.equal(false);
    });

    it('requires the default routing peer to reconnect on the hub', () => {
      const context = {
        role: 'hub',
        peers: [
          { id: 'homelab-a', address: '10.0.0.2', publicKey: 'DEFAULT=', default: true },
          { id: 'worker-a', address: '10.0.0.3', publicKey: 'WORKER=' },
        ],
      };
      const disconnected = wireguardHealthFactory({ context, active: 'active', latestHandshakes: '', now: 1030 });
      expect(disconnected).to.include({ ok: false, peerId: 'homelab-a', handshakeAgeSeconds: null });
      const connected = wireguardHealthFactory({
        context,
        active: 'active',
        latestHandshakes: 'DEFAULT=\t1000',
        now: 1030,
      });
      expect(connected).to.include({ ok: true, peerId: 'homelab-a', handshakeAgeSeconds: 30 });
    });

    it('refuses remediation on a different role or peer identity', () => {
      const state = { role: 'control', peerId: 'homelab-a' };
      expect(() => assertEdgeIdentity(state, { expectedRole: 'hub' })).to.throw("expected role 'hub'");
      expect(() => assertEdgeIdentity(state, { expectedRole: 'control', expectedId: 'worker-a' })).to.throw(
        "expected peer 'worker-a'",
      );
      expect(assertEdgeIdentity(state, { expectedRole: 'control', expectedId: 'homelab-a' })).to.deep.equal(state);
    });

    it('normalizes only supported node roles', () => {
      expect(nodeIdentityFactory({ role: 'control' }).role).to.equal('control');
      expect(nodeIdentityFactory({ role: 'invalid' }).role).to.equal('');
    });
  });
});

// The forward proxy is the one outbound path across the tunnel: a spoke's
// request leaves through the hub, so the origin sees the VPS address. Everything
// below runs on loopback with no network egress.
describe('edge hub forward proxy', () => {
  const API_KEY = 'forward-proxy-test-key';

  describe('forwardProxyAuthorizedFactory', () => {
    it('accepts the configured key presented as a bearer token', () => {
      expect(forwardProxyAuthorizedFactory({ header: `Bearer ${API_KEY}`, apiKey: API_KEY })).to.equal(true);
      expect(forwardProxyAuthorizedFactory({ header: `bearer ${API_KEY}`, apiKey: API_KEY })).to.equal(true);
    });

    it('refuses a wrong key, a missing header and a bare key with no scheme', () => {
      expect(forwardProxyAuthorizedFactory({ header: 'Bearer wrong-key', apiKey: API_KEY })).to.equal(false);
      expect(forwardProxyAuthorizedFactory({ apiKey: API_KEY })).to.equal(false);
      expect(forwardProxyAuthorizedFactory({ header: API_KEY, apiKey: API_KEY })).to.equal(false);
      expect(forwardProxyAuthorizedFactory({ header: `Basic ${API_KEY}`, apiKey: API_KEY })).to.equal(false);
    });

    // A server that read an unset key as "no authentication required" would be
    // an open relay on the tunnel, which is the one failure that must not be
    // possible by omission.
    it('authorizes nothing when no key is configured', () => {
      expect(forwardProxyAuthorizedFactory({ header: 'Bearer anything' })).to.equal(false);
      expect(forwardProxyAuthorizedFactory({ header: 'Bearer ', apiKey: '' })).to.equal(false);
      expect(forwardProxyAuthorizedFactory()).to.equal(false);
    });
  });

  describe('forwardProxyTargetFactory', () => {
    it('reads the origin out of an absolute request URI, keeping the query', () => {
      expect(forwardProxyTargetFactory('http://api.vultr.com/v2/plans?per_page=500')).to.deep.equal({
        hostname: 'api.vultr.com',
        port: 80,
        path: '/v2/plans?per_page=500',
        host: 'api.vultr.com',
      });
      expect(forwardProxyTargetFactory('http://origin.test:8080/x')).to.include({ port: 8080 });
    });

    // An https origin arrives as CONNECT. Serving one over the forward path
    // would mean terminating TLS on the hub, which the whole subsystem avoids.
    it('refuses a relative URI and any scheme other than http', () => {
      expect(forwardProxyTargetFactory('/v2/plans')).to.equal(null);
      expect(forwardProxyTargetFactory('https://api.vultr.com/v2/plans')).to.equal(null);
      expect(forwardProxyTargetFactory('')).to.equal(null);
      expect(forwardProxyTargetFactory('http://')).to.equal(null);
    });
  });

  describe('forwardProxyTunnelTargetFactory', () => {
    it('parses a CONNECT authority, defaulting to the https port', () => {
      expect(forwardProxyTunnelTargetFactory('api.vultr.com:443')).to.deep.equal({
        hostname: 'api.vultr.com',
        port: 443,
      });
      expect(forwardProxyTunnelTargetFactory('api.vultr.com')).to.deep.equal({
        hostname: 'api.vultr.com',
        port: UNDERPOST_EDGE.httpsPort,
      });
    });

    it('refuses an authority that is not a bare host and port', () => {
      expect(forwardProxyTunnelTargetFactory('http://api.vultr.com/')).to.equal(null);
      expect(forwardProxyTunnelTargetFactory('user@api.vultr.com:443')).to.equal(null);
      expect(forwardProxyTunnelTargetFactory('api.vultr.com:0')).to.equal(null);
      expect(forwardProxyTunnelTargetFactory('api.vultr.com:https')).to.equal(null);
      expect(forwardProxyTunnelTargetFactory('')).to.equal(null);
    });
  });

  describe('forwardProxyHeadersFactory', () => {
    // Relaying the proxy key onward would hand the hub's credential to every
    // origin a spoke talks to.
    it('drops the hop-by-hop headers, the proxy credential included', () => {
      const headers = forwardProxyHeadersFactory({
        host: 'api.vultr.com',
        authorization: 'Bearer vultr-key',
        'proxy-authorization': `Bearer ${API_KEY}`,
        'Proxy-Connection': 'keep-alive',
        connection: 'close',
        'transfer-encoding': 'chunked',
        upgrade: 'h2c',
      });
      expect(headers).to.deep.equal({ host: 'api.vultr.com', authorization: 'Bearer vultr-key' });
    });
  });

  describe('forwardProxyConfigFactory', () => {
    const saved = { ...process.env };
    afterEach(() => {
      for (const key of Object.values(FORWARD_PROXY.env))
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
    });

    // Asserted against the constants rather than against an unset environment:
    // the factory also reads `./.env` and the underpost root env, which exist on
    // a configured host and would make an "unset" expectation depend on the box
    // the suite runs on.
    it('falls back to the hub tunnel address and the subsystem port', () => {
      expect(tunnelAddressFactory(UNDERPOST_EDGE.cidr)).to.equal('10.0.0.1');
      expect(tunnelAddressFactory('10.0.0.1')).to.equal('10.0.0.1');
      expect(FORWARD_PROXY.port).to.equal(1080);
    });

    it('reads the environment, and lets an explicit endpoint win over it', () => {
      process.env[FORWARD_PROXY.env.host] = '10.0.0.9';
      process.env[FORWARD_PROXY.env.port] = '3128';
      process.env[FORWARD_PROXY.env.apiKey] = API_KEY;
      expect(forwardProxyConfigFactory()).to.deep.equal({ host: '10.0.0.9', port: 3128, apiKey: API_KEY });
      expect(forwardProxyConfigFactory({ host: '10.0.0.1', port: 1080, apiKey: 'other' })).to.deep.equal({
        host: '10.0.0.1',
        port: 1080,
        apiKey: 'other',
      });
    });
  });

  describe('firewallCommandsFactory', () => {
    // The listener binds the tunnel address alone, and the rule narrows the port
    // to the tunnel CIDR on top of that — the port is reachable from nowhere else.
    it('admits the proxy port from the tunnel only, on the hub only', () => {
      const hub = firewallCommandsFactory({ role: 'hub' }).join('\n');
      expect(hub).to.include(
        `--add-rich-rule="rule family=ipv4 source address=${UNDERPOST_EDGE.tunnelCidr} port port=${FORWARD_PROXY.port} protocol=tcp accept"`,
      );
      expect(hub).to.not.include(`--add-port=${FORWARD_PROXY.port}`);
      expect(firewallCommandsFactory({ role: 'control' }).join('\n')).to.not.include('rich-rule');
    });

    it('admits a custom recorded tunnel subnet instead of the default', () => {
      expect(firewallCommandsFactory({ role: 'hub', tunnelCidr: '10.23.0.0/24' }).join('\n')).to.include(
        `source address=10.23.0.0/24 port port=${FORWARD_PROXY.port} protocol=tcp accept`,
      );
      expect(tunnelNetworkCidrFactory('10.23.7.9/20')).to.equal('10.23.0.0/20');
    });
  });

  describe('forwardProxyUnitFactory', () => {
    const unit = () =>
      forwardProxyUnitFactory({
        host: '10.0.0.1',
        port: 1080,
        apiKey: API_KEY,
        interfaceName: 'wg0',
        workingDirectory: '/home/dd/engine',
        user: 'dd',
        command: forwardProxyCommandFactory({
          host: '10.0.0.1',
          port: 1080,
          execPath: '/usr/bin/node',
          scriptPath: '/home/dd/engine/bin/index.js',
        }),
      });

    // The unit runs the same command the operator did, so there is one code path
    // to the listener rather than a second one only systemd takes.
    it('runs this CLI with the resolved host and port, marked as supervised', () => {
      expect(unit()).to.include(
        'ExecStart=/usr/bin/node /home/dd/engine/bin/index.js wireguard --forward-proxy-server ' +
          '--forward-proxy-server-host 10.0.0.1 --forward-proxy-server-port 1080',
      );
      expect(unit()).to.include(`Environment=${FORWARD_PROXY.supervisedEnv}=1`);
      expect(unit()).to.include(`Environment=${FORWARD_PROXY.env.apiKey}=${API_KEY}`);
      expect(unit()).to.include('WorkingDirectory=/home/dd/engine');
      expect(unit()).to.include('User=dd');
    });

    it('carries the host and port the flags resolved into the description and the command', () => {
      const custom = forwardProxyUnitFactory({
        host: '10.0.0.5',
        port: 3128,
        apiKey: API_KEY,
        execPath: '/usr/bin/node',
      });
      expect(custom).to.include('Description=Underpost edge forward proxy on 10.0.0.5:3128');
      expect(custom).to.include('--forward-proxy-server-host 10.0.0.5 --forward-proxy-server-port 3128');
    });

    // The address the proxy binds exists only while the interface is up, so the
    // two units are one lifecycle: the tunnel's stop and restart propagate, and
    // starting the tunnel brings the proxy back.
    it('ties the service to the tunnel unit and always restarts', () => {
      const rendered = forwardProxyUnitFactory({ host: '10.0.0.1', port: 1080, apiKey: API_KEY, interfaceName: 'wg1' });
      expect(rendered).to.include('Requires=wg-quick@wg1.service');
      expect(rendered).to.include('PartOf=wg-quick@wg1.service');
      expect(rendered).to.include('WantedBy=multi-user.target wg-quick@wg1.service');
      expect(rendered).to.include('Restart=always');
      expect(rendered).to.include(`RestartSec=${FORWARD_PROXY.restartSeconds}`);
      // No start-limit window, so a bind that fails while the tunnel comes up
      // retries instead of latching failed.
      expect(rendered).to.include('StartLimitIntervalSec=0');
    });
  });

  describe('forwardProxyNodeCandidatesFactory', () => {
    // The failure this ordering exists for: systemd cannot enter /root, so a unit
    // pointed at an nvm install there restarts on 203/EXEC forever while every
    // ordinary permission check on the binary passes.
    it('prefers a system Node and keeps one under a home directory for last', () => {
      expect(
        forwardProxyNodeCandidatesFactory({ execPath: '/root/.nvm/versions/node/v24.15.0/bin/node' }),
      ).to.deep.equal([...FORWARD_PROXY.nodePaths, '/root/.nvm/versions/node/v24.15.0/bin/node']);
      expect(forwardProxyNodeCandidatesFactory({ execPath: '/home/dd/.nvm/x/bin/node' })).to.deep.equal([
        ...FORWARD_PROXY.nodePaths,
        '/home/dd/.nvm/x/bin/node',
      ]);
    });

    it('puts the running interpreter first when it is not in a home directory, without duplicating it', () => {
      expect(forwardProxyNodeCandidatesFactory({ execPath: '/opt/node/bin/node' })).to.deep.equal([
        '/opt/node/bin/node',
        ...FORWARD_PROXY.nodePaths,
      ]);
      expect(forwardProxyNodeCandidatesFactory({ execPath: '/usr/bin/node' })).to.deep.equal(FORWARD_PROXY.nodePaths);
    });

    it('recognises a home directory path without mistaking a lookalike for one', () => {
      expect(homeDirectoryPathFactory('/root/.nvm/x/node')).to.equal(true);
      expect(homeDirectoryPathFactory('/root')).to.equal(true);
      expect(homeDirectoryPathFactory('/home/dd/engine')).to.equal(true);
      expect(homeDirectoryPathFactory('/usr/bin/node')).to.equal(false);
      expect(homeDirectoryPathFactory('/rootfs/bin/node')).to.equal(false);
      expect(homeDirectoryPathFactory('')).to.equal(false);
    });
  });

  describe('forward proxy start probes', () => {
    // `test -x` passes on a binary systemd still refuses, so the only reliable
    // test is running it through systemd itself, as the unit's own user.
    it('asks systemd whether it can execute the interpreter', () => {
      expect(forwardProxyNodeProbeCommandFactory('/usr/bin/node', 'root')).to.equal(
        'sudo systemd-run --quiet --collect --wait --uid=root --property=Type=oneshot /usr/bin/node --version',
      );
    });

    it('asks the same of the whole entry point, from the working directory the service will use', () => {
      expect(
        forwardProxyStartProbeCommandFactory({
          nodePath: '/usr/bin/node',
          scriptPath: '/opt/underpost/engine/bin',
          user: 'dd',
          workingDirectory: '/opt/underpost/engine',
        }),
      ).to.equal(
        'sudo systemd-run --quiet --collect --wait --uid=dd --property=Type=oneshot ' +
          '--property=WorkingDirectory=/opt/underpost/engine /usr/bin/node /opt/underpost/engine/bin --version',
      );
    });
  });

  describe('forwardProxyServiceCommandsFactory', () => {
    // Re-running the command must not restart a service that is carrying
    // connections, and must not fail because one is already up.
    it('starts an unchanged service without reloading or restarting it', () => {
      const { ensure } = forwardProxyServiceCommandsFactory({ changed: false });
      expect(ensure).to.deep.equal([
        `sudo systemctl enable ${FORWARD_PROXY.serviceName} || true`,
        `sudo systemctl start ${FORWARD_PROXY.serviceName} || true`,
      ]);
      expect(ensure.join('\n')).to.not.include('restart');
      expect(ensure.join('\n')).to.not.include('daemon-reload');
    });

    it('reloads and restarts only when the unit file changed', () => {
      expect(forwardProxyServiceCommandsFactory({ changed: true }).ensure).to.deep.equal([
        'sudo systemctl daemon-reload',
        `sudo systemctl enable ${FORWARD_PROXY.serviceName} || true`,
        `sudo systemctl restart ${FORWARD_PROXY.serviceName} || true`,
      ]);
    });

    it('withdraws the unit it installed, reloading after the removal', () => {
      expect(forwardProxyServiceCommandsFactory().remove).to.deep.equal([
        `sudo systemctl disable --now ${FORWARD_PROXY.serviceName} 2>/dev/null || true`,
        `sudo rm -f ${FORWARD_PROXY.unitPath}`,
        'sudo systemctl daemon-reload',
      ]);
    });
  });

  // Loopback only: an origin, the proxy handlers, and the client that drives
  // them. No name resolution and no egress, so the path is deterministic.
  describe('request and CONNECT relay', () => {
    const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
    const port = (server) => server.address().port;
    const servers = [];
    let origin;
    let proxy;
    let proxyConfig;

    beforeAll(async () => {
      origin = await listen(
        http.createServer((req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({ url: req.url, host: req.headers.host, relayed: req.headers['proxy-authorization'] }),
          );
        }),
      );
      proxy = await listen(http.createServer());
      proxy.on('request', forwardProxyRequestHandlerFactory({ apiKey: API_KEY }));
      proxy.on('connect', forwardProxyConnectHandlerFactory({ apiKey: API_KEY }));
      servers.push(origin, proxy);
      proxyConfig = { host: '127.0.0.1', port: port(proxy), apiKey: API_KEY };
    });

    afterAll(() => {
      for (const server of servers) server.close();
    });

    it('relays an http request and returns the origin answer', async () => {
      const response = await fetchViaForwardProxy(`http://127.0.0.1:${port(origin)}/v2/instances?per_page=500`, {
        proxy: proxyConfig,
        headers: { authorization: 'Bearer vultr-key' },
      });
      expect(response.status).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.url).to.equal('/v2/instances?per_page=500');
      expect(body.host).to.equal(`127.0.0.1:${port(origin)}`);
      expect(body.relayed).to.equal(undefined);
    });

    it('answers 407 to a request with the wrong key, without reaching the origin', async () => {
      const response = await fetchViaForwardProxy(`http://127.0.0.1:${port(origin)}/v2/instances`, {
        proxy: { ...proxyConfig, apiKey: 'wrong-key' },
      });
      expect(response.status).to.equal(407);
      expect(response.headers['proxy-authenticate']).to.include('Bearer');
    });

    it('answers 502 when the origin cannot be reached', async () => {
      const response = await fetchViaForwardProxy('http://127.0.0.1:1/dead', { proxy: proxyConfig });
      expect(response.status).to.equal(502);
    });

    it('rejects an unsupported target scheme before opening any socket', async () => {
      try {
        await fetchViaForwardProxy('ftp://origin.test/file', { proxy: proxyConfig });
        expect.fail('only http: and https: targets are proxyable');
      } catch (error) {
        expect(error.message).to.include('http: and https:');
      }
    });

    // CONNECT carries opaque bytes — TLS in production. A byte-echo origin proves
    // the splice without a certificate, and covers the `head` bytes a client
    // sends before the tunnel is established.
    it('splices a CONNECT tunnel, delivering the bytes sent with the request', async () => {
      const echo = await listen(net.createServer((socket) => socket.pipe(socket)));
      servers.push(echo);
      const tunnelled = await new Promise((resolve, reject) => {
        const request = http.request({
          host: '127.0.0.1',
          port: port(proxy),
          method: 'CONNECT',
          path: `127.0.0.1:${port(echo)}`,
          headers: { 'proxy-authorization': `Bearer ${API_KEY}` },
        });
        request.on('connect', (res, socket) => {
          if (res.statusCode !== 200) return void reject(new Error(`CONNECT refused (${res.statusCode})`));
          let received = '';
          socket.on('data', (chunk) => {
            received += chunk;
            if (received.length >= 6) {
              socket.destroy();
              resolve(received);
            }
          });
          socket.write('tunnel');
        });
        request.on('error', reject);
        request.end();
      });
      expect(tunnelled).to.equal('tunnel');
    });

    it('refuses a CONNECT with the wrong key', async () => {
      const status = await new Promise((resolve, reject) => {
        const request = http.request({
          host: '127.0.0.1',
          port: port(proxy),
          method: 'CONNECT',
          path: '127.0.0.1:443',
          headers: { 'proxy-authorization': 'Bearer wrong-key' },
        });
        request.on('connect', (res, socket) => {
          socket.destroy();
          resolve(res.statusCode);
        });
        // A refused CONNECT never becomes a tunnel, so it arrives as a response.
        request.on('response', (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        request.on('error', reject);
        request.end();
      });
      expect(status).to.equal(407);
    });
  });

  // SSH carries no SNI and no Host, so there is nothing to route it on. The port
  // goes whole to the fallback spoke, exactly as UDP/443 does — it exists so CI,
  // which has no fixed address, can reach a cluster node behind CGNAT.
  describe('ssh forward', () => {
    const SPOKE = [peerFactory({ id: 'homelab-a', address: '10.0.0.2', publicKey: 'AAA=', default: true })];

    it('is closed by default, so no edge exposes SSH it was not told to', () => {
      expect(hubFactory({}).sshForwardPort).to.equal(0);
      expect(hubFactory({ sshForwardPort: 'nonsense' }).sshForwardPort).to.equal(0);
      expect(hubFactory({ sshForwardPort: 2222 }).sshForwardPort).to.equal(2222);
      expect(haproxyConfFactory({ peers: SPOKE, defaultPeerId: 'homelab-a' })).to.not.include('fe_ssh');
    });

    it('binds the public port and sends it whole to the fallback spoke', () => {
      const conf = haproxyConfFactory({ peers: SPOKE, defaultPeerId: 'homelab-a', sshForwardPort: 2222 });
      expect(conf).to.include('frontend fe_ssh');
      expect(conf).to.include('bind :2222');
      expect(conf).to.include('default_backend be_ssh_default');
      expect(conf).to.include(`server homelab-a 10.0.0.2:${UNDERPOST_EDGE.sshPort} check`);
    });

    // The server speaks first in SSH, so waiting on client bytes would stall
    // every connection until the inspect timeout expired.
    it('does not wait for client bytes the way the SNI frontend does', () => {
      const conf = haproxyConfFactory({ peers: SPOKE, defaultPeerId: 'homelab-a', sshForwardPort: 2222 });
      const directives = conf
        .split('frontend fe_ssh')[1]
        .split('\n\n')[0]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      expect(directives).to.include('mode tcp');
      expect(directives.some((line) => line.startsWith('tcp-request'))).to.equal(false);
    });

    // Binding a port with nothing behind it would accept connections only to
    // drop them, which reads as a broken host rather than a closed door.
    it('emits nothing when there is no spoke to forward to', () => {
      expect(haproxyConfFactory({ peers: [], sshForwardPort: 2222 })).to.not.include('fe_ssh');
    });

    it('opens the port publicly, and withdraws it on teardown', () => {
      const opened = firewallCommandsFactory({ role: 'hub', sshForwardPort: 2222 }).join('\n');
      expect(opened).to.include('--add-port=2222/tcp');
      const closed = firewallCommandsFactory({ role: 'hub', sshForwardPort: 2222, remove: true }).join('\n');
      expect(closed).to.include('--remove-port=2222/tcp');
    });

    it('opens no SSH port when none is configured, and never on a spoke', () => {
      expect(firewallCommandsFactory({ role: 'hub' }).join('\n')).to.not.include('2222');
      expect(firewallCommandsFactory({ role: 'worker', sshForwardPort: 2222 }).join('\n')).to.not.include('2222');
    });
  });

  // A spoke is identified by the key it presents, not by the name topology
  // gives it. Reporting the name without the key is what turns "the hub has the
  // wrong key for this machine" into an unanswerable question.
  describe('peer identity in --status', () => {
    it('reports the public key alongside the topology name', () => {
      const [row] = wireguardStatusFactory({
        peers: [{ id: 'homelab-a', address: '10.0.0.2', publicKey: 'w1M+9VHZ=' }],
        latestHandshakes: 'w1M+9VHZ=\t1000',
        now: 1030,
      });
      expect(row.publicKey).to.equal('w1M+9VHZ=');
      expect(row.id).to.equal('homelab-a');
    });

    it('carries the key through the off-box view too', () => {
      const hub = hubFactory({ peers: [{ id: 'a', address: '10.0.0.2', publicKey: 'KEY=' }] });
      expect(hub.peers[0].publicKey).to.equal('KEY=');
    });
  });

  // `wg set` adds a peer and never removes the one it supersedes, so a corrected
  // --peer-add leaves the previous identity on the wire holding its old
  // handshake — invisible to every view that is keyed by topology.
  describe('unregisteredPeersFactory', () => {
    const PEER = { id: 'homelab-a', address: '10.0.0.2', publicKey: 'CURRENT=' };

    it('reports an identity on the wire that topology does not name', () => {
      expect(
        unregisteredPeersFactory({
          peers: [PEER],
          latestHandshakes: 'CURRENT=\t900\nSUPERSEDED=\t500',
          now: 1000,
        }),
      ).to.deep.equal([{ publicKey: 'SUPERSEDED=', handshakeAgeSeconds: 500 }]);
    });

    it('reports a leftover that never handshaked as an unknown age, not as fresh', () => {
      const [row] = unregisteredPeersFactory({ peers: [PEER], latestHandshakes: 'GHOST=\t0', now: 1000 });
      expect(row).to.deep.equal({ publicKey: 'GHOST=', handshakeAgeSeconds: null });
    });

    it('is quiet when the wire matches topology', () => {
      expect(unregisteredPeersFactory({ peers: [PEER], latestHandshakes: 'CURRENT=\t900', now: 1000 })).to.deep.equal(
        [],
      );
      expect(unregisteredPeersFactory({ peers: [PEER], latestHandshakes: '' })).to.deep.equal([]);
    });
  });
});

describe('node document resolution', () => {
  it('prefers the full hostname, then its short name', () => {
    expect(nodeNameCandidatesFactory('vultr.guest')).to.deep.equal(['vultr.guest', 'vultr']);
    expect(nodeNameCandidatesFactory('localhost.localdomain')).to.deep.equal(['localhost.localdomain', 'localhost']);
  });

  it('offers one candidate when the hostname carries no domain', () => {
    expect(nodeNameCandidatesFactory('vultr')).to.deep.equal(['vultr']);
  });

  it('rejects a hostname a node document could not be named after', () => {
    expect(() => nodeNameCandidatesFactory('bad/name')).to.throw('node names may contain only');
  });
});

describe('engine sync', () => {
  const account = process.env.GITHUB_USERNAME;
  let getDefaultBranch;

  beforeEach(() => {
    getDefaultBranch = Underpost.repo.getDefaultBranch;
    Underpost.repo.getDefaultBranch = (repo) => (repo.endsWith('/engine') ? 'master' : 'main');
  });
  afterEach(() => {
    Underpost.repo.getDefaultBranch = getDefaultBranch;
    if (account === undefined) delete process.env.GITHUB_USERNAME;
    else process.env.GITHUB_USERNAME = account;
  });

  it('accepts a slug or a clone URL for the same repository', () => {
    for (const reference of [
      'underpostnet/engine',
      'https://github.com/underpostnet/engine',
      'https://github.com/underpostnet/engine.git',
      'git@github.com:underpostnet/engine.git',
    ])
      expect(Underpost.repo.repoSlugFactory(reference), reference).to.equal('underpostnet/engine');
  });

  it('refuses a reference that names no owner', () => {
    expect(() => Underpost.repo.repoSlugFactory('engine')).to.throw('is not an owner/repo reference');
  });

  it('binds every repository placeholder to the configured account', () => {
    process.env.GITHUB_USERNAME = 'someone';
    const commands = UnderpostWireguard.API.syncCommands().map((step) => step.command);
    expect(commands).to.have.lengthOf(ENGINE_SYNC_STEPS.length);
    expect(commands.join('\n')).to.not.match(/<[a-z-]+>/);
    expect(commands).to.include('underpost cmt --switch-repo someone/engine --target-branch master');
    expect(commands).to.include('underpost pull ./engine-private someone/engine-private');
  });

  it('pulls the named engine while the private repository follows the account', () => {
    process.env.GITHUB_USERNAME = 'someone';
    const commands = UnderpostWireguard.API.syncCommands({
      repoEngine: 'https://github.com/underpostnet/engine.git',
    }).map((step) => step.command);
    expect(commands).to.include('underpost cmt --switch-repo underpostnet/engine --target-branch master');
    expect(commands).to.include('underpost pull ./engine-private someone/engine-private');
  });

  it('names the branch the node must fetch instead of letting it guess', () => {
    process.env.GITHUB_USERNAME = 'someone';
    Underpost.repo.getDefaultBranch = () => 'trunk';
    expect(UnderpostWireguard.API.syncCommands().map((step) => step.command)).to.include(
      'underpost cmt --switch-repo someone/engine --target-branch trunk',
    );
  });

  it('reaches a node once, chaining every declared step in order', () => {
    process.env.GITHUB_USERNAME = 'someone';
    const script = UnderpostWireguard.API.syncScript();
    const commands = UnderpostWireguard.API.syncCommands().map((step) => step.command);
    expect(script.match(/echo '\[sync\] /g) || []).to.have.lengthOf(commands.length);
    expect(script).to.not.include(';\n');
    let cursor = -1;
    for (const command of commands) {
      const at = script.indexOf(`echo '[sync] ${command}'`);
      expect(at, command).to.be.greaterThan(cursor);
      cursor = at;
    }
  });

  it('restarts a running dispatcher, so it stops answering with the code it started with', () => {
    const restart = ENGINE_SYNC_STEPS[ENGINE_SYNC_STEPS.length - 1];
    expect(restart.command).to.include('systemctl restart underpost-event.service');
    expect(restart.command).to.include('is-active --quiet');
    // A node that does not run the dispatcher must not fail its sync over it.
    expect(restart.halt).to.equal(false);
    expect(UnderpostWireguard.API.syncScript()).to.include(`{ ${restart.command} || true; }`);
  });

  it('neutralizes advisory steps in place and chains the rest', () => {
    process.env.GITHUB_USERNAME = 'someone';
    const script = UnderpostWireguard.API.syncScript();
    for (const step of UnderpostWireguard.API.syncCommands())
      expect(script, step.command).to.include(step.halt ? `' && ${step.command}` : `' && { ${step.command} || true; }`);
  });
});

describe('peer locality', () => {
  const addresses = new Set(['192.168.1.85', '10.0.0.2']);

  it('is this machine only when the peer management address is one of its own', () => {
    expect(localPeerFactory('192.168.1.85', addresses)).to.equal(true);
    expect(localPeerFactory(' 192.168.1.85 ', addresses)).to.equal(true);
  });

  it('is remote for a peer that lives on another host sharing this hostname', () => {
    expect(localPeerFactory('192.168.1.191', addresses)).to.equal(false);
  });

  it('fails towards SSH when the peer has no verifiable management address', () => {
    expect(localPeerFactory('', addresses)).to.equal(false);
    expect(localPeerFactory('control-plane.lan', addresses)).to.equal(false);
  });
});

describe('command credential redaction', () => {
  it('masks a token embedded in a clone URL', () => {
    expect(redactCredentials('git fetch --force "https://x-access-token:ghp_secret@github.com/o/r" main')).to.equal(
      'git fetch --force "https://***@github.com/o/r" main',
    );
  });

  it('leaves a URL that carries no credential alone', () => {
    expect(redactCredentials('git remote set-url origin "https://github.com/o/r"')).to.equal(
      'git remote set-url origin "https://github.com/o/r"',
    );
  });

  it('keeps the secret out of the error a failed command throws', () => {
    const error = new ShellExecError('git push https://ghp_secret@github.com/o/r', 128, '', '');
    expect(error.message).to.not.include('ghp_secret');
    expect(error.cmd).to.not.include('ghp_secret');
  });
});

describe('tunnel firewall zone', () => {
  const zoneRule = (role, remove = false) =>
    firewallCommandsFactory({ role, remove }).find((command) => command.includes('-interface=wg0'));

  it('zones the tunnel interface for every role, the hub included', () => {
    for (const role of ['hub', 'control', 'worker'])
      expect(zoneRule(role), role).to.include('--zone=trusted --add-interface=wg0');
  });

  it('withdraws the same interface it added', () => {
    expect(zoneRule('hub', true)).to.include('--zone=trusted --remove-interface=wg0');
  });

  it('keeps the hub public ports without losing the zone', () => {
    const rules = firewallCommandsFactory({ role: 'hub' }).join('\n');
    expect(rules).to.include('--add-port=51820/udp');
    expect(rules).to.include('--add-masquerade');
    expect(rules).to.include('--add-interface=wg0');
  });
});

describe('probe scheduling', () => {
  it('gives each interval its own scrape job so cadences do not merge', () => {
    const groups = probeGroupsFactory([
      { eventId: 'a', module: 'icmp', interval: '30s', targets: ['10.0.0.1'], labels: {} },
      { eventId: 'b', module: 'icmp', interval: '30s', targets: ['10.0.0.3'], labels: {} },
      { eventId: 'c', module: 'http_2xx', interval: '10m', targets: ['https://x/'], labels: {} },
    ]);
    expect(groups.map((group) => `${group.module}@${group.interval}`)).to.deep.equal(['icmp@30s', 'http_2xx@10m']);
    expect(groups[0].groups).to.have.lengthOf(2);
  });

  it('renders the declared interval as the job scrape period', () => {
    const conf = prometheusConfFactory({
      probes: [{ eventId: 'c', module: 'http_2xx', interval: '10m', targets: ['https://x/'], labels: {} }],
    });
    expect(conf).to.include("job_name: 'blackbox-http_2xx'");
    expect(conf).to.include('scrape_interval: 10m');
  });

  it('omits the period when an event declares none, leaving the global default', () => {
    const conf = prometheusConfFactory({
      probes: [{ eventId: 'c', module: 'icmp', interval: '', targets: ['10.0.0.1'], labels: {} }],
    });
    expect(conf).to.not.include('scrape_interval: \n');
  });
});

describe('port-scoped ingress blocking', () => {
  it('keeps only well-formed TCP ports', () => {
    expect(Dns.portListFactory('80,443')).to.deep.equal([80, 443]);
    expect(Dns.portListFactory(' 80 , bad , 443 , 99999 , 0 ')).to.deep.equal([80, 443]);
    expect(Dns.portListFactory('')).to.deep.equal([]);
  });

  it('exposes the block and withdraw entry points the scenario calls', () => {
    for (const method of ['blockIngressPort', 'unblockIngressPort', 'portListFactory'])
      expect(Dns[method], method).to.be.a('function');
  });

  it('creates the chain its rules live in before touching it', () => {
    // `inet filter` exists on a firewalld host with no `input` chain, so every
    // ingress command fails on a table that looks present.
    const source = fs.readFileSync(new URL('../../../../src/server/dns.js', import.meta.url), 'utf8');
    for (const method of ['blockAllIngress', 'unblockAllIngress', 'blockIngressPort', 'unblockIngressPort']) {
      const body = source.slice(source.indexOf(`static ${method}(`));
      expect(body.slice(0, body.indexOf('\n  }')), method).to.include('Dns.ensureIngressChain()');
    }
    expect(Dns.ensureIngressChain).to.be.a('function');
  });

  it('calls the helper on the class that declares it', () => {
    // The class is `Dns`; `UnderpostDns` is the CLI wrapper and carries no such
    // static, so naming it here fails only once the command runs on a host.
    const source = fs.readFileSync(new URL('../../../../src/server/dns.js', import.meta.url), 'utf8');
    expect(source).to.not.include('UnderpostDns.portListFactory');
  });
});
