/**
 * The cluster observability stack: Prometheus, Alertmanager, the Blackbox
 * Exporter and Grafana.
 *
 * Every file these four read is derived, never hand-written: scrape targets come
 * from the same `conf.server.json` the runtime binds, probe targets and alert
 * rules come from the event registry that also holds the remediation handlers,
 * and the Alertmanager route points back at the dispatcher that owns them. A
 * probe with no handler and a handler with no probe are therefore both
 * unrepresentable.
 *
 * This module is pure: it renders configuration and manifests from values it is
 * given. Reading deploy configuration, talking to the cluster and reloading the
 * running components belong to `src/cli/monitor.js`.
 *
 * @module src/server/ops/monitoring.js
 * @namespace UnderpostMonitoring
 */

import { containerStorageCommandsFactory } from '../security/container-storage.js';
import { systemdServiceCommandsFactory, systemdUnitFactory } from './systemd.js';

/**
 * @constant UNDERPOST_MONITORING
 * @description Identity of the observability workloads. One stack serves every
 * deploy on the cluster, so these names are cluster-wide constants rather than
 * per-deploy.
 * @memberof UnderpostMonitoring
 */
const UNDERPOST_MONITORING = {
  scrapeInterval: '30s',
  prometheus: {
    name: 'prometheus',
    configMapName: 'prometheus-config',
    rulesConfigMapName: 'prometheus-rules',
    port: 9090,
  },
  alertmanager: {
    name: 'alertmanager',
    configMapName: 'alertmanager-config',
    secretName: 'alertmanager-webhook',
    tokenKey: 'token',
    port: 9093,
  },
  blackbox: {
    name: 'blackbox-exporter',
    configMapName: 'blackbox-exporter-config',
    port: 9115,
  },
  grafana: {
    name: 'grafana',
    adminSecretName: 'grafana-admin',
    adminUserKey: 'admin-user',
    adminPasswordKey: 'admin-password',
    adminSecretVersionAnnotation: 'underpost.net/grafana-admin-secret-version',
    adminLoginAnnotation: 'underpost.net/grafana-admin-login',
    pvcName: 'grafana-pvc',
    nodePortName: 'grafana-nodeport',
    routeName: 'grafana-route',
    datasourcesConfigMapName: 'grafana-datasources',
    dashboardProviderConfigMapName: 'grafana-dashboard-provider',
    dashboardsConfigMapName: 'grafana-dashboards',
    port: 3000,
    nodePort: 32300,
    // Sub-path under an existing hostname, so the dashboards ride the edge
    // certificate already issued for that host instead of needing one of their own.
    subPath: '/grafana',
    dashboardsPath: '/var/lib/grafana/dashboards',
  },
  // Envoy Gateway publishes the data plane's admin metrics on this port; the
  // path is Envoy's own, not a Kubernetes convention.
  envoy: {
    namespace: 'envoy-gateway-system',
    metricsPort: 19001,
    metricsPath: '/stats/prometheus',
  },
  // Host metrics. `hostPort` on a DaemonSet rather than a Service: Prometheus
  // discovers nodes, not endpoints, so the address it scrapes is the node's own
  // and the series carry the node identity the alerts act on.
  nodeExporter: {
    name: 'node-exporter',
    port: 9100,
    // Read by the collector and written by anything that has a number the
    // cluster cannot scrape for itself, the Vultr quota above all.
    textfileDirectory: '/var/lib/node_exporter/textfile',
    // The hub is a VPS, not a cluster node, so it runs the same collector as a
    // systemd service instead of as a DaemonSet pod.
    version: '1.9.1',
    binaryPath: '/usr/local/bin/node_exporter',
    serviceName: 'underpost-node-exporter.service',
    unitPath: '/etc/systemd/system/underpost-node-exporter.service',
    filesystemExclude: '^/(dev|proc|sys|var/lib/(docker|containers|kubelet)|run)($|/)',
    // Physical and tunnel interfaces, named by what they are not: enumerating
    // them misses whatever a given host calls its NIC (ens3 on the hub).
    networkDeviceSelector: 'device!~"lo|veth.*|docker.*|br-.*|cni.*|flannel.*|cali.*|tunl.*|virbr.*"',
  },
  // Where Alertmanager delivers, and where `underpost event --serve` listens.
  eventWebhook: {
    port: 39099,
    path: '/event',
  },
};

/**
 * @method serviceDnsFactory
 * @description Fully qualified in-cluster address of a stack component.
 *
 * Always qualified: the stack is namespaced by `--namespace`, and a short name
 * only resolves for a client that happens to share that namespace. Prometheus
 * scraping the Blackbox Exporter is such a client only by coincidence.
 * @param {string} name - Service name.
 * @param {number} port - Service port.
 * @param {string} [namespace] - Namespace holding the Service.
 * @returns {string} `<name>.<namespace>.svc.cluster.local:<port>`.
 * @memberof UnderpostMonitoring
 */
const serviceDnsFactory = (name, port, namespace = 'default') => `${name}.${namespace}.svc.cluster.local:${port}`;

/**
 * @method metricsPathFactory
 * @description The `/metrics` route an Express runtime mounts for a proxy
 * sub-path. Shared with the runtime itself so a scrape target can never point
 * at a route the server does not serve.
 * @param {string} [path] - Proxy sub-path (`/`, `/api`).
 * @returns {string} Metrics route.
 * @memberof UnderpostMonitoring
 */
const metricsPathFactory = (path = '/') => `${path === '/' ? '' : path}/metrics`;

/**
 * @method scrapeDeployListFactory
 * @description Selects the deploys the stack scrapes.
 *
 * The default set is the cron deploy plus the router deploys, which is exactly
 * what `loadCronDeployEnv()` loads. The router alone would leave the cron deploy
 * — the one that runs the backups, the DNS records and the bandwidth guard — as
 * the single unmonitored runtime on the cluster. An explicit id or list is taken
 * as given, so narrowing to one deploy stays possible.
 * @param {object} params
 * @param {string} [params.deployId] - Explicit deploy id or comma-separated list; `dd` or empty selects the default set.
 * @param {string} [params.cronDeployId] - Deploy id from `engine-private/deploy/dd.cron`.
 * @param {string[]} [params.routerDeployIds] - Deploy ids from `engine-private/deploy/dd.routes`.
 * @returns {string[]} Distinct deploy ids, in resolution order.
 * @memberof UnderpostMonitoring
 */
const scrapeDeployListFactory = ({ deployId = '', cronDeployId = '', routerDeployIds = [] } = {}) => {
  const explicit = `${deployId || ''}`
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (explicit.length > 0 && !explicit.includes('dd')) return [...new Set(explicit)];
  return [...new Set([`${cronDeployId || ''}`.trim(), ...routerDeployIds.map((id) => `${id}`.trim())].filter(Boolean))];
};

/**
 * @method appScrapeEntriesFactory
 * @description Scrape entries for the Express runtimes a deploy declares.
 *
 * Only `nodejs` paths are emitted: they are the ones `ExpressService.createApp`
 * gives a `prom-client` registry to. Redirect-only and `lampp`/`wp` paths serve
 * no registry, and scraping them would produce permanently-down targets that
 * make the stack's own health unreadable.
 * @param {object} confServer - Parsed `conf.server.json` (host → path → config).
 * @param {object} [params]
 * @param {string} [params.scheme] - `https` in production, `http` in development.
 * @returns {Array<{host: string, metricsPath: string, scheme: string}>} Scrape entries.
 * @memberof UnderpostMonitoring
 */
const appScrapeEntriesFactory = (confServer = {}, { scheme = 'https' } = {}) => {
  const entries = [];
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host] || {})) {
      const conf = confServer[host][path] || {};
      if (conf.runtime !== 'nodejs' || conf.redirect) continue;
      entries.push({ host, metricsPath: metricsPathFactory(path), scheme });
    }
  }
  return entries;
};

const yamlList = (values = []) => `[${values.map((value) => `'${value}'`).join(', ')}]`;

/** Escapes a literal for a fully anchored Prometheus relabel regex. */
const promRegexEscape = (value = '') => `${value}`.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');

const indentBlock = (text, spaces) =>
  `${text}`
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => (line.length > 0 ? `${' '.repeat(spaces)}${line}` : ''))
    .join('\n');

/**
 * @method probeGroupsFactory
 * @description Groups event probes by Blackbox module and probe interval, so one
 * scrape job serves every event that probes the same way, at the same cadence.
 *
 * Each probe keeps its own label set as a distinct `static_configs` group. That
 * is what lets one event fan out over many subjects — a probe per WireGuard
 * spoke, each labelled with its id — so the alert Prometheus raises names the
 * subject that failed instead of the event that covers them all.
 *
 * The interval is the event's own `probeInterval`, so a cheap tunnel ping and a
 * fan-out over every public host do not have to share a cadence. Prometheus is
 * the scheduler; this only tells it what each job's period is.
 * @param {Array<{eventId: string, module: string, interval: string, targets: string[], labels: object}>} [probes] - Registered probes.
 * @returns {Array<{module: string, interval: string, groups: Array<{targets: string[], labels: object}>}>} Grouped probes.
 * @memberof UnderpostMonitoring
 */
const probeGroupsFactory = (probes = []) => {
  const byJob = new Map();
  for (const probe of probes) {
    const targets = (probe.targets || []).filter(Boolean);
    if (!probe.module || !probe.eventId || targets.length === 0) continue;
    const interval = `${probe.interval || ''}`.trim();
    const key = `${probe.module}|${interval}`;
    if (!byJob.has(key)) byJob.set(key, { module: probe.module, interval, groups: [] });
    byJob.get(key).groups.push({ targets, labels: { underpost_event: probe.eventId, ...(probe.labels || {}) } });
  }
  return [...byJob.values()];
};

/**
 * @method deployedEventIdsFactory
 * @description The event ids a rendered monitoring configuration carries.
 *
 * Every probe group and every rule is labelled `underpost_event`, so the
 * generated documents already state which events they serve. Reading them back
 * makes the cluster its own record of what is deployed — no local state file to
 * fall out of step with the objects that actually exist.
 * @param {...string} documents - Rendered ConfigMap data (`prometheus.yml`, rules).
 * @returns {string[]} Distinct event ids, sorted.
 * @memberof UnderpostMonitoring
 */
const deployedEventIdsFactory = (...documents) =>
  [
    ...new Set(
      documents.flatMap((document) =>
        [...`${document || ''}`.matchAll(/underpost_event\s*[:=]~?\s*'?"?([a-z0-9-]+)'?"?/gi)].map((match) => match[1]),
      ),
    ),
  ]
    .filter((id) => id && id !== '.+')
    .sort();

/**
 * @method prometheusConfFactory
 * @description Renders `prometheus.yml`.
 *
 * The Envoy job discovers the data plane instead of naming it: Envoy Gateway
 * provisions its own Deployment per GatewayClass with a generated name, so a
 * static target would break on every GatewayClass change. Pod discovery needs
 * the RBAC the Prometheus manifest carries.
 * @param {object} params
 * @param {Array<{host: string, metricsPath: string, scheme: string}>} [params.appTargets] - Express runtime targets.
 * @param {string[]} [params.extraTargets] - Additional `host:port` targets scraped over HTTP at `/metrics`.
 * @param {Array<{eventId: string, module: string, targets: string[]}>} [params.probes] - Blackbox probes.
 * @param {Array<{nodeName: string, role: string}>} [params.nodeRoles] - Registered cluster
 * nodes, relabelled onto their discovered series as `underpost_role`.
 * @param {string} [params.namespace] - Namespace holding the stack.
 * @param {string} [params.scrapeInterval] - Global scrape/evaluation interval.
 * @returns {string} `prometheus.yml` contents.
 * @memberof UnderpostMonitoring
 */
const prometheusConfFactory = ({
  appTargets = [],
  extraTargets = [],
  probes = [],
  hostTargets = [],
  nodeRoles = [],
  namespace = 'default',
  scrapeInterval = UNDERPOST_MONITORING.scrapeInterval,
} = {}) => {
  const { prometheus, alertmanager, blackbox, envoy, nodeExporter } = UNDERPOST_MONITORING;

  const appGroups = new Map();
  for (const target of appTargets) {
    const key = `${target.scheme}|${target.metricsPath}`;
    if (!appGroups.has(key)) appGroups.set(key, []);
    appGroups.get(key).push(target.host);
  }

  const appJobs = [...appGroups.entries()].map(([key, hosts], index) => {
    const [scheme, metricsPath] = key.split('|');
    return `
  - job_name: 'underpost-express${index > 0 ? `-${index}` : ''}'
    metrics_path: ${metricsPath}
    scheme: ${scheme}
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets: ${yamlList([...new Set(hosts)])}`;
  });

  const extraJob =
    extraTargets.length > 0
      ? `
  - job_name: 'underpost-extra'
    metrics_path: /metrics
    static_configs:
      - targets: ${yamlList([...new Set(extraTargets)])}`
      : '';

  // Cluster nodes are discovered; the hub is a VPS that discovery cannot see, so
  // it is scraped across the tunnel at the address the WireGuard events probe.
  // Discovery knows a node's name, not the role the deploy registry gives it, so
  // the role every panel and alert groups by is relabelled on from that registry.
  const roleRelabels = nodeRoles
    .filter((entry) => entry?.nodeName && entry?.role)
    .map(
      (entry) => `
      - source_labels: [__meta_kubernetes_node_name]
        regex: '${promRegexEscape(entry.nodeName)}'
        target_label: underpost_role
        replacement: '${entry.role}'`,
    )
    .join('');

  const hostJobs = [
    `
  - job_name: '${nodeExporter.name}'
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - source_labels: [__meta_kubernetes_node_address_InternalIP]
        target_label: __address__
        replacement: '\$1:${nodeExporter.port}'
      - source_labels: [__meta_kubernetes_node_name]
        target_label: node
      - target_label: underpost_role
        replacement: 'cluster'${roleRelabels}`,
    ...(hostTargets.length > 0
      ? [
          `
  - job_name: '${nodeExporter.name}-hub'
    static_configs:
      - targets: ${yamlList(hostTargets.map((target) => `${target}:${nodeExporter.port}`))}
        labels:
          underpost_role: 'hub'`,
        ]
      : []),
  ];

  const probeJobs = probeGroupsFactory(probes).map(
    ({ module, interval, groups }, index) => `
  - job_name: 'blackbox-${module}${index > 0 ? `-${index}` : ''}'
    metrics_path: /probe${interval ? `\n    scrape_interval: ${interval}` : ''}
    params:
      module: ['${module}']
    static_configs:
${groups
  .map(
    (group) => `      - targets: ${yamlList(group.targets)}
        labels:
${Object.entries(group.labels)
  .map(([key, value]) => `          ${key}: '${value}'`)
  .join('\n')}`,
  )
  .join('\n')}
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: '${serviceDnsFactory(blackbox.name, blackbox.port, namespace)}'`,
  );

  return `global:
  scrape_interval: ${scrapeInterval}
  evaluation_interval: ${scrapeInterval}

rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['${serviceDnsFactory(alertmanager.name, alertmanager.port, namespace)}']

scrape_configs:
  - job_name: '${prometheus.name}'
    static_configs:
      - targets: ['127.0.0.1:${prometheus.port}']

  - job_name: 'envoy-gateway'
    metrics_path: ${envoy.metricsPath}
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names: ['${envoy.namespace}']
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app_kubernetes_io_name]
        regex: envoy
        action: keep
      - source_labels: [__meta_kubernetes_pod_ip]
        target_label: __address__
        replacement: '\$1:${envoy.metricsPort}'
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
    metric_relabel_configs:
      # Envoy truncates a cluster name at its first hyphen when it extracts the
      # tag, so every www-* HTTPRoute reports as httproute/default/www. The
      # samples arrive already indistinguishable, no relabeling can separate
      # them, and Prometheus drops the scrape's worth of them as duplicates with
      # the same timestamp. Nothing reads this socket-match counter, so it goes.
      - source_labels: [__name__]
        regex: envoy_cluster_total_match_count
        action: drop
${[...appJobs, extraJob, ...hostJobs, ...probeJobs].filter(Boolean).join('\n')}
`;
};

/**
 * @method alertRulesFactory
 * @description Renders the alerting rules for the registered events.
 *
 * Every rule carries `underpost_event`, because that label is the whole
 * contract between the rule, the Alertmanager route and the dispatcher: the
 * route matches on its presence and the dispatcher reads it to select a
 * handler. A rule without it fires into the null receiver.
 * @param {Array<object>} [events] - Registered events with an `alert` definition carrying its declared `for`.
 * @returns {string} Rules file contents.
 * @memberof UnderpostMonitoring
 */
const alertRulesFactory = (events = []) => {
  const rules = events
    // A rule needs its window as much as its expression: the contract declares
    // `alertFor`, and rendering a default here would put the answer in two places.
    .filter((event) => event.id && event.alert?.expr && event.alert?.for)
    .map(
      (event) => `      - alert: ${event.alert.name}
        expr: ${event.alert.expr}
        for: ${event.alert.for}
        labels:
          severity: ${event.alert.severity || 'critical'}
          underpost_event: '${event.id}'
        annotations:
          summary: '${event.alert.summary || event.description || event.id}'
          description: '${event.alert.description || event.description || event.id}'`,
    );

  return `groups:
  - name: underpost-events
    rules:
${rules.length > 0 ? rules.join('\n') : '      []'}
`;
};

/**
 * @method alertmanagerConfFactory
 * @description Renders `alertmanager.yml`.
 *
 * One route matters: anything labelled `underpost_event` goes to the webhook
 * the dispatcher serves. Everything else lands in a null receiver rather than
 * an inbox, because an alert with no registered handler has no remediation to
 * announce.
 *
 * `send_resolved` stays off. The dispatcher acts — it re-runs setup and opens a
 * ticket by mail — and a resolution notice would ask it to act again on a
 * condition that has already cleared.
 *
 * Deliveries always carry the bearer token from the mounted Secret: the
 * receiver runs on the host with root-equivalent reach on the edge, so an
 * unauthenticated variant of this route is not a mode worth having.
 * @param {object} params
 * @param {string} params.webhookUrl - Absolute URL of the dispatcher's receiver.
 * @param {string} [params.repeatInterval] - How long before an unresolved alert is redelivered.
 * @returns {string} `alertmanager.yml` contents.
 * @memberof UnderpostMonitoring
 */
const alertmanagerConfFactory = ({ webhookUrl, repeatInterval = '1h' } = {}) => {
  const { alertmanager } = UNDERPOST_MONITORING;
  return `global:
  resolve_timeout: 5m

route:
  receiver: 'underpost-null'
  # Grouped by subject as well as by event: a fan-out event raises one alert per
  # subject, and grouping them together would deliver a single webhook naming
  # whichever one Alertmanager happened to pick first.
  group_by: ['alertname', 'underpost_event', 'underpost_spoke']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: ${repeatInterval}
  routes:
    - receiver: 'underpost-event'
      matchers:
        - underpost_event =~ ".+"

receivers:
  - name: 'underpost-null'

  - name: 'underpost-event'
    webhook_configs:
      - url: '${webhookUrl}'
        send_resolved: false
        max_alerts: 0
        http_config:
          authorization:
            type: Bearer
            credentials_file: /etc/alertmanager/secret/${alertmanager.tokenKey}
`;
};

/**
 * @method blackboxConfFactory
 * @description Renders `blackbox.yml`.
 *
 * The three modules the event registry probes with, and nothing else: a module
 * no probe names is configuration that cannot be observed to be wrong.
 * `insecure_skip_verify` applies to the HTTP prober alone — probes target the
 * edge by address, where the certificate names a hostname it cannot present.
 * @returns {string} `blackbox.yml` contents.
 * @memberof UnderpostMonitoring
 */
const blackboxConfFactory = () => `modules:
  http_2xx:
    prober: http
    timeout: 5s
    http:
      preferred_ip_protocol: ip4
      ip_protocol_fallback: false
      valid_status_codes: []
      follow_redirects: true
      tls_config:
        insecure_skip_verify: true

  tcp_connect:
    prober: tcp
    timeout: 5s
    tcp:
      preferred_ip_protocol: ip4
      ip_protocol_fallback: false

  icmp:
    prober: icmp
    timeout: 5s
    icmp:
      preferred_ip_protocol: ip4
      ip_protocol_fallback: false
`;

/**
 * @method grafanaDatasourcesFactory
 * @description Renders the provisioned Prometheus datasource.
 * @param {object} [params]
 * @param {string} [params.namespace] - Namespace holding Prometheus.
 * @returns {string} Datasource provisioning file contents.
 * @memberof UnderpostMonitoring
 */
const grafanaDatasourcesFactory = ({ namespace = 'default' } = {}) => {
  const { prometheus } = UNDERPOST_MONITORING;
  return `apiVersion: 1
datasources:
  - name: Prometheus
    uid: underpost-prometheus
    type: prometheus
    access: proxy
    url: 'http://${serviceDnsFactory(prometheus.name, prometheus.port, namespace)}'
    isDefault: true
    editable: false
    jsonData:
      timeInterval: ${UNDERPOST_MONITORING.scrapeInterval}
`;
};

/**
 * @method nodeExporterManifestFactory
 * @description Renders the host-metrics collector as a DaemonSet.
 *
 * `hostNetwork` and `hostPID` because the point is the host, not the pod: CPU,
 * memory, filesystem and interface counters have to describe the machine the
 * workloads run on. The root filesystem is mounted read-only so a collector can
 * never write to what it measures, and the textfile directory is the one path
 * anything else may drop a `.prom` file into.
 * @param {object} [params]
 * @param {string} [params.namespace='default'] - Namespace holding the stack.
 * @returns {string} DaemonSet manifest.
 * @memberof UnderpostMonitoring
 */
const nodeExporterManifestFactory = ({ namespace = 'default' } = {}) => {
  const { nodeExporter } = UNDERPOST_MONITORING;
  return `---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: ${nodeExporter.name}
  namespace: ${namespace}
  labels:
    app: ${nodeExporter.name}
spec:
  selector:
    matchLabels:
      app: ${nodeExporter.name}
  template:
    metadata:
      labels:
        app: ${nodeExporter.name}
    spec:
      hostNetwork: true
      hostPID: true
      tolerations:
        - operator: Exists
      containers:
        - name: ${nodeExporter.name}
          image: prom/node-exporter:latest
          args:
            - --path.rootfs=/host/root
            - --path.procfs=/host/proc
            - --path.sysfs=/host/sys
            - --collector.textfile.directory=${nodeExporter.textfileDirectory}
            - --collector.filesystem.mount-points-exclude=${nodeExporter.filesystemExclude}
          ports:
            - name: metrics
              containerPort: ${nodeExporter.port}
          resources:
            requests:
              cpu: 25m
              memory: 32Mi
          securityContext:
            runAsUser: 0
          volumeMounts:
            - name: proc
              mountPath: /host/proc
              readOnly: true
            - name: sys
              mountPath: /host/sys
              readOnly: true
            - name: root
              mountPath: /host/root
              mountPropagation: HostToContainer
              readOnly: true
            - name: textfile
              mountPath: ${nodeExporter.textfileDirectory}
              readOnly: true
      volumes:
        - name: proc
          hostPath:
            path: /proc
        - name: sys
          hostPath:
            path: /sys
        - name: root
          hostPath:
            path: /
        - name: textfile
          hostPath:
            path: ${nodeExporter.textfileDirectory}
            type: DirectoryOrCreate
`;
};

/**
 * @method nodeExporterServiceFactory
 * @description Renders the same host collector as a systemd unit, for a machine
 * the cluster cannot schedule a pod onto.
 *
 * Bound to the tunnel address rather than every interface: Prometheus scrapes
 * the hub across WireGuard, and a listener on the VPS public address would
 * publish the host's inventory to the internet. Binding it makes the unit
 * depend on the interface, which is why it is tied to `wg-quick@`.
 * @param {object} params
 * @param {string} params.host - Tunnel address the collector binds.
 * @param {string} [params.interfaceName='wg0'] - Tunnel interface carrying that address.
 * @returns {string} Rendered unit file.
 * @memberof UnderpostMonitoring
 */
const nodeExporterServiceFactory = ({ host, interfaceName = 'wg0' }) => {
  const { nodeExporter } = UNDERPOST_MONITORING;
  const tunnelUnit = `wg-quick@${interfaceName}.service`;
  return systemdUnitFactory({
    header:
      '# Generated by `underpost wireguard --node-exporter`. Do not edit by hand:\n' +
      '# the next run rewrites the file and restarts the service.',
    sections: {
      Unit: {
        Description: `Underpost host metrics collector on ${host}:${nodeExporter.port}`,
        Documentation: 'https://www.nexodev.org/docs',
        After: `network-online.target ${tunnelUnit}`,
        Wants: 'network-online.target',
        Requires: tunnelUnit,
        PartOf: tunnelUnit,
      },
      Service: {
        Type: 'simple',
        User: 'root',
        ExecStart: [
          nodeExporter.binaryPath,
          `--web.listen-address=${host}:${nodeExporter.port}`,
          `--collector.textfile.directory=${nodeExporter.textfileDirectory}`,
          `--collector.filesystem.mount-points-exclude=${nodeExporter.filesystemExclude}`,
        ].join(' '),
        Restart: 'always',
        RestartSec: 5,
      },
      Install: { WantedBy: `multi-user.target ${tunnelUnit}` },
    },
  });
};

/**
 * @method nodeExporterServiceScriptFactory
 * @description The single command that provisions the collector on a host.
 *
 * Base64 in, bash out: the remote runner interpolates its command into
 * `bash -lc "..."`, which would eat the quotes, expansions and heredoc this
 * needs. Encoding the script transports it intact and keeps one implementation
 * for the local and the SSH path. The final state read is what makes a failed
 * start a failed run rather than a silent one.
 * @param {object} params
 * @param {string} params.host - Tunnel address the collector binds.
 * @param {string} [params.interfaceName='wg0'] - Tunnel interface carrying that address.
 * @returns {string} Command to execute on the target host.
 * @memberof UnderpostMonitoring
 */
const nodeExporterServiceScriptFactory = ({ host, interfaceName = 'wg0' }) => {
  const { nodeExporter } = UNDERPOST_MONITORING;
  const lifecycle = systemdServiceCommandsFactory({
    changed: true,
    name: nodeExporter.serviceName,
    unitPath: nodeExporter.unitPath,
  }).ensure;

  const script = `set -e
VERSION=${nodeExporter.version}
ARCH=$(uname -m)
case "$ARCH" in x86_64) ARCH=amd64 ;; aarch64) ARCH=arm64 ;; esac
RELEASE=node_exporter-$VERSION.linux-$ARCH
# The collector's textfile directory is written by CronJob pods, so it needs the shared container
# label; the /var/lib default leaves it readable but not writable by container_t. Non-fatal: a
# host without the SELinux userspace still gets a working collector, just unlabeled.
# A subshell, not a brace group: the generated mapping command calls exit 1 when semanage is
# missing, which in a brace group would terminate this installer rather than just this check.
if ! ( ${containerStorageCommandsFactory(nodeExporter.textfileDirectory)
    .map((command) => `{ ${command}; }`)
    .join(' && ')} ); then
  echo "WARN: could not label ${nodeExporter.textfileDirectory} for container access" >&2
fi
if ! ${nodeExporter.binaryPath} --version 2>/dev/null | grep -q "version $VERSION"; then
  TMP=$(mktemp -d)
  curl -fsSL "https://github.com/prometheus/node_exporter/releases/download/v$VERSION/$RELEASE.tar.gz" -o "$TMP/$RELEASE.tar.gz"
  tar -xzf "$TMP/$RELEASE.tar.gz" -C "$TMP"
  sudo install -m 0755 "$TMP/$RELEASE/node_exporter" ${nodeExporter.binaryPath}
  rm -rf "$TMP"
fi
sudo tee ${nodeExporter.unitPath} >/dev/null <<'UNIT'
${nodeExporterServiceFactory({ host, interfaceName })}UNIT
${lifecycle.join('\n')}
systemctl is-active --quiet ${nodeExporter.serviceName}
`;

  return `echo ${Buffer.from(script, 'utf8').toString('base64')} | base64 -d | bash -s`;
};

/**
 * @method grafanaDashboardProviderFactory
 * @description Renders the file-based dashboard provider.
 * @returns {string} Dashboard provider provisioning file contents.
 * @memberof UnderpostMonitoring
 */
const grafanaDashboardProviderFactory = () => `apiVersion: 1
providers:
  - name: 'underpost'
    orgId: 1
    folder: 'Underpost'
    type: file
    disableDeletion: false
    allowUiUpdates: true
    updateIntervalSeconds: 30
    options:
      path: ${UNDERPOST_MONITORING.grafana.dashboardsPath}
      foldersFromFilesStructure: false
`;

const timeSeriesPanel = ({ id, title, unit = 'short', gridPos, targets, overrides = [] }) => ({
  id,
  type: 'timeseries',
  title,
  datasource: { type: 'prometheus', uid: 'underpost-prometheus' },
  gridPos,
  fieldConfig: { defaults: { unit, custom: { fillOpacity: 8, lineWidth: 1 } }, overrides },
  options: { legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } },
  targets: targets.map((target, index) => ({ refId: String.fromCharCode(65 + index), ...target })),
});

/** Series identity every host panel groups and labels by. */
const NODE_LEGEND = '{{instance}} ({{underpost_role}})';

/** Re-units one query of a panel and moves it to the opposite axis. */
const secondaryAxisOverride = (refId, unit) => ({
  matcher: { id: 'byFrameRefID', options: refId },
  properties: [
    { id: 'unit', value: unit },
    { id: 'custom.axisPlacement', value: 'right' },
  ],
});

const statPanel = ({ id, title, description, unit = 'short', gridPos, targets, defaults = {}, options = {} }) => ({
  id,
  type: 'stat',
  title,
  ...(description ? { description } : {}),
  datasource: { type: 'prometheus', uid: 'underpost-prometheus' },
  gridPos,
  fieldConfig: { defaults: { unit, ...defaults }, overrides: [] },
  options: {
    reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
    colorMode: 'value',
    ...options,
  },
  targets: targets.map((target, index) => ({ refId: String.fromCharCode(65 + index), ...target })),
});

/**
 * The field config every boolean availability field carries: `probe_success`
 * and `up` are only ever 0 or 1, so the number itself says nothing an operator
 * reads faster than a word and a colour. The threshold step at 1 is what makes
 * anything short of a full success red, and `noValue` separates a target that
 * reports failure from one that stopped reporting at all.
 */
const availabilityDefaults = () => ({
  min: 0,
  max: 1,
  decimals: 0,
  noValue: 'NO DATA',
  color: { mode: 'thresholds' },
  mappings: [
    {
      type: 'value',
      options: {
        0: { text: 'DOWN', color: 'red', index: 0 },
        1: { text: 'UP', color: 'green', index: 1 },
      },
    },
  ],
  thresholds: {
    mode: 'absolute',
    steps: [
      { color: 'red', value: null },
      { color: 'green', value: 1 },
    ],
  },
});

/**
 * @method stateTimelinePanel
 * @description A boolean availability series as coloured bands over time.
 *
 * A line chart of dozens of targets that are almost always 1 spends its whole
 * vertical axis on two values and draws every target on top of the same line.
 * A state timeline spends the axis on identity instead — one row per series —
 * which is what makes a single red band among fifty green ones findable.
 * Values are merged, so a target that never failed is one band rather than one
 * rectangle per scrape, and nulls are not spanned, so a target that stopped
 * reporting reads as a gap rather than as continued health.
 * @param {object} params
 * @param {number} params.id - Panel id.
 * @param {string} params.title - Panel title.
 * @param {string} [params.description] - Panel description.
 * @param {object} params.gridPos - Grafana grid position.
 * @param {Array<object>} params.targets - Panel queries.
 * @returns {object} Panel model.
 * @memberof UnderpostMonitoring
 */
const stateTimelinePanel = ({ id, title, description, gridPos, targets }) => ({
  id,
  type: 'state-timeline',
  title,
  ...(description ? { description } : {}),
  datasource: { type: 'prometheus', uid: 'underpost-prometheus' },
  gridPos,
  fieldConfig: {
    defaults: {
      ...availabilityDefaults(),
      custom: { fillOpacity: 85, lineWidth: 0, spanNulls: false },
    },
    overrides: [],
  },
  options: {
    mergeValues: true,
    showValue: 'never',
    alignValue: 'left',
    rowHeight: 0.9,
    legend: { showLegend: false, displayMode: 'list', placement: 'bottom' },
    tooltip: { mode: 'single', sort: 'none' },
  },
  targets: targets.map((target, index) => ({ refId: String.fromCharCode(65 + index), ...target })),
});

/** One background-coloured UP/DOWN card per series: the instant state, read at a glance. */
const availabilityStatPanel = (panel) =>
  statPanel({
    ...panel,
    defaults: availabilityDefaults(),
    options: {
      colorMode: 'background',
      graphMode: 'none',
      textMode: 'value_and_name',
      justifyMode: 'center',
      wideLayout: false,
      text: { titleSize: 11, valueSize: 20 },
    },
  });

/** Availability as a fraction of the selected range, coloured against an SLO. */
const uptimeStatPanel = (panel) =>
  statPanel({
    ...panel,
    unit: 'percentunit',
    defaults: {
      min: 0,
      max: 1,
      decimals: 3,
      noValue: 'NO DATA',
      color: { mode: 'thresholds' },
      thresholds: {
        mode: 'absolute',
        steps: [
          { color: 'red', value: null },
          { color: 'orange', value: 0.99 },
          { color: 'green', value: 0.999 },
        ],
      },
    },
    options: { colorMode: 'background', graphMode: 'area', textMode: 'value' },
  });

/** How many members of a fleet are failing right now; zero reads as a word, not a digit. */
const outageCountPanel = (panel) =>
  statPanel({
    ...panel,
    defaults: {
      decimals: 0,
      color: { mode: 'thresholds' },
      mappings: [{ type: 'value', options: { 0: { text: 'ALL UP', color: 'green', index: 0 } } }],
      thresholds: {
        mode: 'absolute',
        steps: [
          { color: 'green', value: null },
          { color: 'red', value: 1 },
        ],
      },
    },
    options: { colorMode: 'background', graphMode: 'area', textMode: 'value' },
  });

/** A label-values variable, so dozens of targets can be narrowed to the one under investigation. */
const dashboardVariableFactory = ({ name, label, query }) => ({
  name,
  label,
  type: 'query',
  datasource: { type: 'prometheus', uid: 'underpost-prometheus' },
  definition: query,
  query: { query, refId: `${name}-variable` },
  refresh: 2,
  sort: 1,
  multi: true,
  includeAll: true,
  allValue: '.+',
  current: { selected: true, text: ['All'], value: ['$__all'] },
  options: [],
});

/**
 * @method envoyDashboardFactory
 * @description The Envoy Gateway data plane dashboard.
 *
 * Downstream 5xx is read from `envoy_http_downstream_rq_xx` filtered to
 * `envoy_response_code_class="5"`. Envoy exposes response classes as one
 * labelled family, not as a `..._rq_5xx` series, so selecting the label is what
 * actually yields the 5xx rate.
 * @returns {string} Dashboard JSON.
 * @memberof UnderpostMonitoring
 */
const envoyDashboardFactory = () =>
  `${JSON.stringify(
    {
      uid: 'underpost-envoy',
      title: 'Underpost · Envoy Gateway',
      tags: ['underpost', 'envoy'],
      timezone: 'browser',
      schemaVersion: 39,
      refresh: '30s',
      time: { from: 'now-6h', to: 'now' },
      panels: [
        statPanel({
          id: 1,
          title: 'Data plane uptime',
          unit: 's',
          gridPos: { h: 4, w: 6, x: 0, y: 0 },
          targets: [{ expr: 'max(envoy_server_uptime)', legendFormat: 'uptime' }],
        }),
        statPanel({
          id: 2,
          title: 'Memory allocated',
          unit: 'bytes',
          gridPos: { h: 4, w: 6, x: 6, y: 0 },
          targets: [{ expr: 'sum(envoy_server_memory_allocated)', legendFormat: 'allocated' }],
        }),
        statPanel({
          id: 3,
          title: 'Active downstream connections',
          gridPos: { h: 4, w: 6, x: 12, y: 0 },
          targets: [{ expr: 'sum(envoy_http_downstream_cx_active)', legendFormat: 'active' }],
        }),
        statPanel({
          id: 4,
          title: 'Probe success',
          gridPos: { h: 4, w: 6, x: 18, y: 0 },
          targets: [{ expr: 'min(probe_success)', legendFormat: 'probes' }],
        }),
        timeSeriesPanel({
          id: 5,
          title: 'Downstream requests completed',
          unit: 'reqps',
          gridPos: { h: 8, w: 12, x: 0, y: 4 },
          targets: [
            {
              expr: 'sum by (envoy_http_conn_manager_prefix) (rate(envoy_http_downstream_rq_completed[5m]))',
              legendFormat: '{{envoy_http_conn_manager_prefix}}',
            },
          ],
        }),
        timeSeriesPanel({
          id: 6,
          title: 'Downstream 5xx',
          unit: 'reqps',
          gridPos: { h: 8, w: 12, x: 12, y: 4 },
          targets: [
            {
              expr: 'sum by (envoy_http_conn_manager_prefix) (rate(envoy_http_downstream_rq_xx{envoy_response_code_class="5"}[5m]))',
              legendFormat: '{{envoy_http_conn_manager_prefix}} 5xx',
            },
          ],
        }),
        timeSeriesPanel({
          id: 7,
          title: 'Downstream throughput',
          unit: 'Bps',
          gridPos: { h: 8, w: 12, x: 0, y: 12 },
          targets: [
            { expr: 'sum(rate(envoy_http_downstream_cx_rx_bytes_total[5m]))', legendFormat: 'rx' },
            { expr: 'sum(rate(envoy_http_downstream_cx_tx_bytes_total[5m]))', legendFormat: 'tx' },
          ],
        }),
        timeSeriesPanel({
          id: 8,
          title: 'Active connections',
          gridPos: { h: 8, w: 12, x: 12, y: 12 },
          targets: [
            {
              expr: 'sum by (envoy_http_conn_manager_prefix) (envoy_http_downstream_cx_active)',
              legendFormat: '{{envoy_http_conn_manager_prefix}}',
            },
          ],
        }),
      ],
    },
    null,
    2,
  )}\n`;

/** Series the availability panels read, narrowed by the dashboard's own variables. */
const PROBE_SELECTOR = 'probe_success{underpost_event=~"$event"}';
const TARGET_SELECTOR = 'up{job=~"$job"}';

/**
 * A step of a state timeline is wider than a scrape as soon as the range is,
 * and Prometheus answers each step with its last sample — which is how a short
 * outage disappears from a week-long view. Reducing the step with `min_over_time`
 * keeps the failure: any zero inside the window colours the whole band red.
 * `$__rate_interval` rather than `$__interval` because it is guaranteed to be
 * wider than the scrape interval, so the reduction can never see an empty range.
 */
const timelineExpr = (selector) => `min_over_time(${selector}[$__rate_interval])`;

/**
 * @method eventsDashboardFactory
 * @description The event/probe dashboard: what each registered event's probes
 * report, and what the Express runtimes are serving.
 *
 * Availability is boolean, and the dashboard is laid out the way an operator
 * reads one: the top row answers "is anything broken right now, and how much
 * has it cost", the card grids name which subject is broken, and the state
 * timelines say when it broke and for how long. Nothing renders 0/1 on a
 * numeric axis, because dozens of targets that are almost always up produce a
 * single line and an unreadable legend.
 * @returns {string} Dashboard JSON.
 * @memberof UnderpostMonitoring
 */
const eventsDashboardFactory = () =>
  `${JSON.stringify(
    {
      uid: 'underpost-events',
      title: 'Underpost · Events and Probes',
      tags: ['underpost', 'events'],
      timezone: 'browser',
      schemaVersion: 39,
      refresh: '30s',
      time: { from: 'now-6h', to: 'now' },
      templating: {
        list: [
          dashboardVariableFactory({
            name: 'event',
            label: 'Event',
            query: 'label_values(probe_success, underpost_event)',
          }),
          dashboardVariableFactory({ name: 'job', label: 'Job', query: 'label_values(up, job)' }),
        ],
      },
      panels: [
        outageCountPanel({
          id: 10,
          title: 'Probes failing now',
          description: 'Blackbox probes reporting 0 on their most recent scrape.',
          gridPos: { h: 4, w: 6, x: 0, y: 0 },
          targets: [{ expr: `count(${PROBE_SELECTOR} == 0) or vector(0)`, legendFormat: 'failing', instant: true }],
        }),
        uptimeStatPanel({
          id: 11,
          title: 'Probe availability · range',
          description: 'Mean probe success over the selected time range, across every probe.',
          gridPos: { h: 4, w: 6, x: 6, y: 0 },
          targets: [
            { expr: `avg(avg_over_time(${PROBE_SELECTOR}[$__range]))`, legendFormat: 'availability', instant: true },
          ],
        }),
        outageCountPanel({
          id: 12,
          title: 'Targets failing now',
          description: 'Scrape targets Prometheus could not reach on its most recent attempt.',
          gridPos: { h: 4, w: 6, x: 12, y: 0 },
          targets: [{ expr: `count(${TARGET_SELECTOR} == 0) or vector(0)`, legendFormat: 'failing', instant: true }],
        }),
        uptimeStatPanel({
          id: 13,
          title: 'Target availability · range',
          description: 'Worst single target over the selected range, not the fleet average.',
          gridPos: { h: 4, w: 6, x: 18, y: 0 },
          targets: [
            {
              expr: `min(avg_over_time(${TARGET_SELECTOR}[$__range]))`,
              legendFormat: 'worst target',
              instant: true,
            },
          ],
        }),
        availabilityStatPanel({
          id: 14,
          title: 'Probe status by event',
          gridPos: { h: 5, w: 24, x: 0, y: 4 },
          targets: [{ expr: PROBE_SELECTOR, legendFormat: '{{underpost_event}} · {{instance}}', instant: true }],
        }),
        stateTimelinePanel({
          id: 1,
          title: 'Probe success by event',
          gridPos: { h: 9, w: 24, x: 0, y: 9 },
          targets: [{ expr: timelineExpr(PROBE_SELECTOR), legendFormat: '{{underpost_event}} · {{instance}}' }],
        }),
        availabilityStatPanel({
          id: 15,
          title: 'Target status',
          gridPos: { h: 5, w: 24, x: 0, y: 18 },
          targets: [{ expr: TARGET_SELECTOR, legendFormat: '{{job}} · {{instance}}', instant: true }],
        }),
        stateTimelinePanel({
          id: 4,
          title: 'Target availability',
          gridPos: { h: 9, w: 24, x: 0, y: 23 },
          targets: [{ expr: timelineExpr(TARGET_SELECTOR), legendFormat: '{{job}} · {{instance}}' }],
        }),
        timeSeriesPanel({
          id: 2,
          title: 'Probe duration',
          unit: 's',
          gridPos: { h: 8, w: 12, x: 0, y: 32 },
          targets: [
            {
              expr: 'probe_duration_seconds{underpost_event=~"$event"}',
              legendFormat: '{{underpost_event}} · {{instance}}',
            },
          ],
        }),
        timeSeriesPanel({
          id: 3,
          title: 'Express HTTP requests',
          unit: 'reqps',
          gridPos: { h: 8, w: 12, x: 12, y: 32 },
          targets: [
            {
              expr: 'sum by (job, instance) (rate({__name__=~".+_http_requests_total"}[5m]))',
              legendFormat: '{{instance}}',
            },
          ],
        }),
      ],
    },
    null,
    2,
  )}\n`;

/**
 * @method grafanaExposureFactory
 * @description The URL model Grafana must be told about for a given exposure.
 *
 * Grafana builds every asset link, redirect and OAuth callback from
 * `root_url`, so it has to be told where it is being reached — a dashboard
 * served at a sub-path with the default root URL loads a blank page whose
 * assets 404 against the domain root. The two exposures need opposite answers,
 * which is why this resolves to a pair rather than a constant:
 *
 *   - behind the edge at `/grafana`, it serves from the sub-path and must keep
 *     the prefix, so no route rewrite is involved;
 *   - on a NodePort it owns the whole origin and serves from the root.
 * @param {object} [params]
 * @param {string} [params.host] - Hostname the edge serves it under.
 * @param {string} [params.nodeIp] - Node address for the NodePort exposure.
 * @param {number} [params.nodePort] - Node port.
 * @returns {{rootUrl: string, subPath: boolean, url: string}} Root URL, sub-path mode, and the browser URL.
 * @memberof UnderpostMonitoring
 */
const grafanaExposureFactory = ({ host = '', nodeIp = '', nodePort = UNDERPOST_MONITORING.grafana.nodePort } = {}) => {
  const { subPath, port } = UNDERPOST_MONITORING.grafana;
  if (host) {
    const url = `https://${host}${subPath}`;
    return { rootUrl: `${url}/`, subPath: true, url };
  }
  if (nodeIp) {
    const url = `http://${nodeIp}:${nodePort}`;
    return { rootUrl: `${url}/`, subPath: false, url };
  }
  return { rootUrl: `http://localhost:${port}/`, subPath: false, url: `http://localhost:${port}` };
};

const grafanaStorageResetRequiredFactory = ({ nodeName = '', volumeNodes = [] } = {}) =>
  Boolean(nodeName && volumeNodes.length > 0 && !volumeNodes.includes(nodeName));

const grafanaResetPlanFactory = (volumeName = '') => {
  const { name, nodePortName, pvcName, routeName } = UNDERPOST_MONITORING.grafana;
  return {
    controllers: [`deployment/${name}`, `statefulset/${name}`],
    resources: [`service/${name}`, `service/${nodePortName}`, `httproute/${routeName}`],
    claim: `pvc/${pvcName}`,
    volumeName,
  };
};

const grafanaAdminEnvFactory = () => [
  {
    name: 'GF_SECURITY_ADMIN_USER',
    valueFrom: {
      secretKeyRef: {
        name: UNDERPOST_MONITORING.grafana.adminSecretName,
        key: UNDERPOST_MONITORING.grafana.adminUserKey,
      },
    },
  },
  {
    name: 'GF_SECURITY_ADMIN_PASSWORD',
    valueFrom: {
      secretKeyRef: {
        name: UNDERPOST_MONITORING.grafana.adminSecretName,
        key: UNDERPOST_MONITORING.grafana.adminPasswordKey,
      },
    },
  },
];
const grafanaRuntimeEnvFactory = (exposure) => [
  { name: 'GF_SERVER_ROOT_URL', value: exposure.rootUrl },
  { name: 'GF_SERVER_SERVE_FROM_SUB_PATH', value: `${exposure.subPath}` },
];
const grafanaManagedEnvFactory = (exposure) => [...grafanaAdminEnvFactory(), ...grafanaRuntimeEnvFactory(exposure)];

/**
 * @method grafanaDeploymentPatchFactory
 * @description Renders the runtime fields used when republishing an existing Grafana Deployment.
 * @param {object} params
 * @param {object} params.exposure - Result of {@link grafanaExposureFactory}.
 * @param {string} [params.nodeName] - Kubernetes node to pin Grafana to.
 * @param {string} [params.adminSecretVersion] - Secret resource version used to roll Grafana.
 * @returns {object} Kubernetes Deployment merge patch.
 * @memberof UnderpostMonitoring
 */
const grafanaDeploymentPatchFactory = ({ exposure, nodeName = '', adminSecretVersion = '' } = {}) => ({
  spec: {
    template: {
      ...(adminSecretVersion
        ? {
            metadata: {
              annotations: {
                [UNDERPOST_MONITORING.grafana.adminSecretVersionAnnotation]: adminSecretVersion,
              },
            },
          }
        : {}),
      spec: {
        ...(nodeName ? { nodeSelector: { 'kubernetes.io/hostname': nodeName } } : {}),
        containers: [
          {
            name: UNDERPOST_MONITORING.grafana.name,
            env: [...(adminSecretVersion ? grafanaAdminEnvFactory() : []), ...grafanaRuntimeEnvFactory(exposure)],
          },
        ],
      },
    },
  },
});

/**
 * @method grafanaDeploymentFactory
 * @description Adds the browser origin and placement before Grafana's first pod is created.
 * @param {object} params
 * @param {object} params.deployment - Parsed base Deployment manifest.
 * @param {object} params.exposure - Result of {@link grafanaExposureFactory}.
 * @param {string} [params.namespace='default'] - Namespace holding Grafana.
 * @param {string} [params.nodeName] - Kubernetes node to pin Grafana to.
 * @param {string} [params.adminSecretVersion] - Secret resource version used to roll Grafana.
 * @returns {object} Deployment ready to apply.
 * @memberof UnderpostMonitoring
 */
const grafanaDeploymentFactory = ({
  deployment,
  exposure,
  namespace = 'default',
  nodeName = '',
  adminSecretVersion = '',
} = {}) => {
  const rendered = structuredClone(deployment);
  rendered.metadata.namespace = namespace;
  if (adminSecretVersion) {
    rendered.spec.template.metadata ||= {};
    rendered.spec.template.metadata.annotations = {
      ...(rendered.spec.template.metadata.annotations || {}),
      [UNDERPOST_MONITORING.grafana.adminSecretVersionAnnotation]: adminSecretVersion,
    };
  }
  const podSpec = rendered.spec.template.spec;
  podSpec.nodeSelector = nodeName ? { 'kubernetes.io/hostname': nodeName } : {};

  const container = podSpec.containers.find(({ name }) => name === UNDERPOST_MONITORING.grafana.name);
  if (!container) throw new Error('Grafana Deployment manifest has no grafana container');
  const managedNames = new Set(grafanaManagedEnvFactory(exposure).map(({ name }) => name));
  container.env = [
    ...(container.env || []).filter(({ name }) => !managedNames.has(name)),
    ...grafanaManagedEnvFactory(exposure),
  ];
  return rendered;
};

/** Renders the Secret used for Grafana's initial administrator credentials. */
const grafanaAdminSecretFactory = ({ username, password, namespace = 'default' } = {}) => {
  if (!username || !password) throw new Error('Grafana admin username and password are required');
  const { name, adminSecretName, adminUserKey, adminPasswordKey } = UNDERPOST_MONITORING.grafana;
  return `
---
apiVersion: v1
kind: Secret
metadata:
  name: ${adminSecretName}
  namespace: ${namespace}
  labels:
    app: ${name}
    app.kubernetes.io/managed-by: underpost
type: Opaque
data:
  ${adminUserKey}: ${Buffer.from(`${username}`, 'utf8').toString('base64')}
  ${adminPasswordKey}: ${Buffer.from(`${password}`, 'utf8').toString('base64')}
`;
};

/**
 * @method grafanaNodePortFactory
 * @description Renders the NodePort Service that publishes Grafana on the LAN.
 *
 * A second Service beside the ClusterIP rather than a change to it: the
 * in-cluster datasource and the browser reach Grafana for different reasons,
 * and a NodePort withdrawn later must not take the cluster-internal address
 * with it.
 * @param {object} [params]
 * @param {string} [params.namespace] - Namespace holding Grafana.
 * @param {number} [params.nodePort] - Node port to publish on.
 * @returns {string} Service YAML.
 * @memberof UnderpostMonitoring
 */
const grafanaNodePortFactory = ({ namespace = 'default', nodePort = UNDERPOST_MONITORING.grafana.nodePort } = {}) => {
  const { name, nodePortName, port } = UNDERPOST_MONITORING.grafana;
  return `
---
apiVersion: v1
kind: Service
metadata:
  name: ${nodePortName}
  namespace: ${namespace}
  labels:
    app: ${name}
spec:
  type: NodePort
  externalTrafficPolicy: Cluster
  selector:
    app: ${name}
  ports:
    - name: http
      protocol: TCP
      port: ${port}
      targetPort: ${port}
      nodePort: ${nodePort}
`;
};

/**
 * @method nodeMetricsDashboardFactory
 * @description The host-metrics dashboard.
 *
 * Every panel is grouped by `instance`, which for a discovered node is its
 * InternalIP and for the hub its tunnel address — the same identity the node
 * events resolve a repair target from, so a spike here names a machine an
 * operator can act on, and legends carry the `underpost_role` Prometheus
 * relabels onto it so hub, control and worker are told apart at a glance.
 * @returns {string} Dashboard JSON.
 * @memberof UnderpostMonitoring
 */
const nodeMetricsDashboardFactory = () => {
  const { networkDeviceSelector } = UNDERPOST_MONITORING.nodeExporter;
  return `${JSON.stringify(
    {
      uid: 'underpost-node-metrics',
      title: 'Underpost · Node Metrics',
      tags: ['underpost', 'nodes', 'hardware'],
      timezone: 'browser',
      schemaVersion: 39,
      refresh: '30s',
      time: { from: 'now-6h', to: 'now' },
      panels: [
        timeSeriesPanel({
          id: 1,
          title: 'Node CPU Usage %',
          unit: 'percent',
          gridPos: { h: 8, w: 12, x: 0, y: 0 },
          targets: [
            {
              expr:
                '100 - (avg by (instance, underpost_role) ' + '(rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100)',
              legendFormat: NODE_LEGEND,
            },
          ],
        }),
        timeSeriesPanel({
          id: 2,
          title: 'Node Memory Usage %',
          unit: 'percent',
          gridPos: { h: 8, w: 12, x: 12, y: 0 },
          targets: [
            {
              expr: '100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))',
              legendFormat: NODE_LEGEND,
            },
          ],
        }),
        timeSeriesPanel({
          id: 3,
          title: 'Network Throughput (RX/TX)',
          unit: 'binBps',
          gridPos: { h: 8, w: 12, x: 0, y: 8 },
          targets: [
            {
              expr: `rate(node_network_receive_bytes_total{${networkDeviceSelector}}[2m])`,
              legendFormat: `${NODE_LEGEND} {{device}} rx`,
            },
            {
              expr: `rate(node_network_transmit_bytes_total{${networkDeviceSelector}}[2m])`,
              legendFormat: `${NODE_LEGEND} {{device}} tx`,
            },
          ],
        }),
        timeSeriesPanel({
          id: 4,
          title: 'Disk Usage % & I/O Rates',
          unit: 'percent',
          gridPos: { h: 8, w: 12, x: 12, y: 8 },
          overrides: [secondaryAxisOverride('B', 'binBps'), secondaryAxisOverride('C', 'binBps')],
          targets: [
            {
              expr:
                '100 - ((node_filesystem_avail_bytes{mountpoint="/"} * 100) / ' +
                'node_filesystem_size_bytes{mountpoint="/"})',
              legendFormat: `${NODE_LEGEND} used %`,
            },
            { expr: 'rate(node_disk_read_bytes_total[2m])', legendFormat: `${NODE_LEGEND} {{device}} read` },
            { expr: 'rate(node_disk_written_bytes_total[2m])', legendFormat: `${NODE_LEGEND} {{device}} write` },
          ],
        }),
        timeSeriesPanel({
          id: 5,
          title: 'Vultr Hub Monthly Bandwidth Usage',
          unit: 'percent',
          gridPos: { h: 6, w: 24, x: 0, y: 16 },
          targets: [
            {
              expr: '(vultr_bandwidth_used_bytes / vultr_bandwidth_limit_bytes) * 100',
              legendFormat: 'Hub Bandwidth Usage % (hub)',
            },
          ],
        }),
      ],
    },
    null,
    2,
  )}\n`;
};

/**
 * @method monitoringConfigFactory
 * @description Renders the namespace-dependent half of the stack: the RBAC that
 * lets Prometheus discover pods, and every ConfigMap the four components mount.
 *
 * Configuration is generated and workloads are not: the Deployments in
 * `manifests/` describe processes that do not change, while these documents are
 * a projection of the live deploy configuration and event registry. Applying
 * them is what makes a newly added host or event visible to the stack. The RBAC
 * belongs here rather than in the file because a ClusterRoleBinding names its
 * ServiceAccount's namespace in the document body, where `kubectl -n` does not
 * reach.
 * @param {object} params
 * @param {string} [params.namespace] - Namespace to render into.
 * @param {string} params.prometheusConf - Rendered `prometheus.yml`.
 * @param {string} params.alertRules - Rendered rules file.
 * @param {string} params.alertmanagerConf - Rendered `alertmanager.yml`.
 * @param {string} params.blackboxConf - Rendered `blackbox.yml`.
 * @returns {string} Multi-document YAML.
 * @memberof UnderpostMonitoring
 */
const monitoringConfigFactory = ({
  namespace = 'default',
  prometheusConf,
  alertRules,
  alertmanagerConf,
  blackboxConf,
} = {}) => {
  const { prometheus, alertmanager, blackbox, grafana } = UNDERPOST_MONITORING;
  return `${nodeExporterManifestFactory({ namespace })}
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${prometheus.name}
  namespace: ${namespace}
  labels:
    app: ${prometheus.name}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ${prometheus.name}
  labels:
    app: ${prometheus.name}
rules:
  - apiGroups: ['']
    resources: ['nodes', 'nodes/metrics', 'services', 'endpoints', 'pods']
    verbs: ['get', 'list', 'watch']
  - nonResourceURLs: ['/metrics']
    verbs: ['get']
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${prometheus.name}
  labels:
    app: ${prometheus.name}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ${prometheus.name}
subjects:
  - kind: ServiceAccount
    name: ${prometheus.name}
    namespace: ${namespace}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${prometheus.configMapName}
  namespace: ${namespace}
  labels:
    app: ${prometheus.name}
data:
  prometheus.yml: |
${indentBlock(prometheusConf, 4)}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${prometheus.rulesConfigMapName}
  namespace: ${namespace}
  labels:
    app: ${prometheus.name}
data:
  underpost-events.yml: |
${indentBlock(alertRules, 4)}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${alertmanager.configMapName}
  namespace: ${namespace}
  labels:
    app: ${alertmanager.name}
data:
  alertmanager.yml: |
${indentBlock(alertmanagerConf, 4)}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${blackbox.configMapName}
  namespace: ${namespace}
  labels:
    app: ${blackbox.name}
data:
  blackbox.yml: |
${indentBlock(blackboxConf, 4)}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${grafana.datasourcesConfigMapName}
  namespace: ${namespace}
  labels:
    app: ${grafana.name}
data:
  underpost.yaml: |
${indentBlock(grafanaDatasourcesFactory({ namespace }), 4)}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${grafana.dashboardProviderConfigMapName}
  namespace: ${namespace}
  labels:
    app: ${grafana.name}
data:
  underpost.yaml: |
${indentBlock(grafanaDashboardProviderFactory(), 4)}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${grafana.dashboardsConfigMapName}
  namespace: ${namespace}
  labels:
    app: ${grafana.name}
data:
  underpost-envoy.json: |
${indentBlock(envoyDashboardFactory(), 4)}
  underpost-events.json: |
${indentBlock(eventsDashboardFactory(), 4)}
  underpost-node-metrics.json: |
${indentBlock(nodeMetricsDashboardFactory(), 4)}
`;
};

/**
 * @method webhookSecretFactory
 * @description Renders the Secret holding the bearer token Alertmanager
 * presents to the dispatcher.
 *
 * A Secret rather than a field in the Alertmanager ConfigMap: the same token
 * authorizes anything that can reach the receiver to trigger remediation on the
 * hub, so it must not sit in a document `kubectl get -o yaml` prints in full.
 * @param {object} params
 * @param {string} params.token - Shared bearer token.
 * @param {string} [params.namespace] - Namespace to render into.
 * @returns {string} Secret YAML.
 * @memberof UnderpostMonitoring
 */
const webhookSecretFactory = ({ token, namespace = 'default' } = {}) => {
  const { alertmanager } = UNDERPOST_MONITORING;
  return `
---
apiVersion: v1
kind: Secret
metadata:
  name: ${alertmanager.secretName}
  namespace: ${namespace}
  labels:
    app: ${alertmanager.name}
type: Opaque
data:
  ${alertmanager.tokenKey}: ${Buffer.from(`${token}`, 'utf8').toString('base64')}
`;
};

export {
  UNDERPOST_MONITORING,
  alertRulesFactory,
  alertmanagerConfFactory,
  appScrapeEntriesFactory,
  blackboxConfFactory,
  deployedEventIdsFactory,
  envoyDashboardFactory,
  eventsDashboardFactory,
  nodeExporterManifestFactory,
  nodeExporterServiceFactory,
  nodeExporterServiceScriptFactory,
  nodeMetricsDashboardFactory,
  grafanaAdminSecretFactory,
  grafanaDeploymentFactory,
  grafanaDeploymentPatchFactory,
  grafanaDashboardProviderFactory,
  grafanaExposureFactory,
  grafanaNodePortFactory,
  grafanaResetPlanFactory,
  grafanaStorageResetRequiredFactory,
  grafanaDatasourcesFactory,
  metricsPathFactory,
  monitoringConfigFactory,
  probeGroupsFactory,
  prometheusConfFactory,
  scrapeDeployListFactory,
  serviceDnsFactory,
  webhookSecretFactory,
};
