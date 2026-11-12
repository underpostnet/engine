// The storage placement planner and the node admission rules: where the data of a workload lives, and which
// nodes can take its pods. Pure functions over API objects; nothing reads a cluster.

import { describe, expect, it } from 'vitest';
import { admissionRefusals } from '../../../src/server/runtime/pod-scheduling.js';
import { controllerData, storageRefusals, volumeRecord } from '../../../src/server/runtime/storage-placement.js';

const affinity = (...nodes) => ({
  required: {
    nodeSelectorTerms: [{ matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values: nodes }] }],
  },
});
const pv = (name, spec) => ({ metadata: { name }, spec: { persistentVolumeReclaimPolicy: 'Retain', ...spec } });
const claim = (name, volumeName) => ({ metadata: { name, namespace: 'apps' }, spec: { volumeName } });
const mounted = (volumes, readOnly = false) => [
  { name: 'app', volumeMounts: volumes.map(({ name }) => ({ name, mountPath: `/${name}`, readOnly })) },
];
const controller = (kind, { volumes = [], replicas = 1, claimTemplates, readOnly } = {}) => ({
  kind,
  metadata: { name: 'db', namespace: 'apps' },
  spec: {
    replicas,
    template: { spec: { volumes, containers: mounted(volumes, readOnly) } },
    ...(claimTemplates ? { volumeClaimTemplates: claimTemplates.map((name) => ({ metadata: { name } })) } : {}),
  },
});
const node = (name, { ready = true, unschedulable = false, taints = [], labels = {} } = {}) => ({
  metadata: { name, labels: { 'kubernetes.io/hostname': name, ...labels } },
  spec: { unschedulable, taints },
  status: { conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] },
});

describe('the record of a PersistentVolume', () => {
  it('names the nodes of a host path or local volume, and marks attachable storage', () => {
    expect(
      volumeRecord(
        pv('pv-a', {
          hostPath: { path: '/data/a' },
          nodeAffinity: affinity('n1'),
          claimRef: { namespace: 'apps', name: 'c' },
        }),
      ),
    ).toMatchObject({ claim: 'apps/c', hostPath: '/data/a', nodes: ['n1'], affinity: 'hostname', attachable: false });
    expect(volumeRecord(pv('pv-b', { local: { path: '/mnt/b' }, nodeAffinity: affinity('n2', 'n1') }))).toMatchObject({
      hostPath: '/mnt/b',
      nodes: ['n1', 'n2'],
    });
    expect(volumeRecord(pv('pv-c', { hostPath: { path: '/data/c' } }))).toMatchObject({ nodes: [], affinity: 'none' });
    expect(volumeRecord(pv('pv-d', { csi: { driver: 'x' } }))).toMatchObject({ attachable: true });
    const zoned = {
      required: {
        nodeSelectorTerms: [
          { matchExpressions: [{ key: 'topology.kubernetes.io/zone', operator: 'In', values: ['z'] }] },
        ],
      },
    };
    expect(volumeRecord(pv('pv-e', { local: { path: '/x' }, nodeAffinity: zoned })).affinity).toBe('other');
  });
});

describe('the node-bound data of a controller', () => {
  const volumes = [
    volumeRecord(
      pv('pv-local', {
        local: { path: '/mnt/data' },
        nodeAffinity: affinity('n1'),
        claimRef: { namespace: 'apps', name: 'data' },
      }),
    ),
    volumeRecord(pv('pv-free', { hostPath: { path: '/srv/free' }, claimRef: { namespace: 'apps', name: 'free' } })),
    volumeRecord(pv('pv-csi', { csi: { driver: 'x' }, claimRef: { namespace: 'apps', name: 'shared' } })),
    volumeRecord(
      pv('pv-0', {
        hostPath: { path: '/data/db-0' },
        nodeAffinity: affinity('n1'),
        claimRef: { namespace: 'apps', name: 'store-db-0' },
      }),
    ),
    volumeRecord(
      pv('pv-1', {
        hostPath: { path: '/data/db-1' },
        nodeAffinity: affinity('n2'),
        claimRef: { namespace: 'apps', name: 'store-db-1' },
      }),
    ),
  ];
  const claims = [
    claim('data', 'pv-local'),
    claim('free', 'pv-free'),
    claim('shared', 'pv-csi'),
    claim('store-db-0', 'pv-0'),
    claim('store-db-1', 'pv-1'),
  ];

  it('locates a host path where its pods run, a bound local volume by its affinity, and skips attachable storage', () => {
    const deployment = controller('Deployment', {
      volumes: [
        { name: 'cache', hostPath: { path: '/var/cache/app' } },
        { name: 'data', persistentVolumeClaim: { claimName: 'data' } },
        { name: 'free', persistentVolumeClaim: { claimName: 'free' } },
        { name: 'shared', persistentVolumeClaim: { claimName: 'shared' } },
        { name: 'config', configMap: { name: 'x' } },
      ],
    });
    expect(controllerData({ controller: deployment, claims, volumes, podNodes: ['n3', 'n3'] })).toEqual([
      {
        volume: 'cache',
        claim: '',
        persistentVolume: '',
        hostPath: '/var/cache/app',
        nodes: ['n3'],
        source: 'host-path',
        written: true,
      },
      {
        volume: 'data',
        claim: 'apps/data',
        persistentVolume: 'pv-local',
        hostPath: '/mnt/data',
        nodes: ['n1'],
        source: 'local-volume',
        written: true,
      },
      {
        volume: 'free',
        claim: 'apps/free',
        persistentVolume: 'pv-free',
        hostPath: '/srv/free',
        nodes: ['n3'],
        source: 'local-volume',
        written: true,
      },
    ]);
  });

  it('reads the claim of each StatefulSet ordinal', () => {
    const statefulSet = controller('StatefulSet', { replicas: 2, claimTemplates: ['store'] });
    expect(
      controllerData({ controller: statefulSet, claims, volumes }).map(({ claim: id, nodes }) => [id, nodes]),
    ).toEqual([
      ['apps/store-db-0', ['n1']],
      ['apps/store-db-1', ['n2']],
    ]);
  });

  it('refuses nodes that do not hold the data, an unreadable topology, an unlocated host path and shared ordinals', () => {
    const deployment = controller('Deployment', {
      volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'data' } }],
    });
    const data = controllerData({ controller: deployment, claims, volumes });
    expect(storageRefusals({ controller: deployment, data, nodes: ['n1'] })).toEqual([]);
    expect(storageRefusals({ controller: deployment, data, nodes: ['n2'] })).toEqual([
      'Deployment/apps/db keeps /mnt/data (PersistentVolume pv-local of apps/data) on n1, and n2 does not hold it: Underpost moves no data between nodes',
    ]);
    const unplaced = controller('Deployment', { volumes: [{ name: 'cache', hostPath: { path: '/var/cache/app' } }] });
    expect(
      storageRefusals({ controller: unplaced, data: controllerData({ controller: unplaced }), nodes: ['n1'] })[0],
    ).toContain('on a node no live pod or volume names');
    const topology = [
      { volume: 'x', claim: 'apps/x', persistentVolume: 'pv-x', hostPath: '/x', nodes: [], source: 'unknown-topology' },
    ];
    expect(storageRefusals({ controller: deployment, data: topology, nodes: ['n1'] })[0]).toContain(
      'a node topology Underpost cannot read',
    );
    const ordinals = controller('StatefulSet', {
      replicas: 2,
      volumes: [{ name: 'dir', hostPath: { path: '/data/db' } }],
    });
    const shared = controllerData({ controller: ordinals, podNodes: ['n1'] });
    expect(storageRefusals({ controller: ordinals, data: shared, nodes: ['n1'] })).toEqual([
      'the ordinals of StatefulSet/apps/db share the written volume dir: give each one a claim template',
    ]);
    const readOnly = controller('StatefulSet', {
      replicas: 2,
      readOnly: true,
      volumes: [{ name: 'dir', hostPath: { path: '/etc/x' } }],
    });
    expect(
      storageRefusals({
        controller: readOnly,
        data: controllerData({ controller: readOnly, podNodes: ['n1'] }),
        nodes: ['n1'],
      }),
    ).toEqual([]);
  });
});

describe('the admission of a node', () => {
  it('refuses a node that is not Ready, cordoned, or tainted against the pods', () => {
    const pod = { tolerations: [{ key: 'dedicated', operator: 'Equal', value: 'db', effect: 'NoSchedule' }] };
    expect(admissionRefusals({ pod, node: node('n1') })).toEqual([]);
    expect(admissionRefusals({ pod, node: node('n1', { ready: false, unschedulable: true }) })).toEqual([
      'node n1 is not Ready',
      'node n1 is cordoned',
    ]);
    const taints = [
      { key: 'dedicated', value: 'db', effect: 'NoSchedule' },
      { key: 'gpu', effect: 'NoExecute' },
      { key: 'soft', effect: 'PreferNoSchedule' },
    ];
    expect(admissionRefusals({ pod, node: node('n1', { taints }) })).toEqual([
      'node n1 has the taint gpu:NoExecute, which the pods do not tolerate',
    ]);
    expect(admissionRefusals({ pod: { tolerations: [{ operator: 'Exists' }] }, node: node('n1', { taints }) })).toEqual(
      [],
    );
  });

  it('keeps every nodeSelector key and the required node affinity the change does not replace', () => {
    const pod = {
      nodeSelector: { 'kubernetes.io/hostname': 'n0', disk: 'ssd' },
      affinity: {
        nodeAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: {
            nodeSelectorTerms: [{ matchExpressions: [{ key: 'pool', operator: 'In', values: ['data'] }] }],
          },
        },
      },
    };
    expect(
      admissionRefusals({
        pod,
        node: node('n1', { labels: { disk: 'ssd', pool: 'data' } }),
        replaced: ['kubernetes.io/hostname'],
      }),
    ).toEqual([]);
    expect(
      admissionRefusals({ pod, node: node('n1', { labels: { pool: 'web' } }), replaced: ['kubernetes.io/hostname'] }),
    ).toEqual(['the nodeSelector disk=ssd excludes node n1', 'the required node affinity excludes node n1']);
    const named = {
      affinity: {
        nodeAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: {
            nodeSelectorTerms: [{ matchFields: [{ key: 'metadata.name', operator: 'NotIn', values: ['n1'] }] }],
          },
        },
      },
    };
    expect(admissionRefusals({ pod: named, node: node('n1') })).toEqual([
      'the required node affinity excludes node n1',
    ]);
    expect(admissionRefusals({ pod: named, node: node('n2') })).toEqual([]);
  });
});
