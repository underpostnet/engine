// `run node-move` against a cluster the shell harness answers: it refuses a node that does not hold the
// data of a workload or that its scheduling excludes, changes only the nodeSelector keys it records, waits
// for the rollout and checks where the pods run. No real kubectl runs.

import { afterEach, describe, expect, it } from 'vitest';
import Underpost from '../../../src/index.js';
import { shellHarness } from '../../support/shell-harness.js';

const move = (path, options) =>
  Underpost.run.CALL('node-move', path, { ...Underpost.run.DEFAULT_OPTION, namespace: 'apps', ...options });

const nodeItem = (name, labels = {}) => ({
  metadata: { name, labels: { 'kubernetes.io/hostname': name, ...labels } },
  spec: {},
  status: { conditions: [{ type: 'Ready', status: 'True' }] },
});
const deployment = ({ volumes = [], nodeSelector, annotations } = {}) => ({
  kind: 'Deployment',
  metadata: { name: 'web', namespace: 'apps', ...(annotations ? { annotations } : {}) },
  spec: {
    selector: { matchLabels: { app: 'web' } },
    template: {
      spec: {
        ...(nodeSelector ? { nodeSelector } : {}),
        volumes,
        containers: [{ name: 'web', volumeMounts: volumes.map(({ name }) => ({ name, mountPath: `/${name}` })) }],
      },
    },
  },
});
const podsOn = (...nodes) => ({
  items: nodes.map((nodeName, index) => ({ metadata: { name: `web-${index}` }, spec: { nodeName } })),
});
const localVolume = {
  metadata: { name: 'pv-web' },
  spec: {
    local: { path: '/mnt/web' },
    claimRef: { namespace: 'apps', name: 'web-data' },
    nodeAffinity: {
      required: {
        nodeSelectorTerms: [{ matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values: ['n1'] }] }],
      },
    },
  },
};

let harness;
afterEach(() => harness?.restore());

/** A cluster with nodes n1 and n2, one controller, and its pods on n1 until a patch moves them to n2. */
const cluster = ({ controller, claims = [], volumes = [], placed = 'n2', rollout = 0, labels = {} }) => {
  harness?.restore();
  harness = shellHarness([
    { match: /^kubectl get node 'n2' /, stdout: JSON.stringify(nodeItem('n2', labels)) },
    { match: 'kubectl get pvc -n apps', stdout: JSON.stringify({ items: claims }) },
    { match: 'kubectl get pv ', stdout: JSON.stringify({ items: volumes }) },
    { match: 'kubectl get deployment web -n apps', stdout: JSON.stringify(controller) },
    {
      match: 'kubectl get pods -n apps',
      get stdout() {
        return JSON.stringify(harness.ran('kubectl patch') ? podsOn(placed) : podsOn('n1'));
      },
    },
    { match: 'kubectl rollout status', code: rollout },
  ]);
  return harness;
};
const patches = () => harness.calls.filter((call) => call.startsWith('kubectl patch'));

describe('run node-move', async () => {
  it('records the keys it sets beside the nodeSelector it keeps, then checks the rollout and the pods', async () => {
    cluster({ controller: deployment({ nodeSelector: { disk: 'ssd' } }), labels: { disk: 'ssd' } });
    expect(await move('deployment/web', { nodeName: 'n2' })).toEqual([
      { ref: 'deployment/web', status: 'moved', node: 'n2' },
    ]);
    const [patch] = patches();
    expect(JSON.parse(patch.match(/-p '(.*)'$/)[1])).toEqual({
      metadata: { annotations: { 'underpost.net/node-placement': '{"kubernetes.io/hostname":"n2"}' } },
      spec: { template: { spec: { nodeSelector: { 'kubernetes.io/hostname': 'n2' } } } },
    });
    expect(harness.ran('kubectl rollout status deployment/web -n apps --timeout=5m')).toBe(true);
  });

  it('refuses a node that does not hold the local volume of the workload, and patches nothing', async () => {
    cluster({
      controller: deployment({ volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'web-data' } }] }),
      claims: [{ metadata: { name: 'web-data', namespace: 'apps' }, spec: { volumeName: 'pv-web' } }],
      volumes: [localVolume],
    });
    await expect(move('deployment/web', { nodeName: 'n2' })).rejects.toThrow(
      'deployment/web refused: Deployment/apps/web keeps /mnt/web (PersistentVolume pv-web of apps/web-data) on n1, and n2 does not hold it',
    );
    expect(patches()).toEqual([]);
  });

  it('refuses a node another nodeSelector key excludes', async () => {
    cluster({ controller: deployment({ nodeSelector: { disk: 'ssd' } }) });
    await expect(move('deployment/web', { nodeName: 'n2' })).rejects.toThrow(
      'the nodeSelector disk=ssd excludes node n2',
    );
    expect(patches()).toEqual([]);
  });

  it('labels a pool node only before the first patch, never for a refused move', async () => {
    cluster({ controller: deployment({ nodeSelector: { disk: 'ssd' } }) });
    await expect(move('deployment/web', { nodeName: 'n2', labels: 'pool=web' })).rejects.toThrow(
      'the nodeSelector disk=ssd excludes node n2',
    );
    expect(harness.calls.some((call) => call.startsWith('kubectl label'))).toBe(false);
    cluster({ controller: deployment() });
    await move('deployment/web', { nodeName: 'n2', labels: 'pool=web' });
    const label = harness.calls.findIndex((call) => call === 'kubectl label node n2 pool=web --overwrite');
    expect(label).toBeGreaterThan(-1);
    expect(label).toBeLessThan(harness.calls.findIndex((call) => call.startsWith('kubectl patch')));
  });

  it('reports a workload whose pods stay Pending after the move, and fails', async () => {
    cluster({ controller: deployment(), placed: '', rollout: 1 });
    await expect(move('deployment/web', { nodeName: 'n2' })).rejects.toThrow(
      'deployment/web not-placed: web-0 on no node (Pending)',
    );
  });

  it('removes only the keys it recorded, with a test of each value', async () => {
    cluster({
      controller: deployment({
        nodeSelector: { 'kubernetes.io/hostname': 'n2', disk: 'ssd' },
        annotations: { 'underpost.net/node-placement': '{"kubernetes.io/hostname":"n2"}' },
      }),
    });
    expect(await move('deployment/web', { remove: true })).toEqual([{ ref: 'deployment/web', status: 'cleared' }]);
    const [patch] = patches();
    expect(JSON.parse(patch.match(/-p '(.*)'$/)[1])).toEqual([
      { op: 'test', path: '/spec/template/spec/nodeSelector/kubernetes.io~1hostname', value: 'n2' },
      { op: 'remove', path: '/spec/template/spec/nodeSelector/kubernetes.io~1hostname' },
      { op: 'remove', path: '/metadata/annotations/underpost.net~1node-placement' },
    ]);
    cluster({ controller: deployment({ nodeSelector: { disk: 'ssd' } }) });
    expect(await move('deployment/web', { remove: true })).toEqual([
      { ref: 'deployment/web', status: 'already-cleared' },
    ]);
    expect(patches()).toEqual([]);
  });
});
