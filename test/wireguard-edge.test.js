'use strict';

import { expect } from 'chai';
import {
  UNDERPOST_EDGE,
  allowedIpsConflictsFactory,
  backendNameFactory,
  defaultPeerFactory,
  deployListFactory,
  edgeRouteTableFactory,
  edgeStateFactory,
  firewallCommandsFactory,
  haproxyConfFactory,
  haproxyMapsFactory,
  hostProxyEntriesFactory,
  instanceProxyEntriesFactory,
  mergeRouteTablesFactory,
  peerFactory,
  quicForwardCommandsFactory,
  redirectHostFactory,
  wireguardClientConfFactory,
  wireguardServerConfFactory,
  wireguardStatusFactory,
} from '../src/cli/wireguard.js';

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
    it('expands the dd meta id through dd.router', () => {
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
      const commands = firewallCommandsFactory({ role: 'server' }).join('\n');
      for (const port of ['80/tcp', '443/tcp', '443/udp', '51820/udp']) expect(commands).to.include(port);
    });

    // A spoke dials out; it publishes nothing. What it does need is for the
    // tunnel interface to sit in a zone that permits the forwarded traffic.
    it('opens nothing on a spoke beyond trusting the tunnel interface', () => {
      const commands = firewallCommandsFactory({ role: 'client' }).join('\n');
      expect(commands).to.include('--zone=trusted --add-interface=wg0');
      expect(commands).to.not.include('--add-port');
    });

    it('is a no-op where firewalld is not running', () => {
      for (const command of firewallCommandsFactory({ role: 'server' }))
        expect(command).to.include('systemctl is-active --quiet firewalld');
    });

    // A reset that leaves the ports open has not returned the host to zero, and
    // the only way the two directions cannot drift is sharing one rule list.
    it('withdraws exactly the rules it opens, for either role', () => {
      const opened = firewallCommandsFactory({ role: 'server', listenPort: 51821 });
      const withdrawn = firewallCommandsFactory({ role: 'server', listenPort: 51821, remove: true });
      expect(withdrawn).to.have.lengthOf(opened.length);
      expect(withdrawn.join('\n')).to.equal(opened.join('\n').replace(/--add-/g, '--remove-'));
      expect(firewallCommandsFactory({ role: 'client', remove: true }).join('\n')).to.include(
        '--zone=trusted --remove-interface=wg0',
      );
    });
  });

  describe('wireguardStatusFactory', () => {
    // One row per spoke carries both halves of its state: what the registry
    // binds to it, and what the live interface reports — so there is no second
    // command to list peers.
    it('folds link state onto the registry bindings', () => {
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

  describe('registry normalization', () => {
    it('fills the defaults a hand-written registry may omit', () => {
      const peer = peerFactory({ id: 'homelab-a', address: '10.0.0.2' });
      expect(peer.allowedIPs).to.deep.equal(['10.0.0.2/32']);
      expect(peer.hosts).to.deep.equal([]);
      expect(peer.instances).to.deep.equal([]);
      expect(peer.default).to.equal(false);
    });

    // The three routing bindings are the whole registry surface; anything else
    // a hand-edited file carries is not a binding the edge honours.
    it('keeps only the three routing bindings on a peer', () => {
      const peer = peerFactory({ id: 'a', address: '10.0.0.2', clients: ['legacy'], keepalive: 15 });
      expect(Object.keys(peer)).to.deep.equal([
        'id',
        'address',
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

    it('drops registry entries with no id', () => {
      const state = edgeStateFactory({ peers: [{ address: '10.0.0.2' }, { id: 'ok', address: '10.0.0.3' }] });
      expect(state.peers.map((peer) => peer.id)).to.deep.equal(['ok']);
    });

    // A spoke rebuilds its interface from `endpoint` + `hubPublicKey`. Without
    // the second one recorded, re-running the setup — and every --wireguard-
    // reinstall, which ends in one — fails on a flag the operator already gave.
    it('records the hub identity a spoke dials, so its setup is repeatable', () => {
      const state = edgeStateFactory({ role: 'client', endpoint: 'vps.example.com:51820', hubPublicKey: 'HUB=' });
      expect(state.endpoint).to.equal('vps.example.com:51820');
      expect(state.hubPublicKey).to.equal('HUB=');
      expect(edgeStateFactory().hubPublicKey).to.equal('');
    });

    it('falls back to the subsystem defaults for an empty registry', () => {
      const state = edgeStateFactory();
      expect(state.interfaceName).to.equal(UNDERPOST_EDGE.interfaceName);
      expect(state.listenPort).to.equal(UNDERPOST_EDGE.listenPort);
      expect(state.peers).to.deep.equal([]);
    });
  });
});
