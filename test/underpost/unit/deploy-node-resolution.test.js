'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import Underpost from '../../../src/index.js';

describe('deploy node resolution', () => {
  const originalDeployNode = process.env.UNDERPOST_DEPLOY_NODE;
  let fixturePath;
  let cwd;

  const writeNode = (nodeName, role) =>
    fs.outputJsonSync(`./engine-private/deploy/nodes/${nodeName}.json`, { role, hubHost: '198.51.100.1' });

  beforeEach(() => {
    delete process.env.UNDERPOST_DEPLOY_NODE;
    // The node registry resolves against the source tree root, so the fixture stands in for it.
    fixturePath = fs.mkdtempSync('/tmp/engine-deploy-node-');
    cwd = process.cwd();
    process.chdir(fixturePath);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.removeSync(fixturePath);
    if (originalDeployNode === undefined) delete process.env.UNDERPOST_DEPLOY_NODE;
    else process.env.UNDERPOST_DEPLOY_NODE = originalDeployNode;
  });

  it('pins production to the registered control node, not to the build host', () => {
    writeNode('control-node', 'control');
    writeNode('worker-node', 'worker');
    expect(Underpost.deploy.resolveDeployNode({ env: 'production' })).to.equal('control-node');
    expect(Underpost.deploy.resolveDeployNode({ kubeadm: true, env: 'development' })).to.equal('control-node');
  });

  it('keeps the explicit node and UNDERPOST_DEPLOY_NODE above the registry', () => {
    writeNode('control-node', 'control');
    expect(Underpost.deploy.resolveDeployNode({ node: 'explicit-node', kubeadm: true })).to.equal('explicit-node');
    process.env.UNDERPOST_DEPLOY_NODE = 'configured-node';
    expect(Underpost.deploy.resolveDeployNode({ k3s: true })).to.equal('configured-node');
  });

  it('falls back to this host with no control node or an ambiguous one', () => {
    expect(Underpost.deploy.resolveDeployNode({ env: 'production' })).to.equal(os.hostname());
    writeNode('control-a', 'control');
    writeNode('control-b', 'control');
    expect(Underpost.deploy.resolveDeployNode({ env: 'production' })).to.equal(os.hostname());
  });

  it('keeps kind-worker for a kind context', () => {
    writeNode('control-node', 'control');
    expect(Underpost.deploy.resolveDeployNode({ env: 'development' })).to.equal('kind-worker');
    expect(Underpost.deploy.resolveDeployNode({ kind: true, env: 'production' })).to.equal('kind-worker');
  });
});
