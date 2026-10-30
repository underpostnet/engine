'use strict';

import { expect } from 'chai';
import Underpost from '../../../src/index.js';
import { shellHarness } from '../../support/shell-harness.js';

describe('cluster add-ons', () => {
  let harness;

  beforeEach(() => {
    harness = shellHarness();
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
  });

  it('applies the basic Kafka manifest in the kafka namespace, idempotently', () => {
    Underpost.cluster.deployKafka({ underpostRoot: '.', options: { namespace: 'default' } });
    expect(harness.calls).to.deep.equal([
      'kubectl create namespace kafka --dry-run=client -o yaml | kubectl apply -f -',
      'kubectl apply -f ./manifests/deployment/kafka/deployment.yaml -n kafka',
    ]);
  });

  it('loads the Kafka image the way the cluster type needs it', () => {
    Underpost.cluster.deployKafka({ underpostRoot: '.', options: { pullImage: true } });
    expect(harness.calls[0]).to.equal('docker pull doughgle/kafka-kraft');
    expect(harness.calls.some((command) => command.includes('ctr --namespace=k8s.io images import'))).to.equal(true);
    harness.calls.length = 0;

    Underpost.cluster.deployKafka({ underpostRoot: '.', options: { pullImage: true, k3s: true } });
    expect(harness.calls[0]).to.include('crictl').and.to.include("pull 'doughgle/kafka-kraft'");
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
