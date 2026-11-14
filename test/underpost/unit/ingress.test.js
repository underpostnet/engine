// The routing of the deployments: which deployment declares each host, the routing object that serves it, and the
// stale routing a deployment leaves where it no longer runs. Every file lives in a scratch checkout, and the shell
// harness answers each kubectl call: no real cluster is reached.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import Underpost from '../../../src/index.js';
import { providerTransition, routingPlan, servedHostsOf } from '../../../src/cli/ingress.js';
import {
  controllerItem,
  gatewayItem,
  kubeCluster,
  namespaceItem,
  owned,
  policyItem,
  routeItem,
} from '../../support/kube-cluster.js';
import { shellHarness } from '../../support/shell-harness.js';

// The host that runs the suite is never a container: a case stubs KUBERNETES_SERVICE_HOST to run in a pod.
vi.mock('../../../src/server/runtime/environment.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isOciRuntime: () => !!process.env.KUBERNETES_SERVICE_HOST,
}));

const CONF = './engine-private/deploy/conf.cluster.json';
const WORKLOADS = 'underpost-workloads';
const LAMPP = owned('dd-lampp-production');

const deployment = (name, namespace, label) =>
  controllerItem('Deployment', name, namespace, {
    labels: { 'deploy-id': label },
    spec: { replicas: 1, template: { metadata: { labels: { app: name } }, spec: { containers: [] } } },
    status: { readyReplicas: 1 },
  });

const declare = (deployId, hosts, instances = []) => {
  fs.outputJsonSync(
    `./engine-private/conf/${deployId}/conf.server.json`,
    Object.fromEntries(hosts.map((host) => [host, { '/': {} }])),
  );
  if (instances.length) fs.outputJsonSync(`./engine-private/conf/${deployId}/conf.instances.json`, instances);
};

let cwd;
let scratch;
let harness;

beforeEach(() => {
  cwd = process.cwd();
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-ingress-'));
  process.chdir(scratch);
  fs.outputJsonSync(CONF, {
    environments: {
      production: {
        context: 'underpost-production',
        profile: 'recommended',
        routing: { provider: 'gateway-api' },
        tls: { mode: 'cert-manager', issuer: 'letsencrypt-prod' },
      },
    },
  });
  fs.outputFileSync('./engine-private/deploy/dd.routes', 'dd-lampp,dd-core,dd-shop');
  declare('dd-lampp', ['www.lampp.test', 'lampp.test']);
  declare('dd-core', ['core.test'], [{ id: 'mmo-client', host: 'client.core.test', path: '/' }]);
  declare('dd-shop', ['shop.test', 'core.test']);
});

afterEach(() => {
  harness?.restore();
  harness = undefined;
  process.chdir(cwd);
  fs.removeSync(scratch);
});

/** A cluster where dd-lampp runs in underpost-workloads and left its labeled Gateway, a route and a policy in default. */
const cluster = () => {
  harness = kubeCluster({
    contexts: 'underpost-production\n',
    namespaces: [namespaceItem('default'), namespaceItem(WORKLOADS, { owned: true })],
    crds: [
      'gateways.gateway.networking.k8s.io',
      'httproutes.gateway.networking.k8s.io',
      'clienttrafficpolicies.gateway.envoyproxy.io',
    ],
    controllers: [
      deployment('dd-lampp-production-green', WORKLOADS, 'dd-lampp-production'),
      deployment('dd-core-production-blue', 'default', 'dd-core-production'),
    ],
    gateways: [
      gatewayItem('dd-lampp-production', 'default', { hosts: ['www.lampp.test'], labels: LAMPP }),
      gatewayItem('dd-lampp-production', WORKLOADS, {
        hosts: ['www.lampp.test', 'lampp.test'],
        labels: LAMPP,
        status: { Accepted: ['True'], Programmed: ['True'] },
      }),
      gatewayItem('dd-core-production', 'default', { hosts: ['core.test'], labels: owned('dd-core-production') }),
    ],
    routes: [
      routeItem('www.lampp.test', 'default', {
        gateway: 'dd-lampp-production',
        hosts: ['www.lampp.test'],
        labels: LAMPP,
      }),
      routeItem('www.lampp.test', WORKLOADS, {
        gateway: 'dd-lampp-production',
        hosts: ['www.lampp.test'],
        labels: LAMPP,
      }),
      routeItem('core.test', 'default', { gateway: 'dd-core-production', hosts: ['core.test'] }),
    ],
    policies: [policyItem('dd-lampp-production-http3', 'default', { gateway: 'dd-lampp-production', labels: LAMPP })],
  });
};

const ids = (items) => items.map(({ kind, metadata }) => `${kind}/${metadata.namespace}/${metadata.name}`).sort();

describe('the hosts of the deployments', () => {
  it('lists each host a deployment declares: its server, www and redirect hosts, and its instance hosts', () => {
    expect(Underpost.ingress.select({ deployIds: ['dd-core'] })).toEqual([
      { host: 'core.test', deployId: 'dd-core' },
      { host: 'client.core.test', deployId: 'dd-core' },
    ]);
    expect(Underpost.ingress.select({ deployIds: ['dd-lampp'] }).map(({ host }) => host)).toEqual([
      'www.lampp.test',
      'lampp.test',
    ]);
    expect(Underpost.ingress.select().length).toBe(6);
  });

  it('resolves the one owner of a host, and refuses a host no deployment or two deployments declare', () => {
    const select = (selection) => Underpost.ingress.select(selection);
    expect(select({ hosts: ['lampp.test'] })).toEqual([{ host: 'lampp.test', deployId: 'dd-lampp' }]);
    expect(select({ deployIds: ['dd-shop'], hosts: ['core.test'] })).toEqual([
      { host: 'core.test', deployId: 'dd-shop' },
    ]);
    expect(() => select({ hosts: ['core.test'] })).toThrow(
      'core.test is declared by dd-core and dd-shop: name its deployment with --deploy-id',
    );
    expect(() => select({ deployIds: ['dd-lampp'], hosts: ['core.test'] })).toThrow(
      'core.test is declared by dd-core, dd-shop, not by dd-lampp',
    );
    expect(() => select({ hosts: ['nobody.test'] })).toThrow(
      'nobody.test is declared by no deployment of the route table',
    );
    expect(() => select({ deployIds: ['dd-gone'] })).toThrow('dd-gone is not in engine-private/deploy/dd.routes');
    expect(() => select({ all: true, deployIds: ['dd-core'] })).toThrow('--all selects every deployment');
  });

  it('refuses a deploy of a host another deployment declares, before it changes anything', async () => {
    expect(() => Underpost.ingress.assertOwnership(['dd-lampp'])).not.toThrow();
    expect(() => Underpost.ingress.assertOwnership(['dd-shop'])).toThrow(
      'core.test is declared by dd-core and dd-shop: one deployment owns a host',
    );
    // An instance host belongs to its deployment like a server host.
    declare('dd-lampp', ['www.lampp.test', 'lampp.test', 'client.core.test']);
    expect(() => Underpost.ingress.assertOwnership(['dd-lampp'])).toThrow(
      'client.core.test is declared by dd-lampp and dd-core: one deployment owns a host',
    );
    harness = shellHarness();
    await expect(Underpost.deploy.callback('dd-shop', 'production', {})).rejects.toThrow(
      'core.test is declared by dd-core and dd-shop',
    );
    expect(harness.calls).toEqual([]);
  });

  it('takes the Gateway where the deployment runs, then the one of its placement, then the one a deploy creates', async () => {
    cluster();
    const observation = await Underpost.namespace.observe();
    const consumer = (host, deployId, options = {}) =>
      Underpost.ingress.consumer({ host, deployId, environment: 'production', options, observation });
    expect(consumer('www.lampp.test', 'dd-lampp')).toMatchObject({
      id: `Gateway/${WORKLOADS}/dd-lampp-production`,
      live: true,
      secret: `${WORKLOADS}/www.lampp.test`,
    });
    // dd-core runs in default, which its placement has not reached yet: its Gateway there serves it.
    expect(consumer('core.test', 'dd-core')).toMatchObject({ id: 'Gateway/default/dd-core-production', live: true });
    expect(consumer('client.core.test', 'dd-core')).toMatchObject({
      id: `Gateway/${WORKLOADS}/dd-core-production`,
      live: false,
      secret: `${WORKLOADS}/client.core.test`,
    });
    // An environment routed by Contour serves each host from its HTTPProxy.
    const conf = fs.readJsonSync(CONF);
    conf.environments.production.routing.provider = 'contour';
    fs.outputJsonSync(CONF, conf);
    expect(consumer('shop.test', 'dd-shop')).toMatchObject({
      kind: 'HTTPProxy',
      id: `HTTPProxy/${WORKLOADS}/shop.test`,
      live: false,
    });
  });
});

describe('the ingress command', () => {
  it('reports the routing object of each deployment and the listeners and routes of each host', async () => {
    cluster();
    const report = await Underpost.ingress.status({ options: { deployId: 'dd-lampp,dd-shop' } });
    expect(report.provider).toBe('gateway-api');
    expect(report.deployments.map(({ deployId, consumer }) => `${deployId} ${consumer.id} ${consumer.live}`)).toEqual([
      `dd-lampp Gateway/${WORKLOADS}/dd-lampp-production true`,
      `dd-shop Gateway/${WORKLOADS}/dd-shop-production false`,
    ]);
    expect(report.deployments[0].hosts).toEqual([
      {
        host: 'www.lampp.test',
        served: true,
        listeners: ['HTTP/80', 'HTTPS/443'],
        routes: [`HTTPRoute/${WORKLOADS}/www.lampp.test`],
        unresolved: [],
        state: 'programmed',
      },
      {
        host: 'lampp.test',
        served: true,
        listeners: ['HTTP/80', 'HTTPS/443'],
        routes: [],
        unresolved: [],
        state: 'no-route',
      },
    ]);
    expect(report.findings.map(({ code }) => code).sort()).toEqual([
      'gateway-missing',
      'gateway-stale',
      'host-duplicate',
      'route-missing',
    ]);
    expect(report.findings.find(({ code }) => code === 'host-duplicate')).toMatchObject({
      severity: 'error',
      message: 'core.test is declared by dd-core and dd-shop: one deployment owns a host',
    });
    expect(harness.calls.some((call) => / (apply|delete|patch) /.test(call))).toBe(false);
  });

  it('plans the removal of stale routing as a server dry run, for the selected deployment only', async () => {
    cluster();
    const { context, plan, applied } = await Underpost.ingress.reconcile({ options: { deployId: 'dd-core' } });
    expect({ context, plan, applied }).toEqual({ context: 'underpost-production', plan: [], applied: false });
    const { plan: steps } = await Underpost.ingress.reconcile({ options: { deployId: 'dd-lampp' } });
    expect(steps.map(({ action, object }) => `${action} ${object}`)).toEqual([
      'retire HTTPRoute/default/www.lampp.test',
      'retire ClientTrafficPolicy/default/dd-lampp-production-http3',
      'retire Gateway/default/dd-lampp-production',
    ]);
    const changes = harness.calls.filter((call) => / (delete|patch) /.test(call));
    expect(changes.length).toBe(3);
    expect(
      changes.every((call) => call.includes('--dry-run=server') && call.includes('--context underpost-production')),
    ).toBe(true);
    expect(harness.state.gateways.length).toBe(3);
  });

  it('removes the stale routing a deployment owns, and nothing of another deployment', async () => {
    cluster();
    const { applied, unchanged } = await Underpost.ingress.reconcile({
      apply: true,
      options: { env: 'production', deployId: 'dd-lampp' },
    });
    expect({ applied, unchanged }).toEqual({ applied: true, unchanged: [] });
    expect(ids(harness.state.gateways)).toEqual([
      'Gateway/default/dd-core-production',
      `Gateway/${WORKLOADS}/dd-lampp-production`,
    ]);
    expect(ids(harness.state.routes)).toEqual(['HTTPRoute/default/core.test', `HTTPRoute/${WORKLOADS}/www.lampp.test`]);
    expect(harness.state.policies).toEqual([]);
    expect(harness.state.controllers.length).toBe(2);
  });

  it('reports the routing one deployment leaves where it no longer runs, and changes nothing', async () => {
    cluster();
    const lampp = await Underpost.ingress.stale({ deployId: 'dd-lampp', environment: 'production' });
    expect(lampp.map(({ code, deployId }) => `${code} ${deployId}`)).toEqual(['gateway-stale dd-lampp']);
    expect(lampp[0].message).toContain('Gateway/default/dd-lampp-production');
    expect(await Underpost.ingress.stale({ deployId: 'dd-core', environment: 'production' })).toEqual([]);
    expect(harness.calls.some((call) => / (apply|delete|patch) /.test(call))).toBe(false);
  });

  it('refuses a change without an environment or a selection', async () => {
    cluster();
    await expect(Underpost.ingress.reconcile({ apply: true, options: { deployId: 'dd-lampp' } })).rejects.toThrow(
      'ingress reconcile --apply needs --env',
    );
    await expect(Underpost.ingress.reconcile({ apply: true, options: { env: 'production' } })).rejects.toThrow(
      'ingress reconcile --apply needs --deploy-id or --host, or --all',
    );
    expect(harness.calls.length).toBe(0);
  });
});

describe('the routing plan', () => {
  const observation = ({ gateways = [], routes = [], controllers = [] }) => ({
    environment: 'production',
    controllers,
    routing: { gateways, routes, policies: [] },
  });
  const gateway = (name, namespace, { labels = {}, hosts = [] } = {}) => ({
    kind: 'Gateway',
    namespace,
    name,
    labels,
    className: 'eg',
    conditions: {},
    listeners: hosts.map((hostname) => ({
      name: `https-${hostname}`,
      hostname,
      protocol: 'HTTPS',
      port: 443,
      certificates: [`${namespace}/${hostname}`],
      conditions: {},
    })),
  });
  const workload = (namespace, label) => ({
    kind: 'Deployment',
    namespace,
    name: label,
    labels: { 'deploy-id': label },
  });
  const CYBERIA = owned('dd-cyberia-production');

  it('keeps a Gateway whose deployment still runs an instance, or whose owner the labels and routes do not prove', () => {
    const plan = routingPlan(
      observation({
        gateways: [
          gateway('dd-cyberia-production', 'default', { labels: CYBERIA }),
          gateway('dd-cyberia-production', WORKLOADS, { labels: CYBERIA }),
          gateway('shared', 'default', { labels: { 'app.kubernetes.io/managed-by': 'underpost' } }),
        ],
        controllers: [
          workload('default', 'dd-cyberia-mmo-client-production'),
          workload(WORKLOADS, 'dd-cyberia-production'),
        ],
      }),
      ['dd-cyberia'],
    );
    expect(plan.stale).toEqual([]);
    expect(plan.steps).toEqual([]);
    const unrouted = routingPlan(
      observation({
        gateways: [
          gateway('dd-cyberia-production', 'default', { labels: CYBERIA }),
          gateway('dd-cyberia-production', WORKLOADS, { labels: CYBERIA }),
        ],
        controllers: [workload(WORKLOADS, 'dd-cyberia-production')],
      }),
      [],
    );
    expect(unrouted.stale).toEqual([]);
  });

  it('takes an unlabeled Gateway for a copy only when the labeled Gateway serves each of its hosts', () => {
    const plan = (hosts) =>
      routingPlan(
        observation({
          gateways: [
            gateway('dd-cyberia-production', 'default', { hosts }),
            gateway('dd-cyberia-production', WORKLOADS, {
              labels: CYBERIA,
              hosts: ['cyberia.test', 'www.cyberia.test'],
            }),
          ],
          controllers: [workload(WORKLOADS, 'dd-cyberia-production')],
        }),
        ['dd-cyberia'],
      );
    const retire = { action: 'retire', object: 'Gateway/default/dd-cyberia-production', deployId: 'dd-cyberia' };
    expect(plan(['cyberia.test']).steps).toEqual([retire]);
    expect(plan(['cyberia.test']).retired).toEqual(['Gateway/default/dd-cyberia-production']);
    for (const hosts of [[], ['cyberia.test', 'old.test']]) {
      expect(plan(hosts).steps).toEqual([]);
      expect(plan(hosts).findings.map(({ code }) => code)).toContain('routing-unowned');
    }
  });

  it('reads the live status: a listener that conflicts or does not resolve its references', () => {
    const conflicted = { Conflicted: { status: 'True', reason: 'HostnameConflict', message: '' } };
    const unresolved = { ResolvedRefs: { status: 'False', reason: 'InvalidCertificateRef', message: '' } };
    const a = gateway('a', 'one', { hosts: ['old.test'] });
    a.listeners[0].conditions = conflicted;
    const b = gateway('b', 'two', { hosts: ['old.test', 'new.test'] });
    b.listeners[1].conditions = unresolved;
    expect(
      routingPlan(observation({ gateways: [a, b] }), []).findings.map(({ code, message }) => `${code}: ${message}`),
    ).toEqual([
      'listener-conflicted: Gateway/one/a listener https-old.test conflicts (HostnameConflict) with Gateway/two/b',
      'listener-unresolved: Gateway/two/b listener https-new.test does not resolve its references: InvalidCertificateRef',
    ]);
  });
});

describe('the routing audit', () => {
  const condition = (status, reason = 'Reason') => ({ status, reason, message: '' });
  const listener = (name, conditions = {}) => ({
    name,
    hostname: 'lampp.test',
    protocol: 'HTTPS',
    port: 443,
    allowedRoutes: 'Same',
    certificates: [],
    conditions,
  });
  const observation = {
    environment: 'production',
    controllers: [],
    services: [{ kind: 'Service', namespace: WORKLOADS, name: 'dd-lampp-production-green-service' }],
    routing: {
      gateways: [
        {
          kind: 'Gateway',
          namespace: WORKLOADS,
          name: 'dd-lampp-production',
          labels: LAMPP,
          className: 'contour',
          conditions: { Accepted: condition('False', 'InvalidParameters') },
          listeners: [listener('https-lampp', { Accepted: condition('False', 'UnsupportedProtocol') })],
        },
      ],
      routes: [
        {
          kind: 'HTTPRoute',
          namespace: WORKLOADS,
          name: 'lampp.test',
          labels: LAMPP,
          hostnames: ['lampp.test'],
          parents: [`${WORKLOADS}/dd-lampp-production`],
          backends: [
            `${WORKLOADS}/dd-lampp-production-green-service:80`,
            `${WORKLOADS}/dd-lampp-production-blue-service:80`,
          ],
          unresolved: false,
        },
      ],
      policies: [
        {
          kind: 'ClientTrafficPolicy',
          namespace: WORKLOADS,
          name: 'dd-lampp-production-http3',
          labels: LAMPP,
          targets: ['Gateway/dd-lampp-production'],
          sections: ['Gateway/dd-lampp-production/https-gone'],
        },
      ],
      proxies: [
        {
          kind: 'HTTPProxy',
          namespace: 'default',
          name: 'old.test',
          fqdn: 'old.test',
          status: 'invalid',
          description: 'TLS Secret not found',
        },
      ],
    },
  };

  it('tells what exists from what the controller accepts, and each reference that resolves to nothing', () => {
    const { findings } = routingPlan(observation, ['dd-lampp'], { gatewayClass: 'eg' });
    expect(findings.map(({ severity, code, message }) => `${severity} ${code}: ${message}`)).toEqual([
      `warning gateway-class-mismatch: Gateway/${WORKLOADS}/dd-lampp-production has the class contour, not eg: node bin deploy dd-lampp`,
      `error gateway-not-accepted: Gateway/${WORKLOADS}/dd-lampp-production is not accepted: InvalidParameters`,
      `error listener-not-accepted: Gateway/${WORKLOADS}/dd-lampp-production listener https-lampp is not accepted: UnsupportedProtocol`,
      `error route-backend-missing: HTTPRoute/${WORKLOADS}/lampp.test sends requests to the Service ` +
        `${WORKLOADS}/dd-lampp-production-blue-service, which does not exist: they answer 500`,
      'error proxy-invalid: HTTPProxy/default/old.test is invalid: TLS Secret not found',
      `error policy-section-missing: ClientTrafficPolicy/${WORKLOADS}/dd-lampp-production-http3 targets the listener ` +
        `https-gone of Gateway/${WORKLOADS}/dd-lampp-production, which has none`,
    ]);
  });
});

describe('a published path', () => {
  it('attaches to the Gateway of the deployment that declares the host, with its labels and the grant of the Service', () => {
    harness = shellHarness();
    const published = Underpost.ingress.publishPath({
      name: 'grafana',
      host: 'lampp.test',
      path: '/grafana',
      service: 'grafana',
      serviceNamespace: 'underpost-observability',
      port: 3000,
      environment: 'production',
    });
    expect(published).toEqual({
      route: `HTTPRoute/${WORKLOADS}/grafana`,
      deployId: 'dd-lampp',
      gateway: `Gateway/${WORKLOADS}/dd-lampp-production`,
    });
    const [apply] = harness.calls;
    expect(apply).toContain(`name: grafana\n  namespace: ${WORKLOADS}`);
    expect(apply).toContain('deploy-id: dd-lampp-production');
    expect(apply).toContain('      name: dd-lampp-production\n');
    expect(apply).toContain('          namespace: underpost-observability\n');
    expect(apply).toContain(
      `kind: ReferenceGrant\nmetadata:\n  name: routes-from-${WORKLOADS}\n  namespace: underpost-observability`,
    );
    Underpost.ingress.retractPath({ name: 'grafana', environment: 'production' });
    expect(harness.calls[1]).toBe(`kubectl delete httproute grafana -n ${WORKLOADS} --ignore-not-found`);
  });

  it('refuses a host no deployment declares, and an environment Contour routes', () => {
    harness = shellHarness();
    const publish = (host) => () =>
      Underpost.ingress.publishPath({
        name: 'grafana',
        host,
        path: '/grafana',
        service: 'grafana',
        serviceNamespace: 'underpost-observability',
        port: 3000,
        environment: 'production',
      });
    expect(publish('nobody.test')).toThrow('nobody.test is declared by no deployment of the route table');
    // A monitoring path rides on the one deployment that owns its host.
    expect(publish('core.test')).toThrow('core.test is declared by dd-core and dd-shop: name its deployment');
    const conf = fs.readJsonSync(CONF);
    conf.environments.production.routing.provider = 'contour';
    fs.outputJsonSync(CONF, conf);
    expect(publish('lampp.test')).toThrow('production routes through Contour');
    expect(harness.calls).toEqual([]);
  });
});

describe('the transport of the Gateway API routes', () => {
  it('advertises HTTP/3 only where the environment terminates TLS', () => {
    const conf = fs.readJsonSync(CONF);
    conf.environments.test = { ...conf.environments.production, tls: { mode: 'none' } };
    fs.outputJsonSync(CONF, conf);
    const http3 = (options, environment) => Underpost.ingress.gatewayApiConfigFactory(options, environment).http3;
    expect(http3({}, 'production')).toBe(true);
    expect(http3({ disableHttp3: true }, 'production')).toBe(false);
    expect(http3({}, 'test')).toBe(false);
    expect(http3({})).toBe(false);
    expect(
      Underpost.ingress.clientTrafficPolicyYamlFactory({ name: 'dd-core-test', sectionName: 'https', env: 'test' }),
    ).toBe('');
  });
});

describe('a routing provider transition', () => {
  const gateway = (programmed) => ({
    kind: 'Gateway',
    namespace: WORKLOADS,
    name: 'dd-lampp-production',
    conditions: { Programmed: { status: programmed ? 'True' : 'False' } },
  });
  const route = (name, hostnames, accepted) => ({
    kind: 'HTTPRoute',
    namespace: WORKLOADS,
    name,
    hostnames,
    parents: [`${WORKLOADS}/dd-lampp-production`],
    accepted,
  });
  const proxy = (fqdn, status = 'valid') => ({ kind: 'HTTPProxy', namespace: WORKLOADS, name: fqdn, fqdn, status });
  const hosts = [
    { host: 'a.test', deployId: 'dd-lampp' },
    { host: 'b.test', deployId: 'dd-lampp' },
  ];
  const observation = (routing) => ({ environment: 'production', routing });

  it('serves a host through an accepted route of a programmed Gateway, or a valid HTTPProxy', () => {
    const routing = {
      gateways: [gateway(true)],
      routes: [route('a.test', ['a.test'], true), route('b.test', ['b.test'], false)],
      proxies: [proxy('a.test'), proxy('b.test', 'invalid')],
    };
    expect([...servedHostsOf(routing, 'gateway-api')]).toEqual(['a.test']);
    expect([...servedHostsOf({ ...routing, gateways: [gateway(false)] }, 'gateway-api')]).toEqual([]);
    expect([...servedHostsOf(routing, 'contour')]).toEqual(['a.test']);
  });

  it('keeps the old route until the new one serves, then retires it', () => {
    const waiting = providerTransition(
      observation({
        gateways: [gateway(true)],
        routes: [route('a.test', ['a.test'], false)],
        proxies: [proxy('a.test')],
      }),
      hosts.slice(0, 1),
      'gateway-api',
    );
    expect(waiting.steps).toEqual([]);
    expect(waiting.findings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'provider-transition',
        message:
          'a.test is served by HTTPProxy/underpost-workloads/a.test, and environments.production.routing.provider is ' +
          'gateway-api: HTTPRoute/underpost-workloads/a.test does not serve it yet, so HTTPProxy/underpost-workloads/a.test stays',
      }),
    ]);
    const unpublished = providerTransition(
      observation({ proxies: [proxy('a.test')] }),
      hosts.slice(0, 1),
      'gateway-api',
    );
    expect(unpublished.findings[0].message).toContain('node bin deploy dd-lampp production publishes its route');

    const served = providerTransition(
      observation({
        gateways: [gateway(true)],
        routes: [route('a.test', ['a.test'], true)],
        proxies: [proxy('a.test')],
      }),
      hosts.slice(0, 1),
      'gateway-api',
    );
    expect(served.steps).toEqual([{ action: 'retire', object: `HTTPProxy/${WORKLOADS}/a.test`, deployId: 'dd-lampp' }]);
    expect(served.findings).toEqual([expect.objectContaining({ severity: 'error', code: 'provider-conflict' })]);
  });

  it('moves to Contour the same way, and keeps an old route that also serves a host that has not moved', () => {
    const shared = route('lampp', ['a.test', 'b.test'], true);
    const { steps, findings } = providerTransition(
      observation({ gateways: [gateway(true)], routes: [shared], proxies: [proxy('a.test'), proxy('b.test', '')] }),
      hosts,
      'contour',
    );
    expect(steps).toEqual([]);
    expect(findings.map(({ code, message }) => `${code}: ${message}`)).toEqual([
      `provider-conflict: a.test is served by HTTPProxy/${WORKLOADS}/a.test of contour and by HTTPRoute/${WORKLOADS}/lampp: ` +
        `HTTPRoute/${WORKLOADS}/lampp also serves a host that has not moved, so it stays`,
      expect.stringContaining(`provider-transition: b.test is served by HTTPRoute/${WORKLOADS}/lampp`),
    ]);
  });
});

describe('the removal of the routes of the inactive provider after a deploy', () => {
  let harness;
  afterEach(() => harness?.restore());

  it('removes the HTTPProxy of a host only once its HTTPRoute serves it', () => {
    const accepted = {
      parents: [
        {
          conditions: [
            { type: 'Accepted', status: 'True' },
            { type: 'ResolvedRefs', status: 'True' },
          ],
        },
      ],
    };
    const routeObject = (host, status) => ({
      kind: 'HTTPRoute',
      metadata: { name: host, namespace: WORKLOADS },
      spec: { hostnames: [host], parentRefs: [{ name: 'dd-lampp-production' }] },
      status,
    });
    harness = shellHarness([
      {
        match: 'get gateways.gateway.networking.k8s.io --all-namespaces',
        stdout: JSON.stringify({
          items: [
            {
              kind: 'Gateway',
              metadata: { name: 'dd-lampp-production', namespace: WORKLOADS },
              spec: { listeners: [] },
              status: { conditions: [{ type: 'Programmed', status: 'True' }] },
            },
          ],
        }),
      },
      {
        match: 'get httproutes.gateway.networking.k8s.io --all-namespaces',
        stdout: JSON.stringify({ items: [routeObject('a.test', accepted), routeObject('b.test', {})] }),
      },
    ]);
    expect(
      Underpost.ingress.removeInactiveHostRoutes({
        hosts: ['a.test', 'b.test'],
        gatewayApi: true,
        namespace: WORKLOADS,
      }),
    ).toEqual({ retired: ['a.test'], kept: ['b.test'] });
    expect(harness.calls.filter((call) => call.includes(' delete '))).toEqual([
      `kubectl delete httpproxies.projectcontour.io a.test -n ${WORKLOADS} --ignore-not-found`,
    ]);
  });
});
