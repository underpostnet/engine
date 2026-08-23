/**
 * Operational event dispatcher: the single place where a detected fault and its
 * remediation are declared together.
 *
 * One registry entry holds an event's probes, its alerting rule and the handler
 * that repairs it. Prometheus and Alertmanager are provisioned from that entry
 * rather than configured beside it, so a probe that nothing can act on and a
 * handler nothing can trigger are both unrepresentable — and adding an event
 * means adding one object, not editing four files.
 *
 * Alertmanager reaches the control-plane handler over the webhook `--serve` exposes. It is a
 * remediation path with root-equivalent reach, so every delivery
 * authenticates with the bearer token the Alertmanager Secret carries.
 *
 * @module src/cli/event.js
 * @namespace UnderpostEvent
 */

import http from 'node:http';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCronDeployEnv, parseList } from '../server/ops/cron.js';
import { timer } from '../client/components/core/CommonJs.js';
import { installRootFile, shellExec, sleepSync } from '../server/runtime/process.js';
import {
  homeDirectoryPathFactory,
  journalctlCommandFactory,
  nodeCandidatesFactory,
  nodeProbeCommandFactory,
  runSystemdCommands,
  scriptProbeCommandFactory,
  systemdServiceCommandsFactory,
  systemdStatusCommandsFactory,
  systemdUnitFactory,
} from '../server/ops/systemd.js';
import { loggerFactory } from '../server/ops/logger.js';
import { shellArgumentFactory } from '../server/security/selinux.js';
import { mailerInterceptorFactory } from '../mailer/MailerInterceptor.js';
import {
  EVENT_CONF_PATH,
  assertNotificationRoutes,
  deliverEventNotification,
  eventNotificationRoutes,
  assertEventSchedules,
  eventSchedule,
  THRESHOLD_TOKEN,
  readEventConf,
} from '../server/ops/event-notification.js';
import { publicIngressProbeFactory, publicIngressUrlsFactory } from '../server/runtime/conf.js';
import { resolveDeployList } from '../server/network/router.js';
import { UNDERPOST_MONITORING } from '../server/ops/monitoring.js';
import {
  EDGE_TOPOLOGY_PATH,
  hostAddressesFactory,
  hubTunnelAddressFactory,
  localPeerFactory,
  readEdgeContext,
  readNodeConfigs,
  readTopology,
  tunnelAddressFactory,
} from './wireguard.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/** Interfaces the node events measure, shared with the dashboard that plots them. */
const NETWORK_DEVICE_SELECTOR = UNDERPOST_MONITORING.nodeExporter.networkDeviceSelector;

/**
 * @constant ENGINE_REMOTE_PATH
 * @description Working directory every remediation runs from. The engine
 * checkout is the only place the `underpost` CLI and the deploy configuration
 * exist together on a managed host.
 * @memberof UnderpostEvent
 */
const ENGINE_REMOTE_PATH = '/home/dd/engine';

/**
 * @constant EVENT_SERVICE
 * @description Identity of the supervised dispatcher.
 *
 * The receiver has to answer whenever Alertmanager fires, which is precisely
 * when nobody is watching a terminal. A unit, not a session: it survives the
 * SSH connection that installed it, and the reboot after it.
 * @memberof UnderpostEvent
 */
const EVENT_SERVICE = {
  name: 'underpost-event.service',
  unitPath: '/etc/systemd/system/underpost-event.service',
  restartSeconds: 5,
  settleTimeoutMs: 15000,
  settleIntervalMs: 500,
};

/**
 * @constant EVENT_E2E
 * @description Bounds of the end-to-end rehearsal.
 *
 * The probe is read from the Blackbox Exporter directly rather than through
 * Prometheus' `for:` window, so these bound how long a real host takes to drop
 * and come back — not how long an alert takes to fire.
 * @memberof UnderpostEvent
 */
const EVENT_E2E = {
  scenarioDirectory: 'test/e2e',
  baselineTimeoutMs: 60000,
  detectTimeoutMs: 180000,
  recoverTimeoutMs: 180000,
  notifyTimeoutMs: 60000,
  probeIntervalMs: 5000,
};

/** Versioned on-disk contract used to restore alerting after planned maintenance. */
const EVENT_SUSPENSION_VERSION = 1;

/**
 * Renders what a probe wait actually observed.
 *
 * "Probes answered again" is the only reading of a bare elapsed time, and it is
 * wrong for every failing wait. An unreadable exporter is named as such rather
 * than reported as a subject that stayed down, because the two need opposite
 * responses from whoever reads the line.
 */
const probeDetail = ({ ok, readable, elapsedMs, observations = [] }, expectation) => {
  if (ok) return `probes ${expectation} after ${elapsedMs}ms`;
  if (!readable) {
    const reasons = [
      ...new Set(observations.filter((entry) => !entry.read).map((entry) => entry.error || 'no answer')),
    ];
    return (
      `the Blackbox Exporter could not be read after ${elapsedMs}ms (${reasons.join(', ')}); ` +
      'the observability stack has to be deployed and reachable by kubectl from here'
    );
  }
  return `probes never ${expectation} within ${elapsedMs}ms (${observations
    .map((entry) => `${entry.target} probe_success=${entry.success ? 1 : 0}`)
    .join(', ')})`;
};

/**
 * @constant PUBLIC_INGRESS_RECOVERY
 * @description How long the edge is given to carry traffic again after a repair.
 *
 * Restarting the tunnel does not restore service the instant the command
 * returns: HAProxy rebinds and every spoke re-handshakes first. Reading the
 * verdict immediately reports a failure that has already fixed itself.
 * @memberof UnderpostEvent
 */
const PUBLIC_INGRESS_RECOVERY = { timeoutMs: 120000, intervalMs: 10000 };

/** Strips the colour codes a remote command's logger wrote for its own terminal. */
const plainText = (value = '') =>
  `${value ?? ''}`
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim();

/** Gives each event subject an independent webhook cooldown. */
const eventCooldownKeyFactory = (eventId, alerts = []) => {
  const subjects = [
    ...new Set(
      alerts
        .map((alert) => alert?.labels?.underpost_spoke || alert?.labels?.instance || '')
        .filter(Boolean)
        .sort(),
    ),
  ];
  return `${eventId}:${subjects.join(',') || 'global'}`;
};

/** Opens or closes the authenticated dispatcher port when firewalld is active. */
const eventFirewallCommandsFactory = ({ port = UNDERPOST_MONITORING.eventWebhook.port, remove = false } = {}) => {
  const resolvedPort = Number(port) || UNDERPOST_MONITORING.eventWebhook.port;
  const action = remove ? '--remove-port' : '--add-port';
  const guard = 'command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld';
  return [
    `sudo sh -c '${guard} && firewall-cmd --permanent ${action}=${resolvedPort}/tcp >/dev/null || true'`,
    `sudo sh -c '${guard} && firewall-cmd --reload >/dev/null || true'`,
  ];
};

const eventServicePortFactory = (unit = '') => {
  const match = `${unit || ''}`.match(/^ExecStart=.*\bevent\s+--serve\b[^\n]*\s--port\s+(\d+)(?:\s|$)/m);
  const port = Number(match?.[1]);
  return port > 0 && port <= 65535 ? port : 0;
};

const assertHubManagementConnection = ({ hubHost, sshForwardPort = 0, connection } = {}) => {
  if (!connection)
    throw new Error(
      `[event] no SSH connection is registered for the WireGuard hub at ${hubHost}; ` +
        `run: node bin ssh --user <user> --host ${hubHost} --user-add`,
    );
  if (sshForwardPort && Number(connection.port) === Number(sshForwardPort))
    throw new Error(
      `[event] hub SSH at ${hubHost}:${connection.port} collides with the spoke-forward port; ` +
        'register the VPS sshd port instead',
    );
  return connection;
};

/**
 * @method wireguardAlertFactory
 * @description The alerting rule shape both WireGuard events share.
 *
 * `probe_success == 0` on the event's own label selector, and nothing else.
 * `absent()` would also fire during Prometheus' first scrape after a config
 * reload — not a tunnel fault, and not something to run remediation for.
 * @param {object} params
 * @param {string} params.name - Alert name.
 * @param {string} params.eventId - Event id the probes are labelled with.
 * @param {string} params.summary - Alert summary, rendered with the alert's own labels.
 * @param {string} params.description - What the handler is about to do.
 * @returns {object} Alert definition, without a duration: `alertFor` is contract
 * data, resolved onto the definition, so the rule cannot carry a second answer.
 * @memberof UnderpostEvent
 */
const wireguardAlertFactory = ({ name, eventId, summary, description }) => ({
  name,
  expr: `probe_success{underpost_event="${eventId}"} == 0`,
  severity: 'critical',
  summary,
  description,
});

/**
 * @constant warnedManagementDrift
 * @description Peer ids already reported as no longer matching this machine.
 * The check runs on every topology read; the warning is worth one line per
 * process, not one per probe render.
 * @memberof UnderpostEvent
 */
const warnedManagementDrift = new Set();

/**
 * @method warnManagementHostDrift
 * @description Warns when this machine no longer answers to the management
 * address its own peer is registered under.
 *
 * Locality is settled against the host's live interfaces, so a management
 * address that drifts — a DHCP lease lost during an outage, a renumbered LAN —
 * silently reclassifies this node as remote. Nothing fails: the spoke probe
 * moves from the hub's tunnel address to this node's own, which answers locally
 * whether or not the tunnel carries anything, and remediation routes over SSH
 * to an address that is now someone else's. Both are quiet wrong answers, so
 * the drift is reported where it is detected.
 * @param {object} state - Edge context for this machine.
 * @param {Array<object>} spokes - Resolved spokes.
 * @param {Set<string>} addresses - This machine's addresses.
 * @memberof UnderpostEvent
 */
const warnManagementHostDrift = (state, spokes, addresses) => {
  if (!state.peerId || warnedManagementDrift.has(state.peerId)) return;
  const self = spokes.find((spoke) => spoke.id === state.peerId);
  if (!self || self.local) return;
  warnedManagementDrift.add(state.peerId);
  logger.warn('This host no longer answers to the management address its peer is registered under', {
    peerId: state.peerId,
    registered: self.managementHost,
    addresses: [...addresses],
    topology: EDGE_TOPOLOGY_PATH,
    effect: 'probes and remediation for this node are resolved as remote',
  });
};

/**
 * @constant EVENTS
 * @description The event registry.
 *
 * The spoke repair runs before the delayed hub repair. The control plane acts
 * locally for itself, over LAN SSH for workers, and over external SSH for the hub.
 *
 * `probes` and `remediation` are functions, not values: both are read from the
 * live WireGuard topology at call time, and resolving them at module load would
 * freeze whatever the file said when the process started.
 * @memberof UnderpostEvent
 */
const EVENTS = {
  'wireguard-server-down': {
    role: 'hub',
    description: 'The WireGuard hub stopped carrying traffic across the tunnel.',
    alert: wireguardAlertFactory({
      name: 'UnderpostWireguardServerDown',
      eventId: 'wireguard-server-down',
      summary: 'WireGuard hub {{ $labels.underpost_hub }} unreachable across the tunnel ({{ $labels.instance }})',
      description: 'The hub tunnel address remains unavailable after spoke remediation; restarting the hub.',
    }),
    // The hub's tunnel address, probed from a spoke. Only traffic the hub's
    // WireGuard service is actually carrying reaches that address, so a reply
    // proves the tunnel works — unlike a probe of the public endpoint, which a
    // running VPS answers whether or not WireGuard is up.
    probes: () =>
      Underpost.event
        .hubs()
        .filter((hub) => hub.address)
        .map((hub) => ({
          module: 'icmp',
          targets: [hub.address],
          labels: { underpost_role: 'hub', underpost_hub: hub.hubHost },
        })),
    remediation: () =>
      Underpost.event.hubs().map((hub) => {
        try {
          return Underpost.event.hubTarget(hub.hubHost);
        } catch (error) {
          return { role: 'hub', nodeName: hub.nodeName, address: hub.address, via: 'unresolved', error: error.message };
        }
      }),
    handler: async (options = {}, alerts = []) => Underpost.event.repairHub(options, alerts),
  },

  'wireguard-spoke-down': {
    role: 'spoke',
    description: 'A registered WireGuard spoke fell off the hub tunnel.',
    alert: wireguardAlertFactory({
      name: 'UnderpostWireguardSpokeDown',
      eventId: 'wireguard-spoke-down',
      summary: 'WireGuard spoke {{ $labels.underpost_spoke }} unreachable ({{ $labels.instance }})',
      description: 'Spoke {{ $labels.underpost_spoke }} has not answered across the tunnel for 2m; restarting it.',
    }),
    probes: () =>
      Underpost.event.spokes().map((spoke) => ({
        module: 'icmp',
        targets: [spoke.local ? Underpost.event.hubAddress() : spoke.address],
        labels: { underpost_role: 'spoke', underpost_spoke: spoke.id },
      })),
    remediation: () =>
      Underpost.event.spokes().map((spoke) => {
        try {
          return Underpost.event.spokeTarget(spoke.id);
        } catch (error) {
          return {
            role: 'spoke',
            spokeId: spoke.id,
            address: spoke.address,
            via: 'unresolved',
            error: error.message,
          };
        }
      }),
    handler: async (options = {}, alerts = []) => Underpost.event.repairSpokes(options, alerts),
  },

  'public-ingress-down': {
    role: 'ingress',
    description: 'Public hosts stopped answering through the edge.',
    alert: {
      name: 'UnderpostPublicIngressDown',
      expr: 'probe_success{underpost_event="public-ingress-down"} == 0',
      severity: 'critical',
      summary: 'Public host {{ $labels.instance }} unreachable',
      description: 'A published host stopped answering; the handler classifies the outage before acting.',
    },
    probes: () =>
      Underpost.event.publicIngressUrls().map((entry) => ({
        module: 'http_2xx',
        targets: [entry.url],
        labels: { underpost_role: 'ingress', underpost_host: entry.host },
      })),
    remediation: () =>
      Underpost.event.hubs().map((hub) => {
        try {
          return { ...Underpost.event.hubTarget(hub.hubHost), role: 'ingress' };
        } catch (error) {
          return {
            role: 'ingress',
            nodeName: hub.nodeName,
            address: hub.address,
            via: 'unresolved',
            error: error.message,
          };
        }
      }),
    handler: async (options = {}) => Underpost.event.repairPublicIngress(options),
  },

  'node-cpu-limit-exceeded': {
    role: 'node',
    description: 'CPU usage on a cluster node stayed above its declared threshold.',
    alert: {
      name: 'UnderpostNodeCpuLimitExceeded',
      expr: `(100 - (avg by (instance, underpost_role) (rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100)) > ${THRESHOLD_TOKEN}`,
      severity: 'warning',
      summary: 'High CPU usage on {{ $labels.instance }}',
      description: 'Sustained CPU pressure; the handler captures the processes responsible.',
    },
    probes: () => [],
    remediation: () => Underpost.event.nodeTargets(),
    handler: async (options = {}, alerts = []) =>
      Underpost.event.inspectNodes({
        role: 'node',
        command: 'ps aux --sort=-%cpu | head -n 10',
        condition: 'CPU usage stayed above the declared threshold',
        options,
        alerts,
      }),
  },

  'node-memory-limit-exceeded': {
    role: 'node',
    description: 'Available memory on a cluster node fell below its declared threshold.',
    alert: {
      name: 'UnderpostNodeMemoryLimitExceeded',
      expr: '(100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))) > <threshold>',
      severity: 'warning',
      summary: 'High RAM usage on {{ $labels.instance }}',
      description: 'Sustained memory pressure; the handler captures the processes responsible.',
    },
    probes: () => [],
    remediation: () => Underpost.event.nodeTargets(),
    handler: async (options = {}, alerts = []) =>
      Underpost.event.inspectNodes({
        role: 'node',
        command: 'ps aux --sort=-%mem | head -n 10',
        condition: 'memory usage stayed above the declared threshold',
        options,
        alerts,
      }),
  },

  'hub-bandwidth-limit-exceeded': {
    role: 'hub',
    description: 'The hub consumed the declared share of its monthly bandwidth quota.',
    alert: {
      name: 'UnderpostHubBandwidthLimitExceeded',
      expr: '(vultr_bandwidth_used_bytes / vultr_bandwidth_limit_bytes) * 100 > <threshold>',
      severity: 'critical',
      summary: 'Hub bandwidth limit threshold reached',
      description: 'Monthly quota consumption crossed the declared share; the handler reports the breakdown.',
    },
    // The quota is read by the Vultr cron and published as a textfile metric,
    // so nothing here probes an external API on the alert path.
    probes: () => [],
    remediation: () =>
      Underpost.event.hubs().map((hub) => {
        try {
          return Underpost.event.hubTarget(hub.hubHost);
        } catch (error) {
          return { role: 'hub', nodeName: hub.nodeName, address: hub.address, via: 'unresolved', error: error.message };
        }
      }),
    handler: async (options = {}, alerts = []) =>
      Underpost.event.inspectNodes({
        role: 'hub',
        command: 'node bin vultr --bandwidth --dry-run',
        condition: 'monthly bandwidth consumption crossed the declared share of the quota',
        options,
        alerts,
      }),
  },

  'node-disk-limit-exceeded': {
    role: 'node',
    description: 'Root filesystem usage on a cluster node exceeded its declared threshold.',
    alert: {
      name: 'UnderpostNodeDiskLimitExceeded',
      expr: '(100 - ((node_filesystem_avail_bytes{mountpoint="/"} * 100) / node_filesystem_size_bytes{mountpoint="/"})) > <threshold>',
      severity: 'warning',
      summary: 'High disk utilization on {{ $labels.instance }}',
      description: 'The root filesystem is filling; the handler reports what is consuming it.',
    },
    probes: () => [],
    remediation: () => Underpost.event.nodeTargets(),
    handler: async (options = {}, alerts = []) =>
      Underpost.event.inspectNodes({
        role: 'node',
        command: 'df -h / && du -sh /var/log/* 2>/dev/null | sort -rh | head -n 10',
        condition: 'root filesystem usage stayed above the declared threshold',
        options,
        alerts,
      }),
  },

  'node-network-traffic-exceeded': {
    role: 'node',
    description: 'Interface throughput on a cluster node exceeded its declared rate.',
    alert: {
      name: 'UnderpostNodeNetworkTrafficExceeded',
      expr:
        `((rate(node_network_receive_bytes_total{${NETWORK_DEVICE_SELECTOR}}[2m]) + ` +
        `rate(node_network_transmit_bytes_total{${NETWORK_DEVICE_SELECTOR}}[2m])) * 8 / 1000000) > ${THRESHOLD_TOKEN}`,
      severity: 'warning',
      summary: 'High network traffic burst on {{ $labels.instance }} ({{ $labels.device }})',
      description: 'Sustained throughput above the declared rate; the handler reports the sockets carrying it.',
    },
    probes: () => [],
    remediation: () => Underpost.event.nodeTargets(),
    handler: async (options = {}, alerts = []) =>
      Underpost.event.inspectNodes({
        role: 'node',
        command: 'ss -tunp state established | head -n 20 && cat /proc/net/dev',
        condition: 'interface throughput stayed above the declared rate',
        options,
        alerts,
      }),
  },
};

/**
 * @class UnderpostEvent
 * @description Dispatches operational events, and provisions the monitoring
 * configuration that triggers them.
 * @memberof UnderpostEvent
 */
class UnderpostEvent {
  static API = {
    /**
     * @method EVENTS
     * @description The registered events, keyed by id.
     * @returns {object} Event registry.
     * @memberof UnderpostEvent
     */
    get EVENTS() {
      return EVENTS;
    },

    /**
     * @method hubAddress
     * @description The hub's address inside the tunnel, from either end.
     * @returns {string} Hub tunnel address, or an empty string when underivable.
     * @memberof UnderpostEvent
     */
    hubAddress() {
      return hubTunnelAddressFactory(readEdgeContext());
    },

    /**
     * @method spokes
     * @description Registered spokes with tunnel and management identity.
     *
     * Read from `conf.wireguard.json`, which is the only source of tunnel
     * topology and stable management addresses. `local` is settled against this
     * machine's own addresses rather than against the node document that named
     * it, so a repair never runs here for a peer that is somewhere else.
     * @returns {Array<object>} Spokes with a resolvable tunnel address.
     * @memberof UnderpostEvent
     */
    spokes() {
      const state = readEdgeContext();
      const nodes = readNodeConfigs().filter((node) => node.hubHost === state.hubHost);
      const addresses = hostAddressesFactory();
      const spokes = state.peers
        .map((peer) => {
          const node = nodes.find((entry) => entry.peerId === peer.id);
          return {
            id: peer.id,
            address: tunnelAddressFactory(peer.address),
            managementHost: peer.managementHost,
            nodeRole: node?.role || '',
            nodeName: node?.nodeName || '',
            local: localPeerFactory(peer.managementHost, addresses),
          };
        })
        .filter((spoke) => spoke.id && spoke.address);
      warnManagementHostDrift(state, spokes, addresses);
      return spokes;
    },

    /**
     * @method clusterNodes
     * @description Registered nodes the cluster schedules on, with their role.
     *
     * Node discovery knows a machine by the name the kubelet registered, which
     * is the name its node document is filed under; the role only the document
     * holds is what the dashboards group by.
     * @returns {Array<{nodeName: string, role: string}>} Non-hub nodes.
     * @memberof UnderpostEvent
     */
    clusterNodes() {
      return readNodeConfigs()
        .filter((node) => node.nodeName && node.role && node.role !== 'hub')
        .map((node) => ({ nodeName: node.nodeName, role: node.role }));
    },

    /**
     * @method hubs
     * @description Registered hubs, joined from topology to the node documents
     * that name them.
     *
     * Topology owns the hub set — its top-level key is the static public
     * address — so a hub with no node document is still a hub. The document only
     * supplies the name `--nodes` selects it by.
     * @param {string} [selector] - Hub node name or static address; empty returns every hub.
     * @returns {Array<{nodeName: string, hubHost: string, address: string, sshForwardPort: number}>} Registered hubs.
     * @throws {Error} When a selector matches no registered hub.
     * @memberof UnderpostEvent
     */
    hubs(selector = '') {
      const nodes = readNodeConfigs().filter((node) => node.role === 'hub');
      const hubs = Object.entries(readTopology()).map(([hubHost, hub]) => ({
        nodeName: nodes.find((node) => node.hubHost === hubHost)?.nodeName || '',
        hubHost,
        address: hubTunnelAddressFactory({ role: 'hub', address: hub.address }),
        sshForwardPort: hub.sshForwardPort,
      }));
      const selected = `${selector || ''}`.trim();
      if (!selected) return hubs;
      const hub = hubs.find((entry) => entry.nodeName === selected || entry.hubHost === selected);
      if (!hub)
        throw new Error(`[event] '${selected}' is not a registered hub node or address in ${EDGE_TOPOLOGY_PATH}`);
      return [hub];
    },

    /** Resolves one hub through its static public address, which no failed tunnel is part of. */
    hubTarget(hubHost = '') {
      const [hub] = Underpost.event.hubs(`${hubHost || ''}`.trim() || readEdgeContext().hubHost);
      const connection = assertHubManagementConnection({
        hubHost: hub.hubHost,
        sshForwardPort: hub.sshForwardPort,
        connection: Underpost.ssh.resolveConnection({ host: hub.hubHost }),
      });
      return {
        role: 'hub',
        nodeName: hub.nodeName,
        address: hub.address,
        user: connection.user,
        host: connection.host,
        via: `${connection.user}@${connection.host}:${connection.port}`,
      };
    },

    /**
     * @method spokeTarget
     * @description Maps a spoke to local execution or its registered LAN management host.
     *
     * The management host joins exactly against `conf.users.json`; credentials
     * never enter the topology or rendered monitoring configuration.
     * @param {string} spokeId - Registered spoke id.
     * @returns {{spokeId: string, address: string, user: string, host: string, via: string}} Resolved remediation target.
     * @throws {Error} When the spoke is unregistered or has no management connection.
     * @memberof UnderpostEvent
     */
    spokeTarget(spokeId) {
      const spoke = Underpost.event.spokes().find((entry) => entry.id === spokeId);
      if (!spoke)
        throw new Error(`[event] spoke '${spokeId}' is not in ${EDGE_TOPOLOGY_PATH}; register it with --peer-add`);
      if (!spoke.nodeRole)
        throw new Error(
          `[event] spoke '${spokeId}' has no node identity in deploy/nodes; run --node-config on that machine`,
        );
      if (spoke.local) {
        return {
          role: 'spoke',
          nodeRole: spoke.nodeRole,
          spokeId: spoke.id,
          address: spoke.address,
          user: '',
          host: '',
          via: 'local',
        };
      }
      if (!spoke.managementHost)
        throw new Error(
          `[event] spoke '${spokeId}' has no managementHost; ` +
            `re-register it with --peer-add ${spokeId} --management-host <lan-ip> --build-conf`,
        );
      const connection = Underpost.ssh.resolveConnection({ host: spoke.managementHost });
      if (!connection)
        throw new Error(
          `[event] no SSH connection is registered for spoke '${spokeId}' at ${spoke.managementHost}; ` +
            `run: node bin ssh --user <user> --host ${spoke.managementHost} --user-add`,
        );
      return {
        role: 'spoke',
        nodeRole: spoke.nodeRole,
        spokeId: spoke.id,
        address: spoke.address,
        user: connection.user,
        host: connection.host,
        via: `${connection.user}@${connection.host}:${connection.port}`,
      };
    },

    /**
     * @method controlTarget
     * @description The node the observability stack runs on, and the identity
     * that reaches it.
     *
     * Probes are read where detection reads them. Resolving that node from
     * topology rather than assuming it is this machine is what lets a rehearsal
     * run from any machine holding the deploy configuration and the SSH
     * registry, instead of only from the control plane itself.
     * @returns {object} Resolved execution target.
     * @throws {Error} When no control node is registered.
     * @memberof UnderpostEvent
     */
    controlTarget() {
      const control = Underpost.event.spokes().find((spoke) => spoke.nodeRole === 'control');
      if (!control)
        throw new Error(`[event] no node with role 'control' is registered in deploy/nodes; probes have no reader`);
      return Underpost.event.spokeTarget(control.id);
    },

    /**
     * @method subjectSelection
     * @description The subjects one dispatch acts on.
     *
     * `--nodes` names node documents and `--spoke` topology peer ids; either
     * narrows the dispatch to those subjects, and a selector matching nothing of
     * the event's role is refused. This is the single place that reading happens,
     * so a hand-run repair, a rehearsal and `--list` cannot disagree about what
     * a selector means.
     * @param {('hub'|'spoke')} role - Which registry to select from.
     * @param {object} [options] - CLI options (`nodes`, `spoke`).
     * @returns {string[]} Hub addresses or spoke ids, in registry order.
     * @throws {Error} When a selector matches nothing of that role.
     * @memberof UnderpostEvent
     */
    subjectSelection(role, options = {}) {
      const selectors = parseList(options.nodes);
      if (role === 'hub') {
        if (selectors.length === 0) return Underpost.event.hubs().map((hub) => hub.hubHost);
        return [...new Set(selectors.flatMap((selector) => Underpost.event.hubs(selector).map((hub) => hub.hubHost)))];
      }

      const spokes = Underpost.event.spokes();
      const spokeSelectors = selectors.length > 0 ? selectors : parseList(options.spoke);
      if (spokeSelectors.length === 0) return spokes.map((spoke) => spoke.id);
      return [
        ...new Set(
          spokeSelectors.map((selector) => {
            const spoke = spokes.find((entry) => entry.id === selector || entry.nodeName === selector);
            if (!spoke)
              throw new Error(
                `[event] '${selector}' is not a registered spoke id or node name in ${EDGE_TOPOLOGY_PATH}`,
              );
            return spoke.id;
          }),
        ),
      ];
    },

    /**
     * @method wireguardHealth
     * @description The edge status report, for the notification's health line.
     *
     * Runs the same `wireguard --status` an operator would, locally or on the
     * spoke, so the mail carries the state the CLI reports rather than a second
     * opinion assembled here.
     * @param {object} [params]
     * @param {string} [params.user] - SSH user; omitted runs locally on the control plane.
     * @param {string} [params.host] - Host that account should reach.
     * @param {boolean} [params.dryRun] - Skip the read.
     * @returns {Promise<string>} Trimmed status output.
     * @memberof UnderpostEvent
     */
    async wireguardHealth({ user = '', host = '', dryRun = false } = {}) {
      if (dryRun) return '(dry run: status not read)';
      const read = await Underpost.event.runCommand('node bin wireguard --status', { user, host });
      return `${read.output || read.error || ''}`.trim().slice(-1500);
    },

    /**
     * @method repairHub
     * @description Remediation for `wireguard-server-down`.
     *
     * Runs through each hub's external SSH endpoint so the failed tunnel is not
     * part of the repair path. Acts on the hubs the alert names, else on the
     * `--nodes` selection, else on every registered hub.
     * @param {object} [options] - Dispatch options (`dryRun`, `nodes`).
     * @param {Array<object>} [alerts] - Originating Alertmanager alerts.
     * @returns {Promise<object>} Structured remediation result.
     * @memberof UnderpostEvent
     */
    async repairHub(options = {}, alerts = []) {
      const named = [...new Set(alerts.map((alert) => alert?.labels?.underpost_hub).filter(Boolean))];
      const hubHosts = named.length > 0 ? named : Underpost.event.subjectSelection('hub', options);

      if (hubHosts.length === 0)
        return {
          ok: false,
          role: 'hub',
          condition: `no hub is registered in ${EDGE_TOPOLOGY_PATH}`,
          health: '',
          targets: [],
        };

      const targets = [];
      for (const hubHost of hubHosts) {
        let target;
        try {
          target = Underpost.event.hubTarget(hubHost);
        } catch (error) {
          targets.push({ role: 'hub', address: '', via: 'unresolved', commands: [], ok: false, output: error.message });
          continue;
        }
        const commands = ['node bin wireguard --wireguard-restart --check --check-timeout 30 --expected-role hub'];
        const result = await Underpost.event.runCommand(commands[0], {
          ...options,
          user: target.user,
          host: target.host,
        });
        targets.push({
          role: 'hub',
          nodeName: target.nodeName,
          address: target.address,
          via: target.via,
          commands,
          ok: result.ok,
          output: result.output || result.error,
          health: await Underpost.event.wireguardHealth({
            user: target.user,
            host: target.host,
            dryRun: options.dryRun,
          }),
        });
      }

      return {
        ok: targets.length > 0 && targets.every((target) => target.ok),
        role: 'hub',
        condition:
          `${hubHosts.length} hub(s) stopped answering across the tunnel after spoke remediation: ` +
          hubHosts.join(', '),
        health: '',
        targets,
      };
    },

    /**
     * @method repairSpokes
     * @description Remediation for `wireguard-spoke-down`.
     *
     * Acts only on the spokes the alert names, resolving each one's own SSH
     * account before touching it. Invoked by hand with no alerts, it falls back
     * to the `--spoke` / `--nodes` selection and then to every registered
     * spoke, which is what makes `--dry-run` a useful rehearsal of the whole
     * topology.
     *
     * One spoke failing to resolve or repair does not stop the others: they are
     * independent hosts, and a partial recovery is better than none. The
     * notification reports each outcome separately.
     * @param {object} [options] - Dispatch options (`dryRun`, `spoke`, `nodes`).
     * @param {Array<object>} [alerts] - Originating Alertmanager alerts.
     * @returns {Promise<object>} Structured remediation result.
     * @memberof UnderpostEvent
     */
    async repairSpokes(options = {}, alerts = []) {
      const named = [...new Set(alerts.map((alert) => alert?.labels?.underpost_spoke).filter(Boolean))];
      const spokeIds = named.length > 0 ? named : Underpost.event.subjectSelection('spoke', options);

      if (spokeIds.length === 0)
        return {
          ok: false,
          role: 'spoke',
          condition: `no spoke is registered in ${EDGE_TOPOLOGY_PATH}`,
          health: '',
          targets: [],
        };

      const targets = [];
      for (const spokeId of spokeIds) {
        let target;
        try {
          target = Underpost.event.spokeTarget(spokeId);
        } catch (error) {
          targets.push({
            role: 'spoke',
            spokeId,
            address: '',
            via: 'unresolved',
            commands: [],
            ok: false,
            output: `${error.message}`,
          });
          continue;
        }
        const commands = [
          `node bin wireguard --wireguard-restart --check --check-timeout 30 --expected-role ${shellArgumentFactory(target.nodeRole)} --expected-id ${shellArgumentFactory(target.spokeId)}`,
        ];
        const result = await Underpost.event.runCommand(commands[0], {
          ...options,
          user: target.user,
          host: target.host,
        });
        targets.push({
          role: 'spoke',
          spokeId: target.spokeId,
          address: target.address,
          via: target.via,
          commands,
          ok: result.ok,
          output: result.output || result.error,
          health: await Underpost.event.wireguardHealth({
            user: target.user,
            host: target.host,
            dryRun: options.dryRun,
          }),
        });
      }

      return {
        ok: targets.length > 0 && targets.every((target) => target.ok),
        role: 'spoke',
        condition: `${spokeIds.length} spoke(s) stopped answering across the tunnel: ${spokeIds.join(', ')}`,
        health: '',
        targets,
      };
    },

    /**
     * @method publicIngressUrls
     * @description Every public URL the cluster publishes, from the deploy conf
     * the traffic report reads.
     * @returns {Array<{host: string, path: string, url: string}>} Routable URLs.
     * @memberof UnderpostEvent
     */
    publicIngressUrls() {
      return publicIngressUrlsFactory(resolveDeployList('dd'), 'production');
    },

    /**
     * @method publicIngressHealth
     * @description Probes every public URL and classifies the outage.
     *
     * The final code of the redirect chain is the answer: a `301` that never
     * lands on a `200` is a broken route, not a served one. The classification
     * is what decides the response — the difference between one host failing and
     * every host failing is the difference between a deploy problem and an edge
     * outage, and only the second is something remediation can fix.
     * @returns {{state: ('healthy'|'partial'|'down'), total: number, failing: Array<object>, healthy: number}} Report.
     * @memberof UnderpostEvent
     */
    publicIngressHealth() {
      const results = Underpost.event.publicIngressUrls().map((entry) => {
        const statuses = publicIngressProbeFactory(entry.url);
        return { ...entry, statuses, ok: statuses[statuses.length - 1] === '200' };
      });
      const failing = results.filter((entry) => !entry.ok);
      return {
        state:
          results.length === 0 || failing.length === 0
            ? 'healthy'
            : failing.length === results.length
              ? 'down'
              : 'partial',
        total: results.length,
        healthy: results.length - failing.length,
        failing,
      };
    },

    /**
     * @method awaitPublicIngressHealth
     * @description Probes the public edge until it is healthy, or the wait runs out.
     * @param {object} [params]
     * @param {number} [params.timeoutMs] - Maximum wait.
     * @param {number} [params.intervalMs] - Pause between passes.
     * @returns {Promise<object>} The last health report.
     * @memberof UnderpostEvent
     */
    async awaitPublicIngressHealth({
      timeoutMs = PUBLIC_INGRESS_RECOVERY.timeoutMs,
      intervalMs = PUBLIC_INGRESS_RECOVERY.intervalMs,
    } = {}) {
      const deadline = Date.now() + Math.max(0, timeoutMs);
      let health = Underpost.event.publicIngressHealth();
      while (health.state !== 'healthy' && Date.now() < deadline) {
        await timer(intervalMs);
        health = Underpost.event.publicIngressHealth();
      }
      return health;
    },

    /**
     * @method repairPublicIngress
     * @description Remediation for `public-ingress-down`.
     *
     * Three outcomes, because they need three different responses. Every host
     * healthy is not an event at all and is reported to nobody. Some hosts
     * failing is a deploy-level fault the edge cannot repair, so it is announced
     * and left alone. Every host failing is an edge outage: ingress is unblocked
     * and the tunnel rebuilt on the hub, then the same probe decides whether it
     * worked — polled, because the edge takes a moment to carry traffic again
     * and a single immediate read reports a failure that has already cleared.
     * @param {object} [options] - Dispatch options (`dryRun`, `nodes`).
     * @returns {Promise<object>} Structured remediation result.
     * @memberof UnderpostEvent
     */
    async repairPublicIngress(options = {}) {
      const before = Underpost.event.publicIngressHealth();
      const summary = (health) => `${health.healthy}/${health.total} public hosts answering 200`;

      if (before.state === 'healthy')
        return { ok: true, role: 'ingress', silent: true, condition: summary(before), health: '', targets: [] };

      if (before.state === 'partial')
        return {
          ok: false,
          role: 'ingress',
          condition: `${summary(before)}; ${before.failing.length} failing, so the edge is up and the fault is per host`,
          health: Underpost.event.publicIngressReport(before),
          targets: [],
        };

      const targets = [];
      for (const hubHost of Underpost.event.subjectSelection('hub', options)) {
        let target;
        try {
          target = Underpost.event.hubTarget(hubHost);
        } catch (error) {
          targets.push({
            role: 'ingress',
            address: '',
            via: 'unresolved',
            commands: [],
            ok: false,
            output: error.message,
          });
          continue;
        }
        // Ingress first: a blocked edge would make the tunnel rebuild look
        // successful while nothing could still reach it.
        const commands = [
          'node bin ip --unblock-all-ingress',
          'node bin wireguard --wireguard-setup --wireguard-restart',
        ];
        const outputs = [];
        let ok = true;
        for (const command of commands) {
          const result = await Underpost.event.runCommand(command, {
            ...options,
            user: target.user,
            host: target.host,
          });
          outputs.push(`${result.output || result.error || ''}`.trim().slice(-500));
          ok = result.ok;
          if (!ok) break;
        }
        targets.push({
          role: 'ingress',
          nodeName: target.nodeName,
          address: target.address,
          via: target.via,
          commands,
          ok,
          output: outputs.join('\n'),
        });
      }

      const after = options.dryRun ? before : await Underpost.event.awaitPublicIngressHealth();
      return {
        ok: targets.length > 0 && targets.every((target) => target.ok) && after.state === 'healthy',
        role: 'ingress',
        condition: `every public host stopped answering (${before.total} of ${before.total}); after remediation ${summary(after)}`,
        health: Underpost.event.publicIngressReport(after),
        targets,
      };
    },

    /** Renders the per-host probe outcome for the notification body. */
    publicIngressReport(health) {
      return health.failing.map((entry) => `${entry.url} -> ${entry.statuses.join('→')}`).join('\n');
    },

    /**
     * @method nodeTargets
     * @description Every machine host metrics are collected from, keyed by the
     * address Prometheus labels its series with.
     *
     * A discovered node reports its InternalIP, which is the management address
     * topology already records; the hub reports its tunnel address. Both resolve
     * to the identity that can run a command there, so a threshold alert names a
     * machine an operator can reach.
     * @returns {Array<object>} Execution targets with the `instance` they answer to.
     * @memberof UnderpostEvent
     */
    nodeTargets() {
      const targets = [];
      for (const hub of Underpost.event.hubs())
        try {
          targets.push({ ...Underpost.event.hubTarget(hub.hubHost), instance: hub.address });
        } catch (error) {
          targets.push({ role: 'hub', instance: hub.address, via: 'unresolved', error: error.message });
        }
      for (const spoke of Underpost.event.spokes())
        try {
          const target = Underpost.event.spokeTarget(spoke.id);
          targets.push({ ...target, instance: spoke.managementHost || spoke.address });
        } catch (error) {
          targets.push({ role: 'spoke', instance: spoke.managementHost, via: 'unresolved', error: error.message });
        }
      return targets;
    },

    /**
     * @method inspectNodes
     * @description Runs one diagnostic on every node an alert names, or on all
     * of them when it names none.
     *
     * The diagnostic is read-only: a threshold crossing says a machine is under
     * pressure, not what to do about it, and the useful response is the evidence
     * an operator would gather by hand.
     * @param {object} params
     * @param {string} params.role - Reported role for the notification.
     * @param {string} params.command - Diagnostic to run on each node.
     * @param {string} params.condition - What the rule observed.
     * @param {object} [params.options] - Dispatch options.
     * @param {Array<object>} [params.alerts] - Originating alerts; their `instance` selects the nodes.
     * @returns {Promise<object>} Structured result.
     * @memberof UnderpostEvent
     */
    async inspectNodes({ role, command, condition, options = {}, alerts = [] }) {
      const named = [
        ...new Set(alerts.map((alert) => `${alert?.labels?.instance || ''}`.split(':')[0]).filter(Boolean)),
      ];
      const nodes = Underpost.event.nodeTargets();
      const selected = named.length > 0 ? nodes.filter((node) => named.includes(node.instance)) : nodes;

      if (selected.length === 0)
        return {
          ok: false,
          role,
          condition,
          health: '',
          targets: [],
          error: `no registered node matches ${named.join(', ') || 'the alert'}`,
        };

      const targets = [];
      for (const node of selected) {
        if (node.via === 'unresolved') {
          targets.push({
            role,
            address: node.instance,
            via: 'unresolved',
            commands: [],
            ok: false,
            output: node.error,
          });
          continue;
        }
        const result = await Underpost.event.runCommand(command, {
          ...options,
          user: node.user,
          host: node.host,
          silent: true,
        });
        targets.push({
          role,
          nodeName: node.nodeName || node.spokeId || '',
          address: node.instance,
          via: node.via,
          commands: [command],
          ok: result.ok,
          output: `${result.output || result.error || ''}`.trim().slice(-1500),
        });
      }

      return { ok: targets.every((target) => target.ok), role, condition, health: '', targets };
    },

    /**
     * @method definitions
     * @description Resolves event definitions, with probes and remediation
     * identities expanded from live host state. This is the shape the monitoring
     * stack is rendered from, and the shape `--list` prints.
     * A string selects by name and empty means every registered event, which is
     * what a full convergence wants. An array is taken literally, empty
     * included: `--undeploy` of the last event has to render no events at all,
     * and "none" must not collapse into "all".
     * @param {string|string[]} [eventIds] - Comma-separated ids, or an exact list.
     * @returns {Array<object>} Definitions with `id`, resolved `probes` and resolved `remediation`.
     * @memberof UnderpostEvent
     */
    definitions(eventIds = '') {
      const ids = parseList(eventIds);
      const selected = Array.isArray(eventIds) || ids.length > 0 ? ids : Object.keys(EVENTS);
      const conf = readEventConf();
      return selected.map((id) => {
        const event = EVENTS[id];
        if (!event) throw new Error(`[event] unknown event id: ${id}`);
        const schedule = eventSchedule(id, conf);
        const probes = event.probes().map((probe) => ({ ...probe, eventId: id, interval: schedule.probeInterval }));
        // Only a rule that reads `probe_success` depends on them; a threshold
        // rule reads scraped host metrics and declares no probe by design.
        if (probes.length === 0 && `${event.alert.expr}`.includes('probe_success'))
          logger.warn(`Event has no resolvable probe targets; its rule will never fire`, { eventId: id });
        return {
          ...event,
          id,
          schedule,
          alert: {
            ...event.alert,
            for: schedule.alertFor,
            expr: `${event.alert.expr}`.replaceAll(THRESHOLD_TOKEN, schedule.threshold),
          },
          probes,
          remediation: event.remediation(),
          notifications: eventNotificationRoutes(id, conf),
        };
      });
    },

    /** Ensures every rendered event has an executable remediation route. */
    assertRemediationReady(definitions = Underpost.event.definitions()) {
      const unresolved = definitions
        .flatMap((definition) => definition.remediation)
        .filter((target) => target.via === 'unresolved');
      if (unresolved.length > 0)
        throw new Error(
          `[event] remediation targets are unresolved:\n${unresolved
            .map((target) => `- ${target.spokeId || target.role}: ${target.error || 'no management route'}`)
            .join('\n')}`,
        );
      return definitions;
    },

    /**
     * @method deployedEventIds
     * @description The events the cluster is currently running.
     * @param {object} [options] - CLI options (`namespace`).
     * @returns {string[]} Event ids read from the live ConfigMaps.
     * @memberof UnderpostEvent
     */
    deployedEventIds(options = {}) {
      return Underpost.event.deployedEventState(options).ids;
    },

    /**
     * @method deployedEventState
     * @description The deployed event set together with whether the cluster answered.
     * @param {object} [options] - CLI options (`namespace`).
     * @returns {{readable: boolean, ids: string[], reason: string}} Deployed set and its readability.
     * @memberof UnderpostEvent
     */
    deployedEventState(options = {}) {
      return Underpost.monitor.readDeployedEventState({ namespace: options.namespace || 'default' });
    },

    /**
     * @method suspendEvents
     * @description Atomically records the exact deployed event set, then
     * republishes observability with no event probes or alert rules. The state
     * file is deliberately retained on every failure so maintenance rollback
     * can converge the original set instead of guessing from local defaults.
     * @param {string} stateFile - Root-owned maintenance state file.
     * @param {object} [options] - Observability options (`namespace`).
     * @returns {Promise<object>} The persisted suspension state.
     * @memberof UnderpostEvent
     */
    async suspendEvents(stateFile, options = {}) {
      const target = nodePath.resolve(`${stateFile || ''}`);
      const namespace = options.namespace || 'default';
      if (!stateFile) throw new Error('[event] --suspend-events requires a state-file path');
      if (fs.existsSync(target))
        throw new Error(`[event] suspension state already exists at ${target}; resume it before suspending again`);

      const state = Underpost.event.deployedEventState({ namespace });
      if (!state.readable)
        throw new Error(
          `[event] the deployed event set is unreadable and cannot be suspended safely${state.reason ? ` (${state.reason})` : ''}`,
        );
      const events = [...new Set(state.ids)].sort();
      const unknown = events.filter((id) => !EVENTS[id]);
      if (unknown.length > 0)
        throw new Error(
          `[event] cannot suspend and exactly restore undeclared deployed event(s): ${unknown.join(', ')}; undeploy them first`,
        );

      const suspension = {
        version: EVENT_SUSPENSION_VERSION,
        namespace,
        events,
        suspendedAt: new Date().toISOString(),
      };
      const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
      fs.ensureDirSync(nodePath.dirname(target), { mode: 0o700 });
      try {
        fs.writeFileSync(temporary, `${JSON.stringify(suspension, null, 2)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
        fs.renameSync(temporary, target);
        fs.chmodSync(target, 0o600);
      } finally {
        fs.removeSync(temporary);
      }

      logger.warn('Suspending operational events for planned maintenance', { namespace, events, stateFile: target });
      try {
        await Underpost.monitor.syncObservability({
          ...options,
          namespace,
          events: [],
          requireEventReload: true,
        });
      } catch (error) {
        logger.error('Event suspension failed; recovery state was retained', {
          namespace,
          events,
          stateFile: target,
          error: `${error?.message || error}`,
        });
        throw error;
      }
      logger.info('Operational events suspended', { namespace, events, stateFile: target });
      return suspension;
    },

    /**
     * @method resumeEvents
     * @description Restores the exact event set saved by `suspendEvents` and
     * removes the state file only after observability reconciliation succeeds.
     * A failed resync is therefore safe to retry after boot or rollback.
     * @param {string} stateFile - Suspension state created by `suspendEvents`.
     * @param {object} [options] - Observability options.
     * @returns {Promise<object>} The applied observability context.
     * @memberof UnderpostEvent
     */
    async resumeEvents(stateFile, options = {}) {
      const target = nodePath.resolve(`${stateFile || ''}`);
      if (!stateFile) throw new Error('[event] --resume-events requires a state-file path');
      if (!fs.existsSync(target)) throw new Error(`[event] suspension state does not exist: ${target}`);

      let suspension;
      try {
        suspension = fs.readJsonSync(target);
      } catch (error) {
        throw new Error(`[event] suspension state is invalid JSON at ${target}: ${error.message}`);
      }
      if (suspension?.version !== EVENT_SUSPENSION_VERSION)
        throw new Error(`[event] unsupported suspension state version at ${target}: ${suspension?.version}`);
      const namespace = `${suspension.namespace || ''}`;
      if (!/^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/.test(namespace))
        throw new Error(`[event] suspension state has an invalid namespace: ${namespace || '<empty>'}`);
      if (!Array.isArray(suspension.events) || suspension.events.some((id) => typeof id !== 'string'))
        throw new Error(`[event] suspension state has an invalid event list: ${target}`);
      const events = [...new Set(suspension.events)].sort();
      const unknown = events.filter((id) => !EVENTS[id]);
      if (unknown.length > 0)
        throw new Error(`[event] cannot restore event(s) no longer declared by this checkout: ${unknown.join(', ')}`);

      logger.info('Resynchronizing operational events after planned maintenance', {
        namespace,
        events,
        stateFile: target,
      });
      try {
        const context = await Underpost.monitor.syncObservability({
          ...options,
          namespace,
          events,
          requireEventReload: true,
        });
        fs.removeSync(target);
        logger.info('Operational events restored', { namespace, events });
        return context;
      } catch (error) {
        logger.error('Event resynchronization failed; suspension state was retained for retry', {
          namespace,
          events,
          stateFile: target,
          error: `${error?.message || error}`,
        });
        throw error;
      }
    },

    /**
     * @method deploySelection
     * @description The event set a scoped `--deploy` or `--undeploy` publishes.
     *
     * The ConfigMaps are rendered whole, so publishing one event means rendering
     * every event that must stay published with it. The set already deployed is
     * read back from the cluster and the named event merged into or removed from
     * it — the only way an incremental command can be incremental without a
     * local file claiming what the cluster contains.
     * @param {string} eventId - Event being added or withdrawn.
     * @param {object} [options] - CLI options (`namespace`).
     * @param {boolean} [remove=false] - Withdraw the event instead of adding it.
     * @returns {string[]} The exact set to render.
     * @memberof UnderpostEvent
     */
    deploySelection(eventId, options = {}, remove = false) {
      const state = Underpost.event.deployedEventState(options);
      // The render is whole: merging into a set the cluster never reported would
      // publish this event alone and withdraw every other deployed one.
      if (!state.readable)
        throw new Error(
          `[event] the deployed event set is unreadable, so ${eventId} cannot be merged into it without ` +
            `withdrawing the rest; resolve cluster access and retry${state.reason ? ` (${state.reason})` : ''}`,
        );
      const deployed = new Set(state.ids);
      if (remove) deployed.delete(eventId);
      else deployed.add(eventId);
      // An event the registry no longer declares cannot be rendered; withdrawing
      // it is what `--undeploy` is for, so it is dropped rather than failing the
      // publication of everything else.
      return [...deployed].filter((id) => EVENTS[id]).sort();
    },

    /**
     * @method deploymentStatus
     * @description Declared events against deployed events.
     * @param {object} [options] - CLI options (`namespace`).
     * @returns {Array<{id: string, status: string, reason: string}>} One row per declared or
     * deployed event; `UNKNOWN` when the cluster did not answer.
     * @memberof UnderpostEvent
     */
    deploymentStatus(options = {}) {
      const state = Underpost.event.deployedEventState(options);
      const deployed = new Set(state.ids);
      const declared = new Set(Object.keys(EVENTS));
      return [...new Set([...declared, ...deployed])].sort().map((id) => ({
        id,
        status: !state.readable
          ? 'UNKNOWN'
          : declared.has(id)
            ? deployed.has(id)
              ? 'DEPLOYED'
              : 'PENDING'
            : 'OUT_OF_SYNC',
        reason: state.reason,
      }));
    },

    /**
     * @method assertDispatchReady
     * @description The gate every publication passes: detection is refused
     * unless the fault can be repaired *and* reported.
     *
     * A rule with no repair route repeats an outage; a rule with no
     * notification route repairs it silently, so a recurring fault is never
     * escalated; a rule with no declared cadence falls back to a period and a
     * window nobody chose. All three are failures of the same contract and are
     * refused together.
     * @param {Array<object>} [definitions] - Resolved definitions.
     * @returns {Array<object>} The same definitions, when every route resolves.
     * @memberof UnderpostEvent
     */
    assertDispatchReady(definitions = Underpost.event.definitions()) {
      Underpost.event.assertRemediationReady(definitions);
      assertEventSchedules(definitions);
      assertNotificationRoutes(definitions.flatMap((definition) => definition.notifications));
      return definitions;
    },

    /**
     * @method runCommand
     * @description Runs one remediation command through the single execution
     * facility, locally or on a named account's host.
     *
     * `sshRemoteRunner` selects local or remote execution. A remote target always
     * supplies both the registered user and management host.
     * @param {string} command - Command to run.
     * @param {object} [options]
     * @param {string} [options.user] - Registered SSH user; omitted runs locally.
     * @param {string} [options.host] - Host that account should reach.
     * @param {boolean} [options.dryRun] - Report the command instead of running it.
     * @param {boolean} [options.silent] - Suppress the command's output; it is still returned.
     * @returns {Promise<{ok: boolean, output: string, error?: string}>} Execution result.
     * @memberof UnderpostEvent
     */
    async runCommand(command, options = {}) {
      const user = options.user || '';
      const host = options.host || '';
      const where = user ? `ssh ${user}@${host || '(registered host)'}` : 'local';
      if (options.dryRun) {
        logger.info(`[dry-run] ${where} :: ${command}`);
        return { ok: true, output: `[dry-run] ${where} :: ${command}` };
      }
      // A polled read announces itself once per target per interval; at one probe
      // per public host that is the whole report, so a silent call stays silent.
      if (options.silent !== true) logger.info(`${where} :: ${command}`);
      try {
        const output = await Underpost.ssh.sshRemoteRunner(command, {
          user,
          host,
          cd: ENGINE_REMOTE_PATH,
          remote: Boolean(user),
          silent: options.silent === true,
        });
        return { ok: true, output: `${output || ''}` };
      } catch (error) {
        // What the command said, not the wrapper that carried it: the generated
        // SSH script is in the thrown message and tells a reader nothing.
        const reported = `${error?.stderr || ''}${error?.stdout || ''}`.trim();
        return { ok: false, output: '', error: plainText(reported || `${error?.message || error}`) };
      }
    },

    /**
     * @method notificationFactory
     * @description Renders the operational alert.
     *
     * An alert exists to let whoever reads it act without opening a terminal, so
     * it names the event, the role, the specific subject, the condition that was
     * detected, the commands attempted and their outcome. "WireGuard down" tells
     * an operator nothing they can act on; "spoke `node-a` at 10.0.0.2, restart
     * failed" tells them where to look.
     * @param {object} params
     * @param {string} params.eventId - Dispatched event id.
     * @param {object} params.result - Handler result.
     * @param {Array<object>} [params.alerts] - Originating Alertmanager alerts.
     * @returns {{subject: string, text: string}} Rendered alert.
     * @memberof UnderpostEvent
     */
    notificationFactory({ eventId, result, alerts = [] }) {
      const targets = result?.targets || [];
      const subjects = targets.map((target) => target.spokeId || target.role).join(', ');
      const dryRun = targets.some((target) => `${target.output || ''}`.startsWith('[dry-run]'));
      const outcome = dryRun ? 'planned' : result?.ok ? 'remediated' : 'FAILED';

      const lines = [
        `event:        ${eventId}`,
        `role:         ${result?.role || 'unknown'}`,
        `subjects:     ${subjects || '(none)'}`,
        `condition:    ${result?.condition || 'unknown'}`,
        `result:       ${outcome}${dryRun ? ' (dry run; no command executed)' : ''}`,
        `deploy:       ${process.env.DEPLOY_ID || ''}`,
        `timestamp:    ${new Date().toISOString()}`,
        alerts.length > 0 ? `alert instances: ${alerts.map((alert) => alert?.labels?.instance || '').join(', ')}` : '',
        '',
      ];

      for (const target of targets) {
        lines.push(
          `--- ${target.role}${target.spokeId ? ` ${target.spokeId}` : ''} ---`,
          `tunnel address:  ${target.address || '(unresolved)'}`,
          `remediated via:  ${target.via}`,
          `commands:        ${target.commands.join(' && ') || '(none)'}`,
          `outcome:         ${target.ok ? 'ok' : 'failed'}`,
          `${target.output || ''}`.trim().slice(-1500),
          `${target.health ? `health:\n${target.health}` : ''}`,
          '',
        );
      }
      if (result?.health) lines.push('--- hub health ---', result.health, '');
      if (result?.error) lines.push(`error: ${result.error}`);

      return {
        subject: `[underpost] ${eventId} — ${subjects || result?.role || 'unknown'} — ${outcome}`,
        text: lines.filter((line) => line !== '').join('\n'),
      };
    },

    /**
     * @method notify
     * @description Delivers the rendered alert over the routes the event declares.
     *
     * Who hears about an event is deployment data, not behaviour, so the routes
     * come from the notification contract rather than from this registry or
     * from ambient SMTP environment variables: adding a subscriber is a change
     * to `engine-private/deploy/conf.event.json` and to nothing else.
     * @param {object} params
     * @param {string} params.eventId - Dispatched event id.
     * @param {object} params.result - Handler result.
     * @param {Array<object>} [params.alerts] - Originating Alertmanager alerts.
     * @returns {Promise<{ok: boolean, delivered: Array<object>, failed: Array<object>}>} Per-route outcome.
     * @memberof UnderpostEvent
     */
    async notify({ eventId, result, alerts = [] }) {
      const { subject, text } = Underpost.event.notificationFactory({ eventId, result, alerts });
      return await deliverEventNotification({ eventId, subject, text });
    },

    /**
     * @method dispatch
     * @description Runs one event's handler and mails the outcome.
     *
     * A failing handler is reported rather than thrown: the dispatcher may be
     * serving a webhook, where an unhandled rejection would take down the
     * receiver and silence every later alert. The mail is what carries the
     * failure to a human.
     * @param {string} eventId - Registered event id.
     * @param {object} [options] - Dispatch options (`spoke`, `dryRun`, `notify`).
     * @param {Array<object>} [alerts] - Originating Alertmanager alerts; they name the subject to act on.
     * @returns {Promise<object>} Handler result.
     * @memberof UnderpostEvent
     */
    async dispatch(eventId, options = {}, alerts = []) {
      const event = EVENTS[eventId];
      if (!event) throw new Error(`[event] unknown event id: ${eventId}`);

      logger.info('Dispatching event', { eventId, dryRun: options.dryRun === true, alerts: alerts.length });

      let result;
      try {
        result = { ok: true, role: event.role, ...(await event.handler(options, alerts)) };
      } catch (error) {
        result = { ok: false, role: event.role, targets: [], error: `${error?.message || error}` };
        logger.error(`Event handler failed`, { eventId, error: result.error });
      }

      // A handler that found nothing wrong has nothing to announce; alerting on
      // a healthy check is how an inbox stops being read.
      if (options.notify !== false && result.silent !== true) await Underpost.event.notify({ eventId, result, alerts });
      return result;
    },

    /**
     * @method e2eScenario
     * @description Loads the rehearsal an event id declares.
     *
     * A scenario is the only thing that knows how to break a real subject, so
     * it lives beside the tests rather than in the registry: the registry
     * describes production behaviour, and nothing in it should be able to take
     * a host down.
     * @param {string} eventId - Registered event id.
     * @returns {Promise<object>} Scenario module.
     * @throws {Error} When no scenario exists, or it does not implement the contract.
     * @memberof UnderpostEvent
     */
    async e2eScenario(eventId) {
      const path = nodePath.resolve(process.cwd(), EVENT_E2E.scenarioDirectory, `event-e2e-${eventId}.js`);
      if (!fs.existsSync(path)) throw new Error(`[event] no end-to-end scenario for '${eventId}' at ${path}`);
      const scenario = (await import(pathToFileURL(path).href)).default;
      for (const method of ['subjects', 'break', 'restore'])
        if (typeof scenario?.[method] !== 'function')
          throw new Error(`[event] scenario ${path} does not implement ${method}()`);
      return scenario;
    },

    /**
     * @method e2eSubject
     * @description Rehearses one subject: break it, watch detection see it,
     * repair it, watch it come back, and confirm the notification was sent.
     * @param {object} params
     * @param {string} params.eventId - Registered event id.
     * @param {object} params.subject - Resolved scenario subject.
     * @param {object} params.scenario - Scenario module.
     * @param {object} params.context - Scenario context.
     * @param {object} params.interceptor - Installed mailer interceptor.
     * @returns {Promise<Array<object>>} Steps, in the order they ran.
     * @memberof UnderpostEvent
     */
    async e2eSubject({ eventId, subject, scenario, context, interceptor }) {
      const { namespace, options, controlTarget } = context;
      const steps = [];
      const step = (name, ok, detail) => {
        steps.push({ name, subject: subject.label, ok, detail });
        logger[ok ? 'info' : 'error'](`e2e ${name}`, { eventId, subject: subject.label, ok, detail });
        return ok;
      };
      const awaitProbes = (expect, timeoutMs) =>
        Underpost.monitor.awaitProbes({
          probes: subject.probes,
          expect,
          namespace,
          timeoutMs,
          intervalMs: EVENT_E2E.probeIntervalMs,
          target: { user: controlTarget.user, host: controlTarget.host },
        });

      // What the probe reports is only evidence if it was answering to begin
      // with: a subject that is already down makes detection pass vacuously and
      // recovery impossible, and an unreadable exporter looks exactly the same.
      const baseline = await awaitProbes(true, EVENT_E2E.baselineTimeoutMs);
      if (!step('baseline', baseline.ok, probeDetail(baseline, 'answered before the fault was induced'))) return steps;

      let recovered = false;
      try {
        const broken = await scenario.break(context, subject);
        if (!step('arrange', broken.ok === true, `${broken.output || broken.error || ''}`.trim().slice(-500)))
          return steps;

        const detected = await awaitProbes(false, EVENT_E2E.detectTimeoutMs);
        if (!step('detect', detected.ok, probeDetail(detected, 'stopped answering'))) return steps;

        const sent = interceptor.messages.length;
        const result = await Underpost.event.dispatch(eventId, { ...options, ...subject.dispatchOptions });
        step('act', result.ok === true, `${result.condition || result.error || ''}`);

        const recovery = await awaitProbes(true, EVENT_E2E.recoverTimeoutMs);
        recovered = recovery.ok;
        step('recover', recovery.ok, probeDetail(recovery, 'answered again'));

        // Only mail this dispatch produced counts: an earlier subject's
        // notification would otherwise satisfy every later subject's wait.
        const mail = await interceptor.waitFor(
          (message, index) => index >= sent && `${message.sendOptions.subject}`.includes(eventId),
          { timeoutMs: EVENT_E2E.notifyTimeoutMs },
        );
        step(
          'notify',
          Boolean(mail?.accepted),
          mail
            ? `${mail.sendOptions.subject} -> ${mail.sendOptions.to}`
            : `no notification was sent for '${eventId}'; declared routes are in ${EVENT_CONF_PATH}`,
        );
        return steps;
      } finally {
        // The remediation is what should have restored the subject; this runs
        // only when it did not, so an aborted rehearsal cannot leave it down.
        if (!recovered) {
          const restored = await scenario.restore(context, subject);
          logger[restored.ok ? 'warn' : 'error']('e2e restore', {
            eventId,
            subject: subject.label,
            ok: restored.ok === true,
          });
        }
      }
    },

    /**
     * @method e2e
     * @description Rehearses one event against the live edge, end to end.
     *
     * Breaks the real subject, waits for the Blackbox Exporter to actually stop
     * seeing it, runs the production remediation, waits for the subject to come
     * back, and confirms the notification left the transport. Every step is a
     * real component: a rehearsal that stubs detection or delivery proves only
     * that the stubs agree with each other.
     *
     * Every subject the event covers is rehearsed — each hub for a hub event,
     * each peer of this node's hub for a spoke event — one at a time, each
     * restored before the next is touched. `--nodes` narrows that selection.
     * @param {string} eventId - Registered event id.
     * @param {object} [options] - CLI options; `--nodes` / `--spoke` narrow the subjects.
     * @returns {Promise<{ok: boolean, steps: Array<object>}>} Step-by-step outcome.
     * @memberof UnderpostEvent
     */
    async e2e(eventId, options = {}) {
      if (options.dryRun)
        throw new Error('[event] --e2e-test runs the real remediation and is not compatible with --dry-run');
      if (options.notify === false)
        throw new Error('[event] --e2e-test verifies the notification and is not compatible with --no-notify');

      const [definition] = Underpost.event.assertDispatchReady(Underpost.event.definitions(eventId));
      const scenario = await Underpost.event.e2eScenario(eventId);
      const context = {
        eventId,
        definition,
        options,
        namespace: options.namespace || 'default',
        controlTarget: Underpost.event.controlTarget(),
      };
      const subjects = await scenario.subjects(context);
      if (subjects.length === 0) throw new Error(`[event] '${eventId}' has no subject to rehearse`);

      const interceptor = mailerInterceptorFactory({
        filter: ({ id }) => `${id}`.startsWith('event-notification:'),
      });
      const steps = [];

      try {
        logger.info('Running end-to-end event rehearsal', {
          eventId,
          subjects: subjects.map((subject) => subject.label),
          probesReadVia: context.controlTarget.via,
          scenario: scenario.description,
        });
        for (const subject of subjects)
          steps.push(...(await Underpost.event.e2eSubject({ eventId, subject, scenario, context, interceptor })));
        return { ok: steps.every((entry) => entry.ok), steps };
      } finally {
        interceptor.close();
      }
    },

    /**
     * @method webhookEventIds
     * @description Event ids a firing Alertmanager payload asks for.
     *
     * Resolved alerts are ignored: remediation is an action, and the condition
     * having cleared is not a reason to take it again.
     * @param {object} [payload] - Alertmanager webhook body.
     * @returns {string[]} Distinct registered event ids.
     * @memberof UnderpostEvent
     */
    webhookEventIds(payload = {}) {
      const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
      return [
        ...new Set(
          alerts
            .filter((alert) => (alert?.status || payload.status) === 'firing')
            .map((alert) => alert?.labels?.underpost_event)
            .filter((eventId) => eventId && EVENTS[eventId]),
        ),
      ];
    },

    /**
     * @method serviceUnitFactory
     * @description Renders the dispatcher's systemd unit.
     *
     * The unit depends only on the host network so it survives the tunnel it repairs.
     * @param {object} [params]
     * @param {number} [params.port] - Listening port.
     * @param {string} [params.workingDirectory] - Engine checkout the unit runs from.
     * @param {string} [params.user] - Account the unit runs as.
     * @param {string} [params.execPath] - Node binary the unit executes; probed by the caller.
     * @returns {string} Rendered unit file.
     * @memberof UnderpostEvent
     */
    serviceUnitFactory({
      port = UNDERPOST_MONITORING.eventWebhook.port,
      workingDirectory = process.cwd(),
      user = os.userInfo().username,
      execPath = process.execPath,
    } = {}) {
      return systemdUnitFactory({
        header:
          '# Generated by `underpost event --service`. Do not edit by hand:\n' +
          '# the next run rewrites the file and restarts the service.',
        sections: {
          Unit: {
            Description: `Underpost operational event dispatcher on :${port}`,
            Documentation: 'https://www.nexodev.org/docs',
            After: 'network-online.target',
            Wants: 'network-online.target',
            StartLimitIntervalSec: 60,
            StartLimitBurst: 5,
          },
          Service: {
            Type: 'simple',
            User: user,
            WorkingDirectory: workingDirectory,
            Environment: `PATH=${nodePath.dirname(execPath)}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin`,
            ExecStart: `${execPath} ${workingDirectory}/bin event --serve --port ${port}`,
            Restart: 'on-failure',
            RestartSec: EVENT_SERVICE.restartSeconds,
          },
          Install: { WantedBy: 'multi-user.target' },
        },
      });
    },

    /**
     * @method serviceState
     * @description Reads the unit's state once it has settled.
     *
     * `systemctl restart` returns as soon as the job is queued, so a state read
     * immediately after it can catch a short-lived `active` state before the
     * process exits. Requiring one full restart interval without a transition
     * distinguishes a running service from a restart loop.
     * @param {object} [params]
     * @param {number} [params.timeoutMs] - Maximum wait for the unit to settle.
     * @returns {{service: string, active: string, enabled: string, logs: string, settled: boolean}} Unit state.
     * @memberof UnderpostEvent
     */
    serviceState({ timeoutMs = EVENT_SERVICE.settleTimeoutMs } = {}) {
      const status = systemdStatusCommandsFactory(EVENT_SERVICE.name);
      const read = (command) =>
        `${shellExec(command, { stdout: true, silent: true, silentOnError: true, disableLog: true }) || ''}`.trim();

      const stableWindowMs = (EVENT_SERVICE.restartSeconds + 1) * 1000;
      const deadline = Date.now() + Math.max(timeoutMs, stableWindowMs);
      let active = read(status.active);
      let activeSince = active === 'active' ? Date.now() : 0;
      while (Date.now() < deadline) {
        if (active === 'active' && Date.now() - activeSince >= stableWindowMs) break;
        sleepSync(EVENT_SERVICE.settleIntervalMs);
        active = read(status.active);
        if (active !== 'active') activeSince = 0;
        else if (!activeSince) activeSince = Date.now();
      }
      const settled = active === 'active' && Date.now() - activeSince >= stableWindowMs;
      return {
        service: EVENT_SERVICE.name,
        active,
        enabled: read(status.enabled),
        logs: status.logs,
        settled,
      };
    },

    /** Returns the recent dispatcher journal without echoing the command. */
    serviceJournal(lines = 30) {
      return (
        shellExec(`${journalctlCommandFactory({ name: EVENT_SERVICE.name, lines })} --no-pager`, {
          stdout: true,
          silent: true,
          silentOnError: true,
          disableLog: true,
        }) || ''
      );
    },

    /** Returns the port rendered into the installed dispatcher unit. */
    serviceInstalledPort() {
      if (!fs.existsSync(EVENT_SERVICE.unitPath)) return 0;
      return eventServicePortFactory(fs.readFileSync(EVENT_SERVICE.unitPath, 'utf8'));
    },

    /**
     * @method serviceNodePath
     * @description The Node binary a unit can actually execute, probed rather
     * than assumed.
     *
     * systemd refuses to execute a binary under `/root` or `/home` on an SELinux
     * host, and the failure surfaces only as 203/EXEC in the journal. Probing
     * with a transient unit reproduces the constraint before one is installed.
     * @returns {{path: string, probed: boolean}} Chosen path, and whether a probe confirmed it.
     * @memberof UnderpostEvent
     */
    serviceNodePath() {
      const ok = (command) =>
        shellExec(command, { silent: true, silentOnError: true, disableLog: true, stdout: false }).code === 0;
      const candidates = [...new Set([process.execPath, ...nodeCandidatesFactory()])];
      for (const path of candidates)
        if (
          ok(nodeProbeCommandFactory(path)) &&
          ok(
            scriptProbeCommandFactory({
              nodePath: path,
              scriptPath: process.argv[1],
              workingDirectory: process.cwd(),
            }),
          )
        )
          return { path, probed: true };
      return { path: candidates[0] || process.execPath, probed: false };
    },

    /**
     * @method service
     * @description Installs, reports or removes the supervised dispatcher.
     *
     * Convergent: the unit is rewritten only when it differs, and the service is
     * restarted only when it was. Re-running after a `git pull` is therefore a
     * no-op unless something about the unit actually changed.
     * @param {object} [options]
     * @param {boolean} [options.serviceStop] - Disable and remove the unit instead of installing it.
     * @param {boolean} [options.serviceStatus] - Report the unit's state and exit.
     * @param {number} [options.port] - Listening port baked into the unit.
     * @param {boolean} [options.dryRun] - Print what would be applied.
     * @returns {object} The unit's resolved state.
     * @memberof UnderpostEvent
     */
    service(options = {}) {
      const run = (commands) =>
        runSystemdCommands(commands, {
          dryRun: options.dryRun === true,
          execute: (command) => shellExec(command),
          onDryRun: (command) => logger.info(`[dry-run] ${command}`),
        });

      if (options.serviceStatus) {
        const state = Underpost.event.serviceState();
        logger.info('Event dispatcher service', state);
        if (state.active !== 'active' || !state.settled) {
          console.log(Underpost.event.serviceJournal());
          process.exitCode = 1;
        }
        return state;
      }

      const installedPort = Underpost.event.serviceInstalledPort();

      if (options.serviceStop) {
        const port = installedPort || Number(options.port) || UNDERPOST_MONITORING.eventWebhook.port;
        run(eventFirewallCommandsFactory({ port, remove: true }));
        run(systemdServiceCommandsFactory({ name: EVENT_SERVICE.name, unitPath: EVENT_SERVICE.unitPath }).remove);
        logger.info('Event dispatcher service removed', { service: EVENT_SERVICE.name, port });
        return { service: EVENT_SERVICE.name, active: 'inactive', enabled: 'disabled' };
      }

      if (readEdgeContext().role !== 'control')
        throw new Error(
          '[event] the dispatcher must run on a WireGuard control node; remove it elsewhere with --service-stop',
        );

      Underpost.event.assertDispatchReady();

      const node = Underpost.event.serviceNodePath();
      if (!node.probed)
        throw new Error(
          `[event] no Node executable can run ${process.argv[1]} from ${process.cwd()} under systemd; ` +
            'install Node system-wide or move the checkout outside /root and /home',
        );
      const port = Number(options.port) || UNDERPOST_MONITORING.eventWebhook.port;
      const unit = Underpost.event.serviceUnitFactory({
        port,
        execPath: node.path,
      });
      const changed = installRootFile({
        target: EVENT_SERVICE.unitPath,
        content: unit,
        mode: '0644',
        dryRun: options.dryRun === true,
      });
      if (installedPort && installedPort !== port)
        run(eventFirewallCommandsFactory({ port: installedPort, remove: true }));
      run(eventFirewallCommandsFactory({ port }));
      run([`sudo systemctl reset-failed ${EVENT_SERVICE.name} 2>/dev/null || true`]);
      run(
        systemdServiceCommandsFactory({ changed, name: EVENT_SERVICE.name, unitPath: EVENT_SERVICE.unitPath }).ensure,
      );
      if (options.dryRun === true) return { service: EVENT_SERVICE.name, active: 'dry-run', enabled: 'dry-run' };

      const state = Underpost.event.serviceState();
      if (state.active === 'active' && state.settled) {
        logger.info('Event dispatcher service reconciled', { ...state, changed, node: node.path });
        return state;
      }

      const journal = Underpost.event.serviceJournal();
      const addressInUse = journal.includes('EADDRINUSE');
      logger.error('Event dispatcher did not start', {
        ...state,
        node: node.path,
        workingDirectory: process.cwd(),
        likely: addressInUse
          ? `port ${port} is owned by another process; inspect it with sudo lsof -nP -iTCP:${port} -sTCP:LISTEN`
          : homeDirectoryPathFactory(process.cwd())
            ? 'the checkout is under a home directory, which a unit cannot read on an SELinux host'
            : 'the unit failed; see the journal below',
        check: `sudo ${scriptProbeCommandFactory({ nodePath: node.path, scriptPath: process.argv[1], workingDirectory: process.cwd() }).replace(/^sudo /, '')}`,
      });
      console.log(journal);
      process.exitCode = 1;
      return state;
    },

    /**
     * @method serve
     * @description Runs the Alertmanager webhook receiver.
     *
     * Answers before dispatching. Remediation reboots a tunnel and can take
     * minutes, while Alertmanager retries any delivery it does not see accepted
     * — holding the response open would have it re-fire the same repair.
     * A cooldown per event subject covers repeated groups.
     * @param {object} [options]
     * @param {number} [options.port] - Listening port.
     * @param {string} [options.token] - Required bearer token; defaults to the one the stack was provisioned with.
     * @param {number} [options.cooldownMs] - Minimum interval between two dispatches of one event.
     * @returns {Promise<import('node:http').Server>} The listening server.
     * @memberof UnderpostEvent
     */
    async serve(options = {}) {
      const port = Number(options.port) || UNDERPOST_MONITORING.eventWebhook.port;
      const token = options.token || Underpost.monitor.eventWebhookTokenFactory();
      const cooldownMs = Number(options.cooldownMs) || 5 * 60 * 1000;
      const lastDispatch = new Map();

      const server = http.createServer((req, res) => {
        const reply = (code, body) => {
          res.writeHead(code, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST' || req.url.split('?')[0] !== UNDERPOST_MONITORING.eventWebhook.path)
          return reply(404, { error: 'not found' });
        if (req.headers.authorization !== `Bearer ${token}`) return reply(401, { error: 'unauthorized' });

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          // An Alertmanager group is small; anything larger is not one.
          if (body.length > 1e6) req.destroy();
        });
        req.on('end', () => {
          let payload;
          try {
            payload = JSON.parse(body || '{}');
          } catch (_) {
            return reply(400, { error: 'invalid payload' });
          }
          const eventIds = Underpost.event.webhookEventIds(payload);
          reply(202, { accepted: eventIds });
          logger.info('Event webhook accepted', { events: eventIds, alerts: payload.alerts?.length || 0 });

          for (const eventId of eventIds) {
            const alerts = (payload.alerts || []).filter((alert) => alert?.labels?.underpost_event === eventId);
            const cooldownKey = eventCooldownKeyFactory(eventId, alerts);
            const now = Date.now();
            if (now - (lastDispatch.get(cooldownKey) || 0) < cooldownMs) {
              logger.warn('Event dispatch skipped: still within cooldown', { eventId, cooldownKey, cooldownMs });
              continue;
            }
            lastDispatch.set(cooldownKey, now);
            Underpost.event
              .dispatch(eventId, options, alerts)
              .catch((error) => logger.error('Event dispatch rejected', { eventId, error: `${error}` }));
          }
        });
      });

      return new Promise((resolve, reject) => {
        server.once('error', (error) => {
          logger.error('Event webhook cannot bind', {
            port,
            code: error?.code,
            hint:
              error?.code === 'EADDRINUSE'
                ? `another process owns this port; inspect it with sudo lsof -nP -iTCP:${port} -sTCP:LISTEN`
                : undefined,
          });
          reject(error);
        });
        server.listen(port, () => {
          logger.info('Event webhook listening', {
            url: `http://0.0.0.0:${port}${UNDERPOST_MONITORING.eventWebhook.path}`,
            events: Object.keys(EVENTS),
          });
          resolve(server);
        });
      });
    },

    /**
     * @method callback
     * @description CLI entrypoint for `underpost event`.
     * @param {string} [eventId] - Registered event id; optional for `--list`, `--serve` and `--deploy`.
     * @param {object} [options] - CLI options.
     * @param {boolean} [options.deploy=false] - Merge the event into the cluster's deployed set and publish.
     * @param {boolean} [options.undeploy=false] - Remove the event from the cluster's deployed set and publish.
     * @param {string} [options.suspendEvents] - Save and temporarily undeploy every event for planned maintenance.
     * @param {string} [options.resumeEvents] - Restore the exact event set from planned-maintenance state.
     * @param {boolean} [options.serve=false] - Run the Alertmanager webhook receiver in the foreground.
     * @param {boolean} [options.service=false] - Install and start the receiver as a supervised systemd unit.
     * @param {boolean} [options.serviceStop=false] - Stop, disable and remove that unit.
     * @param {boolean} [options.serviceStatus=false] - Report the unit's state.
     * @param {boolean} [options.list=false] - List the registered events.
     * @param {boolean} [options.dryRun=false] - Report the remediation instead of running it.
     * @param {boolean} [options.e2eTest=false] - Rehearse the event against the live edge, including its notification.
     * @param {boolean} [options.notify=true] - Mail the outcome to the administrator.
     * @param {string} [options.spoke=''] - Spoke id to remediate when dispatching by hand.
     * @param {string} [options.nodes=''] - Node document naming the single hub or spoke to act on.
     * @param {string} [options.port=''] - Webhook receiver port.
     * @param {string} [options.namespace='default'] - Namespace holding the monitoring stack.
     * @param {string} [options.webhookUrl=''] - URL Alertmanager delivers to.
     * @returns {Promise<any>} Command result.
     * @memberof UnderpostEvent
     */
    async callback(eventId = '', options = {}) {
      loadCronDeployEnv();

      if (options.suspendEvents) return await Underpost.event.suspendEvents(options.suspendEvents, options);
      if (options.resumeEvents) return await Underpost.event.resumeEvents(options.resumeEvents, options);

      if (options.list) {
        const rows = Underpost.event.deploymentStatus(options);
        const status = Object.fromEntries(rows.map((entry) => [entry.id, entry.status]));
        const unreadable = rows.find((entry) => entry.status === 'UNKNOWN');
        if (unreadable)
          console.log(
            `\n${'the cluster did not report its deployed events; the state column below is unknown, not empty'.yellow}` +
              `${unreadable.reason ? `\n${`  reason: ${unreadable.reason}`.yellow}` : ''}`,
          );
        for (const [id, state] of Object.entries(status).filter(([, state]) => state === 'OUT_OF_SYNC'))
          console.log(
            `\n${id.bold.red}  [${state}] — running in the cluster but no longer declared; withdraw it with --undeploy`,
          );
        for (const definition of Underpost.event.definitions(eventId)) {
          const state = status[definition.id] || 'UNKNOWN';
          console.log(
            `\n${definition.id.bold.green}  [${definition.role}] [${state === 'DEPLOYED' ? state.green : state.yellow}] — ${definition.description}`,
          );
          console.log(
            `  every    probe ${definition.schedule.probeInterval}, alert after ${definition.schedule.alertFor}`,
          );
          console.log(`  alert    ${definition.alert.name}  ${definition.alert.expr}  for ${definition.alert.for}`);
          for (const probe of definition.probes)
            console.log(`  probe    ${probe.module.padEnd(12)} ${probe.targets.join(', ')}`);
          for (const target of definition.remediation)
            console.log(
              `  repair   ${`${target.spokeId || target.role}`.padEnd(12)} ${target.address} via ${target.via}`,
            );
          for (const target of definition.remediation.filter((entry) => entry.error))
            console.log(`           ${`reason: ${target.error}`.yellow}`);
          for (const route of definition.notifications)
            console.log(
              route.error
                ? `  notify   ${'unresolved'.padEnd(12)} ${route.error.yellow}`
                : `  notify   ${route.providerId.padEnd(12)} ${route.target} -> ${route.recipients
                    .map((recipient) => recipient.email)
                    .join(', ')}`,
            );
          if (definition.probes.length === 0) console.log(`  ${'no resolvable targets'.yellow}`);
        }
        return;
      }

      // Provisioning is the monitor CLI's concern: the same render/apply/reload
      // path serves `monitor --observability`, so an event's rules land through
      // one implementation rather than two that can disagree. The set is
      // resolved against the cluster first, because the ConfigMaps are rendered
      // whole and publishing one event must not withdraw the rest.
      if (options.deploy || options.undeploy) {
        if (!eventId)
          throw new Error(`[event] an event id is required for --${options.undeploy ? 'undeploy' : 'deploy'}`);
        const events = Underpost.event.deploySelection(eventId, options, options.undeploy === true);
        logger.info(options.undeploy ? 'Withdrawing event' : 'Publishing event', { eventId, events });
        return await Underpost.monitor.syncObservability({ ...options, events });
      }

      if (options.service || options.serviceStop || options.serviceStatus) return Underpost.event.service(options);

      if (options.serve) return await Underpost.event.serve(options);

      if (!eventId) throw new Error(`[event] an event id is required; one of: ${Object.keys(EVENTS).join(', ')}`);

      if (options.e2eTest) {
        const rehearsal = await Underpost.event.e2e(eventId, options);
        for (const entry of rehearsal.steps)
          console.log(
            `  ${entry.ok ? 'ok  '.green : 'FAIL'.red}  ${entry.name.padEnd(9)} ${entry.subject.padEnd(28)} ${entry.detail || ''}`,
          );
        if (!rehearsal.ok) process.exit(1);
        return rehearsal;
      }

      const result = await Underpost.event.dispatch(eventId, options);
      if (!result.ok) process.exit(1);
      return result;
    },
  };
}

export {
  ENGINE_REMOTE_PATH,
  EVENTS,
  EVENT_E2E,
  EVENT_SUSPENSION_VERSION,
  assertHubManagementConnection,
  eventCooldownKeyFactory,
  eventFirewallCommandsFactory,
  eventServicePortFactory,
  probeDetail,
};

export default UnderpostEvent;
