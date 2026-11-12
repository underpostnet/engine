// The pod scheduling of Underpost manifests: the node affinity of a node group in each mode, the narrow
// control-plane toleration, their YAML, their place in each pod template, and a scheduled apply that the
// shell harness answers. No real kubectl runs.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import { dump } from 'js-yaml';
import Underpost from '../../../src/index.js';
import {
  blockingTaints,
  podSchedulingFactory,
  podSchedulingYaml,
  schedulePodTemplate,
} from '../../../src/server/runtime/pod-scheduling.js';
import { shellHarness } from '../../support/shell-harness.js';

const CONTROL_PLANE = { key: 'node-role.kubernetes.io/control-plane', effect: 'NoSchedule' };
const TOLERATION = { key: CONTROL_PLANE.key, operator: 'Exists', effect: 'NoSchedule' };
const SCHEDULING = podSchedulingFactory({ hostnames: ['node-a'], taints: [CONTROL_PLANE] });
const term = (...values) => ({ matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values }] });
const required = (...values) => ({
  nodeAffinity: { requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [term(...values)] } },
});
const template = (kind) => ({
  kind,
  metadata: { name: kind.toLowerCase() },
  spec: { template: { spec: { nodeSelector: { disk: 'ssd' }, containers: [] } } },
});

describe('the pod scheduling of a node group', () => {
  it('requires the nodes of a group and tolerates the control-plane taint of one of them, and nothing else', () => {
    expect(podSchedulingFactory({})).toEqual({});
    expect(SCHEDULING).toEqual({ affinity: required('node-a'), tolerations: [TOLERATION] });
    const taints = [
      { key: 'gpu', effect: 'NoSchedule' },
      { key: 'busy', effect: 'PreferNoSchedule' },
    ];
    // A group of several nodes lets the scheduler choose among them; one control-plane node is enough
    // for one toleration.
    expect(
      podSchedulingFactory({
        hostnames: ['worker-01', 'worker-02', 'worker-03'],
        taints: [...taints, CONTROL_PLANE, CONTROL_PLANE],
      }),
    ).toEqual({ affinity: required('worker-01', 'worker-02', 'worker-03'), tolerations: [TOLERATION] });
    expect(blockingTaints([...taints, CONTROL_PLANE])).toEqual(['gpu:NoSchedule']);
  });

  it('prefers the group in the preferred mode, and leaves the pods to the scheduler in the scheduler mode', () => {
    expect(podSchedulingFactory({ hostnames: ['node-a', 'node-b'], mode: 'preferred' })).toEqual({
      affinity: {
        nodeAffinity: {
          preferredDuringSchedulingIgnoredDuringExecution: [{ weight: 100, preference: term('node-a', 'node-b') }],
        },
      },
    });
    expect(podSchedulingFactory({ hostnames: ['node-a'], mode: 'scheduler', taints: [CONTROL_PLANE] })).toEqual({});
  });

  it('renders the YAML of a pod spec at its indentation', () => {
    expect(podSchedulingYaml({}, 6)).toBe('');
    expect(podSchedulingYaml(SCHEDULING, 2)).toBe(
      [
        '  affinity:',
        '    nodeAffinity:',
        '      requiredDuringSchedulingIgnoredDuringExecution:',
        '        nodeSelectorTerms:',
        '          - matchExpressions:',
        '              - key: kubernetes.io/hostname',
        '                operator: In',
        '                values:',
        '                  - node-a',
        '  tolerations:',
        '    - key: node-role.kubernetes.io/control-plane',
        '      operator: Exists',
        '      effect: NoSchedule',
        '',
      ].join('\n'),
    );
  });

  it('places each pod template but the one of a DaemonSet, which runs on every eligible node', () => {
    for (const kind of ['Deployment', 'StatefulSet', 'Job']) {
      const object = template(kind);
      const spec = schedulePodTemplate(object, SCHEDULING).spec.template.spec;
      expect(spec.affinity).toEqual(SCHEDULING.affinity);
      expect(spec.nodeSelector).toEqual({ disk: 'ssd' });
      expect(spec.tolerations).toEqual(SCHEDULING.tolerations);
      expect(object.spec.template.spec.affinity).toBeUndefined();
    }
    const cronJob = { kind: 'CronJob', spec: { jobTemplate: { spec: { template: { spec: {} } } } } };
    expect(schedulePodTemplate(cronJob, SCHEDULING).spec.jobTemplate.spec.template.spec.affinity).toEqual(
      SCHEDULING.affinity,
    );
    const daemonSet = template('DaemonSet');
    expect(schedulePodTemplate(daemonSet, SCHEDULING)).toBe(daemonSet);
    expect(schedulePodTemplate(template('Deployment'), {}).spec.template.spec.affinity).toBeUndefined();
  });
});

describe('a scheduled apply', () => {
  let scratch;
  let harness;

  beforeEach(() => {
    scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-scheduled-'));
  });

  afterEach(() => {
    harness.restore();
    fs.removeSync(scratch);
  });

  const applied = () =>
    JSON.parse(/<<'EOF'\n([\s\S]*)\nEOF/.exec(harness.calls.find((call) => call.includes(' apply -n ')))[1]).items;

  it('applies a manifest file with the scheduling in every pod template but a DaemonSet', () => {
    harness = shellHarness();
    const file = nodePath.join(scratch, 'manifest.yaml');
    fs.writeFileSync(
      file,
      [template('StatefulSet'), template('DaemonSet'), { kind: 'Service' }].map((object) => dump(object)).join('---\n'),
    );
    Underpost.kubectl.applyScheduled({ path: file, namespace: 'underpost-data', scheduling: SCHEDULING });
    const [statefulSet, daemonSet, service] = applied();
    expect(statefulSet.spec.template.spec.affinity).toEqual(SCHEDULING.affinity);
    expect(daemonSet.spec.template.spec.nodeSelector).toEqual({ disk: 'ssd' });
    expect(service).toEqual({ kind: 'Service' });
    expect(harness.calls.find((call) => call.includes(' apply -n '))).toMatch(
      /^kubectl apply -n 'underpost-data' -f - <<'EOF'/,
    );
  });

  it('renders a kustomization through kubectl kustomize', () => {
    harness = shellHarness([{ match: 'kubectl kustomize', stdout: dump(template('Deployment')) }]);
    Underpost.kubectl.applyScheduled({ path: scratch, namespace: 'ns', scheduling: SCHEDULING });
    expect(harness.calls[0]).toBe(`kubectl kustomize '${scratch}'`);
    expect(applied()[0].spec.template.spec.tolerations).toEqual(SCHEDULING.tolerations);
  });
});
