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

import fs from 'fs-extra';
import nodePath from 'node:path';
import { getConfFilePath, loadConfInstances, loadConfServerJson, resolveDeployList } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';

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
     * `haproxy.cfg`, the NAT chains, and the firewalld rules opened for the
     * recorded role. Leaving `haproxy.cfg` behind while deleting the maps it
     * reads is worse than leaving both: the daemon then fails to start on a
     * config that references files that no longer exist.
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
  readEdgeState,
  redirectHostFactory,
  wireguardClientConfFactory,
  wireguardServerConfFactory,
  wireguardStatusFactory,
  writeEdgeState,
};

export default UnderpostWireguard;
