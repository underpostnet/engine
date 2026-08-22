'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  UNDERPOST_MONITORING,
  alertRulesFactory,
  deployedEventIdsFactory,
  alertmanagerConfFactory,
  appScrapeEntriesFactory,
  blackboxConfFactory,
  envoyDashboardFactory,
  eventsDashboardFactory,
  grafanaAdminSecretFactory,
  grafanaDeploymentFactory,
  grafanaDeploymentPatchFactory,
  grafanaExposureFactory,
  grafanaNodePortFactory,
  grafanaResetPlanFactory,
  grafanaStorageResetRequiredFactory,
  metricsPathFactory,
  monitoringConfigFactory,
  probeGroupsFactory,
  prometheusConfFactory,
  scrapeDeployListFactory,
  serviceDnsFactory,
  webhookSecretFactory,
} from '../src/server/monitoring.js';
import { hubTunnelAddressFactory } from '../src/cli/wireguard.js';

// A deploy that mixes every runtime shape the router can carry: two scrapeable
// Express paths, one non-Express runtime, and one redirect-only entry.
const CONF_SERVER = {
  'www.example.com': {
    '/': { runtime: 'nodejs' },
    '/api': { runtime: 'nodejs' },
    '/legacy': { runtime: 'lampp' },
  },
  'old.example.com': {
    '/': { runtime: 'nodejs', redirect: 'https://www.example.com' },
  },
};

const PROBES = [
  { eventId: 'wireguard-server-down', module: 'icmp', targets: ['10.0.0.1'], labels: { underpost_role: 'hub' } },
  {
    eventId: 'wireguard-spoke-down',
    module: 'icmp',
    targets: ['10.0.0.2'],
    labels: { underpost_role: 'spoke', underpost_spoke: 'node-a' },
  },
  {
    eventId: 'wireguard-spoke-down',
    module: 'icmp',
    targets: ['10.0.0.3'],
    labels: { underpost_role: 'spoke', underpost_spoke: 'node-b' },
  },
  { eventId: 'other-down', module: 'tcp_connect', targets: ['1.2.3.4:443'] },
];

const docs = (yaml) => yaml.split('\n---\n').filter((doc) => doc.trim());
const kind = (yaml, name) => docs(yaml).find((doc) => doc.includes(`\nkind: ${name}\n`));
const configMap = (yaml, name) => docs(yaml).find((doc) => doc.includes(`  name: ${name}\n`));

describe('metricsPathFactory', () => {
  it('mounts the root runtime at /metrics and a sub-path under its own prefix', () => {
    expect(metricsPathFactory('/')).to.equal('/metrics');
    expect(metricsPathFactory('/api')).to.equal('/api/metrics');
    expect(metricsPathFactory()).to.equal('/metrics');
  });
});

describe('appScrapeEntriesFactory', () => {
  it('selects only the Express runtimes that actually serve a registry', () => {
    const entries = appScrapeEntriesFactory(CONF_SERVER);
    expect(entries).to.deep.equal([
      { host: 'www.example.com', metricsPath: '/metrics', scheme: 'https' },
      { host: 'www.example.com', metricsPath: '/api/metrics', scheme: 'https' },
    ]);
  });

  it('scrapes over http in development', () => {
    expect(appScrapeEntriesFactory(CONF_SERVER, { scheme: 'http' }).every((e) => e.scheme === 'http')).to.equal(true);
  });

  it('treats an empty configuration as no targets', () => {
    expect(appScrapeEntriesFactory({})).to.deep.equal([]);
    expect(appScrapeEntriesFactory()).to.deep.equal([]);
  });
});

describe('scrapeDeployListFactory', () => {
  const routers = { cronDeployId: 'dd-cron', routerDeployIds: ['dd-core', 'dd-cyberia'] };

  it('defaults to the cron deploy plus the router deploys, the set loadCronDeployEnv loads', () => {
    expect(scrapeDeployListFactory(routers)).to.deep.equal(['dd-cron', 'dd-core', 'dd-cyberia']);
  });

  it('treats the dd meta id the same as no id at all', () => {
    expect(scrapeDeployListFactory({ ...routers, deployId: 'dd' })).to.deep.equal(scrapeDeployListFactory(routers));
    // `dd` means "everything", so it wins over any id listed beside it.
    expect(scrapeDeployListFactory({ ...routers, deployId: 'dd,dd-other' })).to.deep.equal(
      scrapeDeployListFactory(routers),
    );
  });

  it('narrows to an explicit id or list without re-adding the defaults', () => {
    expect(scrapeDeployListFactory({ ...routers, deployId: 'dd-cyberia' })).to.deep.equal(['dd-cyberia']);
    expect(scrapeDeployListFactory({ ...routers, deployId: 'dd-core, dd-test' })).to.deep.equal(['dd-core', 'dd-test']);
  });

  it('never scrapes one deploy twice when the cron deploy is also in the router', () => {
    expect(scrapeDeployListFactory({ cronDeployId: 'dd-core', routerDeployIds: ['dd-core', 'dd-core'] })).to.deep.equal(
      ['dd-core'],
    );
  });

  it('resolves to nothing rather than guessing when neither router file has content', () => {
    expect(scrapeDeployListFactory({})).to.deep.equal([]);
    expect(scrapeDeployListFactory()).to.deep.equal([]);
  });
});

describe('probeGroupsFactory', () => {
  it('groups probes by module so one job serves every event probing that way', () => {
    const groups = probeGroupsFactory(PROBES);
    expect(groups.map((group) => group.module)).to.deep.equal(['icmp', 'tcp_connect']);
    expect(groups[0].groups).to.have.length(3);
  });

  it('keeps each probe its own labelled group, so a fan-out event names its subject', () => {
    const [icmp] = probeGroupsFactory(PROBES);
    expect(icmp.groups.map((group) => group.labels)).to.deep.equal([
      { underpost_event: 'wireguard-server-down', underpost_role: 'hub' },
      { underpost_event: 'wireguard-spoke-down', underpost_role: 'spoke', underpost_spoke: 'node-a' },
      { underpost_event: 'wireguard-spoke-down', underpost_role: 'spoke', underpost_spoke: 'node-b' },
    ]);
  });

  it('always labels a probe with its event, even when it carries no labels of its own', () => {
    const [group] = probeGroupsFactory([{ eventId: 'solo', module: 'icmp', targets: ['1.1.1.1'] }]);
    expect(group.groups[0].labels).to.deep.equal({ underpost_event: 'solo' });
  });

  it('drops probes that carry no target, module, or event', () => {
    expect(
      probeGroupsFactory([
        { eventId: 'a', module: 'icmp', targets: [] },
        { eventId: '', module: 'icmp', targets: ['1.1.1.1'] },
        { eventId: 'a', module: '', targets: ['1.1.1.1'] },
      ]),
    ).to.deep.equal([]);
  });
});

describe('prometheusConfFactory', () => {
  const conf = prometheusConfFactory({
    appTargets: appScrapeEntriesFactory(CONF_SERVER),
    extraTargets: ['127.0.0.1:9100'],
    probes: PROBES,
    namespace: 'obs',
  });

  it('gives each distinct metrics path its own job', () => {
    expect(conf).to.include("job_name: 'underpost-express'");
    expect(conf).to.include("job_name: 'underpost-express-1'");
    expect(conf).to.include('metrics_path: /api/metrics');
  });

  it('discovers the Envoy data plane instead of naming its generated Deployment', () => {
    expect(conf).to.include('kubernetes_sd_configs');
    expect(conf).to.include(`names: ['${UNDERPOST_MONITORING.envoy.namespace}']`);
    expect(conf).to.include(`replacement: '$1:${UNDERPOST_MONITORING.envoy.metricsPort}'`);
    expect(conf).to.include(`metrics_path: ${UNDERPOST_MONITORING.envoy.metricsPath}`);
  });

  it('labels every probe target with the event whose rule selects on it', () => {
    expect(conf).to.include("underpost_event: 'wireguard-server-down'");
    expect(conf).to.include("underpost_event: 'other-down'");
  });

  it('carries the spoke id into the scrape config, so the alert can name it', () => {
    expect(conf).to.include("underpost_spoke: 'node-a'");
    expect(conf).to.include("underpost_spoke: 'node-b'");
  });

  it('addresses the exporter and Alertmanager by namespace-qualified name', () => {
    expect(conf).to.include(
      serviceDnsFactory(UNDERPOST_MONITORING.blackbox.name, UNDERPOST_MONITORING.blackbox.port, 'obs'),
    );
    expect(conf).to.include(
      serviceDnsFactory(UNDERPOST_MONITORING.alertmanager.name, UNDERPOST_MONITORING.alertmanager.port, 'obs'),
    );
  });

  it('omits the extra-target job when nothing extra is requested', () => {
    expect(prometheusConfFactory({})).to.not.include('underpost-extra');
  });
});

describe('alertRulesFactory', () => {
  const events = [
    {
      id: 'wireguard-server-down',
      description: 'hub down',
      alert: { name: 'UnderpostWireguardServerDown', expr: 'probe_success == 0', for: '2m' },
    },
    {
      id: 'wireguard-spoke-down',
      description: 'spoke down',
      alert: {
        name: 'UnderpostWireguardSpokeDown',
        expr: 'probe_success == 0',
        for: '2m',
        summary: 'spoke {{ $labels.underpost_spoke }} unreachable',
      },
    },
    { id: 'no-rule', description: 'nothing to alert on' },
  ];

  it('emits a rule per event that defines one, always labelled with its event id', () => {
    const rules = alertRulesFactory(events);
    expect(rules).to.include('alert: UnderpostWireguardServerDown');
    expect(rules).to.include('alert: UnderpostWireguardSpokeDown');
    expect(rules).to.include("underpost_event: 'wireguard-server-down'");
    expect(rules).to.include("underpost_event: 'wireguard-spoke-down'");
    expect(rules).to.include('severity: critical');
    expect(rules).to.not.include('no-rule');
  });

  it('keeps the subject label template in the summary, so a spoke alert names the spoke', () => {
    expect(alertRulesFactory(events)).to.include('{{ $labels.underpost_spoke }}');
  });

  it('skips an event whose alert window the contract never declared', () => {
    const rules = alertRulesFactory([{ id: 'undeclared', alert: { name: 'UnderpostUndeclared', expr: 'up == 0' } }]);
    expect(rules).to.not.include('UnderpostUndeclared');
    expect(rules).to.not.include('for: 2m');
  });

  it('renders an empty rule list rather than invalid YAML', () => {
    expect(alertRulesFactory([])).to.include('rules:\n      []');
  });
});

describe('alertmanagerConfFactory', () => {
  const conf = alertmanagerConfFactory({ webhookUrl: 'http://10.0.0.5:9099/event' });

  it('groups by subject as well as by event, so one webhook covers one spoke', () => {
    expect(conf).to.include("group_by: ['alertname', 'underpost_event', 'underpost_spoke']");
  });

  it('routes only labelled alerts to the dispatcher and everything else nowhere', () => {
    expect(conf).to.include('underpost_event =~ ".+"');
    expect(conf).to.include("receiver: 'underpost-null'");
    expect(conf).to.include("url: 'http://10.0.0.5:9099/event'");
  });

  it('never delivers a resolution notice, which would re-run remediation', () => {
    expect(conf).to.include('send_resolved: false');
  });

  it('always presents the mounted bearer token', () => {
    expect(conf).to.include(`credentials_file: /etc/alertmanager/secret/${UNDERPOST_MONITORING.alertmanager.tokenKey}`);
  });
});

describe('blackboxConfFactory', () => {
  it('defines exactly the modules the probes name', () => {
    const conf = blackboxConfFactory();
    for (const module of ['http_2xx', 'tcp_connect', 'icmp']) expect(conf).to.include(`${module}:`);
  });
});

describe('monitoringConfigFactory', () => {
  const yaml = monitoringConfigFactory({
    namespace: 'obs',
    prometheusConf: 'global:\n  scrape_interval: 30s\n',
    alertRules: 'groups: []\n',
    alertmanagerConf: 'route:\n  receiver: x\n',
    blackboxConf: 'modules: {}\n',
  });

  it('binds the pod-discovery ClusterRoleBinding to the namespace it renders into', () => {
    const binding = kind(yaml, 'ClusterRoleBinding');
    expect(binding).to.include('namespace: obs');
    expect(binding).to.include(`name: ${UNDERPOST_MONITORING.prometheus.name}`);
  });

  it('emits every ConfigMap the four components mount', () => {
    for (const name of [
      UNDERPOST_MONITORING.prometheus.configMapName,
      UNDERPOST_MONITORING.prometheus.rulesConfigMapName,
      UNDERPOST_MONITORING.alertmanager.configMapName,
      UNDERPOST_MONITORING.blackbox.configMapName,
      UNDERPOST_MONITORING.grafana.datasourcesConfigMapName,
      UNDERPOST_MONITORING.grafana.dashboardProviderConfigMapName,
      UNDERPOST_MONITORING.grafana.dashboardsConfigMapName,
    ])
      expect(configMap(yaml, name), name).to.be.a('string');
  });

  it('indents each embedded file under its block scalar', () => {
    expect(configMap(yaml, UNDERPOST_MONITORING.prometheus.configMapName)).to.include(
      '  prometheus.yml: |\n    global:\n      scrape_interval: 30s',
    );
  });

  it('points the provisioned datasource at Prometheus in the same namespace', () => {
    expect(configMap(yaml, UNDERPOST_MONITORING.grafana.datasourcesConfigMapName)).to.include(
      serviceDnsFactory(UNDERPOST_MONITORING.prometheus.name, UNDERPOST_MONITORING.prometheus.port, 'obs'),
    );
  });

  it('never renders Grafana administrator credentials into a ConfigMap', () => {
    expect(yaml).to.not.include('GF_SECURITY_ADMIN_PASSWORD');
    expect(yaml).to.not.include('admin-password');
  });
});

describe('grafanaAdminSecretFactory', () => {
  it('renders credentials only as Secret data', () => {
    const secret = grafanaAdminSecretFactory({ username: 'operator', password: 'S3cret!', namespace: 'obs' });
    expect(secret).to.include('kind: Secret');
    expect(secret).to.include('name: grafana-admin');
    expect(secret).to.include(`admin-user: ${Buffer.from('operator').toString('base64')}`);
    expect(secret).to.include(`admin-password: ${Buffer.from('S3cret!').toString('base64')}`);
    expect(secret).to.not.include('S3cret!');
  });
});

describe('webhookSecretFactory', () => {
  it('base64-encodes the token under the key Alertmanager reads as a file', () => {
    const secret = webhookSecretFactory({ token: 'shhh', namespace: 'obs' });
    expect(secret).to.include(
      `${UNDERPOST_MONITORING.alertmanager.tokenKey}: ${Buffer.from('shhh').toString('base64')}`,
    );
    expect(secret).to.include('namespace: obs');
  });
});

describe('grafanaExposureFactory', () => {
  it('serves from the sub-path behind the edge, keeping the prefix in the root URL', () => {
    // With serve_from_sub_path Grafana expects to receive /grafana, so the route
    // must not rewrite it away.
    expect(grafanaExposureFactory({ host: 'www.example.com' })).to.deep.equal({
      rootUrl: 'https://www.example.com/grafana/',
      subPath: true,
      url: 'https://www.example.com/grafana',
    });
  });

  it('owns the whole origin on a NodePort, so it serves from the root', () => {
    expect(grafanaExposureFactory({ nodeIp: '192.168.1.85', nodePort: 32300 })).to.deep.equal({
      rootUrl: 'http://192.168.1.85:32300/',
      subPath: false,
      url: 'http://192.168.1.85:32300',
    });
  });

  it('prefers the edge host when both exposures are published', () => {
    const exposure = grafanaExposureFactory({ host: 'www.example.com', nodeIp: '192.168.1.85' });
    expect(exposure.subPath).to.equal(true);
    expect(exposure.url).to.equal('https://www.example.com/grafana');
  });

  it('falls back to the port-forward origin when nothing is published', () => {
    expect(grafanaExposureFactory({})).to.deep.equal({
      rootUrl: 'http://localhost:3000/',
      subPath: false,
      url: 'http://localhost:3000',
    });
  });
});

describe('grafana rollout constraints', () => {
  it('rolls Grafana with Recreate so one process owns its data directory', () => {
    const deployment = fs.readFileSync('./manifests/grafana/deployment.yaml', 'utf8');
    const pvc = fs.readFileSync('./manifests/grafana/pvc.yaml', 'utf8');
    expect(pvc).to.include('ReadWriteOnce');
    expect(deployment).to.include('strategy:');
    expect(deployment).to.include('type: Recreate');
  });

  it('keeps the URL model out of the manifest, so the exposure owns it', () => {
    const deployment = fs.readFileSync('./manifests/grafana/deployment.yaml', 'utf8');
    expect(deployment).to.not.include('GF_SERVER_ROOT_URL:');
    expect(deployment).to.not.include('GF_SERVER_SERVE_FROM_SUB_PATH:');
  });

  it('publishes browser access separately from the datasource Service', () => {
    expect(fs.readFileSync('./manifests/grafana/service.yaml', 'utf8')).to.include('type: ClusterIP');
  });

  it('resets the persisted admin through stdin against Grafana container paths', () => {
    const monitor = fs.readFileSync('./src/cli/monitor.js', 'utf8');
    expect(monitor).to.include('admin reset-admin-password --password-from-stdin');
    expect(monitor).to.include('GF_PATHS_CONFIG:-/etc/grafana/grafana.ini');
    expect(monitor).to.include('GF_PATHS_DATA:-/var/lib/grafana');
  });
});

describe('grafanaDeploymentFactory', () => {
  const deployment = {
    metadata: { name: 'grafana' },
    spec: {
      template: {
        spec: {
          containers: [{ name: 'grafana', env: [{ name: 'GF_SECURITY_ADMIN_USER', value: 'operator' }] }],
        },
      },
    },
  };
  const exposure = { rootUrl: 'http://192.168.1.85:32300/', subPath: false };

  it('places Grafana and configures its origin before the Deployment is applied', () => {
    const rendered = grafanaDeploymentFactory({
      deployment,
      exposure,
      namespace: 'obs',
      nodeName: 'node-a',
      adminSecretVersion: '42',
    });
    expect(rendered.metadata.namespace).to.equal('obs');
    expect(rendered.spec.template.spec.nodeSelector).to.deep.equal({ 'kubernetes.io/hostname': 'node-a' });
    expect(rendered.spec.template.spec.containers[0].env).to.deep.equal([
      {
        name: 'GF_SECURITY_ADMIN_USER',
        valueFrom: { secretKeyRef: { name: 'grafana-admin', key: 'admin-user' } },
      },
      {
        name: 'GF_SECURITY_ADMIN_PASSWORD',
        valueFrom: { secretKeyRef: { name: 'grafana-admin', key: 'admin-password' } },
      },
      { name: 'GF_SERVER_ROOT_URL', value: exposure.rootUrl },
      { name: 'GF_SERVER_SERVE_FROM_SUB_PATH', value: 'false' },
    ]);
    expect(rendered.spec.template.spec.containers[0].env.map(({ name }) => name)).to.not.include(
      'GF_SECURITY_ADMIN_EMAIL',
    );
    expect(rendered.spec.template.metadata.annotations).to.deep.equal({
      'underpost.net/grafana-admin-secret-version': '42',
    });
    expect(deployment.metadata).to.not.have.property('namespace');
  });

  it('uses the same runtime fields when republishing an existing Deployment', () => {
    const patch = grafanaDeploymentPatchFactory({ exposure, nodeName: 'node-a' });
    expect(patch.spec.template.spec.nodeSelector).to.deep.equal({ 'kubernetes.io/hostname': 'node-a' });
    expect(patch.spec.template.spec.containers[0].env).to.deep.equal([
      { name: 'GF_SERVER_ROOT_URL', value: exposure.rootUrl },
      { name: 'GF_SERVER_SERVE_FROM_SUB_PATH', value: 'false' },
    ]);
  });

  it('adds Secret references and its rollout version during credential convergence', () => {
    const patch = grafanaDeploymentPatchFactory({ exposure, adminSecretVersion: '43' });
    expect(patch.spec.template.metadata.annotations).to.deep.equal({
      'underpost.net/grafana-admin-secret-version': '43',
    });
    expect(patch.spec.template.spec.containers[0].env.slice(0, 2)).to.deep.equal(
      grafanaDeploymentFactory({ deployment, exposure }).spec.template.spec.containers[0].env.slice(0, 2),
    );
  });
});

describe('grafanaStorageResetRequiredFactory', () => {
  it('does not reset storage before the PVC is bound', () => {
    expect(grafanaStorageResetRequiredFactory({ nodeName: 'control', volumeNodes: [] })).to.equal(false);
  });

  it('does not reset storage without an explicit destination node', () => {
    expect(grafanaStorageResetRequiredFactory({ volumeNodes: ['worker'] })).to.equal(false);
  });

  it('resets storage when the requested node differs from its owner', () => {
    expect(grafanaStorageResetRequiredFactory({ nodeName: 'control', volumeNodes: ['worker'] })).to.equal(true);
  });

  it('preserves storage already bound to the requested node', () => {
    expect(grafanaStorageResetRequiredFactory({ nodeName: 'worker', volumeNodes: ['worker'] })).to.equal(false);
  });
});

describe('grafanaResetPlanFactory', () => {
  it('covers every workload, exposure, and storage resource owned by Grafana', () => {
    expect(grafanaResetPlanFactory('pvc-volume')).to.deep.equal({
      controllers: ['deployment/grafana', 'statefulset/grafana'],
      resources: ['service/grafana', 'service/grafana-nodeport', 'httproute/grafana-route'],
      claim: 'pvc/grafana-pvc',
      volumeName: 'pvc-volume',
    });
  });
});

describe('grafanaNodePortFactory', () => {
  it('publishes a second Service, leaving the ClusterIP the datasource resolves intact', () => {
    const yaml = grafanaNodePortFactory({ namespace: 'obs' });
    expect(yaml).to.include(`name: ${UNDERPOST_MONITORING.grafana.nodePortName}`);
    expect(yaml).to.include('type: NodePort');
    expect(yaml).to.include(`nodePort: ${UNDERPOST_MONITORING.grafana.nodePort}`);
    expect(yaml).to.include('namespace: obs');
    expect(yaml).to.include(`app: ${UNDERPOST_MONITORING.grafana.name}`);
  });
});

describe('grafana dashboards', () => {
  it('reads Envoy 5xx from the labelled response-class family Envoy actually exposes', () => {
    const dashboard = JSON.parse(envoyDashboardFactory());
    const expressions = dashboard.panels.flatMap((panel) => panel.targets.map((target) => target.expr));
    expect(expressions.some((expr) => expr.includes('envoy_response_code_class="5"'))).to.equal(true);
    for (const metric of [
      'envoy_http_downstream_rq_completed',
      'envoy_http_downstream_cx_active',
      'envoy_server_memory_allocated',
      'envoy_server_uptime',
      'envoy_http_downstream_cx_rx_bytes_total',
      'envoy_http_downstream_cx_tx_bytes_total',
    ])
      expect(
        expressions.some((expr) => expr.includes(metric)),
        metric,
      ).to.equal(true);
  });

  it('produces dashboards Grafana can provision', () => {
    for (const dashboard of [envoyDashboardFactory(), eventsDashboardFactory()]) {
      const parsed = JSON.parse(dashboard);
      expect(parsed.uid).to.be.a('string');
      expect(parsed.panels.length).to.be.greaterThan(0);
      for (const panel of parsed.panels) expect(panel.datasource.uid).to.equal('underpost-prometheus');
    }
  });
});

describe('hubTunnelAddressFactory', () => {
  it('reads the hub address straight from topology on the hub itself', () => {
    expect(hubTunnelAddressFactory({ role: 'hub', address: '10.0.0.1/24' })).to.equal('10.0.0.1');
  });

  it("derives the hub as the tunnel network's first host on a spoke", () => {
    expect(hubTunnelAddressFactory({ role: 'control', address: '10.8.0.5/24' })).to.equal('10.8.0.1');
    expect(hubTunnelAddressFactory({ role: 'worker', address: '10.0.0.7' })).to.equal('10.0.0.1');
  });

  it('yields nothing when the network holds no separate hub host', () => {
    expect(hubTunnelAddressFactory({ role: 'control', address: '10.0.0.9/32' })).to.equal('');
  });
});

describe('deployedEventIdsFactory', () => {
  it('reads event ids back out of a rendered scrape config', () => {
    expect(
      deployedEventIdsFactory("        labels:\n          underpost_event: 'public-ingress-down'\n"),
    ).to.deep.equal(['public-ingress-down']);
  });

  it('reads them out of a rendered rule expression too', () => {
    expect(deployedEventIdsFactory('expr: probe_success{underpost_event="wireguard-spoke-down"} == 0')).to.deep.equal([
      'wireguard-spoke-down',
    ]);
  });

  it('ignores the Alertmanager catch-all matcher', () => {
    expect(deployedEventIdsFactory('- underpost_event =~ ".+"')).to.deep.equal([]);
  });

  it('reports one distinct sorted set across documents', () => {
    expect(
      deployedEventIdsFactory("underpost_event: 'b-event'", "underpost_event: 'a-event'", "underpost_event: 'b-event'"),
    ).to.deep.equal(['a-event', 'b-event']);
  });

  it('reports nothing when the stack is absent', () => {
    expect(deployedEventIdsFactory('', undefined)).to.deep.equal([]);
  });
});

describe('event webhook host', () => {
  it('resolves the control plane, not whichever node the API server lists first', () => {
    const source = fs.readFileSync(new URL('../src/cli/monitor.js', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('nodeInternalIp(nodeName = '));
    const method = body.slice(0, body.indexOf('\n    },'));
    expect(method).to.include('node-role.kubernetes.io/control-plane');
    expect(method).to.not.match(/kubectl get nodes -o jsonpath/);
  });
});

describe('envoy scrape hygiene', () => {
  const conf = prometheusConfFactory({});
  const job = conf.slice(conf.indexOf("job_name: 'envoy-gateway'"), conf.indexOf("job_name: 'underpost"));

  it('drops the family Envoy emits with colliding labels', () => {
    expect(job).to.include('metric_relabel_configs:');
    expect(job).to.include('regex: envoy_cluster_total_match_count');
    expect(job).to.include('action: drop');
  });

  it('keeps every series the dashboards actually read', () => {
    for (const metric of [
      'envoy_server_uptime',
      'envoy_http_downstream_cx_active',
      'envoy_http_downstream_rq_completed',
      'envoy_http_downstream_rq_xx',
    ])
      expect(job, metric).to.not.include(metric);
  });
});
