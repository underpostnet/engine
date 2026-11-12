// The namespace audit and repair of a cluster whose deployments moved, through the TLS and ingress domains: the
// observed LAMPP migration, where the TLS Secrets reached their namespace without a Certificate to renew them, the
// preparation of the TLS of a migration unit, and a deployment recreated outside a plan that left its routing behind.
// The shell harness answers each kubectl call, every file lives in a scratch checkout, and the certificates are
// generated for the run: no real cluster is reached.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import Underpost from '../../../../src/index.js';
import { kubectlFactory } from '../../../../src/cli/namespace.js';
import {
  certificateItem,
  claimItem,
  controllerItem,
  gatewayItem,
  issuerItem,
  kubeCluster,
  namespaceItem,
  owned,
  policyItem,
  routeItem,
  serviceItem,
  tlsLine,
  tlsPair,
  tlsSecretItem,
} from '../../../support/kube-cluster.js';

const CONF = './engine-private/deploy/conf.cluster.json';
const WORKLOADS = 'underpost-workloads';
const CRDS = [
  'gateways.gateway.networking.k8s.io',
  'httproutes.gateway.networking.k8s.io',
  'certificates.cert-manager.io',
  'clusterissuers.cert-manager.io',
  'clienttrafficpolicies.gateway.envoyproxy.io',
];
const LAMPP = owned('dd-lampp-production');
const LAMPP_HOSTS = [
  'www.giancarlobertini.test',
  'giancarlobertini.test',
  'www.ayleenbertini.test',
  'ayleenbertini.test',
];
const CYBERIA = owned('dd-cyberia-production');
const CYBERIA_HOSTS = ['cyberia.test', 'www.cyberia.test', 'services.cyberia.test', 'shop.cyberia.test'];

const deployment = (name, namespace, label) =>
  controllerItem('Deployment', name, namespace, {
    labels: { 'deploy-id': label },
    spec: { replicas: 1, template: { metadata: { labels: { app: name } }, spec: { containers: [] } } },
    status: { readyReplicas: 1 },
  });

let cwd;
let scratch;
let harness;
let pairs;

beforeAll(() => {
  pairs = Object.fromEntries([...LAMPP_HOSTS, ...CYBERIA_HOSTS, 'core.test'].map((host) => [host, tlsPair([host])]));
  pairs.other = tlsPair(['other.test']);
});

beforeEach(() => {
  cwd = process.cwd();
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-tls-repair-'));
  process.chdir(scratch);
});

afterEach(() => {
  harness?.restore();
  harness = undefined;
  process.chdir(cwd);
  fs.removeSync(scratch);
});

/** The configuration of a production cluster with its context, and the hosts each deployment declares. The scheduler places the pods. */
const SCHEDULER = Object.fromEntries(
  ['workloads', 'releases', 'platform', 'operations', 'observability', 'datastores'].map((category) => [
    category,
    { mode: 'scheduler' },
  ]),
);
const configure = (profile, deployments) => {
  fs.outputJsonSync(CONF, {
    environments: {
      production: {
        context: 'underpost-production',
        profile,
        routing: { provider: 'gateway-api' },
        tls: { mode: 'cert-manager', issuer: 'letsencrypt-prod' },
        overrides: { scheduling: SCHEDULER },
      },
    },
  });
  fs.outputFileSync('./engine-private/deploy/dd.routes', Object.keys(deployments).join(','));
  for (const [deployId, hosts] of Object.entries(deployments))
    fs.outputJsonSync(
      `./engine-private/conf/${deployId}/conf.server.json`,
      Object.fromEntries(hosts.map((host) => [host, { '/': {} }])),
    );
};

const secretsOf = (entries) => ({
  secrets: entries.map(([namespace, name]) => tlsLine(namespace, name)),
  secretObjects: Object.fromEntries(
    entries.map(([namespace, name, pair = pairs[name]]) => [
      `${namespace}/${name}`,
      tlsSecretItem(namespace, name, pair.data),
    ]),
  ),
});

const ids = (items) => items.map(({ kind, metadata }) => `${kind}/${metadata.namespace}/${metadata.name}`).sort();
const changes = () => harness.calls.filter((call) => / (apply|delete|patch|scale) /.test(call));

describe('the LAMPP migration', () => {
  /**
   * After the move of dd-lampp to underpost-workloads: its workload, Services, claim and labeled Gateway run there, and
   * its four TLS Secrets were copied there, but no Certificate renews them. dd-core runs in default with its own TLS.
   */
  const migrated = (state = {}) => {
    configure('recommended', { 'dd-lampp': LAMPP_HOSTS, 'dd-core': ['core.test'] });
    harness = kubeCluster({
      contexts: 'underpost-production\n',
      namespaces: [namespaceItem('default'), namespaceItem(WORKLOADS, { owned: true })],
      crds: CRDS,
      controllers: [
        deployment('dd-lampp-production-green', WORKLOADS, 'dd-lampp-production'),
        deployment('dd-core-production-blue', 'default', 'dd-core-production'),
      ],
      services: [
        serviceItem('dd-lampp-production-traffic-service', WORKLOADS, { app: 'dd-lampp-production-green' }),
        serviceItem('dd-core-production-traffic-service', 'default', { app: 'dd-core-production-blue' }),
      ],
      claims: [claimItem('pvc-wp-dd-lampp-production-green', WORKLOADS, 'pv-wp-dd-lampp-production-green')],
      gateways: [
        gatewayItem('dd-lampp-production', WORKLOADS, { hosts: LAMPP_HOSTS, certificates: LAMPP_HOSTS, labels: LAMPP }),
        gatewayItem('dd-core-production', 'default', {
          hosts: ['core.test'],
          certificates: ['core.test'],
          labels: owned('dd-core-production'),
        }),
      ],
      issuers: [issuerItem('letsencrypt-prod', { parentRefs: ['default/dd-core-production'] })],
      certificates: [certificateItem('core.test', 'default', { status: { Ready: ['True'] } })],
      ...secretsOf([...LAMPP_HOSTS.map((host) => [WORKLOADS, host]), ['default', 'core.test']]),
      ...state,
    });
  };

  it('fails the audit while a copied TLS Secret has no Certificate that renews it', async () => {
    migrated();
    const { findings } = await Underpost.namespace.audit();
    const tls = findings.filter(({ code }) => /^(tls|issuer|certificate)-/.test(code));
    expect(tls.map(({ severity, code }) => `${severity} ${code}`)).toEqual([
      ...LAMPP_HOSTS.map(() => 'error tls-unrenewed'),
      'error issuer-gateway-missing',
    ]);
    expect(tls[0].message).toBe(
      `${WORKLOADS}/www.giancarlobertini.test has no Certificate that renews it: reconcile creates it`,
    );
    expect(changes()).toEqual([]);
  });

  it('repairs it: each Secret stays, its Certificate exists and is Ready, the issuer lists its Gateway, and nothing else changes', async () => {
    migrated();
    const preview = await Underpost.namespace.repair();
    expect(
      preview.plan.map(({ domain, action, object }) => `${domain} ${action}${object ? ` ${object}` : ''}`),
    ).toEqual(['tls issuer', ...LAMPP_HOSTS.map((host) => `tls certify Certificate/${WORKLOADS}/${host}`)]);
    expect(changes().every((call) => call.includes('--dry-run=server'))).toBe(true);

    const { applied, unchanged } = await Underpost.namespace.repair({ apply: true });
    expect({ applied, unchanged }).toEqual({ applied: true, unchanged: [] });
    harness.settle();
    for (const host of LAMPP_HOSTS) {
      const certificate = harness.state.certificates.find(
        ({ metadata }) => metadata.namespace === WORKLOADS && metadata.name === host,
      );
      expect(certificate.spec).toMatchObject({ secretName: host, dnsNames: [host] });
      expect(certificate.metadata.labels).toEqual(LAMPP);
      expect(certificate.status.conditions.find(({ type }) => type === 'Ready').status).toBe('True');
      // The Secret the Gateway reads is the one the migration copied: never written again.
      expect(harness.state.secretObjects[`${WORKLOADS}/${host}`].data).toEqual(pairs[host].data);
    }
    const refs = harness.state.issuers[0].spec.acme.solvers[0].http01.gatewayHTTPRoute.parentRefs;
    expect(refs.map(({ namespace, name }) => `${namespace}/${name}`)).toEqual([
      'default/dd-core-production',
      `${WORKLOADS}/dd-lampp-production`,
    ]);
    // The active Gateway resolves each certificate reference, and no workload, Service, claim or volume changed.
    const after = await Underpost.namespace.observe();
    const gateway = after.routing.gateways.find(({ namespace }) => namespace === WORKLOADS);
    expect(
      gateway.listeners.filter(({ protocol }) => protocol === 'HTTPS').map(({ certificates }) => certificates),
    ).toEqual(LAMPP_HOSTS.map((host) => [`${WORKLOADS}/${host}`]));
    expect(harness.calls.some((call) => / delete /.test(call))).toBe(false);
    expect(harness.state.controllers.length).toBe(2);
    expect(harness.state.services.length).toBe(2);
    expect(harness.state.claims.length).toBe(1);
    expect(ids(harness.state.certificates)).toContain('Certificate/default/core.test');
  });

  it('reports a Certificate that is not Ready with its pending state', async () => {
    migrated({ unready: ['ayleenbertini.test'] });
    const { unchanged } = await Underpost.namespace.repair({ apply: true });
    expect(unchanged).toEqual([
      `Certificate/${WORKLOADS}/ayleenbertini.test is not Ready yet: a Certificate it replaces stays`,
    ]);
    const { findings } = await Underpost.tls.audit({ options: { host: 'ayleenbertini.test' } });
    expect(findings.map(({ code }) => code)).toEqual(['certificate-not-ready']);
  });

  it('prepares the TLS of a destination before a unit deletes its source, and verifies each Certificate', async () => {
    migrated({
      controllers: [deployment('dd-lampp-production-green', 'default', 'dd-lampp-production')],
      certificates: LAMPP_HOSTS.slice(0, 3).map((host) =>
        certificateItem(host, 'default', { status: { Ready: ['True'] } }),
      ),
      ...secretsOf([
        ...LAMPP_HOSTS.slice(0, 3).map((host) => ['default', host]),
        ['default', 'ayleenbertini.test', pairs.other],
      ]),
    });
    const observation = await Underpost.namespace.observe();
    const kubectl = kubectlFactory('underpost-production');
    const done = await Underpost.tls.prepare({ kubectl, observation, hosts: LAMPP_HOSTS, to: WORKLOADS });
    // A Secret that does not name its host is not copied: its host waits for its Gateway to issue a new one.
    expect(done).toEqual([
      ...LAMPP_HOSTS.slice(0, 3).map((host) => `copy Secret/default/${host} into ${WORKLOADS}`),
      ...LAMPP_HOSTS.slice(0, 3).map((host) => `apply Certificate/${WORKLOADS}/${host}`),
    ]);
    harness.settle();
    expect(ids(harness.state.certificates).filter((id) => id.includes(WORKLOADS))).toEqual(
      LAMPP_HOSTS.slice(0, 3)
        .map((host) => `Certificate/${WORKLOADS}/${host}`)
        .sort(),
    );
    // The source stays: the migration removes it only after this step.
    expect(ids(harness.state.certificates).filter((id) => id.includes('/default/')).length).toBe(3);
  });

  it('stops a preparation that places a Secret without the Certificate that renews it', async () => {
    migrated({ certificates: [], ...secretsOf(LAMPP_HOSTS.map((host) => ['default', host])) });
    let applies = 0;
    harness.route({
      match: (call) => / apply -f -$/.test(call) && ++applies > LAMPP_HOSTS.length,
      code: 1,
      stderr: 'denied',
    });
    const observation = await Underpost.namespace.observe();
    await expect(
      Underpost.tls.prepare({
        kubectl: kubectlFactory('underpost-production'),
        observation,
        hosts: LAMPP_HOSTS,
        to: WORKLOADS,
      }),
    ).rejects.toThrow();
    expect(harness.calls.some((call) => / delete /.test(call))).toBe(false);
  });
});

describe('a deployment recreated outside a plan', () => {
  /**
   * dd-cyberia runs in underpost-workloads and left its labeled Gateway, routes, a policy, Certificates and TLS
   * Secrets in default; dd-test left unlabeled routes and a policy that name its Gateway, which is gone there; dd-lampp
   * left an unlabeled Gateway that serves a host its labeled one does not.
   */
  const recreated = () => {
    configure('legacy', {
      'dd-cyberia': CYBERIA_HOSTS,
      'dd-core': ['core.test'],
      'dd-lampp': ['lampp.test'],
      'dd-test': ['test.test', 'www.test.test'],
    });
    harness = kubeCluster({
      contexts: 'underpost-production\n',
      namespaces: [namespaceItem('default'), namespaceItem(WORKLOADS, { owned: true })],
      crds: CRDS,
      controllers: [
        deployment('dd-cyberia-production-green', WORKLOADS, 'dd-cyberia-production'),
        deployment('dd-core-production-blue', 'default', 'dd-core-production'),
        deployment('dd-lampp-production-blue', WORKLOADS, 'dd-lampp-production'),
        deployment('dd-test-production-blue', WORKLOADS, 'dd-test-production'),
      ],
      gateways: [
        gatewayItem('dd-cyberia-production', 'default', {
          hosts: CYBERIA_HOSTS.slice(0, 2),
          certificates: CYBERIA_HOSTS.slice(0, 2),
          labels: CYBERIA,
        }),
        gatewayItem('dd-cyberia-production', WORKLOADS, {
          hosts: CYBERIA_HOSTS,
          certificates: CYBERIA_HOSTS,
          labels: CYBERIA,
          listeners: { 'cyberia.test': { ResolvedRefs: ['False', 'InvalidCertificateRef'] } },
        }),
        gatewayItem('dd-core-production', 'default', {
          hosts: ['core.test'],
          certificates: ['core.test'],
          labels: owned('dd-core-production'),
        }),
        gatewayItem('dd-lampp-production', 'default', { hosts: ['lampp.test', 'old.lampp.test'] }),
        gatewayItem('dd-lampp-production', WORKLOADS, {
          hosts: ['lampp.test'],
          certificates: ['lampp.test'],
          labels: owned('dd-lampp-production'),
        }),
        gatewayItem('dd-test-production', WORKLOADS, {
          hosts: ['test.test', 'www.test.test'],
          certificates: ['test.test', 'www.test.test'],
          labels: owned('dd-test-production'),
        }),
      ],
      routes: [
        routeItem('cyberia.test', 'default', { gateway: 'dd-cyberia-production', labels: CYBERIA }),
        routeItem('shared.test', 'default', {
          gateways: ['dd-cyberia-production', 'dd-core-production'],
          labels: CYBERIA,
        }),
        routeItem('grafana', 'default', { gateway: 'dd-cyberia-production' }),
        routeItem('cyberia.test', WORKLOADS, { gateway: 'dd-cyberia-production', labels: CYBERIA }),
        routeItem('test.test', 'default', { gateway: 'dd-test-production', hosts: ['test.test'] }),
        routeItem('www.test.test', 'default', { gateway: 'dd-test-production', hosts: ['www.test.test'] }),
        routeItem('foreign.test', 'default', { gateway: 'dd-test-production', hosts: ['foreign.test'] }),
      ],
      policies: [
        policyItem('dd-cyberia-production-http3', 'default', { gateway: 'dd-cyberia-production', labels: CYBERIA }),
        policyItem('manual', 'default', { gateway: 'dd-cyberia-production' }),
        policyItem('dd-cyberia-production-http3', WORKLOADS, { gateway: 'dd-cyberia-production', labels: CYBERIA }),
        policyItem('dd-test-production-http3', 'default', { gateway: 'dd-test-production' }),
      ],
      issuers: [
        issuerItem('letsencrypt-prod', {
          parentRefs: [
            'default/dd-core-production',
            `${WORKLOADS}/dd-cyberia-production`,
            `${WORKLOADS}/dd-lampp-production`,
            `${WORKLOADS}/dd-test-production`,
          ],
        }),
      ],
      certificates: [
        certificateItem('cyberia.test', 'default', { labels: CYBERIA, status: { Ready: ['True'] } }),
        certificateItem('www.cyberia.test', 'default', { labels: CYBERIA, status: { Ready: ['True'] } }),
        certificateItem('core.test', 'default', { status: { Ready: ['True'] } }),
        certificateItem('services.cyberia.test', WORKLOADS, { labels: CYBERIA, status: { Issuing: ['True'] } }),
      ],
      ...secretsOf([
        ['default', 'cyberia.test'],
        ['default', 'www.cyberia.test'],
        ['default', 'core.test'],
        [WORKLOADS, 'www.cyberia.test'],
      ]),
    });
  };

  it('names each drift from the labels, the TLS of each host and the live status, and changes nothing', async () => {
    recreated();
    const { findings } = await Underpost.namespace.audit();
    expect(
      findings
        .filter(({ code }) => /^(tls|gateway|certificate|routing|listener|issuer)-/.test(code))
        .map(({ severity, code }) => `${severity} ${code}`)
        .sort(),
    ).toEqual([
      'error gateway-stale',
      'error listener-unresolved',
      'error tls-misplaced',
      'error tls-secret-missing',
      'error tls-secret-missing',
      'error tls-secret-missing',
      'error tls-secret-missing',
      'error tls-unrenewed',
      'warning certificate-duplicate',
      'warning certificate-duplicate',
      'warning routing-dangling',
      'warning routing-orphaned',
      'warning routing-orphaned',
      'warning routing-stale',
      'warning routing-stale',
      'warning routing-stale',
      'warning routing-unowned',
      'warning tls-issuing',
    ]);
    expect(changes()).toEqual([]);
  });

  it('places the TLS where each deployment runs before it removes the routing the deployment owns, and keeps the rest', async () => {
    recreated();
    const { plan, applied, unchanged } = await Underpost.namespace.repair({ apply: true });
    expect(applied).toBe(true);
    expect(plan.map(({ domain, action, object }) => `${domain} ${action} ${object}`)).toEqual([
      `tls copy Secret/default/cyberia.test`,
      `tls certify Certificate/${WORKLOADS}/cyberia.test`,
      `tls certify Certificate/${WORKLOADS}/www.cyberia.test`,
      `tls certify Certificate/${WORKLOADS}/shop.cyberia.test`,
      `tls certify Certificate/${WORKLOADS}/lampp.test`,
      `tls certify Certificate/${WORKLOADS}/test.test`,
      `tls certify Certificate/${WORKLOADS}/www.test.test`,
      'tls retire Certificate/default/cyberia.test',
      'tls retire Certificate/default/www.cyberia.test',
      'ingress detach HTTPRoute/default/shared.test',
      'ingress retire HTTPRoute/default/cyberia.test',
      'ingress retire ClientTrafficPolicy/default/dd-cyberia-production-http3',
      'ingress retire Gateway/default/dd-cyberia-production',
      'ingress retire HTTPRoute/default/test.test',
      'ingress retire HTTPRoute/default/www.test.test',
      'ingress retire ClientTrafficPolicy/default/dd-test-production-http3',
    ]);
    expect(ids(harness.state.gateways)).toEqual([
      'Gateway/default/dd-core-production',
      'Gateway/default/dd-lampp-production',
      `Gateway/${WORKLOADS}/dd-cyberia-production`,
      `Gateway/${WORKLOADS}/dd-lampp-production`,
      `Gateway/${WORKLOADS}/dd-test-production`,
    ]);
    const shared = harness.state.routes.find(({ metadata }) => metadata.name === 'shared.test');
    expect(shared.spec.parentRefs).toEqual([{ name: 'dd-core-production' }]);
    harness.settle();
    expect(ids(harness.state.certificates)).toEqual(
      [
        'Certificate/default/core.test',
        ...[
          'cyberia.test',
          'www.cyberia.test',
          'services.cyberia.test',
          'shop.cyberia.test',
          'lampp.test',
          'test.test',
          'www.test.test',
        ].map((host) => `Certificate/${WORKLOADS}/${host}`),
      ].sort(),
    );
    // A Certificate goes as an orphan owner: its Secret stays whatever owner references cert-manager writes.
    const removed = harness.calls.filter((call) => call.includes(' delete certificates.cert-manager.io '));
    expect(removed.length).toBe(2);
    expect(removed.every((call) => call.includes('--cascade=orphan'))).toBe(true);
    expect(harness.state.secretObjects['default/cyberia.test']).toBeDefined();
    expect(harness.calls.join('\n')).not.toContain(pairs['cyberia.test'].data['tls.key']);
    // The repair reads the cluster again and names what it leaves for a person to judge.
    const named = (text) => unchanged.some((line) => line.includes(text));
    expect(named('HTTPRoute/default/grafana attaches to no live Gateway')).toBe(true);
    expect(named('ClientTrafficPolicy/default/manual attaches to no live Gateway')).toBe(true);
    expect(named('HTTPRoute/default/foreign.test attaches to no live Gateway')).toBe(true);
    expect(named('Gateway/default/dd-lampp-production has no Underpost ownership label')).toBe(true);
    expect(harness.state.controllers.length).toBe(4);
  });

  it('copies no TLS Secret whose key does not match its certificate, and removes nothing', async () => {
    recreated();
    harness.state.secretObjects['default/cyberia.test'].data['tls.key'] = pairs['www.cyberia.test'].data['tls.key'];
    await expect(Underpost.namespace.repair({ apply: true })).rejects.toThrow(
      'Secret/default/cyberia.test: its key does not match its certificate',
    );
    expect(harness.calls.some((call) => / (delete|patch) /.test(call))).toBe(false);
  });
});
