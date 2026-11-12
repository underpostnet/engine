'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import Underpost from '../../../../src/index.js';
import { podSchedulingFactory } from '../../../../src/server/runtime/pod-scheduling.js';

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
    scheduling: nodeName ? podSchedulingFactory({ hostnames: [nodeName] }) : {},
  });

describe('deployment node placement', () => {
  it('renders explicit workload placement in the original pod template', () => {
    expect(deploymentManifest('hp-envy-iso-ram-rocky9')).to.match(
      /operator: In\n\s+values:\n\s+- hp-envy-iso-ram-rocky9\n/,
    );
  });

  it('leaves scheduling unconstrained when no deployment node was requested', () => {
    expect(deploymentManifest()).to.not.include('affinity:');
  });

  it('does not restart a controller after node-move patches its pod template', () => {
    const source = fs.readFileSync(new URL('../../../../src/cli/run.js', import.meta.url), 'utf8');
    const start = source.indexOf("    'node-move':");
    const end = source.indexOf('\n    /**', start);
    const runner = source.slice(start, end);
    expect(runner).to.include('kubectl patch');
    expect(runner).to.not.match(/shellExec\(`kubectl rollout restart/);
  });

  it('schedules live and generated custom-instance manifests as workloads, with --node-name above the scheduling', () => {
    const source = fs.readFileSync(new URL('../../../../src/cli/run.js', import.meta.url), 'utf8');
    const placements =
      source.match(
        /scheduling: Underpost\.namespace\.podScheduling\(\{\s*resource: 'workloads',\s*environment: env,\s*node: options\.nodeName,?\s*\}\)/g,
      ) || [];
    expect(placements).to.have.length(2);
  });
});
