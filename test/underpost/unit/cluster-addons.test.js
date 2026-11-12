'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import Underpost from '../../../src/index.js';
import { privilegedCommand, shellHarness } from '../../support/shell-harness.js';

/** The checkout that holds the manifests; each test runs in a scratch directory with no conf.cluster.json. */
const ROOT = process.cwd();

describe('cluster add-ons', () => {
  let harness;
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-cluster-addons-'));
    process.chdir(scratch);
    harness = shellHarness();
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
    process.chdir(ROOT);
    fs.removeSync(scratch);
  });

  it('applies the basic Kafka manifest in the namespace its manifest fixes, and creates it once', async () => {
    harness.route({ match: 'kubectl get namespace kafka', code: 1 });
    await Underpost.cluster.deployKafka({ underpostRoot: ROOT, options: { namespace: 'default' } });
    expect(harness.calls.slice(0, 2)).to.deep.equal([
      'kubectl get namespace kafka -o name',
      'kubectl apply --server-side --field-manager=underpost -f -',
    ]);
    expect(harness.calls).to.have.length(3);
    const applied = JSON.parse(/<<'EOF'\n([\s\S]*)\nEOF/.exec(harness.calls[2])[1]).items;
    expect(harness.calls[2]).to.match(/^kubectl apply -n 'kafka' -f - <<'EOF'/);
    expect(applied.map(({ kind }) => kind)).to.include('StatefulSet');
    expect(JSON.parse(harness.inputs[1])).to.deep.include({ kind: 'Namespace' });
    expect(JSON.parse(harness.inputs[1]).metadata.labels).to.deep.include({
      'app.kubernetes.io/managed-by': 'underpost',
      'underpost.net/namespace-role': 'datastore',
    });
  });

  it('loads the Kafka image the way the cluster type needs it', async () => {
    harness.route({ match: 'kind get nodes', stdout: 'kind-control-plane\nkind-worker\n' });
    await Underpost.cluster.deployKafka({ underpostRoot: ROOT, options: { pullImage: true } });
    expect(privilegedCommand(harness.calls[0])).to.equal("docker pull 'doughgle/kafka-kraft'");
    expect(harness.count('ctr --namespace=k8s.io images import')).to.equal(2);
    harness.calls.length = 0;

    await Underpost.cluster.deployKafka({ underpostRoot: ROOT, options: { pullImage: true, k3s: true } });
    expect(privilegedCommand(harness.calls[0])).to.include('crictl').and.to.include("pull 'doughgle/kafka-kraft'");
    expect(harness.calls.some((command) => command.includes('docker'))).to.equal(false);
  });

  it('installs the GPU and Spark operators as Helm releases that a rerun upgrades in place', () => {
    Underpost.cluster.installGpuOperator();
    Underpost.cluster.installSparkOperator({ underpostRoot: '.', options: { namespace: 'default' } });
    const helm = harness.calls.filter((command) => command.startsWith('helm upgrade'));
    expect(helm.map((command) => command.split(' ').slice(0, 5).join(' '))).to.deep.equal([
      'helm upgrade --install --wait gpu-operator',
      'helm upgrade --install spark-operator spark-operator/spark-operator',
    ]);
    expect(helm[0]).to.include('--version=v25.3.1').and.to.include('--set cdi.enabled=true');
    expect(harness.calls).to.include('kubectl apply -f ./manifests/deployment/spark/spark-pi-py.yaml -n default');
    expect(harness.calls.some((command) => command.includes('--generate-name'))).to.equal(false);
  });
});
