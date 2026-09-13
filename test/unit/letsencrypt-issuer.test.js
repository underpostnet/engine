'use strict';

import { expect } from 'chai';
import { load as yamlLoad } from 'js-yaml';
import shell from 'shelljs';
import { vi } from 'vitest';
import UnderpostCluster from '../../src/cli/cluster.js';
import UnderpostDeploy, { LETSENCRYPT_ISSUER_MANIFEST, LETSENCRYPT_ISSUER_NAME } from '../../src/cli/deploy.js';

describe("Let's Encrypt issuer for the ingress stack in use", () => {
  afterEach(() => vi.restoreAllMocks());

  describe('acmeSolverFactory', () => {
    it('answers through the Gateway API whenever its data plane is installed', () => {
      // The `cluster` runner installs the issuer in an invocation that carries no stack
      // flag, so the decision has to come from the cluster, not from the flags.
      const presence = { contour: false, gateway: true };
      expect(UnderpostCluster.API.acmeSolverFactory({ options: {}, presence })).to.equal('gateway');
      expect(UnderpostCluster.API.acmeSolverFactory({ options: { gatewayApi: true }, presence })).to.equal('gateway');
      expect(
        UnderpostCluster.API.acmeSolverFactory({
          options: { gatewayApi: true },
          presence: { contour: true, gateway: false },
        }),
      ).to.equal('gateway');
    });

    it('keeps the Contour Ingress solver only where nothing else carries the challenge', () => {
      expect(
        UnderpostCluster.API.acmeSolverFactory({ options: {}, presence: { contour: true, gateway: false } }),
      ).to.equal('ingress');
      expect(
        UnderpostCluster.API.acmeSolverFactory({
          options: { contour: true },
          presence: { contour: false, gateway: true },
        }),
      ).to.equal('ingress');
    });
  });

  describe('letsEncryptIssuerYamlFactory', () => {
    it('keeps the account from the base manifest and swaps in the Gateway solver', () => {
      const base = yamlLoad(
        UnderpostDeploy.API.letsEncryptIssuerYamlFactory({ solver: 'ingress', basePath: LETSENCRYPT_ISSUER_MANIFEST }),
      );
      const issuer = yamlLoad(
        UnderpostDeploy.API.letsEncryptIssuerYamlFactory({
          solver: 'gateway',
          parentRefs: [
            { name: 'dd-core-production', namespace: 'default' },
            { name: 'dd-prototype-production', namespace: 'default' },
          ],
        }),
      );
      expect(issuer.kind).to.equal('ClusterIssuer');
      expect(issuer.metadata.name).to.equal(LETSENCRYPT_ISSUER_NAME);
      expect(issuer.spec.acme.email).to.equal(base.spec.acme.email);
      expect(issuer.spec.acme.server).to.equal(base.spec.acme.server);
      expect(issuer.spec.acme.privateKeySecretRef).to.deep.equal(base.spec.acme.privateKeySecretRef);
      expect(issuer.spec.acme.solvers).to.deep.equal([
        {
          http01: {
            gatewayHTTPRoute: {
              parentRefs: [
                { name: 'dd-core-production', namespace: 'default', kind: 'Gateway' },
                { name: 'dd-prototype-production', namespace: 'default', kind: 'Gateway' },
              ],
            },
          },
        },
      ]);
      expect(base.spec.acme.solvers).to.deep.equal([{ http01: { ingress: { class: 'contour' } } }]);
    });

    it('refuses a Gateway solver with nothing to attach the challenge route to', () => {
      expect(() => UnderpostDeploy.API.letsEncryptIssuerYamlFactory({ solver: 'gateway', parentRefs: [] })).to.throw(
        /parentRef/,
      );
    });
  });

  describe('acmeGatewayParentRefsFactory', () => {
    it('unions the live Gateways with the routed deploys, once each, sorted', () => {
      vi.spyOn(shell, 'exec').mockImplementation((command) => {
        const stdout = command.startsWith('kubectl get gateway')
          ? 'gateway.gateway.networking.k8s.io/dd-core-production\ngateway.gateway.networking.k8s.io/other-production\n'
          : '';
        return { code: 0, stdout, stderr: '', toString: () => stdout };
      });
      vi.spyOn(UnderpostDeploy.API, 'gatewayNameFactory').mockImplementation(
        ({ deployId, env }) => `${deployId}-${env}`,
      );
      const refs = UnderpostDeploy.API.acmeGatewayParentRefsFactory({ namespace: 'default', env: 'production' });
      const names = refs.map(({ name }) => name);
      expect(names).to.include('dd-core-production');
      expect(names).to.include('other-production');
      expect(names).to.deep.equal([...new Set(names)].sort());
      expect(refs.every(({ namespace }) => namespace === 'default')).to.equal(true);
    });
  });
});
