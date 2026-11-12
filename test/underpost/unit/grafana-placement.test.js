// The placement of Grafana when it is published: the scheduling of the observability node group, one node,
// and a patch of the live Deployment that carries it. The shell harness answers every kubectl call.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import Underpost from '../../../src/index.js';
import { podSchedulingFactory } from '../../../src/server/runtime/pod-scheduling.js';
import { shellHarness } from '../../support/shell-harness.js';

const CONTROL_PLANE = { key: 'node-role.kubernetes.io/control-plane', effect: 'NoSchedule' };
const scheduling = (...nodes) => ({ ...podSchedulingFactory({ hostnames: nodes, taints: [CONTROL_PLANE] }), nodes });
const OPTIONS = { namespaceObservability: 'underpost-observability', namespaceWorkloads: 'underpost-workloads' };
const VOLUMES = JSON.stringify({
  items: [
    {
      metadata: { name: 'pv-grafana' },
      spec: {
        claimRef: { name: 'grafana-pvc', namespace: 'underpost-observability' },
        nodeAffinity: {
          required: {
            nodeSelectorTerms: [{ matchExpressions: [{ key: 'kubernetes.io/hostname', values: ['node-a'] }] }],
          },
        },
      },
    },
  ],
});

let cwd;
let scratch;
let harness;

beforeEach(() => {
  cwd = process.cwd();
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-grafana-'));
  process.chdir(scratch);
});

afterEach(() => {
  harness?.restore();
  process.chdir(cwd);
  fs.removeSync(scratch);
});

describe('the placement of a published Grafana', () => {
  it('patches the live Deployment with the scheduling of its node, and drops a hostname pin', () => {
    harness = shellHarness([
      { match: 'kubectl get pvc grafana-pvc', stdout: 'pv-grafana' },
      { match: 'kubectl get pv -o json', stdout: VOLUMES },
    ]);
    Underpost.monitor.exposeGrafana({ ...OPTIONS, scheduling: scheduling('node-a') });

    const patch = harness.calls.find((call) => call.startsWith('kubectl patch deployment grafana'));
    expect(patch).toContain('-n underpost-observability');
    const { spec } = JSON.parse(/-p '(.+)'$/.exec(patch)[1]).spec.template;
    expect(spec.affinity).toEqual(scheduling('node-a').affinity);
    expect(spec.nodeSelector).toEqual({ 'kubernetes.io/hostname': null });
    expect(spec.tolerations).toEqual(scheduling('node-a').tolerations);
    expect(harness.calls.some((call) => call.startsWith('kubectl delete deployment/grafana'))).toBe(false);
  });

  it('refuses a node group of more than one node before it reaches the cluster', () => {
    harness = shellHarness();
    expect(() => Underpost.monitor.exposeGrafana({ ...OPTIONS, scheduling: scheduling('node-a', 'node-b') })).toThrow(
      'Grafana runs on one node, and its node group names node-a, node-b',
    );
    expect(harness.calls).toEqual([]);
  });
});
