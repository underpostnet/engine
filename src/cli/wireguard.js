/**
 * Edge routing for distributed homelab sites: a WireGuard overlay and the public
 * gateway in front of it.
 *
 * Homelab clusters sit behind dynamic ISP addresses and CGNAT, so nothing on the
 * public internet can dial them. A cloud VPS with a static address holds the
 * hostname, and every spoke keeps an outbound UDP session open to it — the only
 * direction a CGNAT boundary lets a session start.
 *
 * Two layers, kept apart:
 *
 * - **WireGuard** is the L3 encrypted transport. It owns one interface, one peer
 *   table and the networks each spoke routes. It knows nothing about hostnames.
 * - **HAProxy** is the public edge gateway. It is the only layer that maps a
 *   hostname to a spoke.
 *
 * The gateway never terminates TLS. HAProxy reads the SNI out of the ClientHello
 * and forwards the still-encrypted stream over the tunnel, so certificates and
 * private keys stay inside the cluster that already owns them and the VPS holds
 * no key material for any hostname it serves. This is the same split
 * {@link module:src/server/underpost-ingress.js} makes inside a node, one hop
 * further out:
 *
 * - `TCP :80`  is routed by `Host` — plaintext carries a readable header, and
 *              ACME http-01 rides this path to the spoke's own ingress.
 * - `TCP :443` is passed through by SNI — no decryption, no ALPN re-negotiation.
 * - `UDP :443` is DNAT'd whole to the default spoke. A QUIC Initial carries its
 *              SNI inside an encrypted frame, so the port cannot be split per
 *              hostname; a client that tries QUIC against another spoke's
 *              hostname gets no answer and falls back to TCP.
 *
 * Those three carry traffic *inbound*. The forward proxy is the one path in the
 * other direction: a spoke that has to appear on the internet as the VPS — an
 * API keyed to the edge's address, a provider endpoint that must not see a
 * residential IP — sends the request to `10.0.0.1:1080` and the hub makes it.
 * It binds the tunnel address alone and authenticates every request, so it is
 * an open relay to nothing.
 *
 * Routing is derived, never hand-written: `conf.server.json` and
 * `conf.instances.json` say which hostnames exist, and `conf.wireguard.json`
 * says which spoke each one lives behind, through three bindings resolved most
 * specific first — `hosts`, `instances`, `default`.
 *
 * Layout on the host:
 *   /etc/wireguard/<iface>.conf                 interface + peer table
 *   /etc/wireguard/<iface>.key                  private key, 0600, root-only
 *   /etc/wireguard/<iface>.pub                  public key
 *   /etc/haproxy/haproxy.cfg                    generated edge gateway
 *   /etc/haproxy/domain2backend.map             SNI  -> spoke backend
 *   /etc/haproxy/domain2backend-http.map        Host -> spoke backend
 *
 * @module src/cli/wireguard.js
 * @namespace UnderpostWireguard
 */

import dotenv from 'dotenv';
import fs from 'fs-extra';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import nodePath from 'node:path';
import {
  getConfFilePath,
  getUnderpostRootPath,
  loadConfInstances,
  loadConfServerJson,
  resolveDeployList,
} from '../server/conf.js';
import { loggerFactory, loggerMiddleware } from '../server/logger.js';
import { shellExec } from '../server/process.js';

const logger = loggerFactory(import.meta);
// Proxied traffic is reported at `http`, the level morgan's stream writes to, so
// the forward path and the CONNECT path appear at one verbosity — and neither is
// suppressed by the module logger's default `info` level.
const proxyLogger = loggerFactory(import.meta, 'debug');

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
  // The forward proxy a spoke borrows the hub's public address through. It binds
  // the tunnel address only, so the port is unreachable from the internet even
  // when a firewall would allow it.
  forwardProxyPort: 1080,
  forwardProxyTimeoutMs: 30000,
  forwardProxyEnv: {
    apiKey: 'FORWARD_PROXY_API_KEY',
    host: 'FORWARD_PROXY_HOST',
    port: 'FORWARD_PROXY_PORT',
  },
  // One fixed unit name, which is what makes re-running the command converge on
  // a single service rather than accumulate one per invocation.
  forwardProxyServiceName: 'underpost-forward-proxy',
  forwardProxyUnitPath: '/etc/systemd/system/underpost-forward-proxy.service',
  // Set by the unit alone: it tells the same command it is the supervised process
  // and should bind the socket rather than reconcile the service again.
  forwardProxySupervisedEnv: 'UNDERPOST_FORWARD_PROXY_SUPERVISED',
  forwardProxyRestartSeconds: 5,
  // A peer is considered live within this window: WireGuard re-handshakes at
  // least every 120s while traffic flows, so a longer gap means the link is
  // down rather than merely idle.
  handshakeStaleSeconds: 180,
};

/**
 * @method deployIdFactory
 * @description Normalizes a deploy id to the `dd-<conf-id>` convention.
 * @param {string} deployId - Deploy id, with or without the prefix.
 * @returns {string} Prefixed deploy id.
 * @memberof UnderpostWireguard
 */
const deployIdFactory = (deployId) => {
  const value = `${deployId || ''}`.trim();
  // `dd` is the meta id every runner reads as "all of dd.router"; prefixing it
  // would turn it into a deploy that does not exist.
  if (!value || value === 'dd') return value;
  return value.startsWith('dd-') ? value : `dd-${value}`;
};

/**
 * @method deployListFactory
 * @description The deploys whose hostnames a run publishes.
 *
 * `dd` expands through the same `dd.router` read every other runner uses, so
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
 * @constant EDGE_STATE_PATH
 * @description Location of the peer registry.
 *
 * Cluster-wide rather than per deploy, and stored beside `dd.router` for that
 * reason: the hub has one interface, one address and one peer table, and those
 * are properties of the machine. A copy per deploy would be several records of
 * one fact, free to disagree. `--deploy-id` selects which hostnames are routed
 * across it, not which tunnel exists.
 *
 * Holds public keys only — the private half never leaves `/etc/wireguard` on
 * the host that generated it.
 * @memberof UnderpostWireguard
 */
const EDGE_STATE_PATH = './engine-private/deploy/conf.wireguard.json';

/**
 * @method peerFactory
 * @description Normalizes one spoke entry, filling the fields a partially
 * written registry may omit.
 *
 * `allowedIPs` defaults to the peer's own tunnel address alone: a spoke routes
 * its LAN only when the registry says so, so a mistyped entry cannot silently
 * claim a subnet another spoke already answers for.
 * @param {object} peer - Raw registry entry.
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
 * @param {Array<object>} [peers] - Normalized registry entries.
 * @returns {?object} The fallback peer, or null.
 * @memberof UnderpostWireguard
 */
const defaultPeerFactory = (peers = []) =>
  peers.find((peer) => peer.default === true) || (peers.length === 1 ? peers[0] : null);

/**
 * @method edgeStateFactory
 * @description Normalizes the registry as a whole, so every consumer reads one
 * shape whether the file exists, is partial, or is absent.
 *
 * `endpoint` and `hubPublicKey` are the pair a spoke needs to rebuild its own
 * interface: the hub it dials, and the identity it expects there. Both are
 * recorded so re-running the setup does not require re-supplying them, which is
 * what makes a spoke's bring-up repeatable and `--wireguard-reinstall` possible
 * on a spoke at all. Neither is secret — a public key is public.
 * @param {object} [state] - Raw registry contents.
 * @returns {object} Normalized registry.
 * @memberof UnderpostWireguard
 */
const edgeStateFactory = (state = {}) => ({
  interfaceName: `${state.interfaceName || UNDERPOST_EDGE.interfaceName}`.trim(),
  role: `${state.role || ''}`.trim(),
  listenPort: Number(state.listenPort) > 0 ? Number(state.listenPort) : UNDERPOST_EDGE.listenPort,
  address: `${state.address || ''}`.trim(),
  endpoint: `${state.endpoint || ''}`.trim(),
  hubPublicKey: `${state.hubPublicKey || ''}`.trim(),
  publicKey: `${state.publicKey || ''}`.trim(),
  peers: (Array.isArray(state.peers) ? state.peers : []).map(peerFactory).filter((peer) => peer.id),
});

/**
 * @method readEdgeState
 * @description The peer registry. A missing or malformed file is treated as an
 * empty registry rather than an error: the first `--wireguard-setup` on a fresh
 * host runs before any registry exists.
 * @returns {object} Normalized registry.
 * @memberof UnderpostWireguard
 */
const readEdgeState = () => {
  if (!fs.existsSync(EDGE_STATE_PATH)) return edgeStateFactory();
  try {
    return edgeStateFactory(JSON.parse(fs.readFileSync(EDGE_STATE_PATH, 'utf8')));
  } catch (error) {
    logger.warn('Ignoring unreadable wireguard registry', { target: EDGE_STATE_PATH, message: error.message });
    return edgeStateFactory();
  }
};

/**
 * @method writeEdgeState
 * @description Persists the peer registry.
 * @param {object} state - Registry to write.
 * @returns {boolean} True when the file changed.
 * @memberof UnderpostWireguard
 */
const writeEdgeState = (state) => {
  const target = EDGE_STATE_PATH;
  const next = `${JSON.stringify(edgeStateFactory(state), null, 2)}\n`;
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current === next) return false;
  fs.mkdirpSync(nodePath.dirname(target));
  fs.writeFileSync(target, next, 'utf8');
  return true;
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
 * a registry can bind a whole family with one entry.
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
  // than dependent on registry order changing under an edit.
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
 * multi-spoke registry breaks.
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
 * `dd.router` has to be compiled together — publishing one deploy's table alone
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
 * @param {Array<object>} [peers] - Peers to emit backends for.
 * @param {string} [defaultPeerId] - Peer an unmatched hostname falls back to.
 * @param {string} [mapDir] - Directory holding the map files.
 * @returns {string} haproxy.cfg contents.
 * @memberof UnderpostWireguard
 */
const haproxyConfFactory = ({ peers = [], defaultPeerId = '', mapDir = UNDERPOST_EDGE.haproxyDir } = {}) => {
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

${backends}${backends ? '\n\n' : ''}${defaults}
`;
};

/**
 * @method wireguardPrivateKeyDirective
 * @description Loads the interface key from disk after the interface is up.
 *
 * The key is deliberately not inlined into the rendered config: keeping it in
 * its own 0600 file means no rendered configuration, dry-run print, diff or log
 * line can ever carry it, and the config itself becomes a pure function of the
 * registry. `wg-quick` runs `PostUp` after `wg setconf`, so the interface is
 * keyed before it forwards anything.
 * @param {string} keyPath - Path of the private key file.
 * @returns {string} `PostUp` directive.
 * @memberof UnderpostWireguard
 */
const wireguardPrivateKeyDirective = (keyPath) => `PostUp = wg set %i private-key ${keyPath}`;

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
  return `# Generated by \`underpost wireguard --wireguard-setup --server\`. Do not edit by hand.
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
} = {}) => `# Generated by \`underpost wireguard --wireguard-setup --client\`. Do not edit by hand.
[Interface]
Address = ${`${address}`.includes('/') ? address : `${address}/32`}
${wireguardPrivateKeyDirective(keyPath)}

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
 * @param {string} role - `server` or `client`.
 * @param {string} [interfaceName] - Tunnel interface.
 * @param {number} [listenPort] - UDP listen port.
 * @param {boolean} [remove] - Withdraw the rules instead of adding them.
 * @returns {Array<string>} Shell commands, each a no-op when firewalld is absent.
 * @memberof UnderpostWireguard
 */
const firewallCommandsFactory = ({
  role,
  interfaceName = UNDERPOST_EDGE.interfaceName,
  listenPort = UNDERPOST_EDGE.listenPort,
  remove = false,
} = {}) => {
  const verb = remove ? 'remove' : 'add';
  const rules =
    role === 'server'
      ? [
          `--${verb}-port=${UNDERPOST_EDGE.httpPort}/tcp`,
          `--${verb}-port=${UNDERPOST_EDGE.httpsPort}/tcp`,
          `--${verb}-port=${UNDERPOST_EDGE.httpsPort}/udp`,
          `--${verb}-port=${listenPort}/udp`,
          // The forward proxy is admitted from the tunnel only. The listener
          // already binds the tunnel address alone, so this rule narrows a port
          // that is unreachable from anywhere else rather than opening one.
          `--${verb}-rich-rule="rule family=ipv4 source address=${UNDERPOST_EDGE.tunnelCidr} port port=${UNDERPOST_EDGE.forwardProxyPort} protocol=tcp accept"`,
          `--${verb}-masquerade`,
        ]
      : [`--zone=trusted --${verb}-interface=${interfaceName}`];
  const guard = 'command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld';
  return [
    ...rules.map((rule) => `sudo sh -c '${guard} && firewall-cmd --permanent ${rule} >/dev/null || true'`),
    `sudo sh -c '${guard} && firewall-cmd --reload >/dev/null || true'`,
  ];
};

/**
 * @method peerSummaryFactory
 * @description One spoke as the registry declares it: its transport address and
 * the three bindings that route hostnames to it.
 * @param {object} peer - Normalized registry entry.
 * @returns {object} Registry view of the peer.
 * @memberof UnderpostWireguard
 */
const peerSummaryFactory = (peer) => ({
  id: peer.id,
  address: peer.address,
  allowedIPs: peer.allowedIPs,
  hosts: peer.hosts,
  instances: peer.instances,
  default: peer.default,
});

/**
 * @method wireguardStatusFactory
 * @description Folds `wg show` output onto the registry, one row per spoke.
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
 * @method writeRootFile
 * @description Places a file the host's services read, at an explicit mode.
 *
 * Staged and installed rather than written directly: the deploy may run
 * unprivileged while `/etc/wireguard` and `/etc/haproxy` are root-owned, and
 * `install -m` sets the mode as it copies, so a 0600 file is never briefly
 * readable at the default umask.
 * @param {string} target - Destination path.
 * @param {string} content - File contents.
 * @param {string} [mode] - Octal mode.
 * @param {boolean} [dryRun] - Print the destination instead of writing.
 * @returns {boolean} True when the file changed.
 * @memberof UnderpostWireguard
 */
const writeRootFile = ({ target, content, mode = '0644', dryRun = false }) => {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === content) return false;
  if (dryRun) {
    logger.info(`[dry-run] write ${target} (mode ${mode})`, { bytes: content.length });
    return true;
  }
  const staged = nodePath.join('/tmp', `underpost-edge-${nodePath.basename(target)}-${process.pid}`);
  fs.writeFileSync(staged, content, { mode: 0o600 });
  shellExec(`sudo mkdir -p ${nodePath.dirname(target)}`, { silent: true });
  shellExec(`sudo install -m ${mode} -o root -g root ${staged} ${target}`, { silent: true });
  fs.removeSync(staged);
  return true;
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
  if (state.role !== 'server') return false;
  return writeRootFile({
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
 * @method warnRegistryHazards
 * @description Reports the two registry states that break routing silently.
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
 * @param {Array<object>} [peers] - The registry's peers.
 * @returns {void}
 * @memberof UnderpostWireguard
 */
const warnRegistryHazards = (peers = []) => {
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

/**
 * @constant FORWARD_PROXY_HOP_HEADERS
 * @description Headers that describe one hop and must not be relayed to the
 * next. `proxy-authorization` is in the list for a second reason: it carries the
 * key that authenticated the request to the hub, and forwarding it would hand
 * that key to every origin the spoke talks to.
 * @memberof UnderpostWireguard
 */
const FORWARD_PROXY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/**
 * @method tunnelAddressFactory
 * @description The bare address of an interface address, with any prefix length
 * dropped — `10.0.0.1/24` is what the registry stores, `10.0.0.1` is what a
 * socket binds.
 * @param {string} [address] - Address, with or without a prefix.
 * @returns {string} Address alone.
 * @memberof UnderpostWireguard
 */
const tunnelAddressFactory = (address) => `${address || ''}`.trim().split('/')[0];

/**
 * @method secretEqual
 * @description Constant-time string comparison, for the one comparison in this
 * module whose timing an attacker could measure.
 * @param {string} a - First value.
 * @param {string} b - Second value.
 * @returns {boolean} True when the two are identical.
 * @memberof UnderpostWireguard
 */
const secretEqual = (a, b) => {
  const left = `${a ?? ''}`;
  const right = `${b ?? ''}`;
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
};

/**
 * @method forwardProxyAuthorizedFactory
 * @description Whether a request carries the configured proxy key.
 *
 * One scheme, `Proxy-Authorization: Bearer <key>`, on both the forward and the
 * `CONNECT` path — a proxy that accepted several ways of presenting the same
 * secret would have several places to get the comparison wrong. An unset key
 * authorizes nothing, so a misconfigured server refuses every request rather
 * than relaying for anyone.
 * @param {string} [header] - Raw `Proxy-Authorization` header.
 * @param {string} [apiKey] - Configured key.
 * @returns {boolean} True when the request may be relayed.
 * @memberof UnderpostWireguard
 */
const forwardProxyAuthorizedFactory = ({ header = '', apiKey = '' } = {}) => {
  const expected = `${apiKey || ''}`.trim();
  if (!expected) return false;
  const match = /^Bearer\s+(.+)$/i.exec(`${header || ''}`.trim());
  return match ? secretEqual(match[1].trim(), expected) : false;
};

/**
 * @method forwardProxyTargetFactory
 * @description The origin a forward request names.
 *
 * A proxy request carries an absolute URI in its request line, which is what
 * distinguishes it from a request meant for the proxy itself. Only `http:` is
 * accepted here: an `https:` origin arrives as `CONNECT`, and answering one over
 * the forward path would mean terminating TLS on the hub, which is exactly what
 * the rest of this subsystem exists to avoid.
 * @param {string} [requestUrl] - Request line target.
 * @returns {?{hostname: string, port: number, path: string, host: string}} Origin, or null when the URI is not a proxyable absolute `http:` URI.
 * @memberof UnderpostWireguard
 */
const forwardProxyTargetFactory = (requestUrl) => {
  const value = `${requestUrl || ''}`.trim();
  if (!/^http:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (!url.hostname) return null;
    const port = Number(url.port) || UNDERPOST_EDGE.httpPort;
    return { hostname: url.hostname, port, path: `${url.pathname}${url.search}`, host: url.host };
  } catch {
    return null;
  }
};

/**
 * @method forwardProxyTunnelTargetFactory
 * @description The origin a `CONNECT` authority names, defaulting to `:443`.
 * @param {string} [authority] - `host` or `host:port` from the request line.
 * @returns {?{hostname: string, port: number}} Origin, or null when the authority is malformed.
 * @memberof UnderpostWireguard
 */
const forwardProxyTunnelTargetFactory = (authority) => {
  const value = `${authority || ''}`.trim();
  if (!value || value.includes('/') || value.includes('@')) return null;
  const separator = value.lastIndexOf(':');
  const hostname = separator > 0 ? value.slice(0, separator) : value;
  const port = separator > 0 ? Number(value.slice(separator + 1)) : UNDERPOST_EDGE.httpsPort;
  if (!hostname || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { hostname, port };
};

/**
 * @method forwardProxyHeadersFactory
 * @description A header set with the hop-by-hop entries removed, for relaying in
 * either direction.
 * @param {object} [headers] - Node header object.
 * @returns {object} Relayable headers.
 * @memberof UnderpostWireguard
 */
const forwardProxyHeadersFactory = (headers = {}) =>
  Object.fromEntries(
    Object.entries(headers || {}).filter(([name]) => !FORWARD_PROXY_HOP_HEADERS.has(`${name}`.toLowerCase())),
  );

/**
 * @constant envFileCache
 * @description Parsed contents of the env files consulted below, read at most
 * once per process. The root env path is resolved by shelling out to npm, so it
 * is memoized too — and an empty string when that is not available at all.
 * @memberof UnderpostWireguard
 */
const envFileCache = new Map();
let underpostRootEnvPath;

/**
 * @method envFileFactory
 * @description One env file as an object; a missing or unreadable file is an
 * empty one.
 * @param {string} path - Env file path.
 * @returns {object} Parsed variables.
 * @memberof UnderpostWireguard
 */
const envFileFactory = (path) => {
  if (!envFileCache.has(path)) {
    let parsed = {};
    try {
      if (path && fs.existsSync(path)) parsed = dotenv.parse(fs.readFileSync(path, 'utf8'));
    } catch (error) {
      logger.warn('Ignoring unreadable env file', { target: path, message: error.message });
    }
    envFileCache.set(path, parsed);
  }
  return envFileCache.get(path);
};

/**
 * @method edgeEnvFactory
 * @description One configuration value, resolved the three ways an operator can
 * have set it.
 *
 * A CLI run is not a deploy: nothing has loaded an env file into `process.env`
 * for it. `underpost env <deploy-id> <environment>` selects a deploy's env into
 * `./.env`, and `underpost env set` writes the root env — reading only
 * `process.env` would silently ignore both and report a key the operator had
 * plainly set as missing.
 *
 * Precedence is most explicit first: an exported variable overrides the selected
 * deploy env, which overrides the root env.
 * @param {string} key - Variable name.
 * @returns {string} The resolved value, or an empty string. Never logged — one of the keys this resolves is a credential.
 * @memberof UnderpostWireguard
 */
const edgeEnvFactory = (key) => {
  const fromProcess = `${process.env[key] ?? ''}`.trim();
  if (fromProcess) return fromProcess;
  if (underpostRootEnvPath === undefined) {
    try {
      const root = `${getUnderpostRootPath() || ''}`.trim();
      underpostRootEnvPath = root ? `${root}/.env` : '';
    } catch {
      underpostRootEnvPath = '';
    }
  }
  for (const path of ['./.env', underpostRootEnvPath]) {
    const value = `${envFileFactory(path)[key] ?? ''}`.trim();
    if (value) return value;
  }
  return '';
};

/**
 * @method forwardProxyConfigFactory
 * @description Where the proxy is, and the key that opens it.
 *
 * The default address is the hub's own tunnel address, because that is the only
 * place the server binds. Every value is resolved through
 * {@link UnderpostWireguard.edgeEnvFactory}, so the endpoint is configured the
 * same way whether the caller exported the variables, selected a deploy env, or
 * set the root env; a caller that resolves them from somewhere richer still — a
 * cron container reading its deploy env — passes them in.
 * @param {string} [host] - Proxy address.
 * @param {number|string} [port] - Proxy port.
 * @param {string} [apiKey] - Proxy key.
 * @returns {{host: string, port: number, apiKey: string}} Resolved endpoint; `apiKey` must never be logged.
 * @memberof UnderpostWireguard
 */
const forwardProxyConfigFactory = ({ host, port, apiKey } = {}) => ({
  host:
    `${host || edgeEnvFactory(UNDERPOST_EDGE.forwardProxyEnv.host)}`.trim() ||
    tunnelAddressFactory(UNDERPOST_EDGE.cidr),
  port: Number(port || edgeEnvFactory(UNDERPOST_EDGE.forwardProxyEnv.port)) || UNDERPOST_EDGE.forwardProxyPort,
  apiKey: `${apiKey || edgeEnvFactory(UNDERPOST_EDGE.forwardProxyEnv.apiKey)}`.trim(),
});

/**
 * @method forwardProxyCommandFactory
 * @description The command line the unit runs: this CLI, this subcommand, with
 * the endpoint resolved.
 *
 * Built from `process.execPath` and `process.argv[1]` so the service runs the
 * same entry point the operator did — a global `underpost` install and a
 * `node bin` checkout both produce a unit that works, without either being
 * hard-coded. The host and port are passed explicitly because the unit must not
 * re-resolve them: a service that read the registry at start could bind somewhere
 * other than where it was installed to.
 * @param {string} host - Bind address.
 * @param {number} port - Bind port.
 * @param {string} [execPath] - Node binary.
 * @param {string} [scriptPath] - CLI entry point.
 * @returns {string} `ExecStart` command.
 * @memberof UnderpostWireguard
 */
const forwardProxyCommandFactory = ({ host, port, execPath = process.execPath, scriptPath = process.argv[1] }) =>
  [
    execPath,
    scriptPath,
    'wireguard',
    '--forward-proxy-server',
    `--forward-proxy-server-host ${host}`,
    `--forward-proxy-server-port ${port}`,
  ].join(' ');

/**
 * @method forwardProxyUnitFactory
 * @description The systemd unit that supervises the proxy.
 *
 * Tied to the tunnel rather than merely ordered after it: the address the proxy
 * binds exists only while the interface is up, so `Requires` makes the dependency
 * real, `PartOf` propagates the tunnel's stop and restart to the proxy, and the
 * `WantedBy` on the same unit brings the proxy back when the tunnel returns.
 * Together they make the pair one lifecycle — which is what `--wireguard-stop
 * --wireguard-start` needs in order to leave a working proxy behind.
 *
 * `Restart=always` with no start-limit window covers the rest: a bind that fails
 * because the tunnel is still coming up retries instead of latching failed.
 * @param {string} host - Bind address.
 * @param {number} port - Bind port.
 * @param {string} apiKey - Proxy key, passed to the process through the unit.
 * @param {string} [interfaceName] - Tunnel interface the proxy's address belongs to.
 * @param {string} [workingDirectory] - Directory the service runs from, so `./.env` resolves as it does for the CLI.
 * @param {string} [user] - Account the listener runs as.
 * @param {string} [command] - `ExecStart` command.
 * @returns {string} Unit file contents.
 * @memberof UnderpostWireguard
 */
const forwardProxyUnitFactory = ({
  host,
  port,
  apiKey,
  interfaceName = UNDERPOST_EDGE.interfaceName,
  workingDirectory = process.cwd(),
  user = os.userInfo().username,
  command,
} = {}) => {
  const tunnelUnit = `wg-quick@${interfaceName}.service`;
  return `# Generated by \`underpost wireguard --forward-proxy-server\`. Do not edit by
# hand: the next run rewrites the file and restarts the service.
[Unit]
Description=Underpost edge forward proxy on ${host}:${port}
Documentation=https://www.nexodev.org/docs
After=network-online.target ${tunnelUnit}
Wants=network-online.target
Requires=${tunnelUnit}
PartOf=${tunnelUnit}
StartLimitIntervalSec=0

[Service]
Type=simple
User=${user}
WorkingDirectory=${workingDirectory}
Environment=${UNDERPOST_EDGE.forwardProxySupervisedEnv}=1
Environment=${UNDERPOST_EDGE.forwardProxyEnv.apiKey}=${apiKey}
ExecStart=${command || forwardProxyCommandFactory({ host, port })}
Restart=always
RestartSec=${UNDERPOST_EDGE.forwardProxyRestartSeconds}

[Install]
WantedBy=multi-user.target ${tunnelUnit}
`;
};

/**
 * @method forwardProxyServiceCommandsFactory
 * @description The commands that bring the service to its declared state, and the
 * ones that withdraw it.
 *
 * Every one of them is a no-op on a host already in that state: `enable` is
 * idempotent, and `start` on an active unit does nothing. Only a unit whose file
 * changed is reloaded and restarted — reconciling an unchanged service must not
 * drop the connections it is carrying.
 *
 * The two that can legitimately fail carry `|| true`, so a service that will not
 * come up is reported from the unit's own state afterwards rather than as a raw
 * shell failure with no context.
 * @param {boolean} [changed] - Whether the unit file was rewritten.
 * @param {string} [name] - Service name.
 * @param {string} [unitPath] - Unit file path.
 * @returns {{ensure: Array<string>, remove: Array<string>}} Shell commands.
 * @memberof UnderpostWireguard
 */
const forwardProxyServiceCommandsFactory = ({
  changed = false,
  name = UNDERPOST_EDGE.forwardProxyServiceName,
  unitPath = UNDERPOST_EDGE.forwardProxyUnitPath,
} = {}) => ({
  ensure: [
    ...(changed ? ['sudo systemctl daemon-reload'] : []),
    `sudo systemctl enable ${name} || true`,
    `sudo systemctl ${changed ? 'restart' : 'start'} ${name} || true`,
  ],
  remove: [
    `sudo systemctl disable --now ${name} 2>/dev/null || true`,
    `sudo rm -f ${unitPath}`,
    `sudo systemctl daemon-reload`,
  ],
});

/**
 * @method forwardProxyRefuse
 * @description Ends a forward request without relaying it.
 * @param {object} res - Server response.
 * @param {number} status - Status code.
 * @param {string} message - Plain-text body.
 * @returns {void}
 * @memberof UnderpostWireguard
 */
const forwardProxyRefuse = (res, status, message) => {
  res.writeHead(status, {
    'content-type': 'text/plain',
    // Named on a 407 so a client knows which scheme to present.
    ...(status === 407 ? { 'proxy-authenticate': 'Bearer realm="underpost-forward-proxy"' } : {}),
  });
  res.end(`${message}\n`);
};

/**
 * @method forwardProxyRequestHandlerFactory
 * @description The `http` forward path: authenticate, relay the request to the
 * origin, stream the answer back.
 *
 * Both directions are piped rather than buffered, so a large body costs the hub
 * a socket pair and no memory — the hub is a 1 GB VPS whose whole job is passing
 * bytes it does not read.
 * @param {string} apiKey - Configured proxy key.
 * @returns {Function} `(req, res)` handler.
 * @memberof UnderpostWireguard
 */
const forwardProxyRequestHandlerFactory = ({ apiKey }) =>
  function forwardProxyRequestHandler(req, res) {
    if (!forwardProxyAuthorizedFactory({ header: req.headers['proxy-authorization'], apiKey }))
      return void forwardProxyRefuse(res, 407, 'proxy authentication required');
    const target = forwardProxyTargetFactory(req.url);
    if (!target)
      return void forwardProxyRefuse(res, 400, 'an absolute http:// request-URI is required; use CONNECT for https');

    const upstream = http.request(
      {
        host: target.hostname,
        port: target.port,
        method: req.method,
        path: target.path,
        headers: { ...forwardProxyHeadersFactory(req.headers), host: target.host },
        timeout: UNDERPOST_EDGE.forwardProxyTimeoutMs,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode, forwardProxyHeadersFactory(upstreamRes.headers));
        upstreamRes.pipe(res);
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('upstream timed out')));
    upstream.on('error', (error) => {
      logger.warn('Forward proxy upstream failed', { target: `${target.host}${target.path}`, message: error.message });
      if (res.headersSent) res.destroy();
      else forwardProxyRefuse(res, 502, 'upstream request failed');
    });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  };

/**
 * @method forwardProxyConnectHandlerFactory
 * @description The `CONNECT` path: authenticate, open a TCP socket to the origin,
 * then splice the two sockets and stop looking.
 *
 * The hub relays ciphertext it cannot read, exactly as `fe_https` does inbound,
 * so a spoke's TLS session terminates at the origin and no certificate or key
 * for it exists on the VPS.
 * @param {string} apiKey - Configured proxy key.
 * @returns {Function} `(req, clientSocket, head)` handler.
 * @memberof UnderpostWireguard
 */
const forwardProxyConnectHandlerFactory = ({ apiKey }) =>
  function forwardProxyConnectHandler(req, clientSocket, head) {
    const startedAt = Date.now();
    // The same shape morgan writes on the forward path, so one log reads alike
    // for both: <client> CONNECT <authority> <status> <bytes> - <ms> ms. A
    // tunnel is logged when it closes, because that is when its size is known.
    const log = (status, bytes = '-') =>
      proxyLogger.http(
        `${clientSocket.remoteAddress || '-'} CONNECT ${req.url} ${status} ${bytes} - ${Date.now() - startedAt} ms`,
      );
    const reject = (status, reason) => {
      log(status);
      clientSocket.end(`HTTP/1.1 ${status} ${reason}\r\n\r\n`);
    };
    if (!forwardProxyAuthorizedFactory({ header: req.headers['proxy-authorization'], apiKey }))
      return void reject(407, 'Proxy Authentication Required');
    const target = forwardProxyTunnelTargetFactory(req.url);
    if (!target) return void reject(400, 'Bad Request');

    let established = false;
    const upstream = net.connect(target.port, target.hostname, () => {
      established = true;
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // The bytes the client sent before the tunnel existed — a ClientHello, in
      // practice — are already in `head` and are not re-delivered by the stream.
      if (head && head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.setTimeout(UNDERPOST_EDGE.forwardProxyTimeoutMs, () => upstream.destroy());
    upstream.on('error', (error) => {
      logger.warn('Forward proxy tunnel failed', {
        target: `${target.hostname}:${target.port}`,
        message: error.message,
      });
      if (established || clientSocket.writableEnded || clientSocket.destroyed) clientSocket.destroy();
      else reject(502, 'Bad Gateway');
    });
    upstream.on('close', () => {
      if (established) log(200, upstream.bytesRead + upstream.bytesWritten);
    });
    clientSocket.on('error', () => upstream.destroy());
    clientSocket.on('close', () => upstream.destroy());
  };

/**
 * @method forwardProxyResponseFactory
 * @description Drives one client request to completion and buffers its answer.
 *
 * Buffered rather than streamed because the caller is an API client — the cron's
 * Vultr reads are JSON small enough to hold, and a string is what a caller can
 * actually parse.
 * @param {object} request - A `ClientRequest` that has not been ended.
 * @param {?string} body - Request body.
 * @param {number} timeoutMs - Timeout for the whole exchange.
 * @returns {Promise<{status: number, headers: object, body: string}>} The origin's answer.
 * @memberof UnderpostWireguard
 */
const forwardProxyResponseFactory = ({ request, body = null, timeoutMs }) =>
  new Promise((resolve, reject) => {
    request.once('response', (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.once('error', reject);
      res.once('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    request.once('error', reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`request timed out after ${timeoutMs}ms`)));
    if (body !== null) request.write(body);
    request.end();
  });

/**
 * @method forwardProxyTunnelFactory
 * @description Opens a `CONNECT` tunnel through the proxy and hands back the raw
 * socket, for a client that then speaks TLS over it.
 * @param {object} proxy - Resolved endpoint from {@link UnderpostWireguard.forwardProxyConfigFactory}.
 * @param {string} authority - `host:port` of the origin.
 * @param {number} timeoutMs - Timeout for the handshake with the proxy.
 * @returns {Promise<object>} Connected socket.
 * @throws {Error} When the proxy refuses the tunnel.
 * @memberof UnderpostWireguard
 */
const forwardProxyTunnelFactory = ({ proxy, authority, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const request = http.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: authority,
      headers: { host: authority, 'proxy-authorization': `Bearer ${proxy.apiKey}` },
      agent: false,
    });
    const refused = (status) => reject(new Error(`[wireguard] forward proxy refused CONNECT ${authority} (${status})`));
    request.once('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        refused(res.statusCode);
        return;
      }
      socket.setTimeout(0);
      resolve(socket);
    });
    // A refusal may arrive as an ordinary response rather than as a tunnel that
    // never opened; both mean the same thing to the caller.
    request.once('response', (res) => {
      res.resume();
      refused(res.statusCode);
    });
    request.once('error', reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`[wireguard] forward proxy CONNECT timed out`)));
    request.end();
  });

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

    /**
     * @method setup
     * @description Builds the tunnel interface for either role and persists what
     * the other side needs to know.
     *
     * The hub writes its own address and public key into the registry so a spoke
     * can be configured from the same file the routes are derived from; a spoke
     * records the hub it dials. Re-running with the same inputs rewrites the same
     * bytes and reloads nothing.
     * @param {object} options - CLI options.
     * @returns {object} The registry as persisted.
     * @memberof UnderpostWireguard
     */
    setup(options = {}) {
      const state = readEdgeState();
      const buildConf = options.buildConf === true;
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      if (options.server === true && options.client === true)
        throw new Error('[wireguard] --server and --client are mutually exclusive');
      // A re-run on a configured host inherits its recorded role, so repeating
      // the setup does not require repeating every flag that established it.
      const role = options.server === true ? 'server' : options.client === true ? 'client' : state.role;
      if (!role) throw new Error('[wireguard] --wireguard-setup requires --server or --client');
      const listenPort = Number(options.port) > 0 ? Number(options.port) : state.listenPort;
      // Authoring the registry must work on a machine that is not the edge — a
      // workstation has no `/etc/wireguard` to key, and generating one there
      // would mint an identity no host will ever present.
      const { privateKeyPath, publicKey } = buildConf
        ? { privateKeyPath: `${UNDERPOST_EDGE.wireguardDir}/${interfaceName}.key`, publicKey: state.publicKey }
        : UnderpostWireguard.API.ensureKeyPair(interfaceName, options.dryRun);

      let conf;
      let next;
      if (role === 'server') {
        const address = `${options.cidr || state.address || UNDERPOST_EDGE.cidr}`.trim();
        if (!address.includes('/')) throw new Error('[wireguard] --cidr must carry a prefix length (e.g. 10.0.0.1/24)');
        conf = wireguardServerConfFactory({
          interfaceName,
          address,
          listenPort,
          keyPath: privateKeyPath,
          peers: state.peers,
        });
        next = { ...state, interfaceName, role, listenPort, address, publicKey };
      } else {
        const address = `${options.peerIp || state.address || ''}`.trim();
        const endpoint = `${options.endpoint || state.endpoint || ''}`.trim();
        const hubPublicKey = `${options.publicKey || state.hubPublicKey || ''}`.trim();
        if (!address) throw new Error('[wireguard] --client requires --peer-ip');
        if (!endpoint) throw new Error('[wireguard] --client requires --endpoint (e.g. vps.example.com:51820)');
        if (!hubPublicKey) throw new Error('[wireguard] --client requires --public-key (the hub public key)');
        conf = wireguardClientConfFactory({
          address,
          keyPath: privateKeyPath,
          publicKey: hubPublicKey,
          endpoint,
          cidr: options.cidr || UNDERPOST_EDGE.tunnelCidr,
          keepalive: UNDERPOST_EDGE.keepalive,
        });
        next = { ...state, interfaceName, role, listenPort, address, endpoint, hubPublicKey, publicKey };
      }

      let confChanged = false;
      if (!buildConf) {
        confChanged = writeRootFile({
          target: `${UNDERPOST_EDGE.wireguardDir}/${interfaceName}.conf`,
          content: conf,
          mode: '0600',
          dryRun: options.dryRun,
        });
        runHostCommands(
          [
            ...(role === 'server'
              ? [`sudo sh -c 'echo net.ipv4.ip_forward=1 > ${UNDERPOST_EDGE.sysctlPath}'`, `sudo sysctl -q --system`]
              : []),
            ...firewallCommandsFactory({ role, interfaceName, listenPort }),
          ],
          options.dryRun,
        );
      }
      if (!options.dryRun) writeEdgeState(next);
      // Writing the config is idempotent; the *running* interface is not. wg-quick
      // reads the file only at start, so a changed config under a live unit is a
      // divergence that stays silent until the next reboot re-reads it.
      const restartRequired =
        confChanged &&
        !options.dryRun &&
        shellExec(`systemctl is-active --quiet wg-quick@${interfaceName}`, { silent: true, silentOnError: true })
          .code === 0;
      logger.info(buildConf ? 'Registry updated; host untouched' : 'WireGuard interface configured', {
        interfaceName,
        role,
        address: next.address,
        publicKey: next.publicKey,
        peers: next.peers.length,
        restartRequired,
      });
      if (restartRequired)
        logger.warn('Interface config changed while the tunnel is up; the live interface still runs the old one', {
          apply: `--wireguard-stop --wireguard-start --interface ${interfaceName}`,
        });
      return next;
    },

    /**
     * @method peerAdd
     * @description Registers a spoke and applies it to the running hub.
     *
     * `wg set` installs the peer on the live interface, so an existing tunnel is
     * never interrupted to admit a new one — the registry and the config file
     * are updated in the same pass so the peer also survives a restart.
     *
     * A spoke that re-keys is registered under the same id with a new public key.
     * WireGuard identifies a peer *by its key*, not by any name, so admitting the
     * new one does not replace the old: the superseded key would stay on the live
     * interface still claiming the same `AllowedIPs`, and longest-prefix match
     * could keep handing that traffic to an identity the spoke no longer holds.
     * It is dropped first, which is what makes a reconnect leave no trace.
     * @param {object} options - CLI options.
     * @returns {object} The updated registry.
     * @memberof UnderpostWireguard
     */
    peerAdd(options = {}) {
      const state = readEdgeState();
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
          ['default', options.default === true ? true : undefined],
        ].filter(([, value]) => value !== undefined),
      );
      const current = state.peers.find((entry) => entry.id === id) || {};
      const peer = peerFactory({ ...current, id, address, publicKey, ...overrides });
      const supersededKey = current.publicKey && current.publicKey !== publicKey ? current.publicKey : '';
      const peers = [...state.peers.filter((entry) => entry.id !== id), peer].sort((a, b) => a.id.localeCompare(b.id));
      const next = { ...state, peers };
      if (options.buildConf !== true) {
        runHostCommands(
          [
            ...(supersededKey ? [liveWireguardCommand(next.interfaceName, `peer ${supersededKey} remove`)] : []),
            liveWireguardCommand(next.interfaceName, `peer ${publicKey} allowed-ips ${peer.allowedIPs.join(',')}`),
          ],
          options.dryRun,
        );
        writeServerInterfaceConf({ state: next, peers, dryRun: options.dryRun });
      }
      if (!options.dryRun) writeEdgeState(next);
      logger.info(options.buildConf === true ? 'Peer recorded; host untouched' : 'Peer registered', {
        id,
        address,
        allowedIPs: peer.allowedIPs,
        rekeyed: supersededKey !== '',
      });
      warnRegistryHazards(peers);
      return next;
    },

    /**
     * @method peerRemove
     * @description Removes a spoke from the registry and from the running hub.
     * @param {object} options - CLI options.
     * @returns {object} The updated registry.
     * @memberof UnderpostWireguard
     */
    peerRemove(options = {}) {
      const state = readEdgeState();
      const id = `${options.peerRemove || ''}`.trim();
      const peer = state.peers.find((entry) => entry.id === id);
      if (!peer) {
        logger.warn('No such peer in registry', { id });
        return state;
      }
      const peers = state.peers.filter((entry) => entry.id !== id);
      const next = { ...state, peers };
      if (options.buildConf !== true) {
        runHostCommands([liveWireguardCommand(next.interfaceName, `peer ${peer.publicKey} remove`)], options.dryRun);
        writeServerInterfaceConf({ state: next, peers, dryRun: options.dryRun });
      }
      if (!options.dryRun) writeEdgeState(next);
      logger.info(options.buildConf === true ? 'Peer removed from registry; host untouched' : 'Peer removed', { id });
      warnRegistryHazards(peers);
      return next;
    },

    /**
     * @method buildConf
     * @description Rewrites the registry in place, normalized, touching no host.
     *
     * The registry is authored, not derived — its peer bindings and public keys
     * exist nowhere else, so nothing can regenerate it from other configuration.
     * This is the repair path: it fills in defaults a hand-edited file omitted,
     * drops entries with no id, and reports what it read, so a malformed registry
     * is corrected before a sync acts on it.
     * @param {object} [options] - CLI options.
     * @returns {object} The normalized registry.
     * @memberof UnderpostWireguard
     */
    buildConf(options = {}) {
      const state = readEdgeState();
      const changed = options.dryRun ? false : writeEdgeState(state);
      logger.info('Registry normalized', {
        target: EDGE_STATE_PATH,
        role: state.role,
        address: state.address,
        peers: state.peers.map((peer) => peer.id),
        changed,
      });
      if (!state.role)
        logger.warn('Registry records no role for this machine', {
          next: '--build-conf --wireguard-setup --server --cidr 10.0.0.1/24   (or --client …)',
        });
      warnRegistryHazards(state.peers);
      return state;
    },

    /**
     * @method routeTable
     * @description The resolved hostname-to-spoke table for one deploy, a list,
     * or every deploy in `dd.router`.
     *
     * Reads each deploy's configuration through the same helpers the cluster
     * runners use, so a hostname the edge routes is exactly a hostname the
     * cluster publishes.
     *
     * A deploy listed in `dd.router` whose configuration is not checked out
     * locally is skipped with a warning rather than failing the run: the private
     * conf of an unrelated deploy is not a precondition for publishing the ones
     * that are present.
     *
     * Omitting the id means `dd` — the whole of `dd.router`. The edge holds one
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
      const state = readEdgeState();
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
     * query, so an off-box run reports registry and routing alone.
     * @param {object} options - CLI options.
     * @returns {object} Runtime, registry and routing summary.
     * @memberof UnderpostWireguard
     */
    status(options = {}) {
      const state = readEdgeState();
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      const probeHost = options.buildConf !== true;
      const read = (command) => shellExec(command, { stdout: true, silent: true, silentOnError: true }).trim();
      const show = (subCommand) => (probeHost ? read(`sudo wg show ${interfaceName} ${subCommand}`) : '');

      let table = null;
      try {
        table = UnderpostWireguard.API.routeTable(options.deployId);
      } catch (error) {
        logger.warn('Route table unavailable', { message: error.message });
      }

      const via = {};
      for (const route of table?.routes || []) via[route.via] = (via[route.via] || 0) + 1;
      const summary = {
        role: state.role || '(unset)',
        interface: interfaceName,
        address: state.address,
        endpoint: state.endpoint,
        publicKey: state.publicKey,
        ...(probeHost
          ? {
              wireguard: read(`systemctl is-active wg-quick@${interfaceName}`),
              haproxy: read('systemctl is-active haproxy'),
              forwardProxy: read(`systemctl is-active ${UNDERPOST_EDGE.forwardProxyServiceName}`),
              quicTarget: defaultPeerFactory(state.peers)?.address || '',
            }
          : {}),
        peers: probeHost
          ? wireguardStatusFactory({
              peers: state.peers,
              latestHandshakes: show('latest-handshakes'),
              transfer: show('transfer'),
              endpoints: show('endpoints'),
            })
          : state.peers.map(peerSummaryFactory),
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
      warnRegistryHazards(state.peers);
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
      const state = readEdgeState();
      const defaultPeer = defaultPeerFactory(state.peers);
      const maps = haproxyMapsFactory({ routes });
      const conf = haproxyConfFactory({ peers, defaultPeerId: defaultPeer?.id || '' });

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
          else writeRootFile({ target: entry.target, content: entry.content, mode: '0644' });
        }
      };

      let changed = false;
      for (const entry of targets) changed = writeRootFile({ ...entry, dryRun: options.dryRun }) || changed;
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
      if (changed)
        shellExec(`sudo sh -c 'systemctl is-active --quiet haproxy && systemctl reload haproxy || true'`, {
          silent: true,
        });

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
      runHostCommands(['sudo systemctl enable --now haproxy'], options.dryRun);
      logger.info('HAProxy edge gateway enabled');
    },

    /**
     * @method forwardProxyConfig
     * @description The endpoint the proxy runs on, and the guards that must hold
     * for it to run at all.
     *
     * Shared by the two halves of the lifecycle, so the unit is written for
     * exactly the endpoint the supervised process then binds — the flags resolve
     * once, in one place, rather than once per half.
     * @param {object} [options] - CLI options.
     * @returns {{host: string, port: number, apiKey: string, address: string}} Resolved endpoint; `apiKey` must never be logged.
     * @throws {Error} When run on a spoke, or with no key configured.
     * @memberof UnderpostWireguard
     */
    forwardProxyConfig(options = {}) {
      const state = readEdgeState();
      if (state.role === 'client')
        throw new Error(
          '[wireguard] --forward-proxy-server runs on the hub: a spoke would relay through its own ISP address',
        );
      const config = forwardProxyConfigFactory({
        // The flag wins over the registry, so a hub with a second address — or a
        // bring-up before the tunnel is keyed — can be told where to listen.
        host: `${options.forwardProxyServerHost || ''}`.trim() || tunnelAddressFactory(state.address),
        port: options.forwardProxyServerPort,
      });
      if (!config.apiKey)
        throw new Error(
          `[wireguard] ${UNDERPOST_EDGE.forwardProxyEnv.apiKey} is not set; every proxied request is authenticated with it. ` +
            `Export it, put it in the deploy env selected by \`underpost env <deploy-id> <environment>\` (./.env), ` +
            `or set it with \`underpost env set ${UNDERPOST_EDGE.forwardProxyEnv.apiKey} <key>\``,
        );
      // The bind address is what keeps the proxy off the public interface, so a
      // wildcard is worth saying out loud: it is legal, and it leaves the key as
      // the only thing between the internet and an open relay.
      if (['0.0.0.0', '::', '*'].includes(config.host))
        logger.warn('Forward proxy is bound to a wildcard address, not the tunnel', {
          host: config.host,
          consequence: 'the proxy is reachable from every interface; only the API key refuses a request',
          instead: `--forward-proxy-server-host ${tunnelAddressFactory(state.address) || tunnelAddressFactory(UNDERPOST_EDGE.cidr)}`,
        });
      return { ...config, address: `${config.host}:${config.port}`, interfaceName: state.interfaceName };
    },

    /**
     * @method forwardProxyServer
     * @description Ensures the forward proxy is running as a systemd service, and
     * returns.
     *
     * The listener itself is a long-lived process, which a CLI invocation is not:
     * a proxy held open by the shell that started it dies with that shell, does
     * not survive a reboot, and gives an operator no way to ask whether it is
     * running. So this reconciles a unit instead — write, enable, start — and the
     * supervised process is the one that binds the socket, through
     * {@link UnderpostWireguard.forwardProxyListen}.
     *
     * Re-running is a no-op by construction: the unit name is fixed, so there is
     * one service to converge on rather than one per invocation; the file is
     * compared before writing; and an already-active unit is `start`ed, which
     * systemd ignores. Only a unit whose *content* changed — a new host, port or
     * key — is reloaded and restarted, so repeating the command does not drop
     * established tunnels.
     * @param {object} [options] - CLI options.
     * @returns {?object} What was reconciled, or null under `--dry-run`.
     * @throws {Error} When run on a spoke, or with no key configured.
     * @memberof UnderpostWireguard
     */
    forwardProxyServer(options = {}) {
      // The unit runs this same command with the supervision marker set, which is
      // what makes the service's ExecStart and the operator's command one thing
      // rather than two that can drift.
      if (`${process.env[UNDERPOST_EDGE.forwardProxySupervisedEnv] || ''}`.trim())
        return UnderpostWireguard.API.forwardProxyListen(options);

      const config = UnderpostWireguard.API.forwardProxyConfig(options);
      const unit = forwardProxyUnitFactory({
        host: config.host,
        port: config.port,
        apiKey: config.apiKey,
        interfaceName: config.interfaceName,
      });
      const changed = writeRootFile({
        target: UNDERPOST_EDGE.forwardProxyUnitPath,
        content: unit,
        // The unit carries the proxy key, so it is root-only like the interface
        // config that carries a peer table. systemd reads it as root.
        mode: '0600',
        dryRun: options.dryRun,
      });
      runHostCommands(forwardProxyServiceCommandsFactory({ changed }).ensure, options.dryRun);
      if (options.dryRun) {
        logger.info('[dry-run] would reconcile the forward proxy service', {
          service: UNDERPOST_EDGE.forwardProxyServiceName,
          address: config.address,
        });
        return null;
      }
      const read = (command) => shellExec(command, { stdout: true, silent: true, silentOnError: true }).trim();
      const state = read(`systemctl is-active ${UNDERPOST_EDGE.forwardProxyServiceName}`);
      const enabled = read(`systemctl is-enabled ${UNDERPOST_EDGE.forwardProxyServiceName}`);
      logger.info('Forward proxy service reconciled', {
        service: UNDERPOST_EDGE.forwardProxyServiceName,
        address: config.address,
        tunnel: UNDERPOST_EDGE.tunnelCidr,
        unitChanged: changed,
        state,
        enabled,
        logs: `journalctl -u ${UNDERPOST_EDGE.forwardProxyServiceName} -f`,
      });
      // `activating` is the restart backoff, not a failure — the unit retries
      // until the address it binds exists.
      const running = state === 'active' || state === 'activating';
      if (!running) {
        logger.error('Forward proxy service did not come up', {
          state: state || '(unknown)',
          likely: `${config.host} does not exist yet, so the listener cannot bind — bring the tunnel up with --wireguard-start`,
          check: `systemctl status ${UNDERPOST_EDGE.forwardProxyServiceName}`,
        });
        process.exitCode = 1;
      }
      return { service: UNDERPOST_EDGE.forwardProxyServiceName, address: config.address, changed, state, enabled };
    },

    /**
     * @method forwardProxyListen
     * @description Binds the proxy: `http` requests and `CONNECT` tunnels, relayed
     * to the internet through the VPS. This is what the systemd unit runs.
     *
     * Bound to the hub's tunnel address alone — never `0.0.0.0` — so the only
     * clients that can reach it are the spokes on the other side of an encrypted
     * tunnel, and a firewall misconfiguration cannot expose it. Authentication is
     * still required on every request: the tunnel establishes which machine is
     * calling, the key establishes that it meant to.
     * @param {object} [options] - CLI options.
     * @returns {object} The listening server.
     * @throws {Error} When run on a spoke, or with no key configured.
     * @memberof UnderpostWireguard
     */
    forwardProxyListen(options = {}) {
      const config = UnderpostWireguard.API.forwardProxyConfig(options);
      const server = http.createServer();
      // Every proxied request is logged, refusals included: this is the one hop
      // where a spoke's traffic leaves the topology, so an unattributed request
      // through it is the thing an operator must never have to guess about.
      const requestLog = loggerMiddleware(import.meta, 'debug', () => false);
      const relay = forwardProxyRequestHandlerFactory({ apiKey: config.apiKey });
      server.on('request', (req, res) => requestLog(req, res, () => relay(req, res)));
      server.on('connect', forwardProxyConnectHandlerFactory({ apiKey: config.apiKey }));
      // A malformed request line must not take the listener down with it.
      server.on('clientError', (error, socket) => {
        if (!socket.destroyed) socket.destroy();
      });
      server.on('error', (error) => {
        logger.error('Forward proxy listener failed', { address: config.address, message: error.message });
        // Exit non-zero rather than linger without a socket: the usual cause is a
        // bind address that does not exist yet, and the unit's restart is what
        // makes that resolve itself once the tunnel is up.
        process.exitCode = 1;
        server.close(() => {});
      });
      server.listen(config.port, config.host, () =>
        logger.info('Forward proxy listening', { address: config.address, tunnel: UNDERPOST_EDGE.tunnelCidr }),
      );
      return server;
    },

    /**
     * @method fetchViaProxy
     * @description Makes one request through the hub's forward proxy, so the
     * origin sees the VPS address rather than the caller's.
     *
     * `http:` targets go over the forward path with an absolute request URI.
     * `https:` targets open a `CONNECT` tunnel and negotiate TLS over it *here*,
     * in this process — the certificate is verified against the origin by the
     * caller, and the hub only ever sees ciphertext.
     * @param {string} url - Absolute `http:` or `https:` URL.
     * @param {string} [options.method] - HTTP method (default `GET`).
     * @param {object} [options.headers] - Request headers.
     * @param {string|object} [options.body] - Request body; an object is sent as JSON.
     * @param {number} [options.timeout] - Timeout in ms.
     * @param {object} [options.proxy] - `{host, port, apiKey}` overrides for the endpoint resolution.
     * @returns {Promise<{status: number, headers: object, body: string}>} The origin's answer.
     * @throws {Error} When no key is configured, the scheme is unsupported, or the proxy refuses.
     * @memberof UnderpostWireguard
     */
    fetchViaProxy: async function (url, options = {}) {
      const target = new URL(url);
      const proxy = forwardProxyConfigFactory(options.proxy);
      if (!proxy.apiKey)
        throw new Error(
          `[wireguard] ${UNDERPOST_EDGE.forwardProxyEnv.apiKey} is not set; the forward proxy cannot be used without it`,
        );
      const method = `${options.method || 'GET'}`.toUpperCase();
      const timeoutMs = Number(options.timeout) > 0 ? Number(options.timeout) : UNDERPOST_EDGE.forwardProxyTimeoutMs;
      const body =
        options.body === undefined || options.body === null
          ? null
          : typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body);
      const headers = {
        host: target.host,
        ...(body === null ? {} : { 'content-length': `${Buffer.byteLength(body)}` }),
        ...(options.headers || {}),
      };

      if (target.protocol === 'http:')
        return await forwardProxyResponseFactory({
          request: http.request({
            host: proxy.host,
            port: proxy.port,
            method,
            // The absolute URI is what makes this a proxy request rather than a
            // request for the proxy itself.
            path: target.href,
            headers: { ...headers, 'proxy-authorization': `Bearer ${proxy.apiKey}` },
            agent: false,
          }),
          body,
          timeoutMs,
        });
      if (target.protocol !== 'https:')
        throw new Error(`[wireguard] fetchViaProxy supports http: and https: targets only, not ${target.protocol}`);

      const port = Number(target.port) || UNDERPOST_EDGE.httpsPort;
      const socket = await forwardProxyTunnelFactory({
        proxy,
        authority: `${target.hostname}:${port}`,
        timeoutMs,
      });
      // The agent's own `createConnection` is what performs the TLS handshake;
      // handing it the tunnel makes it negotiate over that instead of dialling
      // the origin directly, which is the whole of the CONNECT client side.
      const agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
      const createConnection = agent.createConnection.bind(agent);
      agent.createConnection = (connectOptions, callback) =>
        createConnection({ ...connectOptions, socket, servername: target.hostname }, callback);
      try {
        return await forwardProxyResponseFactory({
          request: https.request({
            host: target.hostname,
            port,
            method,
            path: `${target.pathname}${target.search}`,
            headers,
            agent,
          }),
          body,
          timeoutMs,
        });
      } finally {
        socket.destroy();
      }
    },

    /**
     * @method start
     * @description Enables and starts the tunnel, and the QUIC forward with it.
     * @param {object} options - CLI options.
     * @returns {void}
     * @memberof UnderpostWireguard
     */
    start(options = {}) {
      const state = readEdgeState();
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      runHostCommands([`sudo systemctl enable --now wg-quick@${interfaceName}`], options.dryRun);
      if (state.role === 'server')
        runHostCommands(
          quicForwardCommandsFactory({ interfaceName, target: defaultPeerFactory(state.peers)?.address || '' }).ensure,
          options.dryRun,
        );
      logger.info('WireGuard interface started', { interfaceName });
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
      const state = readEdgeState();
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      runHostCommands(
        [
          `sudo systemctl disable --now wg-quick@${interfaceName} 2>/dev/null || true`,
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
     * The key pair and the registry are deliberately kept: destroying the key
     * invalidates every spoke's peer entry, and the registry is authored source
     * that nothing can regenerate. A reset is for reconfiguring an edge rather
     * than for re-establishing trust with all of them; re-keying is what
     * {@link UnderpostWireguard.reinstall} is for.
     * @param {object} options - CLI options.
     * @returns {void}
     * @memberof UnderpostWireguard
     */
    reset(options = {}) {
      const state = readEdgeState();
      const interfaceName = `${options.interface || state.interfaceName}`.trim();
      UnderpostWireguard.API.stop({ ...options, interface: interfaceName });
      runHostCommands(
        [
          `sudo rm -f ${UNDERPOST_EDGE.wireguardDir}/${interfaceName}.conf`,
          `sudo rm -f ${UNDERPOST_EDGE.sysctlPath}`,
          `sudo systemctl disable --now haproxy 2>/dev/null || true`,
          `sudo rm -f ${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.sniMapName}`,
          `sudo rm -f ${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.httpMapName}`,
          `sudo rm -f ${UNDERPOST_EDGE.haproxyDir}/${UNDERPOST_EDGE.haproxyConfName}`,
          ...forwardProxyServiceCommandsFactory().remove,
          ...(state.role
            ? firewallCommandsFactory({
                role: state.role,
                interfaceName,
                listenPort: state.listenPort,
                remove: true,
              })
            : []),
        ],
        options.dryRun,
      );
      logger.info('Edge host state removed; key pair and peer registry retained', {
        interfaceName,
        role: state.role || '(unset)',
        firewallWithdrawn: state.role !== '',
      });
      if (!state.role)
        logger.warn('Registry records no role, so no firewalld rules were withdrawn', {
          fix: `--wireguard-reset --interface ${interfaceName} after the role is recorded, or withdraw them by hand`,
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
      const state = readEdgeState();
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
        onEverySpoke:
          next.role === 'server'
            ? `--wireguard-setup --client --public-key '${next.publicKey}'   (peer-ip and endpoint are remembered)`
            : 'none',
        onTheHub:
          next.role === 'client'
            ? `--peer-add <this spoke id> --peer-ip ${next.address} --public-key '${next.publicKey}'`
            : 'none',
      });
    },

    /**
     * @method callback
     * @description CLI entry point for both `underpost wireguard` and
     * `underpost haproxy`.
     *
     * Flags are evaluated in lifecycle order — install, setup, peer changes,
     * route publication, then daemon control — so a single invocation can carry
     * a whole bring-up (`--wireguard-install --wireguard-setup --server
     * --haproxy-setup --wireguard-start`) and still execute the steps in the only
     * order that works. `--status` runs last, so it reports what the run left
     * behind.
     * @param {object} [options] - CLI options.
     * @returns {Promise<void>}
     * @memberof UnderpostWireguard
     */
    async callback(options = {}) {
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
      // After the tunnel, because the service requires it and its address only
      // exists once the interface is up; before `--status`, so a run that
      // reconciles the service also reports it.
      if (options.forwardProxyServer === true) UnderpostWireguard.API.forwardProxyServer(options);
      if (options.status === true) UnderpostWireguard.API.status(options);
    },
  };
}

export {
  EDGE_STATE_PATH,
  UNDERPOST_EDGE,
  allowedIpsConflictsFactory,
  backendNameFactory,
  defaultPeerFactory,
  deployListFactory,
  edgeEnvFactory,
  edgeRouteTableFactory,
  edgeStateFactory,
  firewallCommandsFactory,
  forwardProxyAuthorizedFactory,
  forwardProxyCommandFactory,
  forwardProxyConfigFactory,
  forwardProxyConnectHandlerFactory,
  forwardProxyHeadersFactory,
  forwardProxyRequestHandlerFactory,
  forwardProxyServiceCommandsFactory,
  forwardProxyTargetFactory,
  forwardProxyTunnelTargetFactory,
  forwardProxyUnitFactory,
  haproxyConfFactory,
  haproxyMapsFactory,
  hostProxyEntriesFactory,
  instanceProxyEntriesFactory,
  mergeRouteTablesFactory,
  peerFactory,
  quicForwardCommandsFactory,
  readEdgeState,
  redirectHostFactory,
  tunnelAddressFactory,
  wireguardClientConfFactory,
  wireguardServerConfFactory,
  wireguardStatusFactory,
  writeEdgeState,
};

export default UnderpostWireguard;
