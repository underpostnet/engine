// The TLS lifecycle of the hosts the deployments declare: the mode of an environment, the state of each Secret and
// Certificate, the ACME issuer and its challenges, reconcile, renew and self-signed issuance. Every file lives in a
// scratch checkout, the certificates are generated for the run, and the shell harness answers each kubectl call:
// no real cluster, ssl.sh or trust store is reached.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import Underpost from '../../../src/index.js';
import { issuerManifest, issuerManifestPath } from '../../../src/cli/tls.js';
import { CERT_MANAGER_RELEASES } from '../../../src/cli/cluster.js';
import {
  certificateItem,
  challengeItem,
  controllerItem,
  gatewayItem,
  issuerItem,
  kubeCluster,
  namespaceItem,
  owned,
  tlsLine,
  tlsPair,
  tlsSecretItem,
} from '../../support/kube-cluster.js';

const CONF = './engine-private/deploy/conf.cluster.json';
const GATEWAY_API = { provider: 'gateway-api' };
const PRODUCTION = {
  profile: 'recommended',
  routing: GATEWAY_API,
  tls: { mode: 'cert-manager', issuer: 'letsencrypt-prod' },
};
const ISSUER_MANIFEST = issuerManifestPath('letsencrypt-prod');
const WORKLOADS = 'underpost-workloads';
const LAMPP = owned('dd-lampp-production');
const LAMPP_HOSTS = ['www.giancarlo.test', 'giancarlo.test', 'www.ayleen.test', 'ayleen.test'];
const CRDS = [
  'gateways.gateway.networking.k8s.io',
  'httproutes.gateway.networking.k8s.io',
  'referencegrants.gateway.networking.k8s.io',
  'certificates.cert-manager.io',
  'clusterissuers.cert-manager.io',
  'challenges.acme.cert-manager.io',
];

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
  pairs = Object.fromEntries([...LAMPP_HOSTS, 'core.test', 'other.test'].map((host) => [host, tlsPair([host])]));
  pairs.wrong = tlsPair(['wrong.test']);
});

beforeEach(() => {
  cwd = process.cwd();
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-tls-'));
  process.chdir(scratch);
  fs.outputJsonSync(CONF, {
    environments: {
      production: { context: 'underpost-production', ...PRODUCTION },
      development: { context: 'kind-kind', profile: 'recommended', routing: GATEWAY_API, tls: { mode: 'self-signed' } },
      test: { context: 'kind-test', profile: 'recommended', routing: GATEWAY_API, tls: { mode: 'none' } },
    },
  });
  fs.outputFileSync('./engine-private/deploy/dd.routes', 'dd-lampp,dd-core,dd-other');
  const declare = (deployId, hosts) =>
    fs.outputJsonSync(
      `./engine-private/conf/${deployId}/conf.server.json`,
      Object.fromEntries(hosts.map((host) => [host, { '/': {} }])),
    );
  declare('dd-lampp', LAMPP_HOSTS);
  declare('dd-core', ['core.test']);
  fs.outputJsonSync('./engine-private/conf/dd-core/conf.instances.json', [
    { id: 'mmo-client', host: 'client.core.test', path: '/' },
  ]);
  declare('dd-other', ['other.test']);
});

afterEach(() => {
  harness?.restore();
  harness = undefined;
  vi.unstubAllEnvs();
  process.chdir(cwd);
  fs.removeSync(scratch);
});

const secretsOf = (entries) => ({
  secrets: entries.map(([namespace, name]) => tlsLine(namespace, name)),
  secretObjects: Object.fromEntries(
    entries.map(([namespace, name, pair = pairs[name]]) => [
      `${namespace}/${name}`,
      tlsSecretItem(namespace, name, pair.data),
    ]),
  ),
});

/**
 * The LAMPP incident: dd-lampp runs in underpost-workloads behind its labeled Gateway. Two of its TLS Secrets were
 * copied there without a Certificate, one stays in default with its Certificate, and one host has nothing. dd-core
 * still runs in default; the issuer lists its Gateway and a Gateway that is gone.
 */
const incident = (state = {}) => {
  harness = kubeCluster({
    contexts: 'underpost-production\n',
    namespaces: [namespaceItem('default'), namespaceItem(WORKLOADS, { owned: true })],
    crds: CRDS,
    controllers: [
      deployment('dd-lampp-production-green', WORKLOADS, 'dd-lampp-production'),
      deployment('dd-core-production-blue', 'default', 'dd-core-production'),
    ],
    gateways: [
      gatewayItem('dd-lampp-production', WORKLOADS, { hosts: LAMPP_HOSTS, certificates: LAMPP_HOSTS, labels: LAMPP }),
      gatewayItem('dd-core-production', 'default', {
        hosts: ['core.test', 'client.core.test'],
        certificates: ['core.test', 'client.core.test'],
        labels: owned('dd-core-production'),
      }),
    ],
    issuers: [
      issuerItem('letsencrypt-prod', { parentRefs: ['default/dd-core-production', 'default/gone-production'] }),
    ],
    certificates: [
      certificateItem('www.ayleen.test', 'default', { labels: LAMPP, status: { Ready: ['True'] } }),
      certificateItem('core.test', 'default', { status: { Ready: ['True'] } }),
    ],
    ...secretsOf([
      [WORKLOADS, 'www.giancarlo.test'],
      [WORKLOADS, 'giancarlo.test'],
      ['default', 'www.ayleen.test'],
      ['default', 'core.test'],
    ]),
    ...state,
  });
};

/** The TLS plan of a selection against the cluster the harness answers. */
const planOf = async (selection, options = {}) =>
  Underpost.tls.plan({ observation: await Underpost.namespace.observe({ options }), selection, options });

const codes = (findings) => findings.map(({ severity, code }) => `${severity} ${code}`).sort();
const changes = () => harness.calls.filter((call) => / (apply|delete|patch) /.test(call));

describe('the TLS policy of an environment', () => {
  it('names every environment of the cluster a ClusterIssuer serves, and refuses two providers on one issuer', () => {
    const shared = (provider) =>
      fs.outputJsonSync(CONF, {
        environments: {
          production: { context: 'underpost-production', ...PRODUCTION },
          test: {
            context: 'underpost-production',
            profile: 'recommended',
            routing: { provider },
            tls: { mode: 'cert-manager', issuer: 'letsencrypt-prod' },
          },
          development: {
            context: 'kind-kind',
            profile: 'recommended',
            routing: GATEWAY_API,
            tls: { mode: 'self-signed' },
          },
        },
      });
    shared('gateway-api');
    expect(Underpost.tls.issuerConsumers({ environment: 'production' })).toEqual({
      issuer: 'letsencrypt-prod',
      provider: 'gateway-api',
      consumers: [
        { environment: 'production', provider: 'gateway-api' },
        { environment: 'test', provider: 'gateway-api' },
      ],
    });
    shared('contour');
    expect(() => Underpost.tls.issuerConsumers({ environment: 'test' })).toThrow(
      'ClusterIssuer letsencrypt-prod serves production (gateway-api), test (contour): one ClusterIssuer has one solver',
    );
    expect(() => Underpost.tls.issuerConsumers({ environment: 'development' })).toThrow(
      'development issues no ACME certificate',
    );
  });

  it('reads conf.cluster.json: the mode, and the issuer of the cert-manager mode', () => {
    expect(Underpost.tls.policy({ environment: 'production' })).toEqual({
      mode: 'cert-manager',
      issuer: 'letsencrypt-prod',
    });
    expect(Underpost.tls.mode({ environment: 'development' })).toBe('self-signed');
    expect(Underpost.tls.terminates({ environment: 'test' })).toBe(false);
  });

  it('refuses an environment without a policy, and never assumes one', () => {
    fs.outputJsonSync(CONF, { environments: { test: { profile: 'recommended' } } });
    expect(() => Underpost.tls.mode({ environment: 'test' })).toThrow(
      'conf.cluster.json names no TLS policy for test: set environments.test.tls to {"mode": "cert-manager"',
    );
    expect(() => Underpost.tls.mode({ environment: 'production' })).toThrow('environments.production.tls');
    expect(() => Underpost.ingress.provider({ environment: 'test' })).toThrow(
      'set environments.test.routing to {"provider": "gateway-api"} or {"provider": "contour"}',
    );
  });

  it('refuses a policy that is not one, and takes the staging issuer', () => {
    const conf = (tls) => fs.outputJsonSync(CONF, { environments: { test: { profile: 'recommended', tls } } });
    for (const [tls, message] of [
      ['none', 'environments.test.tls is not a TLS policy'],
      [{ mode: 'cert-manager' }, 'environments.test.tls.issuer is missing (letsencrypt-prod, letsencrypt-staging)'],
      [{ mode: 'cert-manager', issuer: 'zerossl' }, 'is not a ClusterIssuer Underpost ships: zerossl'],
      [{ mode: 'self-signed', issuer: 'letsencrypt-prod' }, 'applies to the cert-manager mode only'],
      [{ mode: 'acme' }, 'environments.test.tls.mode is not a TLS mode: acme'],
      [{ mode: 'none', renew: true }, 'environments.test.tls has unknown keys renew'],
    ]) {
      conf(tls);
      expect(() => Underpost.tls.policy({ environment: 'test' })).toThrow(message);
    }
    conf({ mode: 'cert-manager', issuer: 'letsencrypt-staging' });
    expect(Underpost.tls.policy({ environment: 'test' }).issuer).toBe('letsencrypt-staging');
    expect(issuerManifest({ name: 'letsencrypt-staging', solver: 'ingress' }).spec.acme.server).toBe(
      'https://acme-staging-v02.api.letsencrypt.org/directory',
    );
  });

  it('renders the HTTPS listener of each host from the environment, never from a deploy flag', () => {
    const gateway = (env) =>
      yamlLoad(
        Underpost.ingress.gatewayYamlFactory({
          name: `dd-other-${env}`,
          hosts: ['other.test'],
          env,
          options: { env, deployId: 'dd-other' },
        }),
      );
    for (const env of ['production', 'development'])
      expect(gateway(env).spec.listeners.map(({ protocol }) => protocol)).toEqual(['HTTP', 'HTTPS']);
    expect(gateway('test').spec.listeners.map(({ protocol }) => protocol)).toEqual(['HTTP']);
    expect(
      Underpost.ingress.baseProxyYamlFactory({ host: 'other.test', env: 'test', options: { env: 'test' } }),
    ).not.toContain('tls:');
  });
});

describe('the TLS plan', () => {
  it('creates the Certificate of each Secret no Certificate renews, copies a misplaced one, and issues a missing one', async () => {
    incident();
    const plan = await planOf(LAMPP_HOSTS.map((host) => ({ host, deployId: 'dd-lampp' })));
    expect(plan.entries.map(({ host, state }) => `${host} ${state}`)).toEqual([
      'www.giancarlo.test unrenewed',
      'giancarlo.test unrenewed',
      'www.ayleen.test misplaced',
      'ayleen.test missing',
    ]);
    expect(plan.steps.map(({ action, object, to }) => `${action} ${object}${to ? ` → ${to}` : ''}`)).toEqual([
      'issuer undefined',
      `copy Secret/default/www.ayleen.test → ${WORKLOADS}`,
      ...LAMPP_HOSTS.map((host) => `certify Certificate/${WORKLOADS}/${host}`),
      'retire Certificate/default/www.ayleen.test',
    ]);
    expect(plan.steps.find(({ action }) => action === 'certify').manifest).toEqual({
      apiVersion: 'cert-manager.io/v1',
      kind: 'Certificate',
      metadata: { name: 'www.giancarlo.test', namespace: WORKLOADS, labels: LAMPP },
      spec: {
        commonName: 'www.giancarlo.test',
        dnsNames: ['www.giancarlo.test'],
        issuerRef: { name: 'letsencrypt-prod', kind: 'ClusterIssuer' },
        secretName: 'www.giancarlo.test',
      },
    });
    expect(codes(plan.findings)).toEqual([
      'error issuer-gateway-missing',
      'error tls-misplaced',
      'error tls-secret-missing',
      'error tls-unrenewed',
      'error tls-unrenewed',
      'warning certificate-duplicate',
    ]);
  });

  it('reads the issuer against the Gateway inventory: it adds a Gateway, keeps each live one and drops only the gone', async () => {
    incident({
      gateways: [
        gatewayItem('dd-lampp-production', WORKLOADS, { hosts: LAMPP_HOSTS, labels: LAMPP }),
        gatewayItem('dd-core-production', 'default', { hosts: ['core.test'], labels: owned('dd-core-production') }),
        gatewayItem('dd-other-production', WORKLOADS, {
          hosts: ['other.test'],
          labels: owned('dd-other-production'),
          http: false,
        }),
        gatewayItem('dd-old-production', WORKLOADS, {
          hosts: ['old.test'],
          labels: owned('dd-old-production'),
          className: 'contour',
        }),
      ],
    });
    const { issuer } = await planOf([{ host: 'core.test', deployId: 'dd-core' }]);
    expect(issuer).toMatchObject({
      present: true,
      ready: true,
      solver: 'gateway',
      parentRefs: ['default/dd-core-production', 'default/gone-production'],
      desired: ['default/dd-core-production', `${WORKLOADS}/dd-lampp-production`],
      added: [`${WORKLOADS}/dd-lampp-production`],
      removed: ['default/gone-production'],
      excluded: [
        { ref: `${WORKLOADS}/dd-other-production`, reason: 'it has no HTTP listener on port 80' },
        { ref: `${WORKLOADS}/dd-old-production`, reason: 'its class is contour, not eg' },
      ],
    });
  });

  it('creates no Certificate for a host no routing object serves, unless a valid Secret makes a challenge unnecessary', async () => {
    incident({
      gateways: [],
      certificates: [],
      ...secretsOf([
        [WORKLOADS, 'www.giancarlo.test'],
        [WORKLOADS, 'giancarlo.test', pairs.wrong],
      ]),
    });
    const plan = await planOf(LAMPP_HOSTS.map((host) => ({ host, deployId: 'dd-lampp' })));
    expect(plan.entries.map(({ state }) => state)).toEqual(['unrenewed', 'unrouted', 'unrouted', 'unrouted']);
    expect(plan.steps.map(({ action, object }) => `${action} ${object}`)).toEqual([
      `certify Certificate/${WORKLOADS}/www.giancarlo.test`,
    ]);
    expect(plan.findings.find(({ code }) => code === 'tls-unrouted').message).toBe(
      'No routing object serves dd-lampp in production, and its hosts hold no valid TLS Secret: ' +
        'node bin deploy dd-lampp production, then node bin tls reconcile --deploy-id dd-lampp --env production --apply',
    );
  });

  it('keeps a Ready Certificate, corrects the spec of its own, and changes none another deployment owns', async () => {
    incident({
      certificates: [
        certificateItem('www.giancarlo.test', WORKLOADS, { labels: LAMPP, status: { Ready: ['True'] } }),
        {
          ...certificateItem('giancarlo.test', WORKLOADS, { labels: LAMPP, status: { Ready: ['True'] } }),
          spec: {
            secretName: 'giancarlo.test',
            dnsNames: ['old.test'],
            issuerRef: { name: 'staging', kind: 'Issuer' },
          },
        },
        certificateItem('www.ayleen.test', WORKLOADS, {
          labels: owned('dd-core-production'),
          status: { Ready: ['True'] },
        }),
      ],
      ...secretsOf([
        [WORKLOADS, 'www.giancarlo.test'],
        [WORKLOADS, 'giancarlo.test'],
        [WORKLOADS, 'www.ayleen.test'],
      ]),
    });
    const plan = await planOf(LAMPP_HOSTS.slice(0, 3).map((host) => ({ host, deployId: 'dd-lampp' })));
    expect(plan.entries.map(({ state }) => state)).toEqual(['ready', 'ready', 'foreign']);
    expect(plan.steps.map(({ action, object }) => `${action} ${object}`)).toEqual([
      'issuer undefined',
      `certify Certificate/${WORKLOADS}/giancarlo.test`,
    ]);
    expect(codes(plan.findings)).toEqual([
      'error certificate-foreign',
      'error issuer-gateway-missing',
      'warning certificate-spec',
    ]);
  });

  it('removes a duplicate Certificate only where no live Gateway serves its Secret', async () => {
    incident({
      gateways: [
        gatewayItem('dd-lampp-production', WORKLOADS, { hosts: LAMPP_HOSTS, certificates: LAMPP_HOSTS, labels: LAMPP }),
        gatewayItem('dd-lampp-production', 'default', {
          hosts: ['www.ayleen.test'],
          certificates: ['www.ayleen.test'],
          labels: LAMPP,
        }),
      ],
    });
    const selection = [{ host: 'www.ayleen.test', deployId: 'dd-lampp' }];
    const observation = await Underpost.namespace.observe();
    const plan = (retired) => Underpost.tls.plan({ observation, selection, retired });
    expect(plan().steps.map(({ action }) => action)).not.toContain('retire');
    expect(plan(['Gateway/default/dd-lampp-production']).steps.find(({ action }) => action === 'retire')).toEqual({
      action: 'retire',
      object: 'Certificate/default/www.ayleen.test',
      keep: 'Secret/default/www.ayleen.test',
      after: `Certificate/${WORKLOADS}/www.ayleen.test`,
      deployId: 'dd-lampp',
    });
  });

  it('finds a stale or a stuck challenge, a challenge listener that is missing, and an ungranted Secret', async () => {
    const lampp = gatewayItem('dd-lampp-production', WORKLOADS, {
      hosts: LAMPP_HOSTS,
      certificates: LAMPP_HOSTS,
      labels: LAMPP,
    });
    lampp.spec.listeners = lampp.spec.listeners.filter(
      ({ hostname, protocol }) => !(hostname === 'ayleen.test' && protocol === 'HTTP'),
    );
    lampp.spec.listeners.find(
      ({ hostname, protocol }) => hostname === 'www.giancarlo.test' && protocol === 'HTTPS',
    ).tls.certificateRefs = [{ name: 'shared', namespace: 'shared-tls' }];
    incident({
      gateways: [lampp],
      issuers: [issuerItem('letsencrypt-prod', { parentRefs: [`${WORKLOADS}/dd-lampp-production`] })],
      challenges: [
        challengeItem('giancarlo-1', WORKLOADS, {
          host: 'giancarlo.test',
          parentRefs: ['default/dd-lampp-production'],
        }),
        challengeItem('ayleen-1', WORKLOADS, {
          host: 'www.ayleen.test',
          created: '2001-01-01T00:00:00Z',
          reason: 'Waiting for HTTP-01 challenge propagation: wrong status code 404',
          parentRefs: [`${WORKLOADS}/dd-lampp-production`],
        }),
      ],
    });
    const plan = await planOf(LAMPP_HOSTS.map((host) => ({ host, deployId: 'dd-lampp' })));
    expect(plan.steps.filter(({ action }) => action === 'rechallenge')).toEqual([
      { action: 'rechallenge', object: `Challenge/${WORKLOADS}/giancarlo-1`, deployId: 'dd-lampp' },
    ]);
    const messages = Object.fromEntries(plan.findings.map(({ code, message }) => [code, message]));
    expect(messages['acme-challenge-stale']).toContain('routes its challenge through default/dd-lampp-production');
    expect(messages['acme-challenge-stuck']).toBe(
      `Challenge/${WORKLOADS}/ayleen-1 is pending: Waiting for HTTP-01 challenge propagation: wrong status code 404. ` +
        `Check that http://www.ayleen.test/.well-known/acme-challenge/ reaches Gateway/${WORKLOADS}/dd-lampp-production from the internet`,
    );
    expect(messages['challenge-listener-missing']).toContain('has no HTTP listener on port 80 for ayleen.test');
    expect(messages['tls-reference-ungranted']).toBe(
      `Gateway/${WORKLOADS}/dd-lampp-production names shared-tls/shared, and no ReferenceGrant in shared-tls admits it`,
    );
  });

  it('reports a cluster without cert-manager or without its Gateway API support, and plans no change there', async () => {
    incident({ crds: CRDS.filter((crd) => !crd.endsWith('cert-manager.io')) });
    const without = await planOf([{ host: 'ayleen.test', deployId: 'dd-lampp' }]);
    expect(codes(without.findings)).toEqual(['error cert-manager-missing', 'error tls-secret-missing']);
    expect(without.steps).toEqual([]);
    harness.restore();
    incident({ certManager: { args: '["--v=2"]', config: 'apiVersion: controller.config.cert-manager.io/v1alpha1' } });
    const status = await Underpost.tls.status({ options: { host: 'core.test' } });
    expect(codes(status.findings)).toEqual(['error cert-manager-gateway-api-disabled']);
  });

  it('reports a controller that started before the Gateway API CRDs, and each release against the compatibility policy', async () => {
    incident({
      certManager: {
        args: '["--v=2"]',
        image: 'quay.io/jetstack/cert-manager-controller:v1.15.3',
        config: 'enableGatewayAPI: true',
        started: '2026-11-01T10:00:00Z 2026-11-01T10:00:05Z',
        crd: '2026-11-02T08:00:00Z',
      },
    });
    const status = await Underpost.tls.status({ options: { host: 'core.test' } });
    expect(status.findings.filter(({ code }) => code.startsWith('cert-manager')).map(({ message }) => message)).toEqual(
      [
        'cert-manager started before the Gateway API CRDs were installed, so it creates no gateway challenge route: ' +
          'kubectl rollout restart deployment cert-manager -n cert-manager',
        'cert-manager runs v1.15.3; upstream supports 1.20 and 1.21 only (https://cert-manager.io/docs/releases)',
        'cert-manager runs v1.15.3, and Underpost has evidence for v1.17.0 only: run the ACME staging steps of ' +
          'verify-on-a-disposable-cluster.md on it',
      ],
    );
    // Upstream support and Underpost evidence are separate facts: each release reports what it lacks.
    const policyOf = async (version) => {
      harness.restore();
      incident({
        certManager: {
          args: '["--v=2"]',
          image: `quay.io/jetstack/cert-manager-controller:${version}`,
          config: 'enableGatewayAPI: true',
          started: '2026-11-02T10:00:00Z',
          crd: '2026-11-02T08:00:00Z',
        },
      });
      return (await Underpost.tls.status({ options: { host: 'core.test' } })).findings
        .filter(({ code }) => code.startsWith('cert-manager'))
        .map(({ severity, code }) => `${severity} ${code}`);
    };
    expect(await policyOf('v1.21.2')).toEqual(['warning cert-manager-untested']);
    expect(await policyOf(CERT_MANAGER_RELEASES.installed)).toEqual(['warning cert-manager-end-of-life']);
    harness.restore();
    incident({
      certManager: {
        args: '["--v=2", "--enable-gateway-api"]',
        image: 'quay.io/jetstack/cert-manager-controller:v1.14.5',
        config: '',
        started: '2026-11-02T10:00:00Z',
        crd: '2026-11-02T08:00:00Z',
      },
    });
    const old = await Underpost.tls.status({ options: { host: 'core.test' } });
    expect(old.findings.filter(({ code }) => code.startsWith('cert-manager'))).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'cert-manager-unsupported',
        message: 'cert-manager runs v1.14.5, older than v1.15.0, the first release that enables its Gateway API solver',
      }),
    ]);
  });

  it('lists no Gateway the controller does not program, nor one whose HTTP listener it refuses', async () => {
    incident({
      gateways: [
        gatewayItem('dd-lampp-production', WORKLOADS, { hosts: LAMPP_HOSTS, labels: LAMPP }),
        gatewayItem('dd-core-production', 'default', {
          hosts: ['core.test'],
          labels: owned('dd-core-production'),
          status: { Programmed: ['False', 'AddressNotAssigned'] },
        }),
        gatewayItem('dd-other-production', WORKLOADS, {
          hosts: ['other.test'],
          labels: owned('dd-other-production'),
          httpListeners: { 'other.test': { Accepted: ['False', 'UnsupportedProtocol'] } },
        }),
      ],
    });
    const { issuer } = await planOf([{ host: 'core.test', deployId: 'dd-core' }]);
    expect(issuer.excluded).toEqual([
      { ref: 'default/dd-core-production', reason: 'it is not programmed: AddressNotAssigned' },
      { ref: `${WORKLOADS}/dd-other-production`, reason: 'the controller accepts none of its HTTP listeners' },
    ]);
    // A listed Gateway stays listed while it exists: a targeted change never drops another reference.
    expect(issuer.desired).toEqual(['default/dd-core-production', `${WORKLOADS}/dd-lampp-production`]);
  });

  it('issues self-signed TLS where the environment says so, and plans nothing where TLS is off', async () => {
    harness = kubeCluster({
      crds: CRDS,
      certificates: [certificateItem('core.test', WORKLOADS, { status: { Ready: ['True'] } })],
      ...secretsOf([[WORKLOADS, 'core.test']]),
    });
    const selection = [
      { host: 'core.test', deployId: 'dd-core' },
      { host: 'other.test', deployId: 'dd-other' },
    ];
    const development = await planOf(selection, { env: 'development' });
    expect(development.entries.map(({ state }) => state)).toEqual(['ready', 'missing']);
    expect(development.steps.map(({ action, object }) => `${action} ${object}`)).toEqual([
      `issue Secret/${WORKLOADS}/other.test`,
    ]);
    expect(codes(development.findings)).toEqual(['error tls-secret-missing', 'warning certificate-unexpected']);
    const off = await planOf(selection, { env: 'test' });
    expect(off).toMatchObject({ mode: 'none', steps: [], findings: [] });
    expect(off.entries.map(({ state }) => state)).toEqual(['http-only', 'http-only']);
  });
});

describe('the ACME issuer manifest', () => {
  it('keeps the account of the base manifest and renders the solver of the routing stack', () => {
    const base = yamlLoad(fs.readFileSync(ISSUER_MANIFEST, 'utf8'));
    const issuer = issuerManifest({
      name: 'letsencrypt-prod',
      solver: 'gateway',
      parentRefs: [
        { namespace: 'default', name: 'dd-core-production' },
        { namespace: WORKLOADS, name: 'dd-lampp-production' },
      ],
    });
    expect(issuer.metadata.name).toBe('letsencrypt-prod');
    expect(issuer.spec.acme.server).toBe(base.spec.acme.server);
    expect(issuer.spec.acme.privateKeySecretRef).toEqual(base.spec.acme.privateKeySecretRef);
    expect(issuer.spec.acme.solvers).toEqual([
      {
        http01: {
          gatewayHTTPRoute: {
            parentRefs: [
              { name: 'dd-core-production', namespace: 'default', kind: 'Gateway' },
              { name: 'dd-lampp-production', namespace: WORKLOADS, kind: 'Gateway' },
            ],
          },
        },
      },
    ]);
    expect(issuerManifest({ name: 'letsencrypt-prod', solver: 'ingress' }).spec.acme.solvers).toEqual([
      { http01: { ingress: { class: 'contour' } } },
    ]);
    // Before a Gateway exists, the issuer registers its account and solves nothing.
    expect(issuerManifest({ name: 'letsencrypt-prod', solver: 'gateway' }).spec.acme.solvers).toEqual([]);
  });

  it('takes the account email from GITHUB_EMAIL, never from the base manifest', () => {
    expect(yamlLoad(fs.readFileSync(ISSUER_MANIFEST, 'utf8')).spec.acme).not.toHaveProperty('email');
    vi.stubEnv('GITHUB_EMAIL', 'ops@example.com');
    expect(issuerManifest({ name: 'letsencrypt-prod', solver: 'ingress' }).spec.acme.email).toBe('ops@example.com');
  });
});

describe('the tls command', () => {
  it('reconciles the TLS of a deployment as a server dry run in the context it read', async () => {
    incident();
    const { context, plan, applied } = await Underpost.tls.reconcile({ options: { deployId: 'dd-lampp' } });
    expect({ context, applied }).toEqual({ context: 'underpost-production', applied: false });
    expect(plan.map(({ action }) => action)).toEqual([
      'issuer',
      'copy',
      'certify',
      'certify',
      'certify',
      'certify',
      'retire',
    ]);
    expect(changes().length).toBe(7);
    expect(
      changes().every((call) => call.includes('--dry-run=server') && call.includes('--context underpost-production')),
    ).toBe(true);
    harness.settle();
    expect(harness.state.certificates.length).toBe(2);
  });

  it('applies it: each Certificate exists, the issuer lists the Gateway, valid Secrets stay, and no workload changes', async () => {
    incident();
    const report = await Underpost.tls.reconcile({ apply: true, options: { env: 'production', deployId: 'dd-lampp' } });
    expect(report).toMatchObject({ applied: true, unready: [], unchanged: [] });
    harness.settle();
    const certificates = harness.state.certificates
      .map(({ metadata }) => `${metadata.namespace}/${metadata.name}`)
      .sort();
    expect(certificates).toEqual(['default/core.test', ...LAMPP_HOSTS.map((host) => `${WORKLOADS}/${host}`).sort()]);
    expect(harness.state.certificates.find(({ metadata }) => metadata.name === 'ayleen.test').metadata.labels).toEqual(
      LAMPP,
    );
    const [issuer] = harness.state.issuers;
    expect(
      issuer.spec.acme.solvers[0].http01.gatewayHTTPRoute.parentRefs.map(
        ({ namespace, name }) => `${namespace}/${name}`,
      ),
    ).toEqual(['default/dd-core-production', `${WORKLOADS}/dd-lampp-production`]);
    // The duplicate goes as an orphan owner: its Secret stays. The Secrets in place are never written.
    const deletes = harness.calls.filter((call) => / delete /.test(call));
    expect(deletes).toEqual([
      'kubectl --context underpost-production delete certificates.cert-manager.io www.ayleen.test -n default ' +
        '--cascade=orphan --wait=true --timeout=5m --ignore-not-found',
    ]);
    expect(Object.keys(harness.state.secretObjects).sort()).toEqual(
      [
        'default/core.test',
        'default/www.ayleen.test',
        `${WORKLOADS}/giancarlo.test`,
        `${WORKLOADS}/www.ayleen.test`,
        `${WORKLOADS}/www.giancarlo.test`,
      ].sort(),
    );
    expect(changes().some((call) => /deployment|service|persistentvolume/.test(call))).toBe(false);
    expect(harness.calls.join('\n')).not.toContain(pairs['www.ayleen.test'].data['tls.key']);
  });

  it('reports a Certificate that is not Ready, and keeps the Certificate it would replace', async () => {
    incident({ unready: ['www.ayleen.test'] });
    const report = await Underpost.tls.reconcile({
      apply: true,
      options: { env: 'production', host: 'www.ayleen.test' },
    });
    expect(report.unready).toEqual([`Certificate/${WORKLOADS}/www.ayleen.test`]);
    expect(report.plan.map(({ action }) => action)).not.toContain('retire');
    harness.settle();
    expect(
      harness.state.certificates.some(
        ({ metadata }) => metadata.namespace === 'default' && metadata.name === 'www.ayleen.test',
      ),
    ).toBe(true);
  });

  it('renews a Certificate through cert-manager, and deletes nothing', async () => {
    incident();
    const report = await Underpost.tls.renew({ apply: true, options: { env: 'production', host: 'core.test' } });
    expect(report.plan).toEqual([{ action: 'renew', object: 'Certificate/default/core.test' }]);
    const issuing = harness.state.certificates
      .find(({ metadata }) => metadata.name === 'core.test')
      .status.conditions.find(({ type }) => type === 'Issuing');
    expect(issuing).toMatchObject({ status: 'True', reason: 'ManuallyTriggered' });
    expect(
      changes().every((call) =>
        call.includes(' patch certificates.cert-manager.io core.test -n default --subresource=status'),
      ),
    ).toBe(true);
    await expect(
      Underpost.tls.renew({ apply: true, options: { env: 'production', host: 'ayleen.test' } }),
    ).rejects.toThrow(
      'No Certificate renews ayleen.test: node bin tls reconcile --host ayleen.test --env production --apply',
    );
  });

  it('reconciles the issuer from the Gateway inventory', async () => {
    incident();
    const status = await Underpost.tls.issuer('status', { options: {} });
    expect(status).toMatchObject({ added: [`${WORKLOADS}/dd-lampp-production`], removed: ['default/gone-production'] });
    expect(changes()).toEqual([]);
    const applied = await Underpost.tls.issuer('reconcile', { apply: true, options: { env: 'production' } });
    expect(applied).toMatchObject({ applied: true, changed: true });
    harness.settle();
    expect(harness.state.issuers[0].spec.acme.solvers[0].http01.gatewayHTTPRoute.parentRefs.length).toBe(2);
    const again = await Underpost.tls.issuer('reconcile', { apply: true, options: { env: 'production' } });
    expect(again).toMatchObject({ applied: false, changed: false });
  });

  it('refuses an unclear change, and a production cluster the configuration does not name', async () => {
    incident();
    await expect(Underpost.tls.reconcile({ apply: true, options: { deployId: 'dd-lampp' } })).rejects.toThrow(
      'tls reconcile --apply needs --env',
    );
    await expect(Underpost.tls.reconcile({ apply: true, options: { env: 'production' } })).rejects.toThrow(
      'tls reconcile --apply needs --deploy-id or --host, or --all',
    );
    await expect(Underpost.tls.renew({ options: { env: 'production' } })).rejects.toThrow('tls renew needs --host');
    expect(harness.calls).toEqual([]);
    fs.outputJsonSync(CONF, { environments: { production: PRODUCTION } });
    await expect(Underpost.tls.status({ options: { deployId: 'dd-lampp' } })).rejects.toThrow(
      'environments.production.context is not configured',
    );
    await expect(
      Underpost.tls.status({ options: { deployId: 'dd-lampp', currentContext: true } }),
    ).resolves.toMatchObject({ mode: 'cert-manager' });
  });
});

describe('self-signed TLS', () => {
  const local = (host, pair) => {
    fs.outputFileSync(`./.underpost/ssl/${host}/localhost-fullchain.pem`, pair.cert);
    fs.outputFileSync(`./.underpost/ssl/${host}/localhost-key.pem`, pair.key);
  };

  it('applies the certificate of this machine as the TLS Secret in one apply, and issues nothing in a dry run', async () => {
    harness = kubeCluster({ crds: CRDS });
    local('other.test', pairs['other.test']);
    const options = { env: 'development', deployId: 'dd-other' };
    await Underpost.tls.reconcile({ options });
    expect(changes()).toEqual([]);
    const report = await Underpost.tls.reconcile({ apply: true, options });
    expect(report.plan).toEqual([
      {
        action: 'issue',
        object: `Secret/${WORKLOADS}/other.test`,
        host: 'other.test',
        owner: 'dd-other-development',
        deployId: 'dd-other',
      },
    ]);
    harness.settle();
    const secret = harness.state.secretObjects[`${WORKLOADS}/other.test`];
    expect(secret.data['tls.crt']).toBe(pairs['other.test'].data['tls.crt']);
    expect(secret.metadata.labels).toEqual(owned('dd-other-development'));
    expect(harness.ran('ssl.sh')).toBe(false);
    expect(harness.calls.some((call) => / delete /.test(call))).toBe(false);
    expect(harness.calls.join('\n')).not.toContain(pairs['other.test'].data['tls.key']);
    expect(report.unchanged).toEqual([]);
  });

  it('rotates it on renew: this machine issues a new certificate, and the Secret is replaced in place', async () => {
    harness = kubeCluster({ crds: CRDS, ...secretsOf([[WORKLOADS, 'other.test']]) });
    local('other.test', pairs['other.test']);
    const rotated = tlsPair(['other.test']);
    harness.route({
      match: (call) => {
        if (call.includes('ssl.sh')) local('other.test', rotated);
        return false;
      },
    });
    await Underpost.tls.renew({ apply: true, options: { env: 'development', host: 'other.test' } });
    harness.settle();
    expect(harness.ran('ssl.sh')).toBe(true);
    expect(harness.state.secretObjects[`${WORKLOADS}/other.test`].data['tls.crt']).toBe(rotated.data['tls.crt']);
    expect(harness.calls.some((call) => / delete /.test(call))).toBe(false);
  });
});

describe('the deploy command owns no certificate', () => {
  const source = (file) => fs.readFileSync(nodePath.join(cwd, file), 'utf8');

  it('renders no Certificate or issuer and takes no certificate flag', () => {
    expect(source('src/cli/deploy.js')).not.toMatch(/cert-manager\.io|ClusterIssuer|kind: Certificate/);
    const command = source('src/cli/index.js');
    const deploy = command.slice(
      command.indexOf(".options(program.command('deploy'))"),
      command.indexOf('.action(Underpost.deploy.callback)'),
    );
    expect(deploy).not.toMatch(/'--cert\b|--cert-hosts|--self-signed/);
    for (const name of [
      'buildCertManagerCertificate',
      'applyLetsEncryptIssuer',
      'selfSignedTlsSecretFactory',
      'isCertManagerContext',
    ])
      expect(Underpost.deploy[name]).toBeUndefined();
  });
});
