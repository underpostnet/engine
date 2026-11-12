// The platform apart from the workloads: the HTTPRoutes beside the Gateway reach the gateway Service in
// its own namespace through an explicit backend namespace, which a ReferenceGrant admits.

import { afterEach, describe, expect, it } from 'vitest';
import { loadAll } from 'js-yaml';
import Underpost from '../../../src/index.js';
import { UNDERPOST_GATEWAY } from '../../../src/server/network/underpost-gateway.js';
import { shellHarness } from '../../support/shell-harness.js';

const APART = { namespacePlatform: 'underpost-platform', namespaceWorkloads: 'underpost-workloads' };
const SHARED = { namespacePlatform: 'apps', namespaceWorkloads: 'apps' };

let harness;
afterEach(() => harness?.restore());

describe('the platform apart from the workloads', () => {
  it('routes to the gateway in its own namespace, and to the shared namespace without naming it', () => {
    const backend = { serviceId: UNDERPOST_GATEWAY.serviceName, port: UNDERPOST_GATEWAY.port };
    expect(Underpost.ingress.gatewayBackendFactory(APART)).toEqual({
      ...backend,
      serviceNamespace: 'underpost-platform',
    });
    expect(Underpost.ingress.gatewayBackendFactory(SHARED)).toEqual(backend);
    expect(
      Underpost.ingress.httpRouteRuleFactory({ path: '/', ...Underpost.ingress.gatewayBackendFactory(APART) }),
    ).toContain(
      `        - name: ${UNDERPOST_GATEWAY.serviceName}\n          namespace: underpost-platform\n          port: ${UNDERPOST_GATEWAY.port}\n`,
    );
    expect(Underpost.ingress.httpRouteRuleFactory({ path: '/', port: 8080, serviceId: 'app' })).not.toContain(
      'namespace:',
    );
  });

  it('grants the routes of one namespace the Services of another, and nothing within one namespace', () => {
    const [grant] = loadAll(
      Underpost.ingress.referenceGrantYamlFactory({
        namespace: 'underpost-platform',
        fromNamespace: 'underpost-workloads',
        services: [UNDERPOST_GATEWAY.serviceName],
      }),
    ).filter(Boolean);
    expect(grant).toEqual({
      apiVersion: 'gateway.networking.k8s.io/v1beta1',
      kind: 'ReferenceGrant',
      metadata: {
        name: 'routes-from-underpost-workloads',
        namespace: 'underpost-platform',
        labels: { 'app.kubernetes.io/managed-by': 'underpost' },
      },
      spec: {
        from: [{ group: 'gateway.networking.k8s.io', kind: 'HTTPRoute', namespace: 'underpost-workloads' }],
        to: [{ group: '', kind: 'Service', name: UNDERPOST_GATEWAY.serviceName }],
      },
    });
    expect(
      Underpost.ingress.referenceGrantYamlFactory({ namespace: 'apps', fromNamespace: 'apps', services: ['x'] }),
    ).toBe('');
  });

  it('renders the gateway workload into the platform namespace, with the grant its routes need', () => {
    harness = shellHarness();
    const documents = loadAll(Underpost.deploy.underpostGatewayYamlFactory(APART)).filter(Boolean);
    const namespaced = documents.filter(({ metadata }) => metadata.namespace);
    expect(namespaced.length).toBeGreaterThan(0);
    expect(namespaced.every(({ metadata }) => metadata.namespace === 'underpost-platform')).toBe(true);
    expect(documents.find(({ kind }) => kind === 'ReferenceGrant').spec.from[0].namespace).toBe('underpost-workloads');
    expect(
      loadAll(Underpost.deploy.underpostGatewayYamlFactory(SHARED))
        .filter(Boolean)
        .map(({ kind }) => kind),
    ).not.toContain('ReferenceGrant');
  });

  it('grants the routes a deploy publishes apart from the platform, and nothing within one namespace', () => {
    harness = shellHarness();
    Underpost.ingress.applyGatewayGrant({
      namespace: 'underpost-workloads',
      env: 'production',
      options: { namespacePlatform: 'underpost-platform' },
    });
    const [grant] = harness.calls.filter((call) => call.startsWith('kubectl apply -f -'));
    expect(grant).toContain('kind: ReferenceGrant');
    expect(grant).toContain('name: routes-from-underpost-workloads');
    expect(grant).toContain('namespace: underpost-platform');
    harness.calls.length = 0;
    Underpost.ingress.applyGatewayGrant({
      namespace: 'apps',
      env: 'production',
      options: { namespacePlatform: 'apps' },
    });
    expect(harness.calls).toEqual([]);
  });
});

describe('a retained volume and the claim of an installer', () => {
  const claim = {
    volume: UNDERPOST_GATEWAY.volumeName,
    namespace: 'underpost-platform',
    claim: UNDERPOST_GATEWAY.claimName,
  };
  const cluster = ({ holder = '', live = '' }) =>
    shellHarness([
      { match: 'kubectl get pv ', stdout: holder },
      { match: 'kubectl get pvc ', stdout: live },
    ]);

  it('takes a missing volume, and a volume its own claim holds, as they are', () => {
    harness = cluster({});
    expect(Underpost.kubectl.claimVolume(claim)).toBe('absent');
    harness.restore();
    harness = cluster({ holder: 'underpost-platform/pvc-underpost-gateway/uid-1' });
    expect(Underpost.kubectl.claimVolume(claim)).toBe('ready');
    expect(harness.ran(' patch ')).toBe(false);
  });

  it('refuses a volume that a live claim of another namespace holds', () => {
    harness = cluster({ holder: 'default/pvc-underpost-gateway/uid-1', live: 'uid-1' });
    expect(() => Underpost.kubectl.claimVolume(claim)).toThrow(
      'PersistentVolume pv-underpost-gateway holds the data of default/pvc-underpost-gateway, which is live',
    );
    expect(harness.ran(' patch ')).toBe(false);
  });

  it('gives a released volume to the new claim, so its data stays', () => {
    harness = cluster({ holder: 'default/pvc-underpost-gateway/uid-1' });
    expect(Underpost.kubectl.claimVolume(claim)).toBe('released');
    const [patch] = harness.calls.filter((call) => call.includes(' patch pv '));
    expect(patch).toContain('"op":"replace","path":"/spec/claimRef"');
    expect(patch).toContain('"namespace":"underpost-platform","name":"pvc-underpost-gateway"');
    expect(patch).not.toContain('uid');
  });
});
