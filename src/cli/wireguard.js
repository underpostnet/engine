/**
 * WireGuard overlay and HAProxy edge routing lifecycle
 * @module src/cli/wireguard.js
 * @namespace UnderpostWireguard
 */

import fs from 'fs-extra';
import { isIP } from 'node:net';
import os from 'node:os';
import nodePath from 'node:path';
import { getConfFilePath, loadConfInstances, loadConfServerJson } from '../server/conf.js';
import { loadCronDeployEnv, parseList } from '../server/cron.js';
import { resolveDeployList } from '../server/router.js';
import {
  FORWARD_PROXY,
  forwardProxyCommandFactory,
  forwardProxyConfigFactory,
  forwardProxyNodeCandidatesFactory,
  forwardProxyNodeProbeCommandFactory,
  forwardProxyServerFactory,
  forwardProxyServiceCommandsFactory,
  forwardProxyStartProbeCommandFactory,
  forwardProxyUnitFactory,
} from '../server/forward-proxy.js';
import { loggerFactory } from '../server/logger.js';
import { nodeExporterServiceScriptFactory } from '../server/monitoring.js';
import { installRootFile, shellExec, sleepSync } from '../server/process.js';
import {
  homeDirectoryPathFactory,
  journalctlCommandFactory,
  runSystemdCommands,
  systemctlCommandFactory,
  systemdAvailableCommandFactory,
  systemdReloadIfActiveCommandFactory,
  systemdStatusCommandsFactory,
} from '../server/systemd.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @constant UNDERPOST_EDGE
 * @description Fixed identity of the edge subsystem: paths, ports and resource
 * names that both ends of a tunnel have to agree on.
 * @memberof UnderpostWireguard
 */
const UNDERPOST_EDGE = {
  interfaceName: 'wg0',
  listenPort: 51820,
  // The hub's own address, and the subnet a spoke routes back through it. Both
  // sides of every tunnel have to agree on the second one, so it is declared
  // once here rather than defaulted separately at each end.
  cidr: '10.0.0.1/24',
  tunnelCidr: '10.0.0.0/24',
  // Held below the 30s NAT mapping most consumer routers use, so a spoke's
  // outbound session is refreshed before the ISP forgets it exists.
  keepalive: 25,
  wireguardDir: '/etc/wireguard',
  haproxyDir: '/etc/haproxy',
  haproxyConfName: 'haproxy.cfg',
  sniMapName: 'domain2backend.map',
  httpMapName: 'domain2backend-http.map',
  statsSocket: '/var/lib/haproxy/stats',
  natChainPrefix: 'UNDERPOST_WG',
  sysctlPath: '/etc/sysctl.d/99-underpost-wireguard.conf',
  packages: ['wireguard-tools', 'haproxy', 'iptables'],
  httpPort: 80,
  httpsPort: 443,
  // Spoke-side SSH. The public port is per-edge and lives in topology,
  // because exposing SSH is a decision, not a default.
  sshPort: 22,
  defaultSshForwardPort: 2222,
  // A peer is considered live within this window: WireGuard re-handshakes at
  // least every 120s while traffic flows, so a longer gap means the link is
  // down rather than merely idle.
  handshakeStaleSeconds: 180,
};

/** Prints one line per node of a fleet-wide run and fails the process if any did. */
const reportFleetOutcome = ({ ok, nodes }) => {
  for (const node of nodes)
    console.log(`  ${node.ok ? 'ok  '.green : 'FAIL'.red}  ${node.nodeName.padEnd(28)} ${node.via}`);
  if (!ok) process.exitCode = 1;
};

/**
 * @constant ENGINE_SYNC_STEPS
 * @description What bringing one node's checkout up to date consists of.
 *
 * Ordered and fail-fast up to the install: building or installing over a
 * checkout whose pull failed would deploy stale sources under a fresh version.
 * `npm run fix` is advisory — `npm audit` exits non-zero while any advisory
 * remains, which is a finding to report rather than a reason to skip the install.
 * @memberof UnderpostWireguard
 */
const ENGINE_SYNC_STEPS = [
  // { command: 'npm install -g underpost', halt: true },
  // { command: 'node bin secret --from-cron-env .', halt: true },
  { command: 'underpost run clean', halt: true },
  { command: 'underpost cmt --switch-repo <engine> --target-branch <engine-branch>', halt: true },
  { command: 'underpost pull ./engine-private <engine-private>', halt: true },
  // { command: 'npm run fix', halt: false },
  // { command: 'npm install', halt: true },
  // { command: 'node bin secret --from-cron-env .', halt: true },
  // A supervised dispatcher holds the code it started with: after the checkout
  // moves, the running process still answers webhooks from the old registry and
  // silently drops events it has never heard of. Nodes without the unit skip it.
  {
    command: 'systemctl is-active --quiet underpost-event.service && systemctl restart underpost-event.service',
    halt: false,
  },
];

/**
 * @method deployIdFactory
 * @description Normalizes a deploy id to the `dd-<conf-id>` convention.
 * @param {string} deployId - Deploy id, with or without the prefix.
 * @returns {string} Prefixed deploy id.
 * @memberof UnderpostWireguard
 */
const deployIdFactory = (deployId) => {
  const value = `${deployId || ''}`.trim();
  // `dd` is the meta id every runner reads as "all of dd.routes"; prefixing it
  // would turn it into a deploy that does not exist.
  if (!value || value === 'dd') return value;
  return value.startsWith('dd-') ? value : `dd-${value}`;
};

/**
 * @method deployListFactory
 * @description The deploys whose hostnames a run publishes.
 *
 * `dd` expands through the same `dd.routes` read every other runner uses, so
 * the edge routes exactly the set the cluster deploys — a hostname cannot be
 * live in the cluster and absent from the edge because two lists drifted.
 * @param {string} deployId - Deploy id, comma-separated list, or `dd`.
 * @returns {Array<string>} Normalized deploy ids.
 * @memberof UnderpostWireguard
 */
const deployListFactory = (deployId) => {
  const value = `${deployId || ''}`.trim();
  if (!value) return [];
  if (value === 'dd') return resolveDeployList('dd').map(deployIdFactory).filter(Boolean);
  return value.split(',').map(deployIdFactory).filter(Boolean);
};

/**
 * @constant EDGE_TOPOLOGY_PATH
 * @description Location of the deployment topology.
 *
 * Cluster-wide rather than per deploy, and stored beside `dd.routes` for that
 * reason: the hub has one interface, one address and one peer table, and those
 * are properties of the machine. A copy per deploy would be several records of
 * one fact, free to disagree. `--deploy-id` selects which hostnames are routed
 * across it, not which tunnel exists.
 *
 * Holds public keys only — the private half never leaves `/etc/wireguard` on
 * the host that generated it.
 * @memberof UnderpostWireguard
 */
const EDGE_TOPOLOGY_PATH = './engine-private/deploy/conf.wireguard.json';
const EDGE_NODES_PATH = './engine-private/deploy/nodes';
const EDGE_NODE_ROLES = Object.freeze(['control', 'worker', 'hub']);

const nodeNameFactory = (value = '') => {
  const nodeName = `${value || ''}`.trim();
  if (nodeName && !/^[a-zA-Z0-9._-]+$/.test(nodeName))
    throw new Error('[wireguard] node names may contain only letters, numbers, dot, underscore, and hyphen');
  return nodeName;
};

/**
 * @method peerFactory
 * @description Normalizes one spoke entry, filling the fields a partially
 * written topology may omit.
 *
 * `allowedIPs` defaults to the peer's own tunnel address alone: a spoke routes
 * its LAN only when topology says so, so a mistyped entry cannot silently
 * claim a subnet another spoke already answers for.
 * @param {object} peer - Raw topology entry.
 * @returns {object} Normalized entry.
 * @memberof UnderpostWireguard
 */
const peerFactory = (peer = {}) => {
  const address = `${peer.address || ''}`.trim();
  const allowedIPs = (Array.isArray(peer.allowedIPs) ? peer.allowedIPs : [])
    .map((entry) => `${entry || ''}`.trim())
    .filter(Boolean);
  return {
    id: `${peer.id || ''}`.trim(),
    address,
    managementHost: `${peer.managementHost || ''}`.trim(),
    publicKey: `${peer.publicKey || ''}`.trim(),
    allowedIPs: allowedIPs.length > 0 ? allowedIPs : address ? [`${address}/32`] : [],
    hosts: (Array.isArray(peer.hosts) ? peer.hosts : []).map((host) => `${host}`.trim().toLowerCase()).filter(Boolean),
    instances: (Array.isArray(peer.instances) ? peer.instances : []).map((id) => `${id}`.trim()).filter(Boolean),
    default: peer.default === true,
  };
};

/**
 * @method defaultPeerFactory
 * @description The spoke an unmatched hostname falls back to, and the one QUIC
 * is forwarded to.
 *
 * A lone peer is its own fallback: a single-spoke hub has nowhere else to send
 * a hostname, and requiring `"default": true` there would only be ceremony.
 * With several peers and none nominated there is no fallback at all, so nothing
 * is dispatched somewhere arbitrary.
 * @param {Array<object>} [peers] - Normalized topology entries.
 * @returns {?object} The fallback peer, or null.
 * @memberof UnderpostWireguard
 */
const defaultPeerFactory = (peers = []) =>
  peers.find((peer) => peer.default === true) || (peers.length === 1 ? peers[0] : null);

/** Returns the host portion of a WireGuard endpoint. */
const endpointHostFactory = (endpoint = '') => {
  const value = `${endpoint || ''}`.trim();
  if (!value) return '';
  try {
    return new URL(`udp://${value}`).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
};

const hubFactory = (hub = {}) => ({
  interfaceName: `${hub.interfaceName || UNDERPOST_EDGE.interfaceName}`.trim(),
  listenPort: Number(hub.listenPort) > 0 ? Number(hub.listenPort) : UNDERPOST_EDGE.listenPort,
  address: `${hub.address || UNDERPOST_EDGE.cidr}`.trim(),
  publicKey: `${hub.publicKey || ''}`.trim(),
  sshForwardPort: Number(hub.sshForwardPort) > 0 ? Number(hub.sshForwardPort) : 0,
  peers: (Array.isArray(hub.peers) ? hub.peers : []).map(peerFactory).filter((peer) => peer.id),
});

const topologyFactory = (topology = {}) =>
  Object.fromEntries(
    Object.entries(topology)
      .map(([host, hub]) => [endpointHostFactory(host), hubFactory(hub)])
      .filter(([host]) => isIP(host) === 4)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

const nodeIdentityFactory = (identity = {}) => {
  const role = EDGE_NODE_ROLES.includes(`${identity.role || ''}`.trim()) ? `${identity.role}`.trim() : '';
  return {
    nodeName: nodeNameFactory(identity.nodeName),
    role,
    hubHost: endpointHostFactory(identity.hubHost || identity.hub),
    peerId: role === 'hub' ? '' : `${identity.peerId || ''}`.trim(),
  };
};

const readTopology = () => {
  if (!fs.existsSync(EDGE_TOPOLOGY_PATH)) return {};
  try {
    const source = JSON.parse(fs.readFileSync(EDGE_TOPOLOGY_PATH, 'utf8'));
    const topology = topologyFactory(source);
    const invalidHosts = Object.keys(source).filter((host) => isIP(endpointHostFactory(host)) !== 4);
    if (invalidHosts.length > 0)
      throw new Error(`top-level keys must be static IPv4 addresses: ${invalidHosts.join(', ')}`);
    return topology;
  } catch (error) {
    throw new Error(`[wireguard] invalid topology ${EDGE_TOPOLOGY_PATH}: ${error.message}`);
  }
};

const writeTopology = (topology) => {
  const target = EDGE_TOPOLOGY_PATH;
  const next = `${JSON.stringify(topologyFactory(topology), null, 2)}\n`;
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current === next) return false;
  fs.mkdirpSync(nodePath.dirname(target));
  fs.writeFileSync(target, next, 'utf8');
  return true;
};

const nodeConfigPathFactory = (nodeName) => `${EDGE_NODES_PATH}/${nodeName}.json`;

const readNodeConfig = (nodeName) => {
  const selected = nodeNameFactory(nodeName);
  const target = nodeConfigPathFactory(selected);
  if (!selected || !fs.existsSync(target)) return nodeIdentityFactory({ nodeName: selected });
  try {
    return nodeIdentityFactory({ nodeName: selected, ...JSON.parse(fs.readFileSync(target, 'utf8')) });
  } catch (error) {
    throw new Error(`[wireguard] invalid node identity ${target}: ${error.message}`);
  }
};

/**
 * @method nodeNameCandidatesFactory
 * @description The node document names a hostname may be recorded under, in
 * precedence order.
 *
 * The short name follows the full one because an FQDN is a property of the
 * resolver domain, not of the node: `vultr` and `vultr.guest` are one host, and
 * its record must not stop matching when a search domain is added.
 * @param {string} [hostname] - Hostname to resolve; defaults to this machine's.
 * @returns {Array<string>} Candidate node names, most specific first.
 * @memberof UnderpostWireguard
 */
/**
 * @method hostAddressesFactory
 * @description This machine's own routable IPv4 addresses, read from its interfaces.
 * @returns {Set<string>} Addresses, excluding loopback.
 * @memberof UnderpostWireguard
 */
const hostAddressesFactory = () =>
  new Set(
    Object.values(os.networkInterfaces())
      .flat()
      .filter((entry) => entry?.family === 'IPv4' && !entry.internal)
      .map((entry) => entry.address),
  );

/**
 * @method localPeerFactory
 * @description Whether a peer is this machine.
 *
 * Decided from the peer's registered management address, not from the node
 * document that named it: a document is named after a hostname, and a generic
 * one — `localhost.localdomain` — names every machine that kept the default.
 * Concluding locality from that would run a repair, or a checkout switch, on
 * whichever host happened to load the config instead of on the peer. An
 * unverifiable address is remote, so the check can only ever fail towards SSH.
 * @param {string} managementHost - Peer management address from topology.
 * @param {Set<string>} [addresses] - This machine's addresses.
 * @returns {boolean} True when the peer is this machine.
 * @memberof UnderpostWireguard
 */
const localPeerFactory = (managementHost = '', addresses = hostAddressesFactory()) =>
  Boolean(managementHost) && addresses.has(`${managementHost}`.trim());

const nodeNameCandidatesFactory = (hostname = os.hostname()) => {
  const name = nodeNameFactory(hostname);
  return [...new Set([name, name.split('.')[0]])].filter(Boolean);
};

const hostNodeNameFactory = () => {
  const candidates = nodeNameCandidatesFactory();
  return candidates.find((name) => fs.existsSync(nodeConfigPathFactory(name))) || candidates[0] || '';
};

/**
 * @method readNodeIdentity
 * @description This machine's identity: the tracked node document named after it.
 *
 * The document's filename is the node name, so the hostname resolves it. A
 * host-local record of which node this is would be a second copy of a fact the
 * machine already knows, free to disagree with it after a rename.
 * @returns {object} Normalized identity; empty when this host has no document.
 * @memberof UnderpostWireguard
 */
const readNodeIdentity = () => readNodeConfig(hostNodeNameFactory());

const readNodeConfigs = () => {
  if (!fs.existsSync(EDGE_NODES_PATH)) return [];
  return fs
    .readdirSync(EDGE_NODES_PATH)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readNodeConfig(name.slice(0, -5)));
};

const writeNodeIdentity = (identity, { dryRun = false } = {}) => {
  const normalized = nodeIdentityFactory(identity);
  if (dryRun) return normalized;
  fs.mkdirpSync(EDGE_NODES_PATH);
  const target = nodeConfigPathFactory(normalized.nodeName);
  const content = `${JSON.stringify(
    {
      role: normalized.role,
      hubHost: normalized.hubHost,
      ...(normalized.role === 'hub' ? {} : { peerId: normalized.peerId }),
    },
    null,
    2,
  )}\n`;
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) fs.writeFileSync(target, content, 'utf8');
  return normalized;
};

const edgeContextFactory = ({ topology = {}, identity = {} } = {}) => {
  const node = nodeIdentityFactory(identity);
  const hub = topologyFactory(topology)[node.hubHost];
  if (!node.nodeName || !node.role || !node.hubHost)
    throw new Error(
      `[wireguard] host '${os.hostname()}' has no identity in ${EDGE_NODES_PATH}; ` +
        'run --node-config --node-role <control|worker|hub> --hub-host <public-ip>',
    );
  if (!hub) throw new Error(`[wireguard] hub '${node.hubHost}' is not registered in ${EDGE_TOPOLOGY_PATH}`);
  const peer = node.role === 'hub' ? null : hub.peers.find((entry) => entry.id === node.peerId);
  if (node.role !== 'hub' && !peer)
    throw new Error(`[wireguard] node '${node.nodeName}' references unknown peer '${node.peerId}' on ${node.hubHost}`);
  return {
    ...node,
    interfaceName: hub.interfaceName,
    listenPort: hub.listenPort,
    address: node.role === 'hub' ? hub.address : peer.address,
    publicKey: node.role === 'hub' ? hub.publicKey : peer.publicKey,
    hubPublicKey: hub.publicKey,
    endpoint: `${node.hubHost}:${hub.listenPort}`,
    sshForwardPort: hub.sshForwardPort,
    peers: hub.peers,
  };
};

const readEdgeContext = () => edgeContextFactory({ topology: readTopology(), identity: readNodeIdentity() });

const hubHostResolve = ({ topology = readTopology(), identity = readNodeIdentity(), hubHost = '' } = {}) => {
  const selected = endpointHostFactory(hubHost || identity.hubHost);
  if (selected) return selected;
  const hosts = Object.keys(topology);
  if (hosts.length === 1) return hosts[0];
  throw new Error('[wireguard] --hub-host is required when no current identity selects one hub');
};

/**
 * @method redirectHostFactory
 * @description The hostname a `redirect` points at.
 * @param {string} [redirect] - Absolute URL or bare hostname.
 * @returns {string} Hostname, or an empty string when there is none.
 * @memberof UnderpostWireguard
 */
const redirectHostFactory = (redirect) => {
  const value = `${redirect || ''}`.trim();
  if (!value) return '';
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return '';
  }
};

/**
 * @method hostProxyEntriesFactory
 * @description The hostnames a `conf.server.json` publishes through the edge,
 * with the ports each one claims.
 *
 * A sub-path's `proxy` array is the declaration that the hostname is reachable
 * from outside; a host whose sub-paths declare none is internal and gets no
 * route. Ports are unioned across sub-paths because the edge routes a hostname,
 * not a sub-path — a single stream carries every path the host serves.
 * @param {object} confServer - Parsed `conf.server.json`.
 * @returns {Array<{host: string, ports: Array<number>, redirects: Array<string>}>} One entry per published hostname.
 * @memberof UnderpostWireguard
 */
const hostProxyEntriesFactory = ({ confServer = {} } = {}) => {
  const entries = [];
  for (const host of Object.keys(confServer)) {
    const paths = confServer[host] || {};
    const ports = new Set();
    const redirects = new Set();
    for (const path of Object.keys(paths)) {
      const node = paths[path] || {};
      for (const port of Array.isArray(node.proxy) ? node.proxy : [])
        if (Number.isInteger(Number(port))) ports.add(Number(port));
      const redirect = redirectHostFactory(node.redirect);
      if (redirect) redirects.add(redirect);
    }
    if (ports.size === 0) continue;
    entries.push({
      host: `${host}`.toLowerCase(),
      ports: [...ports].sort((a, b) => a - b),
      redirects: [...redirects],
    });
  }
  return entries.sort((a, b) => a.host.localeCompare(b.host));
};

/**
 * @method instanceProxyEntriesFactory
 * @description The hostnames a deploy's instances publish.
 *
 * Instances declare no `proxy` array — their hostname reaches the same cluster
 * ingress the deploy's own hosts do, so it terminates the same two ports. Every
 * variant of a family resolves through both its own id and its template id, so
 * topology can bind a whole family with one entry.
 * @param {Array<object>} [instances] - Expanded entries from `loadConfInstances`.
 * @returns {Array<{host: string, ports: Array<number>, instances: Array<string>}>} One entry per instance hostname.
 * @memberof UnderpostWireguard
 */
const instanceProxyEntriesFactory = ({ instances = [] } = {}) => {
  const byHost = new Map();
  for (const instance of instances) {
    const host = `${instance?.host || ''}`.trim().toLowerCase();
    if (!host) continue;
    if (!byHost.has(host))
      byHost.set(host, { host, ports: [UNDERPOST_EDGE.httpPort, UNDERPOST_EDGE.httpsPort], instances: [] });
    const ids = byHost.get(host).instances;
    for (const id of [instance.id, instance.templateId].filter(Boolean)) if (!ids.includes(`${id}`)) ids.push(`${id}`);
  }
  return [...byHost.values()].sort((a, b) => a.host.localeCompare(b.host));
};

/**
 * @method edgeRouteTableFactory
 * @description Resolves every published hostname to the spoke that serves it.
 *
 * Resolution is ordered from most specific to least: an explicit hostname
 * binding, then an instance id, then the hostname a redirect points at, then the
 * default spoke. The redirect hop exists because a redirect host publishes
 * nothing of its own — `dogmadual.com` only says "go to `www.dogmadual.com`",
 * and the spoke that answers the target is the one that has to answer the
 * redirect too.
 *
 * A hostname that resolves to nothing is returned in `unresolved` rather than
 * dropped: a silently missing route is a hostname that answers nothing at all,
 * which is invisible until someone reports the outage.
 * @param {object} [confServer] - Parsed `conf.server.json`.
 * @param {Array<object>} [instances] - Expanded instance entries.
 * @param {Array<object>} [peers] - Registry entries.
 * @returns {{routes: Array<object>, unresolved: Array<string>, peers: Array<object>}} Route table, unbound hostnames, and the peers actually referenced.
 * @memberof UnderpostWireguard
 */
const edgeRouteTableFactory = ({ confServer = {}, instances = [], peers = [] } = {}) => {
  const entries = new Map();
  for (const entry of hostProxyEntriesFactory({ confServer })) entries.set(entry.host, { ...entry, instances: [] });
  for (const entry of instanceProxyEntriesFactory({ instances })) {
    const current = entries.get(entry.host);
    if (!current) entries.set(entry.host, { ...entry, redirects: [] });
    else {
      current.ports = [...new Set([...current.ports, ...entry.ports])].sort((a, b) => a - b);
      current.instances = [...new Set([...current.instances, ...entry.instances])];
    }
  }

  const list = peers.map(peerFactory).filter((peer) => peer.id && peer.address);
  const byHost = new Map();
  const byInstance = new Map();
  // First declaration wins, so a duplicated binding is deterministic rather
  // than dependent on topology order changing under an edit.
  for (const peer of list) {
    for (const host of peer.hosts) if (!byHost.has(host)) byHost.set(host, peer);
    for (const id of peer.instances) if (!byInstance.has(id)) byInstance.set(id, peer);
  }
  const fallback = defaultPeerFactory(list);

  const resolve = (entry, seen) => {
    if (byHost.has(entry.host)) return { peer: byHost.get(entry.host), via: 'host' };
    for (const id of entry.instances) if (byInstance.has(id)) return { peer: byInstance.get(id), via: 'instance' };
    for (const target of entry.redirects) {
      if (seen.has(target)) continue;
      const targetEntry = entries.get(target);
      if (!targetEntry) continue;
      const resolved = resolve(targetEntry, new Set([...seen, entry.host]));
      if (resolved.peer && resolved.via !== 'default') return { peer: resolved.peer, via: 'redirect' };
    }
    return fallback ? { peer: fallback, via: 'default' } : { peer: null, via: '' };
  };

  const routes = [];
  const unresolved = [];
  for (const entry of [...entries.values()].sort((a, b) => a.host.localeCompare(b.host))) {
    const { peer, via } = resolve(entry, new Set([entry.host]));
    if (!peer) {
      unresolved.push(entry.host);
      continue;
    }
    routes.push({ host: entry.host, ports: entry.ports, peerId: peer.id, address: peer.address, via });
  }
  const referenced = new Set(routes.map((route) => route.peerId));
  return { routes, unresolved, peers: list.filter((peer) => referenced.has(peer.id) || peer === fallback) };
};

/**
 * @method allowedIpsConflictsFactory
 * @description CIDRs that more than one peer claims.
 *
 * WireGuard resolves an outbound packet to a peer by longest-prefix match over
 * every peer's `AllowedIPs`, so a CIDR claimed twice is not shared — one peer
 * wins and the other silently never receives that traffic. Homelabs routinely
 * sit on the same `192.168.1.0/24`, which makes this the likeliest way a
 * multi-spoke topology breaks.
 *
 * Duplicate tunnel addresses are caught by the same pass, because an address
 * with no explicit `allowedIPs` contributes its own `/32`.
 * @param {Array<object>} [peers] - Registry entries.
 * @returns {Array<{cidr: string, peers: Array<string>}>} Contested CIDRs.
 * @memberof UnderpostWireguard
 */
const allowedIpsConflictsFactory = ({ peers = [] } = {}) => {
  const byCidr = new Map();
  for (const peer of peers.map(peerFactory))
    for (const cidr of peer.allowedIPs) byCidr.set(cidr, [...new Set([...(byCidr.get(cidr) || []), peer.id])]);
  return [...byCidr.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([cidr, ids]) => ({ cidr, peers: ids.sort() }))
    .sort((a, b) => a.cidr.localeCompare(b.cidr));
};

/**
 * @method mergeRouteTablesFactory
 * @description Folds one route table per deploy into the single table the edge
 * publishes.
 *
 * The edge is one machine holding one pair of map files, so every deploy in
 * `dd.routes` has to be compiled together — publishing one deploy's table alone
 * would overwrite the maps and take every other deploy's hostname off the
 * internet. Each route records the deploy that contributed it, which is the
 * only way to attribute a hostname once the tables are merged.
 *
 * A hostname two deploys both claim is a configuration error, not a merge to
 * resolve: one of them is not being served. First wins so the output is
 * deterministic, and the collision is reported.
 * @param {Array<{deployId: string, routes: Array<object>, unresolved: Array<string>, peers: Array<object>}>} [tables] - Per-deploy tables.
 * @returns {{routes: Array<object>, unresolved: Array<object>, conflicts: Array<object>, peers: Array<object>}} Merged table.
 * @memberof UnderpostWireguard
 */
const mergeRouteTablesFactory = ({ tables = [] } = {}) => {
  const routes = new Map();
  const conflicts = [];
  const unresolved = [];
  const peers = new Map();
  for (const table of tables) {
    for (const route of table.routes || []) {
      const current = routes.get(route.host);
      if (!current) {
        routes.set(route.host, { ...route, deployId: table.deployId });
        continue;
      }
      if (current.peerId !== route.peerId)
        conflicts.push({ host: route.host, claimed: [current.deployId, table.deployId], serving: current.peerId });
    }
    for (const host of table.unresolved || []) unresolved.push({ host, deployId: table.deployId });
    for (const peer of table.peers || []) if (!peers.has(peer.id)) peers.set(peer.id, peer);
  }
  return {
    routes: [...routes.values()].sort((a, b) => a.host.localeCompare(b.host)),
    unresolved: unresolved.sort((a, b) => a.host.localeCompare(b.host)),
    conflicts,
    peers: [...peers.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
};

/**
 * @method backendNameFactory
 * @description A peer id as an HAProxy proxy name. Only word characters are
 * safe in one, and the prefix keeps the two transports of a single spoke
 * distinguishable in `haproxy -c` output and the stats socket.
 * @param {string} kind - `http` or `tls`.
 * @param {string} peerId - Registry peer id.
 * @returns {string} Backend name.
 * @memberof UnderpostWireguard
 */
const backendNameFactory = (kind, peerId) => `be_${kind}_${`${peerId || 'default'}`.replace(/[^a-zA-Z0-9]/g, '_')}`;

/**
 * @method haproxyMapsFactory
 * @description The two lookup tables the frontends select a backend with.
 *
 * Split by transport because the two are matched on different things — a
 * plaintext `Host` header and a TLS SNI extension — and a hostname may publish
 * one port without the other.
 * @param {Array<object>} [routes] - Route table from {@link UnderpostWireguard.edgeRouteTableFactory}.
 * @returns {{sni: string, http: string}} Rendered map files.
 * @memberof UnderpostWireguard
 */
const haproxyMapsFactory = ({ routes = [] } = {}) => {
  const render = (port, kind) =>
    routes
      .filter((route) => route.peerId && route.ports.includes(port))
      .map((route) => `${route.host} ${backendNameFactory(kind, route.peerId)}`)
      .join('\n');
  const sni = render(UNDERPOST_EDGE.httpsPort, 'tls');
  const http = render(UNDERPOST_EDGE.httpPort, 'http');
  return { sni: sni ? `${sni}\n` : '', http: http ? `${http}\n` : '' };
};

/**
 * @method haproxyConfFactory
 * @description Renders the public edge gateway.
 *
 * There is no `bind ... ssl` line anywhere in the output, and that absence is
 * the design: the `:443` frontend runs in TCP mode and selects a backend from
 * `req.ssl_sni`, which reads the ClientHello without decrypting it. The edge
 * therefore holds no certificate and no private key for any hostname it routes.
 *
 * An unmatched hostname reaches the default spoke, or — with no default
 * declared — is refused rather than dispatched somewhere arbitrary. `421` is
 * the accurate answer for cleartext: the request reached a server that does not
 * serve that authority.
 * `sshForwardPort` adds the one frontend that is not hostname-routed. SSH
 * carries no SNI and no `Host`, so there is nothing to route on: the port goes
 * whole to the fallback spoke, exactly as UDP/443 does. It exists because a
 * spoke behind CGNAT is otherwise unreachable for CI — the deploy runs on the
 * cluster, and the only public address in the topology is the hub's.
 * @param {Array<object>} [peers] - Peers to emit backends for.
 * @param {string} [defaultPeerId] - Peer an unmatched hostname falls back to.
 * @param {string} [mapDir] - Directory holding the map files.
 * @param {number} [sshForwardPort] - Public port forwarded to the spoke's SSH; 0 emits no frontend.
 * @returns {string} haproxy.cfg contents.
 * @memberof UnderpostWireguard
 */
const haproxyConfFactory = ({
  peers = [],
  defaultPeerId = '',
  mapDir = UNDERPOST_EDGE.haproxyDir,
  sshForwardPort = 0,
} = {}) => {
  const sniMap = `${mapDir}/${UNDERPOST_EDGE.sniMapName}`;
  const httpMap = `${mapDir}/${UNDERPOST_EDGE.httpMapName}`;
  const fallback = peers.find((peer) => peer.id === defaultPeerId) || defaultPeerFactory(peers);
  const backends = peers
    .map(
      (peer) => `backend ${backendNameFactory('http', peer.id)}
  mode http
  server ${peer.id} ${peer.address}:${UNDERPOST_EDGE.httpPort} check

backend ${backendNameFactory('tls', peer.id)}
  mode tcp
  server ${peer.id} ${peer.address}:${UNDERPOST_EDGE.httpsPort} check`,
    )
    .join('\n\n');
  const defaults = fallback
    ? `backend ${backendNameFactory('http', 'default')}
  mode http
  server ${fallback.id} ${fallback.address}:${UNDERPOST_EDGE.httpPort} check

backend ${backendNameFactory('tls', 'default')}
  mode tcp
  server ${fallback.id} ${fallback.address}:${UNDERPOST_EDGE.httpsPort} check`
    : `backend ${backendNameFactory('http', 'default')}
  mode http
  http-request deny deny_status 421

backend ${backendNameFactory('tls', 'default')}
  mode tcp
  tcp-request content reject`;

  // Both conditions matter: no port means SSH was never opened, and no fallback
  // means there is no spoke to send it to. Emitting a frontend without a
  // backend would bind the port and refuse every connection on it.
  const sshEnabled = Number(sshForwardPort) > 0 && Boolean(fallback);
  const sshFrontend = sshEnabled
    ? `
frontend fe_ssh
  bind :${sshForwardPort}
  mode tcp
  option tcplog
  # No inspect-delay: the server speaks first in the SSH protocol, so waiting
  # for client bytes here would stall every connection until the timeout.
  default_backend ${backendNameFactory('ssh', 'default')}
`
    : '';
  const sshBackend = sshEnabled
    ? `

backend ${backendNameFactory('ssh', 'default')}
  mode tcp
  server ${fallback.id} ${fallback.address}:${UNDERPOST_EDGE.sshPort} check`
    : '';

  return `# Generated by \`underpost wireguard --haproxy-sync\`. Do not edit by hand:
# every rule here is derived from conf.server.json, conf.instances.json and
# conf.wireguard.json, and the next sync overwrites the file.
global
  log /dev/log local0
  maxconn 20000
  user haproxy
  group haproxy
  daemon
  # \`expose-fd listeners\` is what makes a reload seamless: the incoming
  # process inherits the listening sockets from the outgoing one, so no
  # connection is refused while routes change.
  stats socket ${UNDERPOST_EDGE.statsSocket} mode 660 level admin expose-fd listeners
  stats timeout 30s

defaults
  log global
  option dontlognull
  timeout connect 5s
  timeout client 60s
  timeout server 60s
  # Websockets and other long-lived streams are held by the tunnel timeout,
  # not the idle ones, or the edge would cut a healthy connection at 60s.
  timeout tunnel 1h

frontend fe_http
  bind :${UNDERPOST_EDGE.httpPort}
  mode http
  option httplog
  option forwardfor
  # Plaintext, so the Host header is readable without terminating anything.
  # The port is stripped before lookup because a client may send \`host:80\`.
  use_backend %[req.hdr(host),lower,word(1,:),map(${httpMap},${backendNameFactory('http', 'default')})]
  default_backend ${backendNameFactory('http', 'default')}

frontend fe_https
  bind :${UNDERPOST_EDGE.httpsPort}
  mode tcp
  option tcplog
  # Wait for the ClientHello, read the SNI, forward the bytes untouched. A
  # connection that never sends one falls to the default backend.
  tcp-request inspect-delay 5s
  tcp-request content accept if { req_ssl_hello_type 1 }
  use_backend %[req.ssl_sni,lower,map(${sniMap},${backendNameFactory('tls', 'default')})]
  default_backend ${backendNameFactory('tls', 'default')}
${sshFrontend}
${backends}${backends ? '\n\n' : ''}${defaults}${sshBackend}
`;
};

/**
 * @method wireguardPrivateKeyDirective
 * @description Loads the interface key from disk after the interface is up.
 *
 * The key is deliberately not inlined into the rendered config: keeping it in
 * its own 0600 file means no rendered configuration, dry-run print, diff or log
 * line can ever carry it, and the config itself becomes a pure function of the
 * topology. `wg-quick` runs `PostUp` after `wg setconf`, so the interface is
 * keyed before it forwards anything.
 * @param {string} keyPath - Path of the private key file.
 * @returns {string} `PostUp` directive.
 * @memberof UnderpostWireguard
 */
const wireguardPrivateKeyDirective = (keyPath) => `PostUp = wg set %i private-key ${keyPath}`;

/**
 * @method wireguardClientForwardingDirectivesFactory
 * @description Lets workloads behind a spoke reach tunnel services using the
 * spoke's WireGuard address. The destination-scoped masquerade avoids exposing
 * Kubernetes pod CIDRs to the hub or changing ordinary pod egress.
 * @param {string} cidr - Tunnel CIDR reachable through the hub.
 * @returns {string} Paired `wg-quick` lifecycle directives.
 * @memberof UnderpostWireguard
 */
const wireguardClientForwardingDirectivesFactory = (cidr) => {
  const outbound = `FORWARD -o %i -d ${cidr} -j ACCEPT`;
  const inbound = `FORWARD -i %i -s ${cidr} -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT`;
  const masquerade = `POSTROUTING -o %i -d ${cidr} -j MASQUERADE`;
  return [
    'PostUp = sysctl -q -w net.ipv4.ip_forward=1',
    `PostUp = iptables -C ${outbound} 2>/dev/null || iptables -I ${outbound}`,
    `PostUp = iptables -C ${inbound} 2>/dev/null || iptables -I ${inbound}`,
    `PostUp = iptables -t nat -C ${masquerade} 2>/dev/null || iptables -t nat -I ${masquerade}`,
    `PostDown = iptables -t nat -D ${masquerade} 2>/dev/null || true`,
    `PostDown = iptables -D ${inbound} 2>/dev/null || true`,
    `PostDown = iptables -D ${outbound} 2>/dev/null || true`,
  ].join('\n');
};

/**
 * @method wireguardServerConfFactory
 * @description Renders the hub interface and its spoke table.
 *
 * Forwarding rules are attached to the interface rather than applied globally,
 * so tearing the tunnel down removes them again and a stopped hub leaves no
 * rule behind that outlives it.
 * @param {string} [interfaceName] - Interface name.
 * @param {string} address - Hub address with CIDR (`10.0.0.1/24`).
 * @param {number} [listenPort] - UDP listen port.
 * @param {string} keyPath - Path of the private key file.
 * @param {Array<object>} [peers] - Registry entries.
 * @returns {string} `wg-quick` configuration.
 * @memberof UnderpostWireguard
 */
const wireguardServerConfFactory = ({
  interfaceName = UNDERPOST_EDGE.interfaceName,
  address,
  listenPort = UNDERPOST_EDGE.listenPort,
  keyPath,
  peers = [],
} = {}) => {
  const peerBlocks = peers
    .map(peerFactory)
    .filter((peer) => peer.id && peer.publicKey && peer.allowedIPs.length > 0)
    .map(
      (peer) => `
[Peer]
# ${peer.id}
PublicKey = ${peer.publicKey}
AllowedIPs = ${peer.allowedIPs.join(', ')}`,
    )
    .join('\n');
  return `# Generated by \`underpost wireguard --wireguard-setup\` on the registered hub. Do not edit by hand.
[Interface]
Address = ${address}
ListenPort = ${listenPort}
${wireguardPrivateKeyDirective(keyPath)}
PostUp = sysctl -q -w net.ipv4.ip_forward=1
PostUp = iptables -I FORWARD -i ${interfaceName} -j ACCEPT
PostUp = iptables -I FORWARD -o ${interfaceName} -j ACCEPT
PostDown = iptables -D FORWARD -i ${interfaceName} -j ACCEPT
PostDown = iptables -D FORWARD -o ${interfaceName} -j ACCEPT
${peerBlocks}
`;
};

/**
 * @method wireguardClientConfFactory
 * @description Renders a spoke interface.
 *
 * `AllowedIPs` is the tunnel CIDR alone, never `0.0.0.0/0`: the spoke is
 * publishing services through the hub, not routing its own egress through it,
 * and a default route here would send a whole cluster's outbound traffic across
 * the VPS.
 * @param {string} address - Spoke address (`10.0.0.2`, with or without CIDR).
 * @param {string} keyPath - Path of the private key file.
 * @param {string} publicKey - Hub public key.
 * @param {string} endpoint - Hub `host:port`.
 * @param {string} [cidr] - Tunnel CIDR reachable through the hub.
 * @param {number} [keepalive] - Keepalive interval in seconds.
 * @returns {string} `wg-quick` configuration.
 * @memberof UnderpostWireguard
 */
const wireguardClientConfFactory = ({
  address,
  keyPath,
  publicKey,
  endpoint,
  cidr = UNDERPOST_EDGE.tunnelCidr,
  keepalive = UNDERPOST_EDGE.keepalive,
} = {}) => `# Generated by \`underpost wireguard --wireguard-setup\` on a registered node. Do not edit by hand.
[Interface]
Address = ${`${address}`.includes('/') ? address : `${address}/32`}
${wireguardPrivateKeyDirective(keyPath)}
${wireguardClientForwardingDirectivesFactory(cidr)}

[Peer]
PublicKey = ${publicKey}
Endpoint = ${endpoint}
AllowedIPs = ${cidr}
# Holds the outbound NAT mapping open, which is the only reason a hub behind no
# NAT can reach a spoke behind CGNAT at all.
PersistentKeepalive = ${keepalive}
`;

/**
 * @method quicForwardCommandsFactory
 * @description The packet rules that carry QUIC to the default spoke, and the
 * ones that remove them again.
 *
 * QUIC cannot be routed by hostname — a QUIC Initial carries its SNI inside an
 * encrypted frame — so the whole UDP port goes to one spoke, exactly as
 * `underpost-ingress` sends every datagram to one data plane. A client that
 * tries QUIC against another spoke's hostname gets no answer and falls back to
 * TCP, which is routed correctly.
 *
 * The rules live in dedicated chains that are flushed and refilled on every
 * apply, which is what makes a re-run idempotent: there is no accumulating list
 * of near-duplicate rules and no need to guess what a previous run installed.
 * @param {string} [chainPrefix] - Prefix for the two managed chains.
 * @param {string} [interfaceName] - Tunnel interface.
 * @param {string} [target] - Spoke address; empty renders the chains without rules.
 * @param {number} [port] - UDP port to forward.
 * @returns {{ensure: Array<string>, remove: Array<string>}} Shell commands.
 * @memberof UnderpostWireguard
 */
const quicForwardCommandsFactory = ({
  chainPrefix = UNDERPOST_EDGE.natChainPrefix,
  interfaceName = UNDERPOST_EDGE.interfaceName,
  target = '',
  port = UNDERPOST_EDGE.httpsPort,
} = {}) => {
  const pre = `${chainPrefix}_PRE`;
  const post = `${chainPrefix}_POST`;
  return {
    ensure: [
      `sudo iptables -t nat -N ${pre} 2>/dev/null || true`,
      `sudo iptables -t nat -N ${post} 2>/dev/null || true`,
      `sudo iptables -t nat -C PREROUTING -j ${pre} 2>/dev/null || sudo iptables -t nat -A PREROUTING -j ${pre}`,
      `sudo iptables -t nat -C POSTROUTING -j ${post} 2>/dev/null || sudo iptables -t nat -A POSTROUTING -j ${post}`,
      `sudo iptables -t nat -F ${pre}`,
      `sudo iptables -t nat -F ${post}`,
      ...(target
        ? [
            // `! -i <iface>` keeps datagrams that already arrived through the
            // tunnel from being re-DNAT'd back into it.
            `sudo iptables -t nat -A ${pre} ! -i ${interfaceName} -p udp --dport ${port} -j DNAT --to-destination ${target}:${port}`,
            `sudo iptables -t nat -A ${post} -o ${interfaceName} -d ${target} -p udp --dport ${port} -j MASQUERADE`,
          ]
        : []),
    ],
    remove: [
      `sudo iptables -t nat -D PREROUTING -j ${pre} 2>/dev/null || true`,
      `sudo iptables -t nat -D POSTROUTING -j ${post} 2>/dev/null || true`,
      `sudo iptables -t nat -F ${pre} 2>/dev/null || true`,
      `sudo iptables -t nat -F ${post} 2>/dev/null || true`,
      `sudo iptables -t nat -X ${pre} 2>/dev/null || true`,
      `sudo iptables -t nat -X ${post} 2>/dev/null || true`,
    ],
  };
};

/**
 * @method firewallCommandsFactory
 * @description Opens the ports each role needs, when firewalld is running.
 *
 * A spoke opens nothing publicly — it dials out — but its tunnel interface has
 * to land in a zone that permits forwarded traffic, or the cluster ingress is
 * unreachable over a tunnel that is otherwise perfectly healthy.
 * The same list drives the teardown, flipped to `--remove-*`, so a reset cannot
 * leave behind a permanent rule the setup added — the two directions are one
 * declaration rather than two that drift.
 * @param {string} role - `hub`, `control`, or `worker`.
 * @param {string} [interfaceName] - Tunnel interface.
 * @param {number} [listenPort] - UDP listen port.
 * @param {string} [tunnelCidr] - Tunnel source admitted to the forward proxy.
 * @param {number} [sshForwardPort] - Public SSH port to open; 0 opens none.
 * @param {boolean} [remove] - Withdraw the rules instead of adding them.
 * @returns {Array<string>} Shell commands, each a no-op when firewalld is absent.
 * @memberof UnderpostWireguard
 */
const firewallCommandsFactory = ({
  role,
  interfaceName = UNDERPOST_EDGE.interfaceName,
  listenPort = UNDERPOST_EDGE.listenPort,
  tunnelCidr = UNDERPOST_EDGE.tunnelCidr,
  sshForwardPort = 0,
  remove = false,
} = {}) => {
  const verb = remove ? 'remove' : 'add';
  const rules = [
    // Every role, the hub most of all: firewalld's forward chain ends in
    // `reject with icmpx admin-prohibited`, so an unzoned tunnel interface has
    // its forwarded traffic dropped while the hub itself still answers on it —
    // spoke-to-spoke stops working over a tunnel that looks perfectly healthy.
    `--zone=trusted --${verb}-interface=${interfaceName}`,
    ...(role === 'hub'
      ? [
          `--${verb}-port=${UNDERPOST_EDGE.httpPort}/tcp`,
          `--${verb}-port=${UNDERPOST_EDGE.httpsPort}/tcp`,
          `--${verb}-port=${UNDERPOST_EDGE.httpsPort}/udp`,
          `--${verb}-port=${listenPort}/udp`,
          // Public, unlike the forward proxy: CI dials it from GitHub's runners,
          // which have no fixed address to narrow the rule to.
          ...(Number(sshForwardPort) > 0 ? [`--${verb}-port=${sshForwardPort}/tcp`] : []),
          // The forward proxy is admitted from the tunnel only. The listener
          // already binds the tunnel address alone, so this rule narrows a port
          // that is unreachable from anywhere else rather than opening one.
          `--${verb}-rich-rule="rule family=ipv4 source address=${tunnelCidr} port port=${FORWARD_PROXY.port} protocol=tcp accept"`,
          `--${verb}-masquerade`,
        ]
      : []),
  ];
  const guard =
    'command -v firewall-cmd >/dev/null 2>&1 && ' +
    systemctlCommandFactory({ action: 'is-active --quiet', name: 'firewalld', sudo: false });
  return [
    ...rules.map((rule) => `sudo sh -c '${guard} && firewall-cmd --permanent ${rule} >/dev/null || true'`),
    `sudo sh -c '${guard} && firewall-cmd --reload >/dev/null || true'`,
  ];
};

/**
 * @method peerSummaryFactory
 * @description One spoke as topology declares it: its transport address and
 * the three bindings that route hostnames to it.
 * @param {object} peer - Normalized topology entry.
 * @returns {object} Topology view of the peer.
 * @memberof UnderpostWireguard
 */
const peerSummaryFactory = (peer) => ({
  id: peer.id,
  address: peer.address,
  managementHost: peer.managementHost,
  // The identity the far end actually presents. Registry-only fields say what a
  // spoke is *called*; this is what `wg` matches on, so it is the one field that
  // settles "is the hub expecting the key this machine holds". Public by
  // definition — the private half never leaves the host that generated it.
  publicKey: peer.publicKey,
  allowedIPs: peer.allowedIPs,
  hosts: peer.hosts,
  instances: peer.instances,
  default: peer.default,
});

/**
 * @method unregisteredPeersFactory
 * @description Public keys the live interface carries that topology does not.
 *
 * `wg set` adds a peer and never removes the one it supersedes, so re-keying a
 * spoke or re-running `--peer-add` with a corrected key leaves the previous
 * identity on the interface, still holding its old handshake. Every other view
 * here is keyed by topology, which makes those leftovers invisible — and an
 * invisible peer that still claims an address is exactly what makes a tunnel
 * "configured correctly" and dead at the same time.
 * @param {Array<object>} [peers] - Registry entries.
 * @param {string} [latestHandshakes] - `wg show <iface> latest-handshakes` output.
 * @param {number} [now] - Current time in epoch seconds.
 * @returns {Array<{publicKey: string, handshakeAgeSeconds: ?number}>} Peers on the wire but not in topology.
 * @memberof UnderpostWireguard
 */
const unregisteredPeersFactory = ({ peers = [], latestHandshakes = '', now = Math.floor(Date.now() / 1000) } = {}) => {
  const known = new Set(
    peers
      .map(peerFactory)
      .map((peer) => peer.publicKey)
      .filter(Boolean),
  );
  return `${latestHandshakes || ''}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter(([publicKey]) => publicKey && !known.has(publicKey))
    .map(([publicKey, seconds]) => ({
      publicKey,
      handshakeAgeSeconds: Number(seconds) > 0 ? now - Number(seconds) : null,
    }));
};

/**
 * @method wireguardStatusFactory
 * @description Folds `wg show` output onto topology, one row per spoke.
 *
 * Built from the per-peer sub-commands rather than `wg show <iface> dump`,
 * because the dump's first line contains the interface private key — this
 * command prints its output, so it must never read that line at all.
 * @param {Array<object>} [peers] - Registry entries.
 * @param {string} [latestHandshakes] - `wg show <iface> latest-handshakes` output.
 * @param {string} [transfer] - `wg show <iface> transfer` output.
 * @param {string} [endpoints] - `wg show <iface> endpoints` output.
 * @param {number} [now] - Current time in epoch seconds.
 * @returns {Array<object>} One row per peer.
 * @memberof UnderpostWireguard
 */
const wireguardStatusFactory = ({
  peers = [],
  latestHandshakes = '',
  transfer = '',
  endpoints = '',
  now = Math.floor(Date.now() / 1000),
} = {}) => {
  const parse = (raw) =>
    new Map(
      `${raw || ''}`
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [key, ...rest] = line.split(/\s+/);
          return [key, rest];
        }),
    );
  const handshakes = parse(latestHandshakes);
  const transfers = parse(transfer);
  const peerEndpoints = parse(endpoints);
  return peers.map(peerFactory).map((peer) => {
    const handshake = Number(handshakes.get(peer.publicKey)?.[0] || 0);
    const [rx = '0', tx = '0'] = transfers.get(peer.publicKey) || [];
    const endpoint = peerEndpoints.get(peer.publicKey)?.[0] || '';
    return {
      ...peerSummaryFactory(peer),
      endpoint: endpoint && endpoint !== '(none)' ? endpoint : '',
      handshakeAgeSeconds: handshake > 0 ? now - handshake : null,
      rxBytes: Number(rx) || 0,
      txBytes: Number(tx) || 0,
      online: handshake > 0 && now - handshake <= UNDERPOST_EDGE.handshakeStaleSeconds,
    };
  });
};

/**
 * Resolves the local interface health without reading private key material.
 * A hub must have a fresh handshake with its default routing peer. Control and
 * worker nodes must have a fresh handshake with the configured hub identity.
 */
const wireguardHealthFactory = ({
  context = {},
  active = '',
  latestHandshakes = '',
  now = Math.floor(Date.now() / 1000),
} = {}) => {
  const edge = context;
  const serviceActive = active === 'active';
  const expectedPeer =
    edge.role === 'hub'
      ? defaultPeerFactory(edge.peers)
      : { id: 'hub', address: hubTunnelAddressFactory(edge), publicKey: edge.hubPublicKey };
  const [peer = {}] = wireguardStatusFactory({
    peers: expectedPeer ? [expectedPeer] : [],
    latestHandshakes,
    now,
  });
  return {
    ok: serviceActive && Boolean(expectedPeer?.publicKey) && peer.online === true,
    role: edge.role || '(unset)',
    serviceActive,
    peerId: expectedPeer?.id || '(unset)',
    handshakeAgeSeconds: peer.handshakeAgeSeconds ?? null,
  };
};

/** Refuses a remediation command when SSH reached a different edge host. */
const assertEdgeIdentity = (edge = {}, { expectedRole = '', expectedId = '' } = {}) => {
  if (expectedRole && edge.role !== expectedRole)
    throw new Error(`[wireguard] expected role '${expectedRole}', reached '${edge.role || '(unset)'}'`);
  if (expectedId && edge.peerId !== expectedId)
    throw new Error(`[wireguard] expected peer '${expectedId}', reached '${edge.peerId || '(unset)'}'`);
  return edge;
};

/**
 * @method writeServerInterfaceConf
 * @description Rewrites the hub interface config from the current peer table.
 *
 * A spoke's config holds no peer table of its own, so this is a no-op there —
 * which is what lets `--peer-add` and `--peer-remove` run unconditionally.
 * @param {object} state - Registry the interface belongs to.
 * @param {Array<object>} peers - Peer table to render.
 * @param {boolean} [dryRun] - Print instead of writing.
 * @returns {boolean} True when the file changed.
 * @memberof UnderpostWireguard
 */
const writeServerInterfaceConf = ({ state, peers, dryRun = false }) => {
  if (state.role !== 'hub') return false;
  return installRootFile({
    target: `${UNDERPOST_EDGE.wireguardDir}/${state.interfaceName}.conf`,
    content: wireguardServerConfFactory({
      interfaceName: state.interfaceName,
      address: state.address,
      listenPort: state.listenPort,
      keyPath: `${UNDERPOST_EDGE.wireguardDir}/${state.interfaceName}.key`,
      peers,
    }),
    mode: '0600',
    dryRun,
  });
};

/**
 * @method runHostCommands
 * @description Executes a host-mutating command list, or prints it.
 * @param {Array<string>} commands - Shell commands.
 * @param {boolean} [dryRun] - Print instead of executing.
 * @returns {void}
 * @memberof UnderpostWireguard
 */
const runHostCommands = (commands, dryRun = false) => {
  for (const command of commands) {
    if (dryRun) logger.info(`[dry-run] ${command}`);
    else shellExec(command, { silent: true });
  }
};

const runServiceCommands = (commands, dryRun = false) =>
  runSystemdCommands(commands, {
    dryRun,
    execute: (command) => shellExec(command, { silent: true }),
    onDryRun: (command) => logger.info(`[dry-run] ${command}`),
  });

/**
 * @method csvFactory
 * @description Splits a comma-separated CLI value, or reports that the flag was
 * not passed at all — which is what lets a partial update leave the stored
 * fields it does not name untouched.
 * @param {string} [value] - Raw option value.
 * @returns {?Array<string>} Trimmed entries, or `undefined` when absent.
 * @memberof UnderpostWireguard
 */
const csvFactory = (value) =>
  value === undefined || value === null || `${value}`.trim() === ''
    ? undefined
    : `${value}`
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

/**
 * @method liveWireguardCommand
 * @description Applies a `wg set` change to a running interface, and does
 * nothing when there is none.
 *
 * `wg set` is what admits or drops a peer without restarting the interface, so
 * established tunnels keep their sessions. It is also the only step that
 * requires the interface to be up — persistence is the regenerated config file,
 * so a host whose tunnel is currently down still records the change.
 * @param {string} interfaceName - Interface name.
 * @param {string} args - Arguments after `wg set <interface>`.
 * @returns {string} Shell command.
 * @memberof UnderpostWireguard
 */
const liveWireguardCommand = (interfaceName, args) =>
  `sudo sh -c 'wg show ${interfaceName} >/dev/null 2>&1 && wg set ${interfaceName} ${args} || true'`;

/**
 * @method warnTopologyHazards
 * @description Reports the two topology states that break routing silently.
 *
 * A peer with no `hosts` and no `instances` claims nothing. It still serves
 * every hostname while it is the *only* peer, because a lone peer is its own
 * fallback — so a single-spoke edge works with no bindings at all. Adding a
 * second peer removes that implicit fallback, and every hostname the bindings do
 * not name goes unresolved at once, along with the QUIC forward.
 *
 * That cliff arrives when the peer is registered, not when routes are published,
 * so it is reported at both points rather than left for the next sync to
 * discover.
 * @param {Array<object>} [peers] - The topology peers.
 * @returns {void}
 * @memberof UnderpostWireguard
 */
const warnTopologyHazards = (peers = []) => {
  if (peers.length === 0) {
    logger.warn('Registry has no peers: no hostname can resolve until at least one is registered', {
      next: '--peer-add <id> --peer-ip <10.0.0.x> --public-key <key>',
    });
    return;
  }
  if (peers.length > 1 && !peers.some((peer) => peer.default))
    logger.warn('No peer is marked --default: unmatched hostnames are unresolved and UDP :443 is not forwarded', {
      peers: peers.map((peer) => peer.id),
      fix: '--peer-add <id> --peer-ip <ip> --public-key <key> --default',
    });
  const conflicts = allowedIpsConflictsFactory({ peers });
  if (conflicts.length > 0)
    logger.warn('Overlapping AllowedIPs: only one peer can receive traffic for each contested CIDR', {
      conflicts,
      fix: 'give each spoke a distinct tunnel address, and re-number or omit colliding LAN subnets',
    });
};

/** Return an interface address without its CIDR prefix. */
const tunnelAddressFactory = (address) => `${address || ''}`.trim().split('/')[0];

const tunnelNetworkCidrFactory = (address, fallback = UNDERPOST_EDGE.tunnelCidr) => {
  const [host, prefixValue] = `${address || ''}`.trim().split('/');
  const octets = host.split('.').map(Number);
  const prefix = Number(prefixValue);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255) ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  )
    return fallback;
  const value = octets.reduce((result, octet) => ((result << 8) | octet) >>> 0, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (value & mask) >>> 0;
  return `${[network >>> 24, (network >>> 16) & 255, (network >>> 8) & 255, network & 255].join('.')}/${prefix}`;
};

/**
 * @method hubTunnelAddressFactory
 * @description The hub's address inside the tunnel, as seen from either end.
 *
 * A spoke's topology entry never records it: WireGuard identifies the hub by
 * public key and public endpoint, and the spoke stores only the network it
 * routes back through it. So a spoke derives the address the same way
 * the hub topology assigns it — the tunnel network's first host,
 * which is what `UNDERPOST_EDGE.cidr` declares. Probing the hub from inside the
 * tunnel is the one check that distinguishes a dead tunnel from a hub that is
 * merely busy, so the address has to be resolvable without one.
 * @param {object} [state] - Derived runtime context.
 * @returns {string} Hub tunnel address, or an empty string when underivable.
 * @memberof UnderpostWireguard
 */
const hubTunnelAddressFactory = (state = {}) => {
  if (state.role === 'hub') return tunnelAddressFactory(state.address);
  const [network, prefix] = tunnelNetworkCidrFactory(state.address).split('/');
  const octets = network.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet)) || Number(prefix) > 30) return '';
  const value = (octets.reduce((result, octet) => ((result << 8) | octet) >>> 0, 0) + 1) >>> 0;
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
};

/**
 * @class UnderpostWireguard
 * @description Lifecycle for the edge: the WireGuard transport that reaches the
 * spokes, and the HAProxy gateway that selects one per connection.
 * @memberof UnderpostWireguard
 */
class UnderpostWireguard {
  static API = {
    /**
     * @method install
     * @description Installs the host packages the subsystem needs.
     *
     * Each package is queried before anything is installed, so a host that is
     * already provisioned performs no work and a partially provisioned one
     * installs only what it is missing.
     * @param {object} [options] - CLI options.
     * @returns {Array<string>} Packages that were missing.
     * @memberof UnderpostWireguard
     */
    install(options = {}) {
      if (shellExec('command -v dnf', { stdout: true, silent: true, silentOnError: true }).trim() === '')
        throw new Error('[wireguard] No dnf on this host; the edge subsystem targets RHEL 9 / Rocky Linux 9');
      const missing = UNDERPOST_EDGE.packages.filter(
        (name) => shellExec(`rpm -q ${name}`, { silent: true, silentOnError: true }).code !== 0,
      );
      if (missing.length === 0) {
        logger.info('Edge packages already installed', { packages: UNDERPOST_EDGE.packages });
        return [];
      }
      runHostCommands(
        [
          `sudo dnf -y install epel-release || true`,
          `sudo dnf -y install ${missing.join(' ')}`,
          // HAProxy dials backends on the tunnel; without this boolean SELinux
          // refuses the connection and every route answers 503.
          `sudo sh -c 'command -v setsebool >/dev/null 2>&1 && setsebool -P haproxy_connect_any 1 || true'`,
        ],
        options.dryRun,
      );
      logger.info('Edge packages installed', { missing });
      return missing;
    },

    /**
     * @method ensureKeyPair
     * @description Resolves the interface key pair, generating it once.
     *
     * The private half is created under `umask 077` inside the same shell that
     * writes it, so it is never readable by anyone but root — not even for the
     * moment between creation and a later `chmod`. It is never read back into
     * this process; only the public half is returned.
     * @param {string} interfaceName - Interface name.
     * @param {boolean} [dryRun] - Skip generation.
     * @returns {{privateKeyPath: string, publicKeyPath: string, publicKey: string, generated: boolean}} Key pair locations and the public key.
     * @memberof UnderpostWireguard
     */
    ensureKeyPair(interfaceName, dryRun = false) {
      const privateKeyPath = `${UNDERPOST_EDGE.wireguardDir}/${interfaceName}.key`;
      const publicKeyPath = `${UNDERPOST_EDGE.wireguardDir}/${interfaceName}.pub`;
      const exists =
        shellExec(`sudo test -s ${privateKeyPath} && sudo test -s ${publicKeyPath}`, {
          silent: true,
          silentOnError: true,
        }).code === 0;
      if (!exists) {
        if (dryRun) {
          logger.info(`[dry-run] generate wireguard key pair for ${interfaceName}`);
          return { privateKeyPath, publicKeyPath, publicKey: '', generated: true };
        }
        shellExec(
          `sudo sh -c 'umask 077 && mkdir -p ${UNDERPOST_EDGE.wireguardDir} && wg genkey > ${privateKeyPath} && wg pubkey < ${privateKeyPath} > ${publicKeyPath}'`,
          { silent: true },
        );
        shellExec(`sudo chmod 0600 ${privateKeyPath} && sudo chmod 0644 ${publicKeyPath}`, { silent: true });
      }
      const publicKey = shellExec(`sudo cat ${publicKeyPath}`, {
        stdout: true,
        silent: true,
        silentOnError: true,
      }).trim();
      return { privateKeyPath, publicKeyPath, publicKey, generated: !exists };
    },

    nodeConfig(options = {}) {
      const nodeName = nodeNameFactory(options.nodeName || os.hostname());
      const current = readNodeConfig(nodeName);
      const identity = nodeIdentityFactory({
        nodeName,
        role: options.nodeRole || current.role,
        hubHost: options.hubHost || current.hubHost,
        peerId: options.peerId || current.peerId,
      });
      if (!identity.role) throw new Error(`[wireguard] --node-role must be one of: ${EDGE_NODE_ROLES.join(', ')}`);
      if (isIP(identity.hubHost) !== 4) throw new Error('[wireguard] --hub-host must be the hub static IPv4 address');
      const topology = readTopology();
      const hub = topology[identity.hubHost];
      if (!hub) throw new Error(`[wireguard] hub '${identity.hubHost}' is not registered in ${EDGE_TOPOLOGY_PATH}`);
      if (identity.role !== 'hub' && !identity.peerId)
        throw new Error('[wireguard] --peer-id is required for control and worker nodes');
      if (identity.role !== 'hub' && !hub.peers.some((peer) => peer.id === identity.peerId))
        throw new Error(
          `[wireguard] peer '${identity.peerId}' is not registered on ${identity.hubHost}; add it with --peer-add first`,
        );
      const duplicate = readNodeConfigs().find(
        (node) =>
          node.nodeName !== identity.nodeName &&
          node.hubHost === identity.hubHost &&
          ((identity.role === 'hub' && node.role === 'hub') ||
            (identity.role !== 'hub' && node.peerId === identity.peerId)),
      );
      if (duplicate)
        throw new Error(
          `[wireguard] ${identity.role === 'hub' ? `hub '${identity.hubHost}'` : `peer '${identity.peerId}'`} ` +
            `is already assigned to node '${duplicate.nodeName}'`,
        );
      const saved = writeNodeIdentity(identity, options);
      logger.info(options.dryRun ? '[dry-run] WireGuard node identity' : 'WireGuard node identity configured', saved);
      return saved;
    },

    /**
     * @method setup
     * @description Builds this selected node's interface and updates only its
     * public key in deployment topology.
     * @param {object} options - CLI options.
     * @returns {object} The derived runtime context.
     * @memberof UnderpostWireguard
     */
    setup(options = {}) {
      const buildConf = options.buildConf === true;
      const topology = readTopology();
      const identity = readNodeIdentity();
      const state = edgeContextFactory({ topology, identity });
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      if (state.role !== 'hub' && (options.port !== undefined || options.sshForwardPort !== undefined))
        throw new Error('[wireguard] --port and --ssh-forward-port configure the hub only');
      const listenPort = state.role === 'hub' && Number(options.port) > 0 ? Number(options.port) : state.listenPort;
      const sshForwardPort =
        options.sshForwardPort === undefined || options.sshForwardPort === null || `${options.sshForwardPort}` === ''
          ? state.sshForwardPort
          : Math.max(0, Number(options.sshForwardPort) || 0);
      const { privateKeyPath, publicKey } = buildConf
        ? {
            privateKeyPath: `${UNDERPOST_EDGE.wireguardDir}/${interfaceName}.key`,
            publicKey: `${options.publicKey || state.publicKey}`.trim(),
          }
        : UnderpostWireguard.API.ensureKeyPair(interfaceName, options.dryRun);
      if (!publicKey && !options.dryRun) throw new Error('[wireguard] the selected node has no WireGuard public key');

      let conf;
      let nextTopology;
      if (state.role === 'hub') {
        const address = `${options.cidr || state.address}`.trim();
        if (!address.includes('/')) throw new Error('[wireguard] --cidr must carry a prefix length (e.g. 10.0.0.1/24)');
        const hub = {
          ...topology[state.hubHost],
          interfaceName,
          listenPort,
          address,
          publicKey,
          sshForwardPort,
        };
        nextTopology = { ...topology, [state.hubHost]: hub };
        conf = wireguardServerConfFactory({
          interfaceName,
          address,
          listenPort,
          keyPath: privateKeyPath,
          peers: hub.peers,
        });
      } else {
        const address = `${options.peerIp || state.address}`.trim();
        if (!state.hubPublicKey) throw new Error(`[wireguard] hub '${state.hubHost}' has no publicKey`);
        const hub = topology[state.hubHost];
        const peers = hub.peers.map((peer) =>
          peer.id === state.peerId ? peerFactory({ ...peer, address, publicKey }) : peer,
        );
        nextTopology = { ...topology, [state.hubHost]: { ...hub, peers } };
        conf = wireguardClientConfFactory({
          address,
          keyPath: privateKeyPath,
          publicKey: state.hubPublicKey,
          endpoint: `${state.hubHost}:${listenPort}`,
          cidr: `${options.cidr || tunnelNetworkCidrFactory(hub.address)}`.trim(),
          keepalive: UNDERPOST_EDGE.keepalive,
        });
      }
      const next = edgeContextFactory({ topology: nextTopology, identity });

      let confChanged = false;
      if (!buildConf) {
        confChanged = installRootFile({
          target: `${UNDERPOST_EDGE.wireguardDir}/${interfaceName}.conf`,
          content: conf,
          mode: '0600',
          dryRun: options.dryRun,
        });
        runHostCommands(
          [
            `sudo sh -c 'echo net.ipv4.ip_forward=1 > ${UNDERPOST_EDGE.sysctlPath}'`,
            `sudo sysctl -q --system`,
            ...firewallCommandsFactory({
              role: next.role,
              interfaceName,
              listenPort,
              tunnelCidr: tunnelNetworkCidrFactory(next.address),
              sshForwardPort: next.sshForwardPort,
            }),
          ],
          options.dryRun,
        );
      }
      if (!options.dryRun) writeTopology(nextTopology);
      // Writing the config is idempotent; the *running* interface is not. wg-quick
      // reads the file only at start, so a changed config under a live unit is a
      // divergence that stays silent until the next reboot re-reads it.
      const restartRequired =
        confChanged &&
        !options.dryRun &&
        shellExec(
          systemctlCommandFactory({ action: 'is-active --quiet', name: `wg-quick@${interfaceName}`, sudo: false }),
          { silent: true, silentOnError: true },
        ).code === 0;
      logger.info(buildConf ? 'Topology updated; host untouched' : 'WireGuard interface configured', {
        interfaceName,
        role: next.role,
        nodeName: next.nodeName,
        hubHost: next.hubHost,
        address: next.address,
        publicKey: next.publicKey,
        peers: next.peers.length,
        restartRequired,
      });
      if (restartRequired)
        logger.warn('Interface config changed while the tunnel is up; the live interface still runs the old one', {
          apply: `--wireguard-restart --check --interface ${interfaceName}`,
        });
      return next;
    },

    /**
     * @method peerAdd
     * @description Registers a spoke and applies it to the running hub.
     *
     * `wg set` installs the peer on the live interface, so an existing tunnel is
     * never interrupted to admit a new one — topology and the config file
     * are updated in the same pass so the peer also survives a restart.
     *
     * A spoke that re-keys is registered under the same id with a new public key.
     * WireGuard identifies a peer *by its key*, not by any name, so admitting the
     * new one does not replace the old: the superseded key would stay on the live
     * interface still claiming the same `AllowedIPs`, and longest-prefix match
     * could keep handing that traffic to an identity the spoke no longer holds.
     * It is dropped first, which is what makes a reconnect leave no trace.
     * @param {object} options - CLI options.
     * @returns {object} The updated hub topology.
     * @memberof UnderpostWireguard
     */
    peerAdd(options = {}) {
      const topology = readTopology();
      const hubHost = hubHostResolve({ topology, hubHost: options.hubHost });
      const hub = topology[hubHost];
      if (!hub) throw new Error(`[wireguard] hub '${hubHost}' is not registered in ${EDGE_TOPOLOGY_PATH}`);
      const state = options.buildConf === true ? null : readEdgeContext();
      if (state && (state.role !== 'hub' || state.hubHost !== hubHost))
        throw new Error('[wireguard] live peer changes can run only on the selected hub; use --build-conf off-host');
      const id = `${options.peerAdd || ''}`.trim();
      const address = `${options.peerIp || ''}`.trim();
      const publicKey = `${options.publicKey || ''}`.trim();
      if (!id) throw new Error('[wireguard] --peer-add requires a peer id');
      if (!address) throw new Error('[wireguard] --peer-add requires --peer-ip');
      if (!publicKey) throw new Error('[wireguard] --peer-add requires --public-key');
      // Only flags that were actually passed override the stored entry, so
      // re-registering a spoke to correct its key does not silently drop the
      // subnets and bindings a previous run gave it.
      const overrides = Object.fromEntries(
        [
          ['allowedIPs', csvFactory(options.allowedIps)],
          ['hosts', csvFactory(options.hosts)],
          ['instances', csvFactory(options.instances)],
          ['managementHost', options.managementHost ? `${options.managementHost}`.trim() : undefined],
          ['default', options.default === true ? true : undefined],
        ].filter(([, value]) => value !== undefined),
      );
      const current = hub.peers.find((entry) => entry.id === id) || {};
      const peer = peerFactory({ ...current, id, address, publicKey, ...overrides });
      const supersededKey = current.publicKey && current.publicKey !== publicKey ? current.publicKey : '';
      const peers = [...hub.peers.filter((entry) => entry.id !== id), peer].sort((a, b) => a.id.localeCompare(b.id));
      const nextHub = { ...hub, peers };
      if (options.buildConf !== true) {
        runHostCommands(
          [
            ...(supersededKey ? [liveWireguardCommand(state.interfaceName, `peer ${supersededKey} remove`)] : []),
            liveWireguardCommand(state.interfaceName, `peer ${publicKey} allowed-ips ${peer.allowedIPs.join(',')}`),
          ],
          options.dryRun,
        );
        writeServerInterfaceConf({ state, peers, dryRun: options.dryRun });
      }
      if (!options.dryRun) writeTopology({ ...topology, [hubHost]: nextHub });
      logger.info(options.buildConf === true ? 'Peer recorded; host untouched' : 'Peer registered', {
        id,
        hubHost,
        address,
        managementHost: peer.managementHost || '(unset)',
        allowedIPs: peer.allowedIPs,
        rekeyed: supersededKey !== '',
      });
      warnTopologyHazards(peers);
      return nextHub;
    },

    /**
     * @method peerRemove
     * @description Removes a spoke from topology and from the running hub.
     * @param {object} options - CLI options.
     * @returns {object} The updated hub topology.
     * @memberof UnderpostWireguard
     */
    peerRemove(options = {}) {
      const topology = readTopology();
      const hubHost = hubHostResolve({ topology, hubHost: options.hubHost });
      const hub = topology[hubHost];
      if (!hub) throw new Error(`[wireguard] hub '${hubHost}' is not registered in ${EDGE_TOPOLOGY_PATH}`);
      const state = options.buildConf === true ? null : readEdgeContext();
      if (state && (state.role !== 'hub' || state.hubHost !== hubHost))
        throw new Error('[wireguard] live peer changes can run only on the selected hub; use --build-conf off-host');
      const id = `${options.peerRemove || ''}`.trim();
      const peer = hub.peers.find((entry) => entry.id === id);
      if (!peer) {
        logger.warn('No such peer in topology', { hubHost, id });
        return hub;
      }
      const peers = hub.peers.filter((entry) => entry.id !== id);
      const nextHub = { ...hub, peers };
      if (options.buildConf !== true) {
        runHostCommands([liveWireguardCommand(state.interfaceName, `peer ${peer.publicKey} remove`)], options.dryRun);
        writeServerInterfaceConf({ state, peers, dryRun: options.dryRun });
      }
      if (!options.dryRun) writeTopology({ ...topology, [hubHost]: nextHub });
      logger.info(options.buildConf === true ? 'Peer removed from topology; host untouched' : 'Peer removed', {
        hubHost,
        id,
      });
      warnTopologyHazards(peers);
      return nextHub;
    },

    /**
     * @method buildConf
     * @description Rewrites topology in place, normalized, touching no host.
     *
     * Topology is authored, not derived — its peer bindings and public keys
     * exist nowhere else, so nothing can regenerate it from other configuration.
     * This is the repair path: it fills in defaults a hand-edited file omitted,
     * drops entries with no id, and reports what it read, so malformed topology
     * is corrected before a sync acts on it.
     * @param {object} [options] - CLI options.
     * @returns {object} The normalized topology.
     * @memberof UnderpostWireguard
     */
    buildConf(options = {}) {
      const topology = readTopology();
      const changed = options.dryRun ? false : writeTopology(topology);
      logger.info('WireGuard topology normalized', {
        target: EDGE_TOPOLOGY_PATH,
        hubs: Object.entries(topology).map(([host, hub]) => ({ host, peers: hub.peers.map((peer) => peer.id) })),
        changed,
      });
      for (const hub of Object.values(topology)) warnTopologyHazards(hub.peers);
      return topology;
    },

    /**
     * @method routeTable
     * @description The resolved hostname-to-spoke table for one deploy, a list,
     * or every deploy in `dd.routes`.
     *
     * Reads each deploy's configuration through the same helpers the cluster
     * runners use, so a hostname the edge routes is exactly a hostname the
     * cluster publishes.
     *
     * A deploy listed in `dd.routes` whose configuration is not checked out
     * locally is skipped with a warning rather than failing the run: the private
     * conf of an unrelated deploy is not a precondition for publishing the ones
     * that are present.
     *
     * Omitting the id means `dd` — the whole of `dd.routes`. The edge holds one
     * pair of map files for the cluster, so a complete table is the only default
     * that publishes a working edge; narrowing it is the deliberate act.
     * @param {string} [deployId] - Deploy id, comma-separated list, or `dd` (the default).
     * @returns {{routes: Array<object>, unresolved: Array<object>, conflicts: Array<object>, peers: Array<object>, deployList: Array<string>, missing: Array<string>}} Merged table.
     * @throws {Error} When no requested deploy has a readable configuration.
     * @memberof UnderpostWireguard
     */
    routeTable(deployId) {
      const deployList = deployListFactory(deployId || 'dd');
      if (deployList.length === 0) throw new Error('[wireguard] --deploy-id resolved to no deploys');
      const state = readEdgeContext();
      const tables = [];
      const missing = [];
      for (const id of deployList) {
        const confServerPath = getConfFilePath(id, 'server');
        if (!fs.existsSync(confServerPath)) {
          missing.push(id);
          continue;
        }
        const instancesPath = `./engine-private/conf/${id}/conf.instances.json`;
        tables.push({
          deployId: id,
          ...edgeRouteTableFactory({
            confServer: loadConfServerJson(confServerPath),
            instances: fs.existsSync(instancesPath) ? loadConfInstances(id) : [],
            peers: state.peers,
          }),
        });
      }
      if (missing.length > 0) logger.warn('Deploys with no local configuration were skipped', { missing });
      if (tables.length === 0)
        throw new Error(`[wireguard] No readable deploy configuration among: ${deployList.join(', ')}`);
      return { ...mergeRouteTablesFactory({ tables }), deployList, missing };
    },

    /**
     * @method status
     * @description The whole edge context in one report: this machine's role and
     * transport, both daemons, every spoke with its bindings and link health, and
     * the routing the gateway would publish.
     *
     * This is the only read-only entry point. Host probes are skipped under
     * `--build-conf`, which has to run on a workstation with no interface to
     * query, so an off-box run reports topology and routing alone.
     * @param {object} options - CLI options.
     * @returns {object} Runtime, topology and routing summary.
     * @memberof UnderpostWireguard
     */
    status(options = {}) {
      const state = readEdgeContext();
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      const probeHost = options.buildConf !== true;
      const read = (command) => shellExec(command, { stdout: true, silent: true, silentOnError: true }).trim();
      const show = (subCommand) => (probeHost ? read(`sudo wg show ${interfaceName} ${subCommand}`) : '');
      // Sampled once: the topology view and the leftover-peer view must describe
      // the same instant, or a peer can appear in neither.
      const handshakes = show('latest-handshakes');
      const livePeers =
        state.role === 'hub'
          ? wireguardStatusFactory({
              peers: state.peers,
              latestHandshakes: handshakes,
              transfer: show('transfer'),
              endpoints: show('endpoints'),
            })
          : [];
      const [liveHub] =
        state.role === 'hub'
          ? []
          : wireguardStatusFactory({
              peers: [{ id: 'hub', address: hubTunnelAddressFactory(state), publicKey: state.hubPublicKey }],
              latestHandshakes: handshakes,
              transfer: show('transfer'),
              endpoints: show('endpoints'),
            });

      let table = null;
      try {
        table = UnderpostWireguard.API.routeTable(options.deployId);
      } catch (error) {
        logger.warn('Route table unavailable', { message: error.message });
      }

      const via = {};
      for (const route of table?.routes || []) via[route.via] = (via[route.via] || 0) + 1;
      const summary = {
        nodeName: state.nodeName,
        role: state.role,
        hubHost: state.hubHost,
        peerId: state.peerId || '(hub)',
        interface: interfaceName,
        address: state.address,
        endpoint: state.endpoint,
        publicKey: state.publicKey,
        // What this machine dials, next to what it presents. A spoke that cannot
        // handshake is usually holding one of these two wrong, and reading them
        // off the same report is what makes that a five-second check.
        ...(state.role !== 'hub' ? { hubPublicKey: state.hubPublicKey || '(unset)' } : {}),
        ...(probeHost
          ? {
              wireguard: read(systemdStatusCommandsFactory(`wg-quick@${interfaceName}`).active),
              haproxy: read(systemdStatusCommandsFactory('haproxy').active),
              forwardProxy: read(systemdStatusCommandsFactory(FORWARD_PROXY.serviceName).active),
              quicTarget: defaultPeerFactory(state.peers)?.address || '',
              sshForward: state.sshForwardPort
                ? `:${state.sshForwardPort} -> ${defaultPeerFactory(state.peers)?.address || '(no spoke)'}:${UNDERPOST_EDGE.sshPort}`
                : '(closed)',
            }
          : {}),
        ...(state.role === 'hub'
          ? { peers: probeHost ? livePeers : state.peers.map(peerSummaryFactory) }
          : { hub: liveHub }),
        topologyPeers: state.peers.map(peerSummaryFactory),
        ...(probeHost
          ? {
              unregisteredPeers: unregisteredPeersFactory({
                peers: state.role === 'hub' ? state.peers : [{ publicKey: state.hubPublicKey }],
                latestHandshakes: handshakes,
              }),
            }
          : {}),
        routing: table
          ? {
              deployList: table.deployList,
              missing: table.missing,
              via,
              routes: table.routes.map((route) => `${route.host} -> ${route.peerId} (${route.via}, ${route.deployId})`),
            }
          : null,
      };
      logger.info('Edge status', summary);

      if (table && table.routes.length === 0)
        logger.warn('No hostname resolved to a spoke: the edge would refuse every request', {
          unresolved: table.unresolved.length,
          next: 'register a peer with --peer-add, then bind it with --hosts / --instances, or mark it --default',
        });
      else if (table?.unresolved.length > 0)
        logger.warn('Hostnames with no spoke binding', { unresolved: table.unresolved });
      if (table?.conflicts.length > 0)
        logger.warn('Hostnames claimed by more than one deploy; only the first is served', {
          conflicts: table.conflicts,
        });
      warnTopologyHazards(state.peers);
      return summary;
    },

    /**
     * @method haproxySync
     * @description Recompiles the routing tables from the deploy configuration
     * and hot-reloads HAProxy.
     *
     * The candidate config is validated before the running process is signalled,
     * and the previous files are put back if it fails — a config that does not
     * parse would otherwise take the whole edge down on reload. The reload itself
     * hands the listening sockets to the incoming process, so established
     * connections and the tunnels underneath them are untouched.
     * @param {object} options - CLI options.
     * @returns {{routes: Array<object>, unresolved: Array<object>, conflicts: Array<object>, changed: boolean}} What was published.
     * @throws {Error} When HAProxy rejects the candidate config.
     * @memberof UnderpostWireguard
     */
    haproxySync(options = {}) {
      const { routes, unresolved, conflicts, peers, deployList } = UnderpostWireguard.API.routeTable(options.deployId);
      // Fail before the per-hostname report: with nothing resolved, listing
      // every unbound hostname buries the one line that explains the run.
      if (routes.length === 0)
        throw new Error(
          '[wireguard] No hostname resolved to a spoke; publishing would refuse every request. ' +
            'Register a peer with --peer-add and bind it with --hosts / --instances, or mark it --default.',
        );
      if (unresolved.length > 0)
        logger.warn('Hostnames with no spoke binding; they will fall through to the default backend or be refused', {
          unresolved,
        });
      if (conflicts.length > 0)
        logger.warn('Hostnames claimed by more than one deploy; only the first is served', { conflicts });
      const state = readEdgeContext();
      if (state.role !== 'hub') throw new Error('[wireguard] HAProxy routing can be published only on the hub');
      const defaultPeer = defaultPeerFactory(state.peers);
      const maps = haproxyMapsFactory({ routes });
      const conf = haproxyConfFactory({
        peers,
        defaultPeerId: defaultPeer?.id || '',
        sshForwardPort: state.sshForwardPort,
      });

      const targets = [
        { target: `${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.sniMapName}`, content: maps.sni },
        { target: `${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.httpMapName}`, content: maps.http },
        { target: `${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.haproxyConfName}`, content: conf },
      ];
      const previous = targets.map(({ target }) => ({
        target,
        content: fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null,
      }));
      const restore = () => {
        for (const entry of previous) {
          if (entry.content === null) shellExec(`sudo rm -f ${entry.target}`, { silent: true });
          else installRootFile({ target: entry.target, content: entry.content, mode: '0644' });
        }
      };

      let changed = false;
      for (const entry of targets) changed = installRootFile({ ...entry, dryRun: options.dryRun }) || changed;
      if (options.dryRun) {
        logger.info('[dry-run] edge routes', { deployList, routes, unresolved, conflicts });
        return { routes, unresolved, conflicts, changed };
      }

      const check = shellExec(
        `sudo haproxy -c -f ${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.haproxyConfName} 2>&1`,
        { stdout: true, silent: true, silentOnError: true },
      );
      if (!`${check}`.includes('Configuration file is valid')) {
        restore();
        const detail = `${check}`.trim().split('\n').slice(-3).join(' ');
        logger.error('HAProxy rejected the candidate config; the previous config was restored', { detail });
        throw new Error(`[wireguard] HAProxy rejected the generated config: ${detail}`);
      }
      // Reload only a daemon that is already up: on a first bring-up the config
      // is written before `--haproxy-setup` enables the service, and reloading a
      // stopped unit is a failure rather than a no-op.
      if (changed) shellExec(systemdReloadIfActiveCommandFactory('haproxy'), { silent: true });

      const quicTarget = defaultPeer?.address || '';
      runHostCommands(
        quicForwardCommandsFactory({ interfaceName: state.interfaceName, target: quicTarget }).ensure,
        options.dryRun,
      );
      logger.info('Edge routes published', {
        deployList,
        routes: routes.length,
        unresolved: unresolved.length,
        conflicts: conflicts.length,
        reloaded: changed,
        quicTarget,
      });
      return { routes, unresolved, conflicts, changed };
    },

    /**
     * @method haproxySetup
     * @description Installs HAProxy, publishes the current routes, and enables
     * the daemon so the edge survives a reboot.
     * @param {object} options - CLI options.
     * @returns {void}
     * @memberof UnderpostWireguard
     */
    haproxySetup(options = {}) {
      UnderpostWireguard.API.install(options);
      UnderpostWireguard.API.haproxySync(options);
      runServiceCommands([systemctlCommandFactory({ action: 'enable --now', name: 'haproxy' })], options.dryRun);
      logger.info('HAProxy edge gateway enabled');
    },

    /**
     * @method forwardProxyConfig
     * @description Resolves and validates the hub proxy endpoint.
     * @param {object} [options] - CLI options.
     * @returns {{host: string, port: number, apiKey: string, address: string, interfaceName: string, listenPort: number, tunnelCidr: string}} Resolved endpoint; `apiKey` must never be logged.
     * @throws {Error} When run on a spoke, or with no key configured.
     * @memberof UnderpostWireguard
     */
    forwardProxyConfig(options = {}) {
      const state = readEdgeContext();
      if (state.role !== 'hub') throw new Error('[wireguard] --forward-proxy-server runs only on the hub');
      const config = forwardProxyConfigFactory({
        host: `${options.forwardProxyServerHost || ''}`.trim() || tunnelAddressFactory(state.address),
        port: options.forwardProxyServerPort,
      });
      if (!config.apiKey)
        throw new Error(
          `[wireguard] ${FORWARD_PROXY.env.apiKey} is not set; every proxied request is authenticated with it. ` +
            `Export it, put it in the deploy env selected by \`underpost env <deploy-id> <environment>\` (./.env), ` +
            `or set it with \`underpost env set ${FORWARD_PROXY.env.apiKey} <key>\``,
        );
      if (['0.0.0.0', '::', '*'].includes(config.host))
        logger.warn('Forward proxy is bound to a wildcard address, not the tunnel', {
          host: config.host,
          consequence: 'the proxy is reachable from every interface; only the API key refuses a request',
          instead: `--forward-proxy-server-host ${tunnelAddressFactory(state.address) || tunnelAddressFactory(UNDERPOST_EDGE.cidr)}`,
        });
      return {
        ...config,
        address: `${config.host}:${config.port}`,
        interfaceName: state.interfaceName,
        listenPort: state.listenPort,
        tunnelCidr: tunnelNetworkCidrFactory(state.address),
      };
    },

    /**
     * @method forwardProxyNodePath
     * @description Selects a compatible Node binary that systemd can execute.
     * @returns {{path: string, probed: boolean, rejected: Array<object>}} The chosen binary, and why each earlier candidate was passed over.
     * @memberof UnderpostWireguard
     */
    forwardProxyNodePath() {
      const read = (command) => shellExec(command, { stdout: true, silent: true, silentOnError: true }).trim();
      const ok = (command) => shellExec(command, { silent: true, silentOnError: true }).code === 0;
      const requiredMajor = Number(`${process.versions.node}`.split('.')[0]) || 0;
      const probed = read(systemdAvailableCommandFactory()) !== '';
      const user = os.userInfo().username;
      const rejected = [];
      for (const candidate of forwardProxyNodeCandidatesFactory()) {
        if (!ok(`sudo test -x ${candidate}`)) {
          rejected.push({ candidate, reason: 'not present' });
          continue;
        }
        const major = Number(read(`sudo ${candidate} --version`).replace(/^v/, '').split('.')[0]) || 0;
        if (major < requiredMajor) {
          rejected.push({ candidate, reason: `runs Node v${major || '?'}, the engine needs v${requiredMajor}` });
          continue;
        }
        if (probed && !ok(forwardProxyNodeProbeCommandFactory(candidate, user))) {
          rejected.push({
            candidate,
            reason: homeDirectoryPathFactory(candidate)
              ? 'systemd cannot execute it: it is under a home directory, whose SELinux label a unit cannot enter'
              : 'systemd cannot execute it',
          });
          continue;
        }
        return { path: candidate, probed, rejected };
      }
      return { path: '', probed, rejected };
    },

    /**
     * @method forwardProxyServer
     * @description Reconciles the supervised proxy service.
     * @param {object} [options] - CLI options.
     * @returns {?object} What was reconciled, or null under `--dry-run`.
     * @throws {Error} When run on a spoke, or with no key configured.
     * @memberof UnderpostWireguard
     */
    forwardProxyServer(options = {}) {
      if (`${process.env[FORWARD_PROXY.supervisedEnv] || ''}`.trim())
        return UnderpostWireguard.API.forwardProxyListen(options);

      const read = (command) => shellExec(command, { stdout: true, silent: true, silentOnError: true }).trim();
      const ok = (command) => shellExec(command, { silent: true, silentOnError: true }).code === 0;
      const withdrawBrokenUnit = () => {
        if (fs.existsSync(FORWARD_PROXY.unitPath))
          runServiceCommands(forwardProxyServiceCommandsFactory().remove, false);
      };
      const config = UnderpostWireguard.API.forwardProxyConfig(options);
      const node = options.dryRun
        ? { path: process.execPath, probed: false, rejected: [] }
        : UnderpostWireguard.API.forwardProxyNodePath();
      if (!node.path) {
        logger.error('No Node binary the forward proxy service can execute', {
          requires: `Node v${`${process.versions.node}`.split('.')[0]}`,
          rejected: node.rejected,
          fix: 'install Node system-wide, then re-run: curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash - && sudo dnf install -y nodejs',
        });
        withdrawBrokenUnit();
        throw new Error(
          '[wireguard] No Node binary the forward proxy service can execute; install Node system-wide (a binary under /root or /home cannot be run by a unit) and re-run',
        );
      }
      if (node.probed === false && homeDirectoryPathFactory(node.path))
        logger.warn('Forward proxy unit points at a Node binary under a home directory', {
          node: node.path,
          risk: 'systemd refuses those on an SELinux host and the service restarts on 203/EXEC',
          fix: 'install Node system-wide, or check `journalctl -u underpost-forward-proxy` after this run',
        });
      if (node.probed && !ok(forwardProxyStartProbeCommandFactory({ nodePath: node.path }))) {
        logger.error('The forward proxy service cannot start this checkout', {
          node: node.path,
          cli: process.argv[1],
          workingDirectory: process.cwd(),
          likely: homeDirectoryPathFactory(process.cwd())
            ? 'the checkout is under a home directory, which a unit cannot read on an SELinux host'
            : 'the service cannot read the checkout; see the journal for the failing command',
          check: `sudo ${forwardProxyStartProbeCommandFactory({ nodePath: node.path }).replace(/^sudo /, '')}`,
        });
        withdrawBrokenUnit();
        throw new Error(
          `[wireguard] A systemd unit cannot start ${process.argv[1]} from ${process.cwd()}; move the checkout out of a home directory (e.g. /opt/underpost/engine) and re-run`,
        );
      }
      runHostCommands(
        firewallCommandsFactory({
          role: 'hub',
          interfaceName: config.interfaceName,
          listenPort: config.listenPort,
          tunnelCidr: config.tunnelCidr,
        }),
        options.dryRun,
      );
      const unit = forwardProxyUnitFactory({
        host: config.host,
        port: config.port,
        apiKey: config.apiKey,
        interfaceName: config.interfaceName,
        command: forwardProxyCommandFactory({ host: config.host, port: config.port, execPath: node.path }),
      });
      const changed = installRootFile({
        target: FORWARD_PROXY.unitPath,
        content: unit,
        mode: '0600',
        dryRun: options.dryRun,
      });
      runServiceCommands(forwardProxyServiceCommandsFactory({ changed }).ensure, options.dryRun);
      if (options.dryRun) {
        logger.info('[dry-run] would reconcile the forward proxy service', {
          service: FORWARD_PROXY.serviceName,
          address: config.address,
        });
        return null;
      }
      const statusCommands = systemdStatusCommandsFactory(FORWARD_PROXY.serviceName);
      const state = read(statusCommands.active);
      const enabled = read(statusCommands.enabled);
      logger.info('Forward proxy service reconciled', {
        service: FORWARD_PROXY.serviceName,
        address: config.address,
        tunnel: config.tunnelCidr,
        node: node.path,
        unitChanged: changed,
        state,
        enabled,
        logs: journalctlCommandFactory({ name: FORWARD_PROXY.serviceName, follow: true }),
      });
      const running = state === 'active' || state === 'activating';
      if (!running) {
        logger.error('Forward proxy service did not come up', {
          state: state || '(unknown)',
          likely: `${config.host} does not exist yet, so the listener cannot bind — bring the tunnel up with --wireguard-start`,
          check: journalctlCommandFactory({ name: FORWARD_PROXY.serviceName, lines: 20 }),
        });
        process.exitCode = 1;
      }
      return { service: FORWARD_PROXY.serviceName, address: config.address, changed, state, enabled };
    },

    /**
     * @method forwardProxyListen
     * @description Starts the authenticated listener on the resolved hub address.
     * @param {object} [options] - CLI options.
     * @returns {object} The listening server.
     * @throws {Error} When run on a spoke, or with no key configured.
     * @memberof UnderpostWireguard
     */
    forwardProxyListen(options = {}) {
      const config = UnderpostWireguard.API.forwardProxyConfig(options);
      let server;
      server = forwardProxyServerFactory({
        config,
        onError(error) {
          logger.error('Forward proxy listener failed', { address: config.address, message: error.message });
          process.exitCode = 1;
          server.close(() => {});
        },
        onListen() {
          logger.info('Forward proxy listening', { address: config.address, tunnel: UNDERPOST_EDGE.tunnelCidr });
        },
      });
      return server;
    },

    /**
     * @method start
     * @description Enables and starts the tunnel, and the QUIC forward with it.
     * @param {object} options - CLI options.
     * @returns {void}
     * @memberof UnderpostWireguard
     */
    start(options = {}) {
      const state = readEdgeContext();
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      runServiceCommands(
        [systemctlCommandFactory({ action: 'enable --now', name: `wg-quick@${interfaceName}` })],
        options.dryRun,
      );
      if (state.role === 'hub')
        runHostCommands(
          quicForwardCommandsFactory({ interfaceName, target: defaultPeerFactory(state.peers)?.address || '' }).ensure,
          options.dryRun,
        );
      logger.info('WireGuard interface started', { interfaceName });
    },

    /** Restarts the interface so an active but stale tunnel is actually renegotiated. */
    restart(options = {}) {
      const state = assertEdgeIdentity(readEdgeContext(), options);
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      runServiceCommands(
        [
          systemctlCommandFactory({ action: 'enable', name: `wg-quick@${interfaceName}` }),
          systemctlCommandFactory({ action: 'restart', name: `wg-quick@${interfaceName}` }),
        ],
        options.dryRun,
      );
      if (state.role === 'hub')
        runHostCommands(
          quicForwardCommandsFactory({ interfaceName, target: defaultPeerFactory(state.peers)?.address || '' }).ensure,
          options.dryRun,
        );
      logger.info('WireGuard interface restarted', { interfaceName });
    },

    /** Waits for the local interface to become healthy and sets a failing exit code otherwise. */
    check(options = {}) {
      const state = assertEdgeIdentity(readEdgeContext(), options);
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      const timeoutSeconds = options.checkTimeout === undefined ? 30 : Math.max(0, Number(options.checkTimeout) || 0);
      const deadline = Date.now() + timeoutSeconds * 1000;
      let health;
      do {
        const read = (command) =>
          `${
            shellExec(command, {
              stdout: true,
              silent: true,
              silentOnError: true,
              disableLog: true,
            }) || ''
          }`.trim();
        health = wireguardHealthFactory({
          context: state,
          active: read(systemdStatusCommandsFactory(`wg-quick@${interfaceName}`).active),
          latestHandshakes: read(`sudo wg show ${interfaceName} latest-handshakes`),
        });
        if (health.ok || Date.now() >= deadline) break;
        sleepSync(1000);
      } while (true);

      const report = { interface: interfaceName, ...health };
      if (health.ok) logger.info('WireGuard health check passed', report);
      else {
        logger.error('WireGuard health check failed', report);
        process.exitCode = 1;
      }
      return report;
    },

    /**
     * @method stop
     * @description Tears the tunnel down and removes the packet rules that only
     * make sense while it is up.
     * @param {object} options - CLI options.
     * @returns {void}
     * @memberof UnderpostWireguard
     */
    stop(options = {}) {
      const state = readEdgeContext();
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      runHostCommands(
        [
          systemctlCommandFactory({
            action: 'disable --now',
            name: `wg-quick@${interfaceName}`,
            stderr: true,
            allowFailure: true,
          }),
          `sudo sh -c 'wg-quick down ${interfaceName} 2>/dev/null || true'`,
          ...quicForwardCommandsFactory({ interfaceName }).remove,
        ],
        options.dryRun,
      );
      logger.info('WireGuard interface stopped', { interfaceName });
    },

    /**
     * @method reset
     * @description Returns the host to zero: stops the daemons and withdraws
     * every artifact the setup installed.
     *
     * Everything this subsystem writes outside the repo is removed — interface
     * config, sysctl drop-in, both HAProxy map files *and* the generated
     * `haproxy.cfg`, the forward proxy unit, the NAT chains, and the firewalld
     * rules opened for the recorded role. Leaving `haproxy.cfg` behind while
     * deleting the maps it reads is worse than leaving both: the daemon then
     * fails to start on a config that references files that no longer exist.
     *
     * The key pair and topology are deliberately kept: destroying the key
     * invalidates every spoke's peer entry, and topology is authored source
     * that nothing can regenerate. A reset is for reconfiguring an edge rather
     * than for re-establishing trust with all of them; re-keying is what
     * {@link UnderpostWireguard.reinstall} is for.
     * @param {object} options - CLI options.
     * @returns {void}
     * @memberof UnderpostWireguard
     */
    reset(options = {}) {
      const state = readEdgeContext();
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      UnderpostWireguard.API.stop({ ...options, interface: interfaceName });
      runHostCommands(
        [
          `sudo rm -f ${UNDERPOST_EDGE.wireguardDir}/${interfaceName}.conf`,
          `sudo rm -f ${UNDERPOST_EDGE.sysctlPath}`,
          systemctlCommandFactory({
            action: 'disable --now',
            name: 'haproxy',
            stderr: true,
            allowFailure: true,
          }),
          `sudo rm -f ${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.sniMapName}`,
          `sudo rm -f ${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.httpMapName}`,
          `sudo rm -f ${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.haproxyConfName}`,
          ...forwardProxyServiceCommandsFactory().remove,
          ...firewallCommandsFactory({
            role: state.role,
            interfaceName,
            listenPort: state.listenPort,
            tunnelCidr: tunnelNetworkCidrFactory(state.address),
            sshForwardPort: state.sshForwardPort,
            remove: true,
          }),
        ],
        options.dryRun,
      );
      logger.info('Edge host state removed; key pair, topology and node identity retained', {
        interfaceName,
        role: state.role,
        firewallWithdrawn: true,
      });
    },

    /**
     * @method reinstall
     * @description Full purge and rebuild: reset, drop the key pair, reinstall
     * the packages, then re-key and republish.
     *
     * Every spoke has to be re-registered afterwards, because the hub's identity
     * changed — that is the point of the command, and the reason it is separate
     * from `--wireguard-reset`.
     * @param {object} options - CLI options.
     * @returns {void}
     * @memberof UnderpostWireguard
     */
    reinstall(options = {}) {
      const state = readEdgeContext();
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      UnderpostWireguard.API.reset({ ...options, interface: interfaceName });
      runHostCommands(
        [
          `sudo rm -f ${UNDERPOST_EDGE.wireguardDir}/${interfaceName}.key`,
          `sudo rm -f ${UNDERPOST_EDGE.wireguardDir}/${interfaceName}.pub`,
          `sudo dnf -y reinstall ${UNDERPOST_EDGE.packages.join(' ')} || sudo dnf -y install ${UNDERPOST_EDGE.packages.join(' ')}`,
        ],
        options.dryRun,
      );
      const next = UnderpostWireguard.API.setup({ ...options, interface: interfaceName });
      logger.warn('Re-keyed: this machine now presents a new identity, and the far end still expects the old one', {
        interfaceName,
        publicKey: next.publicKey,
        topology:
          next.role === 'hub'
            ? `hub ${next.hubHost} now has publicKey '${next.publicKey}'`
            : `peer ${next.peerId} on hub ${next.hubHost} now has publicKey '${next.publicKey}'`,
      });
    },

    /**
     * @method syncTargets
     * @description Every node the engine is deployed on, with the identity that
     * reaches it.
     *
     * Both registries are joined through the same resolvers remediation uses,
     * so a node the engine can be synced on is exactly a node it can be repaired
     * on — a second host list here would be free to disagree with that.
     * @param {object} [options] - CLI options (`nodes`).
     * @returns {Array<object>} Resolved targets, hubs first.
     * @throws {Error} When a selector matches no registered node.
     * @memberof UnderpostWireguard
     */
    syncTargets(options = {}) {
      const selectors = parseList(options.nodes);
      const matched = new Set();
      const selected = (nodeName, id) => {
        const hit = selectors.find((selector) => selector === nodeName || selector === id);
        if (hit) matched.add(hit);
        return selectors.length === 0 || Boolean(hit);
      };

      const targets = [
        ...Underpost.event
          .hubs()
          .filter((hub) => selected(hub.nodeName, hub.hubHost))
          .map((hub) => ({ ...Underpost.event.hubTarget(hub.hubHost), nodeName: hub.nodeName || hub.hubHost })),
        ...Underpost.event
          .spokes()
          .filter((spoke) => selected(spoke.nodeName, spoke.id))
          .map((spoke) => ({ ...Underpost.event.spokeTarget(spoke.id), nodeName: spoke.nodeName || spoke.id })),
      ];

      const unknown = selectors.filter((selector) => !matched.has(selector));
      if (unknown.length > 0) throw new Error(`[wireguard] no registered node matches: ${unknown.join(', ')}`);
      return targets;
    },

    /**
     * @method nodeExporter
     * @description Provisions the host metrics collector on the nodes the
     * cluster cannot schedule it onto.
     *
     * Only hubs: every cluster node already runs the collector as a DaemonSet
     * pod, so a second copy there would bind a port the pod holds. The
     * collector listens on the node's tunnel address, which is the address
     * Prometheus already scrapes it at.
     * @param {object} [options] - CLI options (`nodes`, `dryRun`).
     * @returns {Promise<{ok: boolean, nodes: Array<object>}>} Per-node outcome.
     * @memberof UnderpostWireguard
     */
    async nodeExporter(options = {}) {
      const targets = Underpost.wireguard.syncTargets(options).filter((target) => target.role === 'hub');
      if (targets.length === 0)
        throw new Error(
          `[wireguard] no hub node ${
            parseList(options.nodes).length > 0 ? 'matches --nodes' : `is registered in ${EDGE_TOPOLOGY_PATH}`
          }; cluster nodes run the collector as a DaemonSet, so only hubs are provisioned here`,
        );
      const nodes = [];

      for (const target of targets) {
        logger.info('Provisioning host metrics collector', { node: target.nodeName, address: target.address });
        const result = await Underpost.event.runCommand(
          nodeExporterServiceScriptFactory({ host: target.address, interfaceName: options.interface || 'wg0' }),
          { ...options, user: target.user, host: target.host },
        );
        if (!result.ok)
          logger.error('Collector provisioning failed', {
            node: target.nodeName,
            output: `${result.error || result.output || ''}`.trim().slice(-1500),
          });
        nodes.push({ nodeName: target.nodeName, via: target.via, ok: result.ok });
      }

      return { ok: nodes.every((node) => node.ok), nodes };
    },

    /**
     * @method syncCommands
     * @description The sync sequence, bound to the repositories it pulls from.
     *
     * `--repo-engine` accepts `owner/repo` or a clone URL and defaults to the
     * configured GitHub account's `engine`; the private repository follows the
     * same account, because the two are pulled onto the node as one checkout.
     *
     * The engine's default branch is resolved here, once, and named explicitly
     * in the command: the node is about to replace its own checkout, so asking
     * it to work out which branch to fetch would depend on the very tooling and
     * credentials the step exists to renew.
     * @param {object} [options] - CLI options (`repoEngine`).
     * @returns {Array<{command: string, halt: boolean}>} Steps in execution order.
     * @memberof UnderpostWireguard
     */
    syncCommands(options = {}) {
      const account = process.env.GITHUB_USERNAME || 'underpostnet';
      const engine = Underpost.repo.repoSlugFactory(`${options.repoEngine || ''}`.trim() || `${account}/engine`);
      const enginePrivate = `${process.env.GITHUB_USERNAME || engine.split('/')[0]}/engine-private`;
      const branch = Underpost.repo.getDefaultBranch(engine);
      return ENGINE_SYNC_STEPS.map((step) => ({
        ...step,
        command: step.command
          .replace('<engine-private>', enginePrivate)
          .replace('<engine-branch>', branch)
          .replace('<engine>', engine),
      }));
    },

    /**
     * @method syncScript
     * @description The whole sequence as one command.
     *
     * A node is reached once, not once per step: each SSH session re-reads the
     * credential store, re-authenticates and re-enters the checkout, so running
     * six of them per host is six times the handshake for one unit of work — and
     * a step could land on a different session than the one before it. `&&`
     * carries the halt order; the advisory step is neutralized in place so a
     * remaining audit finding cannot stop the install behind it.
     * @param {object} [options] - CLI options (`repoEngine`).
     * @returns {string} Composed remote command.
     * @memberof UnderpostWireguard
     */
    syncScript(options = {}) {
      return Underpost.wireguard
        .syncCommands(options)
        .map(({ command, halt }) => `echo '[sync] ${command}' && ${halt ? command : `{ ${command} || true; }`}`)
        .join(' && ');
    },

    /**
     * @method sync
     * @description Brings every node's engine checkout to the current sources,
     * over the SSH identity registered for it.
     *
     * One node failing does not stop the others: they are independent hosts, and
     * a partially synced fleet is reported rather than hidden. Each node is one
     * session, and the `[sync]` line it last echoed names the step it stopped at.
     * @param {object} [options] - CLI options (`nodes`, `repoEngine`, `dryRun`).
     * @returns {Promise<{ok: boolean, nodes: Array<object>}>} Per-node outcome.
     * @memberof UnderpostWireguard
     */
    async sync(options = {}) {
      // The engine repositories are private, and their credentials live in the
      // cron deploy environment rather than the host's.
      loadCronDeployEnv();
      const targets = Underpost.wireguard.syncTargets(options);
      if (targets.length === 0) throw new Error(`[wireguard] no node is registered in ${EDGE_TOPOLOGY_PATH}`);
      const script = Underpost.wireguard.syncScript(options);
      const nodes = [];

      for (const target of targets) {
        logger.info('Syncing engine checkout', { node: target.nodeName, via: target.via });
        const result = await Underpost.event.runCommand(script, {
          ...options,
          user: target.user,
          host: target.host,
        });
        if (!result.ok)
          logger.error('Sync failed', {
            node: target.nodeName,
            output: `${result.error || result.output || ''}`.trim().slice(-1500),
          });
        nodes.push({ nodeName: target.nodeName, via: target.via, ok: result.ok });
      }

      return { ok: nodes.every((node) => node.ok), nodes };
    },

    /**
     * @method callback
     * @description CLI entry point for both `underpost wireguard` and
     * `underpost haproxy`.
     *
     * Flags are evaluated in lifecycle order — install, setup, peer changes,
     * route publication, then daemon control — so a single invocation can carry
     * a whole bring-up (`--node-config --wireguard-install --wireguard-setup
     * --haproxy-setup --wireguard-start`) and still execute the steps in the only
     * order that works. `--status` runs last, so it reports what the run left
     * behind.
     * @param {object} [options] - CLI options.
     * @returns {Promise<void>}
     * @memberof UnderpostWireguard
     */
    async callback(options = {}) {
      // Fleet-wide and identity-independent: they reach other machines rather
      // than reconciling this one, so they never fall through to a host action.
      if (options.sync === true) return reportFleetOutcome(await UnderpostWireguard.API.sync(options));
      if (options.nodeExporter === true) return reportFleetOutcome(await UnderpostWireguard.API.nodeExporter(options));

      if (options.nodeConfig === true) UnderpostWireguard.API.nodeConfig(options);
      // `--build-conf` is a hard promise, not a modifier: it short-circuits
      // every host action so the run cannot touch /etc, iptables, systemd or a
      // live interface even when other lifecycle flags are also present.
      if (options.buildConf === true) {
        if (options.wireguardSetup === true) UnderpostWireguard.API.setup(options);
        if (options.peerAdd) UnderpostWireguard.API.peerAdd(options);
        if (options.peerRemove) UnderpostWireguard.API.peerRemove(options);
        if (!options.wireguardSetup && !options.peerAdd && !options.peerRemove)
          UnderpostWireguard.API.buildConf(options);
        if (options.status === true) UnderpostWireguard.API.status(options);
        return;
      }

      const hostActions = [
        options.wireguardInstall,
        options.wireguardSetup,
        options.peerAdd,
        options.peerRemove,
        options.haproxySetup,
        options.haproxySync,
        options.wireguardStop,
        options.wireguardStart,
        options.wireguardRestart,
        options.forwardProxyServer,
        options.status,
        options.check,
        options.wireguardReset,
        options.wireguardReinstall,
      ];
      if (options.nodeConfig === true && !hostActions.some(Boolean)) return;

      if (options.wireguardReinstall === true) return void UnderpostWireguard.API.reinstall(options);
      if (options.wireguardReset === true) return void UnderpostWireguard.API.reset(options);
      if (options.wireguardInstall === true) UnderpostWireguard.API.install(options);
      if (options.wireguardSetup === true) UnderpostWireguard.API.setup(options);
      if (options.peerAdd) UnderpostWireguard.API.peerAdd(options);
      if (options.peerRemove) UnderpostWireguard.API.peerRemove(options);
      if (options.haproxySetup === true) UnderpostWireguard.API.haproxySetup(options);
      else if (options.haproxySync === true) UnderpostWireguard.API.haproxySync(options);
      if (options.wireguardStop === true) UnderpostWireguard.API.stop(options);
      if (options.wireguardStart === true) UnderpostWireguard.API.start(options);
      if (options.wireguardRestart === true) UnderpostWireguard.API.restart(options);
      // After the tunnel, because the service requires it and its address only
      // exists once the interface is up; before `--status`, so a run that
      // reconciles the service also reports it.
      if (options.forwardProxyServer === true) UnderpostWireguard.API.forwardProxyServer(options);
      if (options.check === true) UnderpostWireguard.API.check(options);
      if (options.status === true) UnderpostWireguard.API.status(options);
    },
  };
}

export {
  EDGE_TOPOLOGY_PATH,
  ENGINE_SYNC_STEPS,
  UNDERPOST_EDGE,
  allowedIpsConflictsFactory,
  assertEdgeIdentity,
  backendNameFactory,
  defaultPeerFactory,
  deployListFactory,
  edgeRouteTableFactory,
  edgeContextFactory,
  endpointHostFactory,
  firewallCommandsFactory,
  haproxyConfFactory,
  haproxyMapsFactory,
  hostProxyEntriesFactory,
  hostAddressesFactory,
  hubTunnelAddressFactory,
  instanceProxyEntriesFactory,
  localPeerFactory,
  mergeRouteTablesFactory,
  peerFactory,
  quicForwardCommandsFactory,
  readEdgeContext,
  readNodeConfigs,
  readTopology,
  redirectHostFactory,
  unregisteredPeersFactory,
  tunnelAddressFactory,
  tunnelNetworkCidrFactory,
  wireguardClientConfFactory,
  wireguardHealthFactory,
  wireguardServerConfFactory,
  wireguardStatusFactory,
  topologyFactory,
  hubFactory,
  nodeIdentityFactory,
  nodeNameCandidatesFactory,
};

export default UnderpostWireguard;
