'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import UnderpostWireguard, {
  EDGE_TOPOLOGY_PATH,
  UNDERPOST_EDGE,
  hostAddressesFactory,
  readEdgeContext,
  readNodeConfigs,
  readTopology,
} from '../../../../src/cli/wireguard.js';
import Underpost from '../../../../src/index.js';
import UnderpostEvent from '../../../../src/cli/event.js';
import UnderpostRepository from '../../../../src/cli/repository.js';
import { FORWARD_PROXY } from '../../../../src/server/network/forward-proxy.js';
import { shellHarness } from '../../../support/shell-harness.js';

// Emitted only when this checkout ships the script it names, so the case needs a tree that
// carries the deploy: the base template restores no deploy id of its own.
const shipsCyberiaPackageScript = fs.existsSync('./deploy/dd-cyberia/package.sh');

const NODES_PATH = './engine-private/deploy/nodes';
const ROUTES_PATH = './engine-private/deploy/dd.routes';

const HUB_HOST = '203.0.113.10';
const TOPOLOGY = {
  [HUB_HOST]: {
    interfaceName: 'wg0',
    listenPort: 51820,
    address: '10.0.0.1/24',
    publicKey: 'hubPublicKeyFixture=',
    sshForwardPort: 2222,
    peers: [
      {
        id: 'control-a',
        address: '10.0.0.2',
        managementHost: '198.51.100.2',
        publicKey: 'peerAPublicKeyFixture=',
        allowedIPs: ['10.0.0.2/32'],
        hosts: ['app.fixture.test'],
        instances: [],
        default: true,
      },
      {
        id: 'worker-b',
        address: '10.0.0.3',
        managementHost: '198.51.100.3',
        publicKey: 'peerBPublicKeyFixture=',
        allowedIPs: ['10.0.0.3/32'],
        hosts: [],
        instances: ['mmo-server'],
        default: false,
      },
    ],
  },
};

// The edge reads its topology and node documents out of the private repository
// and reconciles /etc, iptables and systemd from them. Both are replaced here:
// an in-memory tree for the documents, and the shell harness for the host, so
// what is asserted is the command vector and the files the run would install.
const edgeFixture = ({ files = {}, hostname = 'hub-node' } = {}) => {
  const table = new Map(Object.entries(files));
  const written = new Map();
  const removedDirectories = [];

  const read = (filePath) => {
    const key = `${filePath}`;
    if (written.has(key)) return written.get(key);
    if (table.has(key)) return table.get(key);
    throw Object.assign(new Error(`ENOENT: ${key}`), { code: 'ENOENT' });
  };

  vi.spyOn(os, 'hostname').mockReturnValue(hostname);
  vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
    const key = `${filePath}`;
    if (table.has(key) || written.has(key)) return true;
    return [...table.keys(), ...written.keys()].some((entry) => entry.startsWith(`${key}/`));
  });
  vi.spyOn(fs, 'readFileSync').mockImplementation(read);
  vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => written.set(`${filePath}`, `${value}`));
  vi.spyOn(fs, 'mkdirpSync').mockImplementation((dir) => removedDirectories.push(`${dir}`));
  vi.spyOn(fs, 'removeSync').mockImplementation(() => undefined);
  vi.spyOn(fs, 'readdirSync').mockImplementation((dir) =>
    [...table.keys(), ...written.keys()]
      .filter((filePath) => filePath.startsWith(`${dir}/`))
      .map((filePath) => filePath.slice(`${dir}/`.length))
      .filter((name) => !name.includes('/')),
  );

  return { table, written };
};

const nodeDocument = (identity) => JSON.stringify(identity);

const HUB_IDENTITY_FILES = {
  [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY),
  [`${NODES_PATH}/hub-node.json`]: nodeDocument({ role: 'hub', hubHost: HUB_HOST }),
};

const SPOKE_IDENTITY_FILES = {
  [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY),
  [`${NODES_PATH}/control-node.json`]: nodeDocument({ role: 'control', hubHost: HUB_HOST, peerId: 'control-a' }),
};

describe('edge topology and node documents', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads no topology at all when the private repository is not checked out', () => {
    edgeFixture();
    expect(readTopology()).to.deep.equal({});
    expect(readNodeConfigs()).to.deep.equal([]);
  });

  it('normalizes a hand-edited topology into the canonical shape', () => {
    edgeFixture({ files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify({ [HUB_HOST]: { peers: [{ id: 'a' }, {}] } }) } });
    const hub = readTopology()[HUB_HOST];
    expect(hub.interfaceName).to.equal(UNDERPOST_EDGE.interfaceName);
    expect(hub.listenPort).to.equal(UNDERPOST_EDGE.listenPort);
    expect(hub.address).to.equal(UNDERPOST_EDGE.cidr);
    // An entry with no id names no peer, so it is dropped rather than written
    // back as a nameless one.
    expect(hub.peers.map((peer) => peer.id)).to.deep.equal(['a']);
  });

  // A hostname key would make the hub's endpoint depend on a resolver the
  // spokes reach it before they can query.
  it('refuses a topology keyed by anything but a static IPv4 address', () => {
    edgeFixture({ files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify({ 'hub.fixture.test': {} }) } });
    expect(() => readTopology()).to.throw('must be static IPv4 addresses');
  });

  it('names the file rather than the parser when topology is malformed', () => {
    edgeFixture({ files: { [EDGE_TOPOLOGY_PATH]: '{ not json' } });
    expect(() => readTopology()).to.throw('invalid topology');
  });

  it('resolves this machine to its node document and the hub it belongs to', () => {
    edgeFixture({ files: HUB_IDENTITY_FILES });
    expect(readEdgeContext()).to.include({
      nodeName: 'hub-node',
      role: 'hub',
      hubHost: HUB_HOST,
      address: '10.0.0.1/24',
      publicKey: 'hubPublicKeyFixture=',
      endpoint: `${HUB_HOST}:51820`,
    });
  });

  it('resolves a spoke to its own peer entry and the hub key it dials', () => {
    edgeFixture({ files: SPOKE_IDENTITY_FILES, hostname: 'control-node' });
    expect(readEdgeContext()).to.include({
      role: 'control',
      peerId: 'control-a',
      address: '10.0.0.2',
      publicKey: 'peerAPublicKeyFixture=',
      hubPublicKey: 'hubPublicKeyFixture=',
    });
  });

  // An FQDN is a property of the resolver domain, not of the node.
  it('matches a node document recorded under the short hostname', () => {
    edgeFixture({ files: HUB_IDENTITY_FILES, hostname: 'hub-node.guest' });
    expect(readEdgeContext().nodeName).to.equal('hub-node');
  });

  it('names the command that registers a host with no identity', () => {
    edgeFixture({ files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY) } });
    expect(() => readEdgeContext()).to.throw('--node-config');
  });

  it('refuses an identity pointing at a hub the topology never registered', () => {
    edgeFixture({ files: { [`${NODES_PATH}/hub-node.json`]: nodeDocument({ role: 'hub', hubHost: HUB_HOST }) } });
    expect(() => readEdgeContext()).to.throw('is not registered');
  });

  it('refuses an identity referencing a peer the hub does not carry', () => {
    edgeFixture({
      files: {
        [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY),
        [`${NODES_PATH}/ghost.json`]: nodeDocument({ role: 'worker', hubHost: HUB_HOST, peerId: 'not-a-peer' }),
      },
      hostname: 'ghost',
    });
    expect(() => readEdgeContext()).to.throw('unknown peer');
  });

  it('reads the routable addresses of this machine', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
      eth0: [
        { family: 'IPv4', address: '198.51.100.2', internal: false },
        { family: 'IPv6', address: '::1' },
      ],
    });
    expect([...hostAddressesFactory()]).to.deep.equal(['198.51.100.2']);
  });
});

describe('edge host provisioning', () => {
  let harness;

  beforeEach(() => {
    harness = shellHarness();
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
  });

  describe('install', () => {
    it('refuses a host the subsystem does not target', () => {
      harness.route({ match: 'command -v dnf', code: 1, stdout: '' });
      expect(() => UnderpostWireguard.API.install()).to.throw('targets RHEL 9');
    });

    it('installs only the packages the host is missing', () => {
      harness.route({ match: 'rpm -q', code: 1 });
      harness.route({ match: 'rpm -q wireguard-tools', code: 0 });
      harness.route({ match: 'command -v dnf', code: 0, stdout: '/usr/bin/dnf\n' });
      expect(UnderpostWireguard.API.install()).to.deep.equal(['haproxy', 'iptables']);
      expect(harness.ran('dnf -y install haproxy iptables')).to.equal(true);
      // HAProxy dials backends over the tunnel; without the boolean SELinux
      // refuses the connection and every route answers 503.
      expect(harness.ran('setsebool -P haproxy_connect_any 1')).to.equal(true);
    });

    it('does no work on an already provisioned host', () => {
      harness.route({ match: 'command -v dnf', code: 0, stdout: '/usr/bin/dnf\n' });
      harness.route({ match: 'rpm -q', code: 0 });
      expect(UnderpostWireguard.API.install()).to.deep.equal([]);
      expect(harness.ran('dnf -y install')).to.equal(false);
    });
  });

  describe('key pair', () => {
    it('generates the private half under a restrictive umask and never reads it back', () => {
      harness.route({ match: 'sudo test -s', code: 1 });
      harness.route({ match: 'sudo cat', code: 0, stdout: 'generatedPublicKey=\n' });
      const result = UnderpostWireguard.API.ensureKeyPair('wg0');
      expect(result).to.include({ publicKey: 'generatedPublicKey=', generated: true });
      expect(harness.ran('umask 077 && mkdir -p /etc/wireguard && wg genkey')).to.equal(true);
      expect(harness.ran('chmod 0600 /etc/wireguard/wg0.key')).to.equal(true);
      expect(harness.ran('cat /etc/wireguard/wg0.key')).to.equal(false);
    });

    it('reuses an existing key pair', () => {
      harness.route({ match: 'sudo test -s', code: 0 });
      harness.route({ match: 'sudo cat', code: 0, stdout: 'existingPublicKey=\n' });
      expect(UnderpostWireguard.API.ensureKeyPair('wg0')).to.include({
        publicKey: 'existingPublicKey=',
        generated: false,
      });
      expect(harness.ran('wg genkey')).to.equal(false);
    });

    it('generates nothing under a dry run', () => {
      harness.route({ match: 'sudo test -s', code: 1 });
      expect(UnderpostWireguard.API.ensureKeyPair('wg0', true)).to.include({ publicKey: '', generated: true });
      expect(harness.ran('wg genkey')).to.equal(false);
    });
  });

  describe('node identity', () => {
    it('records the node document for a hub', () => {
      const { written } = edgeFixture({ files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY) } });
      const saved = UnderpostWireguard.API.nodeConfig({ nodeRole: 'hub', hubHost: HUB_HOST });
      expect(saved).to.include({ nodeName: 'hub-node', role: 'hub', hubHost: HUB_HOST });
      expect(JSON.parse(written.get(`${NODES_PATH}/hub-node.json`))).to.deep.equal({
        role: 'hub',
        hubHost: HUB_HOST,
      });
    });

    it('records the peer id a spoke is registered under', () => {
      const { written } = edgeFixture({ files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY) } });
      UnderpostWireguard.API.nodeConfig({ nodeRole: 'worker', hubHost: HUB_HOST, peerId: 'worker-b' });
      expect(JSON.parse(written.get(`${NODES_PATH}/hub-node.json`)).peerId).to.equal('worker-b');
    });

    it('writes nothing under a dry run', () => {
      const { written } = edgeFixture({ files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY) } });
      UnderpostWireguard.API.nodeConfig({ nodeRole: 'hub', hubHost: HUB_HOST, dryRun: true });
      expect(written.size).to.equal(0);
    });

    it('refuses an unknown role, a non-IPv4 hub, and an unregistered hub', () => {
      edgeFixture({ files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY) } });
      expect(() => UnderpostWireguard.API.nodeConfig({ nodeRole: 'edge', hubHost: HUB_HOST })).to.throw(
        '--node-role must be one of',
      );
      expect(() => UnderpostWireguard.API.nodeConfig({ nodeRole: 'hub', hubHost: 'hub.fixture.test' })).to.throw(
        '--hub-host must be the hub static IPv4 address',
      );
      expect(() => UnderpostWireguard.API.nodeConfig({ nodeRole: 'hub', hubHost: '198.51.100.9' })).to.throw(
        'is not registered',
      );
    });

    it('refuses a spoke with no peer id, or one the hub never registered', () => {
      edgeFixture({ files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY) } });
      expect(() => UnderpostWireguard.API.nodeConfig({ nodeRole: 'worker', hubHost: HUB_HOST })).to.throw(
        '--peer-id is required',
      );
      expect(() =>
        UnderpostWireguard.API.nodeConfig({ nodeRole: 'worker', hubHost: HUB_HOST, peerId: 'ghost' }),
      ).to.throw('add it with --peer-add first');
    });

    // Two nodes claiming one identity is what makes a fleet command reach the
    // wrong machine.
    it('refuses an identity another node already holds', () => {
      edgeFixture({
        files: {
          [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY),
          [`${NODES_PATH}/other.json`]: nodeDocument({ role: 'hub', hubHost: HUB_HOST }),
        },
      });
      expect(() => UnderpostWireguard.API.nodeConfig({ nodeRole: 'hub', hubHost: HUB_HOST })).to.throw(
        "is already assigned to node 'other'",
      );

      vi.restoreAllMocks();
      edgeFixture({
        files: {
          [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY),
          [`${NODES_PATH}/other.json`]: nodeDocument({ role: 'worker', hubHost: HUB_HOST, peerId: 'worker-b' }),
        },
      });
      expect(() =>
        UnderpostWireguard.API.nodeConfig({ nodeRole: 'worker', hubHost: HUB_HOST, peerId: 'worker-b' }),
      ).to.throw("peer 'worker-b' is already assigned");
    });
  });

  describe('setup', () => {
    const stubKeyPair = () => {
      harness.route({ match: 'sudo test -s', code: 0 });
      harness.route({ match: 'sudo cat', code: 0, stdout: 'hubPublicKeyFixture=\n' });
    };

    it('installs the hub interface config, forwarding and firewall rules', () => {
      const { written } = edgeFixture({ files: HUB_IDENTITY_FILES });
      stubKeyPair();
      const next = UnderpostWireguard.API.setup({});
      expect(next.role).to.equal('hub');
      expect(harness.ran('install -m 0600 -o root -g root')).to.equal(true);
      expect(harness.ran('echo net.ipv4.ip_forward=1')).to.equal(true);
      expect(harness.ran('sysctl -q --system')).to.equal(true);
      expect(written.has(EDGE_TOPOLOGY_PATH)).to.equal(true);
    });

    it('writes a client config that dials the hub endpoint on a spoke', () => {
      const staged = [];
      edgeFixture({ files: SPOKE_IDENTITY_FILES, hostname: 'control-node' });
      vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => staged.push(`${value}`));
      harness.route({ match: 'sudo test -s', code: 0 });
      harness.route({ match: 'sudo cat', code: 0, stdout: 'peerAPublicKeyFixture=\n' });

      UnderpostWireguard.API.setup({});

      const conf = staged.find((content) => content.includes('[Peer]'));
      expect(conf).to.include(`Endpoint = ${HUB_HOST}:51820`);
      expect(conf).to.include('PublicKey = hubPublicKeyFixture=');
    });

    it('refuses hub-only flags on a spoke', () => {
      edgeFixture({ files: SPOKE_IDENTITY_FILES, hostname: 'control-node' });
      expect(() => UnderpostWireguard.API.setup({ port: 51821 })).to.throw('configure the hub only');
      expect(() => UnderpostWireguard.API.setup({ sshForwardPort: 2222 })).to.throw('configure the hub only');
    });

    it('refuses a hub address with no prefix length', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      stubKeyPair();
      expect(() => UnderpostWireguard.API.setup({ cidr: '10.0.0.1' })).to.throw('must carry a prefix length');
    });

    it('refuses to record a node with no public key', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      harness.route({ match: 'sudo test -s', code: 0 });
      harness.route({ match: 'sudo cat', code: 0, stdout: '' });
      expect(() => UnderpostWireguard.API.setup({})).to.throw('has no WireGuard public key');
    });

    // The config is written idempotently; the running interface is not, so a
    // changed file under a live unit is a divergence that stays silent until the
    // next reboot re-reads it.
    it('reports that a live interface still runs the previous config', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      stubKeyPair();
      harness.route({ match: 'is-active --quiet wg-quick@wg0', code: 0 });
      expect(() => UnderpostWireguard.API.setup({})).not.to.throw();
      expect(harness.ran('is-active --quiet wg-quick@wg0')).to.equal(true);
    });

    it('touches no host under --build-conf', () => {
      const { written } = edgeFixture({ files: HUB_IDENTITY_FILES });
      UnderpostWireguard.API.setup({ buildConf: true, publicKey: 'offHostKey=' });
      expect(harness.calls.length).to.equal(0);
      expect(written.get(EDGE_TOPOLOGY_PATH)).to.include('offHostKey=');
    });
  });

  describe('peer registration', () => {
    it('installs the peer on the live interface and records it', () => {
      const { written } = edgeFixture({ files: HUB_IDENTITY_FILES });
      const hub = UnderpostWireguard.API.peerAdd({
        peerAdd: 'worker-c',
        peerIp: '10.0.0.4',
        publicKey: 'peerCPublicKeyFixture=',
        hosts: 'c.fixture.test',
        managementHost: '198.51.100.4',
      });
      expect(hub.peers.map((peer) => peer.id)).to.deep.equal(['control-a', 'worker-b', 'worker-c']);
      expect(harness.ran('wg set wg0 peer peerCPublicKeyFixture= allowed-ips 10.0.0.4/32')).to.equal(true);
      expect(written.get(EDGE_TOPOLOGY_PATH)).to.include('worker-c');
    });

    // WireGuard identifies a peer by its key, so admitting a new one does not
    // replace the old: the superseded key would keep claiming the same AllowedIPs.
    it('drops the superseded key when a spoke re-keys', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      UnderpostWireguard.API.peerAdd({
        peerAdd: 'worker-b',
        peerIp: '10.0.0.3',
        publicKey: 'rekeyedPublicKey=',
      });
      expect(harness.ran('peer peerBPublicKeyFixture= remove')).to.equal(true);
      expect(harness.ran('peer rekeyedPublicKey= allowed-ips')).to.equal(true);
    });

    it('keeps the bindings a previous registration gave a re-keyed spoke', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      const hub = UnderpostWireguard.API.peerAdd({
        peerAdd: 'worker-b',
        peerIp: '10.0.0.3',
        publicKey: 'rekeyedPublicKey=',
      });
      expect(hub.peers.find((peer) => peer.id === 'worker-b').instances).to.deep.equal(['mmo-server']);
    });

    it('refuses a registration missing an id, an address or a key', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      expect(() => UnderpostWireguard.API.peerAdd({})).to.throw('requires a peer id');
      expect(() => UnderpostWireguard.API.peerAdd({ peerAdd: 'x' })).to.throw('requires --peer-ip');
      expect(() => UnderpostWireguard.API.peerAdd({ peerAdd: 'x', peerIp: '10.0.0.9' })).to.throw(
        'requires --public-key',
      );
    });

    it('refuses a live peer change from anywhere but the hub', () => {
      edgeFixture({ files: SPOKE_IDENTITY_FILES, hostname: 'control-node' });
      expect(() => UnderpostWireguard.API.peerAdd({ peerAdd: 'x', peerIp: '10.0.0.9', publicKey: 'k=' })).to.throw(
        'use --build-conf off-host',
      );
    });

    it('refuses a hub the topology never registered', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      expect(() => UnderpostWireguard.API.peerAdd({ hubHost: '198.51.100.9', peerAdd: 'x' })).to.throw(
        'is not registered',
      );
    });

    it('records a peer off-host without touching the interface', () => {
      const { written } = edgeFixture({ files: HUB_IDENTITY_FILES });
      UnderpostWireguard.API.peerAdd({
        buildConf: true,
        hubHost: HUB_HOST,
        peerAdd: 'worker-c',
        peerIp: '10.0.0.4',
        publicKey: 'k=',
      });
      expect(harness.calls.length).to.equal(0);
      expect(written.get(EDGE_TOPOLOGY_PATH)).to.include('worker-c');
    });

    it('removes a peer from the live interface and from topology', () => {
      const { written } = edgeFixture({ files: HUB_IDENTITY_FILES });
      const hub = UnderpostWireguard.API.peerRemove({ peerRemove: 'worker-b' });
      expect(hub.peers.map((peer) => peer.id)).to.deep.equal(['control-a']);
      expect(harness.ran('peer peerBPublicKeyFixture= remove')).to.equal(true);
      expect(written.get(EDGE_TOPOLOGY_PATH)).not.to.include('worker-b');
    });

    it('reports an unknown peer rather than rewriting the interface', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      expect(UnderpostWireguard.API.peerRemove({ peerRemove: 'ghost' }).peers.length).to.equal(2);
      expect(harness.ran('wg set')).to.equal(false);
    });

    it('refuses a live removal from a spoke', () => {
      edgeFixture({ files: SPOKE_IDENTITY_FILES, hostname: 'control-node' });
      expect(() => UnderpostWireguard.API.peerRemove({ peerRemove: 'worker-b' })).to.throw('--build-conf off-host');
    });

    it('removes a peer off-host without touching the interface', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      UnderpostWireguard.API.peerRemove({ buildConf: true, hubHost: HUB_HOST, peerRemove: 'worker-b' });
      expect(harness.calls.length).to.equal(0);
    });

    it('normalizes topology in place, touching no host', () => {
      const { written } = edgeFixture({
        files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify({ [HUB_HOST]: { peers: [{ id: 'a' }] } }) },
      });
      expect(Object.keys(UnderpostWireguard.API.buildConf())).to.deep.equal([HUB_HOST]);
      expect(written.get(EDGE_TOPOLOGY_PATH)).to.include('"interfaceName": "wg0"');
      expect(harness.calls.length).to.equal(0);
    });

    it('reports the normalization without writing under a dry run', () => {
      const { written } = edgeFixture({ files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY) } });
      UnderpostWireguard.API.buildConf({ dryRun: true });
      expect(written.size).to.equal(0);
    });
  });

  describe('route table', () => {
    const CONF_SERVER = {
      'app.fixture.test': { '/': { client: 'App', proxy: [80, 443] } },
      'other.fixture.test': { '/': { client: 'Other', proxy: [443] } },
    };

    const routeFixture = (files = {}) =>
      edgeFixture({
        files: {
          ...HUB_IDENTITY_FILES,
          [ROUTES_PATH]: 'dd-core',
          './engine-private/conf/dd-core/conf.server.json': JSON.stringify(CONF_SERVER),
          ...files,
        },
      });

    it('resolves each published hostname to the spoke bound to it', () => {
      routeFixture();
      const table = UnderpostWireguard.API.routeTable('dd-core');
      expect(table.deployList).to.deep.equal(['dd-core']);
      expect(table.routes.find((route) => route.host === 'app.fixture.test').peerId).to.equal('control-a');
    });

    it('falls back to the whole route table when no deploy is named', () => {
      routeFixture();
      expect(UnderpostWireguard.API.routeTable().deployList).to.deep.equal(['dd-core']);
    });

    it('skips a routed deploy whose configuration is not checked out', () => {
      routeFixture({ [ROUTES_PATH]: 'dd-core,dd-absent' });
      expect(UnderpostWireguard.API.routeTable('dd').missing).to.deep.equal(['dd-absent']);
    });

    it('binds an instance host through the spoke that declares the instance', () => {
      routeFixture({
        './engine-private/conf/dd-core/conf.instances.json': JSON.stringify([
          { id: 'mmo-server', host: 'game.fixture.test', path: '/' },
        ]),
      });
      const table = UnderpostWireguard.API.routeTable('dd-core');
      expect(table.routes.find((route) => route.host === 'game.fixture.test').peerId).to.equal('worker-b');
    });

    it('refuses a selector that names no deploy at all', () => {
      routeFixture();
      expect(() => UnderpostWireguard.API.routeTable(',,')).to.throw('resolved to no deploys');
    });

    it('refuses when no requested deploy has a readable configuration', () => {
      routeFixture();
      expect(() => UnderpostWireguard.API.routeTable('dd-absent')).to.throw('No readable deploy configuration');
    });
  });

  describe('haproxy publication', () => {
    const routeFixture = (files = {}) =>
      edgeFixture({
        files: {
          ...HUB_IDENTITY_FILES,
          [ROUTES_PATH]: 'dd-core',
          './engine-private/conf/dd-core/conf.server.json': JSON.stringify({
            'app.fixture.test': { '/': { client: 'App', proxy: [80, 443] } },
          }),
          ...files,
        },
      });

    it('validates the candidate config before signalling the running daemon', () => {
      routeFixture();
      harness.route({ match: 'haproxy -c -f', code: 0, stdout: 'Configuration file is valid\n' });
      const result = UnderpostWireguard.API.haproxySync({});
      expect(result.routes.length).to.be.above(0);
      const checkIndex = harness.calls.findIndex((command) => command.includes('haproxy -c -f'));
      const reloadIndex = harness.calls.findIndex((command) => command.includes('reload'));
      expect(checkIndex).to.be.above(-1);
      expect(reloadIndex).to.be.above(checkIndex);
    });

    // A config that does not parse would take the whole edge down on reload.
    it('restores the previous files and fails when HAProxy rejects the candidate', () => {
      routeFixture({
        [`${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.haproxyConfName}`]: 'previous conf\n',
      });
      harness.route({ match: 'haproxy -c -f', code: 1, stdout: 'parsing error on line 3\n' });
      expect(() => UnderpostWireguard.API.haproxySync({})).to.throw('rejected the generated config');
      expect(harness.ran('rm -f /etc/haproxy/domain2backend.map')).to.equal(true);
      expect(harness.ran('reload')).to.equal(false);
    });

    it('publishes nothing and reloads nothing under a dry run', () => {
      routeFixture();
      const result = UnderpostWireguard.API.haproxySync({ dryRun: true });
      expect(result.changed).to.equal(true);
      expect(harness.ran('haproxy -c -f')).to.equal(false);
    });

    it('refuses to publish an edge that would answer every request with a refusal', () => {
      routeFixture({
        [EDGE_TOPOLOGY_PATH]: JSON.stringify({ [HUB_HOST]: { ...TOPOLOGY[HUB_HOST], peers: [] } }),
      });
      expect(() => UnderpostWireguard.API.haproxySync({})).to.throw('No hostname resolved to a spoke');
    });

    it('refuses to publish routing from a spoke', () => {
      edgeFixture({
        files: {
          ...SPOKE_IDENTITY_FILES,
          [ROUTES_PATH]: 'dd-core',
          './engine-private/conf/dd-core/conf.server.json': JSON.stringify({
            'app.fixture.test': { '/': { client: 'App', proxy: [443] } },
          }),
        },
        hostname: 'control-node',
      });
      expect(() => UnderpostWireguard.API.haproxySync({})).to.throw("requires 'haproxy'");
    });

    it('installs, publishes and enables the daemon in one pass', () => {
      routeFixture();
      harness.route({ match: 'command -v dnf', code: 0, stdout: '/usr/bin/dnf\n' });
      harness.route({ match: 'rpm -q', code: 0 });
      harness.route({ match: 'haproxy -c -f', code: 0, stdout: 'Configuration file is valid\n' });
      UnderpostWireguard.API.haproxySetup({});
      expect(harness.ran('systemctl enable --now haproxy')).to.equal(true);
    });
  });

  describe('interface lifecycle', () => {
    it('enables the unit and installs the QUIC forward on a hub', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      UnderpostWireguard.API.start({});
      expect(harness.ran('systemctl enable --now wg-quick@wg0')).to.equal(true);
      expect(harness.ran('10.0.0.2')).to.equal(true);
    });

    it('enables only the unit on a spoke', () => {
      edgeFixture({ files: SPOKE_IDENTITY_FILES, hostname: 'control-node' });
      UnderpostWireguard.API.start({});
      expect(harness.ran('systemctl enable --now wg-quick@wg0')).to.equal(true);
      expect(harness.ran('DNAT')).to.equal(false);
    });

    it('renegotiates a stale but active tunnel', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      UnderpostWireguard.API.restart({});
      expect(harness.ran('systemctl restart wg-quick@wg0')).to.equal(true);
    });

    it('takes the tunnel down and withdraws the rules that only apply while it is up', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      UnderpostWireguard.API.stop({});
      expect(harness.ran('systemctl disable --now wg-quick@wg0')).to.equal(true);
      expect(harness.ran('wg-quick down wg0')).to.equal(true);
    });

    it('reports a healthy interface', () => {
      edgeFixture({ files: SPOKE_IDENTITY_FILES, hostname: 'control-node' });
      harness.route({ match: 'is-active', code: 0, stdout: 'active\n' });
      harness.route({
        match: 'latest-handshakes',
        code: 0,
        stdout: `hubPublicKeyFixture=\t${Math.floor(Date.now() / 1000)}\n`,
      });
      const report = UnderpostWireguard.API.check({ checkTimeout: 0 });
      expect(report.ok).to.equal(true);
    });

    it('fails the run when the interface never becomes healthy', () => {
      const previousExitCode = process.exitCode;
      edgeFixture({ files: SPOKE_IDENTITY_FILES, hostname: 'control-node' });
      harness.route({ match: 'is-active', code: 3, stdout: 'inactive\n' });
      harness.route({ match: 'latest-handshakes', code: 0, stdout: '' });
      try {
        expect(UnderpostWireguard.API.check({ checkTimeout: 0 }).ok).to.equal(false);
        expect(process.exitCode).to.equal(1);
      } finally {
        process.exitCode = previousExitCode;
      }
    });
  });

  describe('reset and reinstall', () => {
    it('withdraws every artifact the setup installed, keeping the key and topology', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      UnderpostWireguard.API.reset({});
      expect(harness.ran('rm -f /etc/wireguard/wg0.conf')).to.equal(true);
      expect(harness.ran(`rm -f ${UNDERPOST_EDGE.sysctlPath}`)).to.equal(true);
      // Deleting the maps while leaving the config that reads them behind makes
      // the daemon fail to start on a config referencing missing files.
      expect(harness.ran('rm -f /etc/haproxy/haproxy.cfg')).to.equal(true);
      expect(harness.ran('rm -f /etc/haproxy/domain2backend.map')).to.equal(true);
      expect(harness.ran('rm -f /etc/wireguard/wg0.key')).to.equal(false);
    });

    it('drops the key pair and re-keys on a reinstall', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      harness.route({ match: 'sudo test -s', code: 0 });
      harness.route({ match: 'sudo cat', code: 0, stdout: 'reKeyedHubKey=\n' });
      UnderpostWireguard.API.reinstall({});
      expect(harness.ran('rm -f /etc/wireguard/wg0.key')).to.equal(true);
      expect(harness.ran('rm -f /etc/wireguard/wg0.pub')).to.equal(true);
      expect(harness.ran('dnf -y reinstall wireguard-tools haproxy iptables')).to.equal(true);
    });
  });

  describe('status', () => {
    it('reports topology and routing without probing the host under --build-conf', () => {
      edgeFixture({
        files: {
          ...HUB_IDENTITY_FILES,
          [ROUTES_PATH]: 'dd-core',
          './engine-private/conf/dd-core/conf.server.json': JSON.stringify({
            'app.fixture.test': { '/': { client: 'App', proxy: [443] } },
          }),
        },
      });
      const summary = UnderpostWireguard.API.status({ buildConf: true });
      expect(summary).to.include({ role: 'hub', nodeName: 'hub-node' });
      expect(summary).not.to.have.property('wireguard');
      expect(summary.routing.deployList).to.deep.equal(['dd-core']);
      expect(harness.calls.length).to.equal(0);
    });

    it('probes both daemons and the live peers on a hub', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      harness.route({ match: 'is-active', code: 0, stdout: 'active\n' });
      harness.route({
        match: 'latest-handshakes',
        code: 0,
        stdout: `peerAPublicKeyFixture=\t${Math.floor(Date.now() / 1000)}\n`,
      });
      const summary = UnderpostWireguard.API.status({});
      expect(summary.wireguard).to.equal('active');
      expect(summary.haproxy).to.equal('active');
      expect(summary.peers.find((peer) => peer.id === 'control-a').online).to.equal(true);
      // Route table unavailable without a deploy conf; reported as null rather
      // than failing the whole report.
      expect(summary.routing).to.equal(null);
    });

    it('reports the hub link from a spoke', () => {
      edgeFixture({ files: SPOKE_IDENTITY_FILES, hostname: 'control-node' });
      harness.route({ match: 'is-active', code: 0, stdout: 'active\n' });
      const summary = UnderpostWireguard.API.status({});
      expect(summary.hubPublicKey).to.equal('hubPublicKeyFixture=');
      expect(summary.hub).to.be.an('object');
    });
  });

  describe('forward proxy service', () => {
    const withApiKey = (run) => {
      const previous = process.env[FORWARD_PROXY.env.apiKey];
      process.env[FORWARD_PROXY.env.apiKey] = 'fixture-api-key';
      try {
        return run();
      } finally {
        if (previous === undefined) delete process.env[FORWARD_PROXY.env.apiKey];
        else process.env[FORWARD_PROXY.env.apiKey] = previous;
      }
    };

    it('binds the proxy to the hub tunnel address', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      const config = withApiKey(() => UnderpostWireguard.API.forwardProxyConfig({}));
      expect(config.host).to.equal('10.0.0.1');
      expect(config.tunnelCidr).to.equal('10.0.0.0/24');
    });

    it('refuses to run on a spoke', () => {
      edgeFixture({ files: SPOKE_IDENTITY_FILES, hostname: 'control-node' });
      expect(() => withApiKey(() => UnderpostWireguard.API.forwardProxyConfig({}))).to.throw(
        "requires 'forward-proxy'",
      );
    });

    it('names the ways to configure the key when it is unset', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      const previous = process.env[FORWARD_PROXY.env.apiKey];
      delete process.env[FORWARD_PROXY.env.apiKey];
      try {
        expect(() => UnderpostWireguard.API.forwardProxyConfig({})).to.throw('is not set');
      } finally {
        if (previous !== undefined) process.env[FORWARD_PROXY.env.apiKey] = previous;
      }
    });

    // Bound to a wildcard the proxy is reachable from every interface, and only
    // the API key refuses a request.
    it('warns about a wildcard bind rather than refusing it', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      const config = withApiKey(() => UnderpostWireguard.API.forwardProxyConfig({ forwardProxyServerHost: '0.0.0.0' }));
      expect(config.host).to.equal('0.0.0.0');
    });

    it('passes over a Node binary that is absent, too old, or unusable by a unit', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      harness.route({ match: 'sudo test -x', code: 1 });
      const result = UnderpostWireguard.API.forwardProxyNodePath();
      expect(result.path).to.equal('');
      expect(result.rejected.every(({ reason }) => reason === 'not present')).to.equal(true);
    });

    it('selects the first Node binary new enough for the engine', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      const required = `${process.versions.node}`.split('.')[0];
      harness.route({ match: 'sudo test -x', code: 0 });
      harness.route({ match: '--version', code: 0, stdout: `v${required}.0.0\n` });
      const result = UnderpostWireguard.API.forwardProxyNodePath();
      expect(result.path).not.to.equal('');
    });

    it('rejects a Node binary older than the engine requires', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      harness.route({ match: 'sudo test -x', code: 0 });
      harness.route({ match: '--version', code: 0, stdout: 'v18.0.0\n' });
      const result = UnderpostWireguard.API.forwardProxyNodePath();
      expect(result.path).to.equal('');
      expect(result.rejected[0].reason).to.include('the engine needs');
    });

    it('reports the unit it would install under a dry run', () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      expect(withApiKey(() => UnderpostWireguard.API.forwardProxyServer({ dryRun: true }))).to.equal(null);
      expect(harness.ran('systemctl')).to.equal(false);
    });

    it('withdraws a broken unit and fails when no Node binary can run the service', () => {
      edgeFixture({ files: { ...HUB_IDENTITY_FILES, [FORWARD_PROXY.unitPath]: 'stale unit\n' } });
      harness.route({ match: 'sudo test -x', code: 1 });
      expect(() => withApiKey(() => UnderpostWireguard.API.forwardProxyServer({}))).to.throw(
        'No Node binary the forward proxy service can execute',
      );
      expect(harness.ran(`rm -f ${FORWARD_PROXY.unitPath}`)).to.equal(true);
    });
  });

  describe('fleet sync', () => {
    beforeEach(() => {
      vi.spyOn(UnderpostRepository.API, 'getDefaultBranch').mockReturnValue('master');
    });

    it('composes the sync sequence against the resolved repositories and branch', () => {
      const previous = process.env.GITHUB_USERNAME;
      process.env.GITHUB_USERNAME = 'fixture-org';
      try {
        const commands = UnderpostWireguard.API.syncCommands({});
        expect(commands.every(({ command }) => !command.includes('<engine'))).to.equal(true);
        expect(commands.some(({ command }) => command.includes('fixture-org/engine-private'))).to.equal(true);
        expect(commands.some(({ command }) => command.includes('master'))).to.equal(true);
      } finally {
        if (previous === undefined) delete process.env.GITHUB_USERNAME;
        else process.env.GITHUB_USERNAME = previous;
      }
    });

    it.skipIf(!shipsCyberiaPackageScript)(
      'installs the deploy manifest before the CLI is used, and again on what the switch landed',
      () => {
        // Regression: a node whose install no longer matched its manifest could not load its own
        // CLI, so the first step of the sync died before the step that repairs the tree.
        const previousUser = process.env.GITHUB_USERNAME;
        const previousToken = process.env.GITHUB_TOKEN;
        process.env.GITHUB_USERNAME = 'fixture-org';
        process.env.GITHUB_TOKEN = 'fixture-token';
        try {
          const steps = UnderpostWireguard.API.syncCommands({
            repoEngine: 'fixture-org/engine-test-cyberia',
            nodeRole: 'control',
          });
          const commands = steps.map(({ command }) => command);
          const packageStep = 'bash ./deploy/dd-cyberia/package.sh';

          expect(commands[0]).to.equal(packageStep);
          expect(steps[0].halt, 'a tree predating the script must still reach the switch').to.not.equal(true);
          expect(commands).to.not.include('npm link --force');
          const last = commands.lastIndexOf(packageStep);
          expect(last).to.be.greaterThan(commands.findIndex((command) => command.includes('./engine-private')));
          expect(last).to.be.lessThan(commands.findIndex((command) => command.includes('underpost-event')));
          expect(steps[last].halt).to.equal(true);

          // The monorepo belongs to no deploy, so it carries no package step at all.
          expect(
            UnderpostWireguard.API.syncCommands({ repoEngine: 'fixture-org/engine', nodeRole: 'control' }),
          ).to.satisfy((monorepo) =>
            monorepo.every(({ command }) => !command.includes('package.sh') && !/<[a-z-]+>/.test(command)),
          );
        } finally {
          if (previousUser === undefined) delete process.env.GITHUB_USERNAME;
          else process.env.GITHUB_USERNAME = previousUser;
          if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
          else process.env.GITHUB_TOKEN = previousToken;
        }
      },
    );

    it('never writes a blank token onto a node', () => {
      const previous = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;
      try {
        expect(UnderpostWireguard.API.syncCommands({})).to.satisfy((steps) =>
          steps.every(({ command }) => !command.includes('GITHUB_TOKEN')),
        );
      } finally {
        if (previous !== undefined) process.env.GITHUB_TOKEN = previous;
      }
    });

    // A node is reached once, not once per step: each SSH session re-reads the
    // credential store and re-enters the checkout.
    it('composes the whole sequence into one remote command, halting only where it must', () => {
      const script = UnderpostWireguard.API.syncScript({ nodeRole: 'control' });
      expect(script.split(' && echo ').length).to.be.above(1);
      expect(script).to.include('[sync]');
      expect(script).to.include('|| true; }');
    });

    it('joins both registries into one target list, hubs first', () => {
      vi.spyOn(UnderpostEvent.API, 'hubs').mockReturnValue([{ nodeName: 'hub-node', hubHost: HUB_HOST }]);
      vi.spyOn(UnderpostEvent.API, 'spokes').mockReturnValue([{ nodeName: 'control-node', id: 'control-a' }]);
      vi.spyOn(UnderpostEvent.API, 'hubTarget').mockReturnValue({ role: 'hub', via: 'local', host: HUB_HOST });
      vi.spyOn(UnderpostEvent.API, 'spokeTarget').mockReturnValue({ role: 'spoke', via: 'ssh', host: '10.0.0.2' });

      expect(UnderpostWireguard.API.syncTargets({}).map(({ nodeName }) => nodeName)).to.deep.equal([
        'hub-node',
        'control-node',
      ]);
      expect(UnderpostWireguard.API.syncTargets({ nodes: 'control-a' }).map(({ nodeName }) => nodeName)).to.deep.equal([
        'control-node',
      ]);
    });

    it('refuses a selector that matches no registered node', () => {
      vi.spyOn(UnderpostEvent.API, 'hubs').mockReturnValue([]);
      vi.spyOn(UnderpostEvent.API, 'spokes').mockReturnValue([]);
      expect(() => UnderpostWireguard.API.syncTargets({ nodes: 'ghost' })).to.throw('no registered node matches');
    });

    // The URI is the connection the cluster already holds: the node document
    // names the machine, and the address it resolves to is what the SSH
    // registry is keyed by.
    it('builds one connection URI per selected node, from the node name', () => {
      vi.spyOn(UnderpostEvent.API, 'hubs').mockReturnValue([{ nodeName: 'hub-node', hubHost: HUB_HOST }]);
      vi.spyOn(UnderpostEvent.API, 'spokes').mockReturnValue([{ nodeName: 'control-node', id: 'control-a' }]);
      vi.spyOn(UnderpostEvent.API, 'hubTarget').mockReturnValue({
        role: 'hub',
        via: `root@${HUB_HOST}:22`,
        user: 'root',
        host: HUB_HOST,
        port: 22,
        keyPath: './engine-private/deploy/id_rsa',
      });
      vi.spyOn(UnderpostEvent.API, 'spokeTarget').mockReturnValue({
        role: 'spoke',
        via: 'admin@198.51.100.2:2222',
        user: 'admin',
        host: '198.51.100.2',
        port: 2222,
        keyPath: './engine-private/deploy/users/admin/id_rsa',
      });

      expect(UnderpostWireguard.API.connectUri({ nodes: 'control-node' })).to.deep.equal([
        {
          nodeName: 'control-node',
          via: 'admin@198.51.100.2:2222',
          uri: 'ssh admin@198.51.100.2 -i ./engine-private/deploy/users/admin/id_rsa -p 2222',
        },
      ]);
      expect(UnderpostWireguard.API.connectUri({}).map(({ uri }) => uri)).to.deep.equal([
        'ssh root@203.0.113.10 -i ./engine-private/deploy/id_rsa -p 22',
        'ssh admin@198.51.100.2 -i ./engine-private/deploy/users/admin/id_rsa -p 2222',
      ]);
    });

    it('resolves no URI for a node that is this machine', () => {
      vi.spyOn(UnderpostEvent.API, 'hubs').mockReturnValue([]);
      vi.spyOn(UnderpostEvent.API, 'spokes').mockReturnValue([{ nodeName: 'control-node', id: 'control-a' }]);
      vi.spyOn(UnderpostEvent.API, 'spokeTarget').mockReturnValue({ role: 'spoke', via: 'local', user: '', host: '' });

      expect(UnderpostWireguard.API.connectUri({})).to.deep.equal([
        { nodeName: 'control-node', via: 'local', uri: '' },
      ]);
    });

    it('reports every node it synced, and does not stop at the first failure', async () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      vi.spyOn(UnderpostRepository.API, 'getDefaultBranch').mockReturnValue('master');
      vi.spyOn(UnderpostEvent.API, 'hubs').mockReturnValue([{ nodeName: 'hub-node', hubHost: HUB_HOST }]);
      vi.spyOn(UnderpostEvent.API, 'spokes').mockReturnValue([{ nodeName: 'control-node', id: 'control-a' }]);
      // Both carry the user a real target resolves with: sync dispatches over SSH only, and
      // skips any node registered at an address this machine holds.
      vi.spyOn(UnderpostEvent.API, 'hubTarget').mockReturnValue({
        role: 'hub',
        via: 'ssh',
        user: 'root',
        host: HUB_HOST,
      });
      // A documentation address, not the fixture's 10.0.0.2: that tunnel address is a real
      // address on a fleet node, and the guard would skip it there instead of dispatching.
      vi.spyOn(UnderpostEvent.API, 'spokeTarget').mockReturnValue({
        role: 'spoke',
        via: 'ssh',
        user: 'admin',
        host: '198.51.100.2',
      });
      const run = vi
        .spyOn(UnderpostEvent.API, 'runCommand')
        .mockImplementation(async (_command, options) => ({ ok: options.host === HUB_HOST, error: 'refused' }));

      const result = await UnderpostWireguard.API.sync({});

      expect(run.mock.calls.length).to.equal(2);
      expect(result.ok).to.equal(false);
      expect(result.nodes.map(({ ok }) => ok)).to.deep.equal([true, false]);
    });

    // Cluster nodes already run the collector as a DaemonSet pod; a second copy
    // there would bind a port the pod holds.
    it('provisions the host metrics collector on hubs only', async () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      vi.spyOn(UnderpostEvent.API, 'hubs').mockReturnValue([{ nodeName: 'hub-node', hubHost: HUB_HOST }]);
      vi.spyOn(UnderpostEvent.API, 'spokes').mockReturnValue([{ nodeName: 'control-node', id: 'control-a' }]);
      vi.spyOn(UnderpostEvent.API, 'hubTarget').mockReturnValue({ role: 'hub', via: 'local', host: HUB_HOST });
      vi.spyOn(UnderpostEvent.API, 'spokeTarget').mockReturnValue({ role: 'spoke', via: 'ssh', host: '10.0.0.2' });
      const run = vi.spyOn(UnderpostEvent.API, 'runCommand').mockResolvedValue({ ok: true });

      const result = await UnderpostWireguard.API.nodeExporter({});

      expect(run.mock.calls.length).to.equal(1);
      expect(result.ok).to.equal(true);
    });

    it('refuses to provision the collector when no hub matches', async () => {
      vi.spyOn(UnderpostEvent.API, 'hubs').mockReturnValue([]);
      vi.spyOn(UnderpostEvent.API, 'spokes').mockReturnValue([{ nodeName: 'control-node', id: 'control-a' }]);
      vi.spyOn(UnderpostEvent.API, 'spokeTarget').mockReturnValue({ role: 'spoke', via: 'ssh', host: '10.0.0.2' });
      await expect(UnderpostWireguard.API.nodeExporter({})).rejects.toThrow('no hub node');
    });
  });

  describe('CLI dispatch', () => {
    it('runs the lifecycle flags in the only order that works', async () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      const order = [];
      for (const method of ['install', 'setup', 'start', 'status']) {
        vi.spyOn(UnderpostWireguard.API, method).mockImplementation(() => order.push(method));
      }
      await UnderpostWireguard.API.callback({
        status: true,
        wireguardStart: true,
        wireguardSetup: true,
        wireguardInstall: true,
      });
      expect(order).to.deep.equal(['install', 'setup', 'start', 'status']);
    });

    // `--build-conf` is a hard promise: it short-circuits every host action even
    // when other lifecycle flags are present.
    it('touches no host action under --build-conf', async () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      const called = [];
      for (const method of ['install', 'start', 'stop', 'setup', 'buildConf']) {
        vi.spyOn(UnderpostWireguard.API, method).mockImplementation(() => called.push(method));
      }
      await UnderpostWireguard.API.callback({ buildConf: true, wireguardInstall: true, wireguardStart: true });
      expect(called).to.deep.equal(['buildConf']);
    });

    it('normalizes topology when --build-conf carries no other action', async () => {
      edgeFixture({ files: HUB_IDENTITY_FILES });
      const buildConf = vi.spyOn(UnderpostWireguard.API, 'buildConf').mockImplementation(() => ({}));
      await UnderpostWireguard.API.callback({ buildConf: true });
      expect(buildConf.mock.calls.length).to.equal(1);
    });

    it('records an identity and stops when no host action was requested', async () => {
      const nodeConfig = vi.spyOn(UnderpostWireguard.API, 'nodeConfig').mockImplementation(() => ({}));
      const setup = vi.spyOn(UnderpostWireguard.API, 'setup').mockImplementation(() => ({}));
      await UnderpostWireguard.API.callback({ nodeConfig: true });
      expect(nodeConfig.mock.calls.length).to.equal(1);
      expect(setup.mock.calls.length).to.equal(0);
    });

    it('takes reinstall and reset before every other host action', async () => {
      const reinstall = vi.spyOn(UnderpostWireguard.API, 'reinstall').mockImplementation(() => undefined);
      const reset = vi.spyOn(UnderpostWireguard.API, 'reset').mockImplementation(() => undefined);
      const install = vi.spyOn(UnderpostWireguard.API, 'install').mockImplementation(() => undefined);

      await UnderpostWireguard.API.callback({ wireguardReinstall: true, wireguardInstall: true });
      expect(reinstall.mock.calls.length).to.equal(1);
      expect(install.mock.calls.length).to.equal(0);

      await UnderpostWireguard.API.callback({ wireguardReset: true, wireguardInstall: true });
      expect(reset.mock.calls.length).to.equal(1);
      expect(install.mock.calls.length).to.equal(0);
    });

    it('prefers the full HAProxy setup over a bare sync', async () => {
      const setup = vi.spyOn(UnderpostWireguard.API, 'haproxySetup').mockImplementation(() => undefined);
      const sync = vi.spyOn(UnderpostWireguard.API, 'haproxySync').mockImplementation(() => undefined);
      await UnderpostWireguard.API.callback({ haproxySetup: true, haproxySync: true });
      expect(setup.mock.calls.length).to.equal(1);
      expect(sync.mock.calls.length).to.equal(0);
    });

    it('routes the fleet-wide flags away from every host action', async () => {
      const sync = vi.spyOn(UnderpostWireguard.API, 'sync').mockResolvedValue({ ok: true, nodes: [] });
      const nodeExporter = vi.spyOn(UnderpostWireguard.API, 'nodeExporter').mockResolvedValue({ ok: true, nodes: [] });
      const install = vi.spyOn(UnderpostWireguard.API, 'install').mockImplementation(() => undefined);

      await UnderpostWireguard.API.callback({ sync: true, wireguardInstall: true });
      await UnderpostWireguard.API.callback({ nodeExporter: true, wireguardInstall: true });

      expect(sync.mock.calls.length).to.equal(1);
      expect(nodeExporter.mock.calls.length).to.equal(1);
      expect(install.mock.calls.length).to.equal(0);
    });

    it('routes --cmd alone as a fleet run, away from every host action', async () => {
      const sync = vi.spyOn(UnderpostWireguard.API, 'sync').mockResolvedValue({ ok: true, nodes: [] });
      const install = vi.spyOn(UnderpostWireguard.API, 'install').mockImplementation(() => undefined);

      await UnderpostWireguard.API.callback({ cmd: 'uptime', wireguardInstall: true });

      expect(sync.mock.calls.length).to.equal(1);
      expect(install.mock.calls.length).to.equal(0);
    });

    it('runs a single fleet dispatch when --cmd replaces the sync sequence', async () => {
      const sync = vi.spyOn(UnderpostWireguard.API, 'sync').mockResolvedValue({ ok: true, nodes: [] });

      await UnderpostWireguard.API.callback({ sync: true, cmd: 'uptime, hostname' });

      expect(sync.mock.calls.length).to.equal(1);
      expect(sync.mock.calls[0][0]).to.include({ cmd: 'uptime, hostname' });
    });

    it('exposes the same API through the CLI namespace', () => {
      expect(Underpost.wireguard).to.equal(UnderpostWireguard.API);
    });
  });
});
