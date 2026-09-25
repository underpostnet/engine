'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import Underpost from '../../../../src/index.js';

const deploymentManifest = (nodeName = '') =>
  Underpost.deploy.deploymentYamlPartsFactory({
    deployId: 'dd-node-placement-test',
    env: 'production',
    suffix: 'green',
    replicas: 1,
    image: 'underpost/wp:test',
    namespace: 'default',
    cmd: ['true'],
    readinessProbe: { tcpSocket: { port: 3032 } },
    nodeName,
  });

describe('deployment node placement', () => {
  it('renders explicit workload placement in the original pod template', () => {
    expect(deploymentManifest('hp-envy-iso-ram-rocky9')).to.include(
      'nodeSelector:\n        kubernetes.io/hostname: hp-envy-iso-ram-rocky9',
    );
  });

  it('leaves scheduling unconstrained when no deployment node was requested', () => {
    expect(deploymentManifest()).to.not.include('nodeSelector:');
  });

  it('does not restart a controller after node-move patches its pod template', () => {
    const source = fs.readFileSync(new URL('../../../../src/cli/run.js', import.meta.url), 'utf8');
    const start = source.indexOf("    'node-move':");
    const end = source.indexOf('\n    /**', start);
    const runner = source.slice(start, end);
    expect(runner).to.include('kubectl patch');
    expect(runner).to.not.match(/shellExec\(`kubectl rollout restart/);
  });

  it('forwards --node-name into live and generated custom-instance manifests', () => {
    const source = fs.readFileSync(new URL('../../../../src/cli/run.js', import.meta.url), 'utf8');
    const placements = source.match(/nodeName: options\.nodeName\s*\? Underpost\.deploy\.resolveDeployNode/g) || [];
    expect(placements).to.have.length(2);
  });
});
