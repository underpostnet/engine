'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import Underpost from '../../../src/index.js';

describe('deploy node resolution', () => {
  let fixturePath;
  let cwd;

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-deploy-node-');
    cwd = process.cwd();
    process.chdir(fixturePath);
    for (const [name, record] of Object.entries({
      'control-a': { role: 'control', kubernetesNodeName: 'control-node' },
      'worker-b': { role: 'worker', kubernetesNodeName: 'worker-node' },
      'worker-c': { role: 'worker', kubernetesNodeName: 'worker-node-2' },
    }))
      fs.outputJsonSync(`./engine-private/deploy/nodes/${name}.json`, {
        hubHost: '203.0.113.1',
        peerId: name,
        ...record,
      });
    fs.outputJsonSync('./engine-private/deploy/conf.cluster.json', {
      environments: {
        production: {
          profile: 'recommended',
          nodes: { groups: { control: ['control-a'], workers: ['worker-b', 'worker-c'] } },
          overrides: { scheduling: { operations: { mode: 'scheduler' } } },
        },
        development: { profile: 'legacy' },
      },
    });
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.removeSync(fixturePath);
  });

  it('places the volumes of a resource on every Kubernetes node of its group, not on the build host', () => {
    expect(Underpost.deploy.resolveDeployNodes({ env: 'production' })).to.deep.equal(['worker-node', 'worker-node-2']);
    expect(Underpost.deploy.resolveDeployNodes({ resource: 'platform', kubeadm: true })).to.deep.equal([
      'control-node',
    ]);
    expect(Underpost.deploy.resolveDeployNodes({ resource: 'mongodb', env: 'production' })).to.deep.equal([
      'control-node',
    ]);
  });

  it('keeps the explicit node above the scheduling', () => {
    expect(Underpost.deploy.resolveDeployNodes({ node: 'explicit-node', env: 'production' })).to.deep.equal([
      'explicit-node',
    ]);
  });

  it('falls back to the cluster-type default where the scheduler places the pods', () => {
    expect(Underpost.deploy.resolveDeployNodes({ resource: 'operations', env: 'production' })).to.deep.equal([
      os.hostname(),
    ]);
    expect(Underpost.deploy.resolveDeployNodes({ env: 'development' })).to.deep.equal(['kind-worker']);
    expect(Underpost.deploy.resolveDeployNodes({ kubeadm: true, env: 'development' })).to.deep.equal([os.hostname()]);
  });

  it('refuses a group member without a record instead of a guess, and a second node where one is needed', () => {
    expect(() =>
      Underpost.namespace.soleNode(Underpost.deploy.resolveDeployNodes({}), 'The Underpost gateway'),
    ).to.throw('The Underpost gateway runs on one node, and its node group names worker-node, worker-node-2');
    fs.removeSync('./engine-private/deploy/nodes/worker-b.json');
    expect(() => Underpost.deploy.resolveDeployNodes({ env: 'production' })).to.throw(
      './engine-private/deploy/nodes/worker-b.json does not exist',
    );
  });
});
