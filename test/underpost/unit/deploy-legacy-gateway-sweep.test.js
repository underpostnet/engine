'use strict';

import { expect } from 'chai';
import shell from 'shelljs';
import { vi } from 'vitest';
import UnderpostDeploy from '../../../src/cli/deploy.js';

describe('deploy legacy Gateway API sweep', () => {
  let commands;
  let listed;

  beforeEach(() => {
    commands = [];
    listed = { Gateway: '', ClientTrafficPolicy: '' };
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const kind = command.match(/^kubectl get (\w+) /)?.[1];
      const stdout = kind ? listed[kind] : '';
      return { code: 0, stdout, stderr: '', toString: () => stdout };
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const deletes = () => commands.filter((command) => command.includes('kubectl delete'));

  it('lists each kind once and deletes nothing on a namespace that was already migrated', () => {
    // Regression: the sweep deleted `Gateway <host>`, `Gateway undefined` and both
    // `-http3` policies blind, once per host — two dozen no-op round-trips per sync.
    listed.Gateway = 'gateway.gateway.networking.k8s.io/dd-prototype-production\n';
    listed.ClientTrafficPolicy = 'clienttrafficpolicy.gateway.envoyproxy.io/dd-prototype-production-http3\n';
    const removed = UnderpostDeploy.API.sweepLegacyGatewayObjects({
      hosts: ['healthcare.nexodev.org', 'www.bymyelectrics.com', 'bymyelectrics.com'],
      namespace: 'default',
    });
    expect(removed).to.deep.equal({ gateways: [], policies: [] });
    expect(commands.filter((command) => command.startsWith('kubectl get ')).length).to.equal(2);
    expect(deletes()).to.deep.equal([]);
  });

  it('removes only the per-host and unresolved-host objects that still exist', () => {
    listed.Gateway = [
      'gateway.gateway.networking.k8s.io/dd-prototype-production',
      'gateway.gateway.networking.k8s.io/healthcare.nexodev.org',
      'gateway.gateway.networking.k8s.io/undefined',
      'gateway.gateway.networking.k8s.io/other-deploy-production',
    ].join('\n');
    listed.ClientTrafficPolicy = 'clienttrafficpolicy.gateway.envoyproxy.io/undefined-http3\n';
    const removed = UnderpostDeploy.API.sweepLegacyGatewayObjects({
      hosts: ['healthcare.nexodev.org', 'www.bymyelectrics.com'],
      namespace: 'default',
    });
    expect(removed).to.deep.equal({
      gateways: ['healthcare.nexodev.org', 'undefined'],
      policies: ['undefined-http3'],
    });
    expect(deletes()).to.deep.equal([
      'sudo kubectl delete Gateway healthcare.nexodev.org -n default --ignore-not-found',
      'sudo kubectl delete Gateway undefined -n default --ignore-not-found',
      'sudo kubectl delete ClientTrafficPolicy undefined-http3 -n default --ignore-not-found',
    ]);
  });
});
