'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  clusterContextFactory,
  clusterInstancesFactory,
  clusterTypeFactory,
  deployHostsFactory,
  gatewayApiEnabledFactory,
  instanceInterceptStatusesFactory,
  instanceProjectPathFactory,
  instanceStatusPageEntriesFactory,
  loadConfInstances,
} from '../src/server/conf.js';
import { statusPageAssetPathFactory } from '../src/server/underpost-gateway.js';

// `clusterInstancesFactory` reads `./engine-private/conf/<deployId>/conf.instances.json`
// relative to the process cwd, mirroring every other conf loader. engine-private
// is a private repository, so each fixture gets its own deploy directory, that
// directory is removed whole afterwards, and an existing one is never touched.
const CONF_DIR = (deployId) => `./engine-private/conf/${deployId}`;

const SERVER_FIXTURE = {
  'dd-fixture-a': { 'app.fixture.test': { '/': { client: 'App' } } },
  'dd-fixture-b': { 'b.fixture.test': { '/': { client: 'B' } } },
};

const FIXTURES = {
  'dd-fixture-a': [
    {
      id: 'mmo-server',
      host: 'server.fixture.test',
      path: '/',
      runtime: 'fixture-runtime',
      metadata: { repository: 'underpostnet/fixture-server' },
      customStatusPages: [{ status: '404', hostPath: './public/404/index.html' }],
      multiInstance: {
        default: 'MAIN',
        variants: [
          { code: 'MAIN', slug: '', path: '/' },
          { code: 'FOREST', slug: 'forest', path: '/FOREST' },
        ],
      },
    },
    { id: 'mmo-client', host: 'client.fixture.test', path: '/' },
  ],
  'dd-fixture-b': [{ id: 'worker', host: 'worker.fixture.test', path: '/' }],
};

describe('cluster custom instances', () => {
  const created = [];

  before(() => {
    for (const [deployId, entries] of Object.entries(FIXTURES)) {
      const dir = CONF_DIR(deployId);
      if (fs.existsSync(dir)) throw new Error(`Refusing to write fixtures into an existing deploy: ${dir}`);
      fs.outputJsonSync(`${dir}/conf.instances.json`, entries);
      fs.outputJsonSync(`${dir}/conf.server.json`, SERVER_FIXTURE[deployId]);
      created.push(dir);
    }
  });

  after(() => {
    for (const dir of created) fs.removeSync(dir);
  });

  it('binds an instance to the deploy that declares it', () => {
    const { byDeployId, unmatched } = clusterInstancesFactory(['dd-fixture-a', 'dd-fixture-b'], 'mmo-server');
    expect(byDeployId['dd-fixture-a']).to.deep.equal({
      ids: ['mmo-server'],
      hosts: ['server.fixture.test'],
    });
    expect(byDeployId['dd-fixture-b']).to.deep.equal({ ids: [], hosts: [] });
    expect(unmatched).to.deep.equal([]);
  });

  it('resolves several instances across several deploys', () => {
    const { byDeployId, unmatched } = clusterInstancesFactory(
      ['dd-fixture-a', 'dd-fixture-b'],
      'mmo-server+mmo-client+worker',
    );
    expect(byDeployId['dd-fixture-a'].ids).to.deep.equal(['mmo-server', 'mmo-client']);
    expect(byDeployId['dd-fixture-a'].hosts).to.deep.equal(['server.fixture.test', 'client.fixture.test']);
    expect(byDeployId['dd-fixture-b'].ids).to.deep.equal(['worker']);
    expect(unmatched).to.deep.equal([]);
  });

  // Expansion belongs to `run instance`, so the template id is handed over
  // whole — but its variants' hosts are needed up front for the /etc/hosts pass.
  it('passes a template id through while expanding its hosts', () => {
    const { byDeployId } = clusterInstancesFactory(['dd-fixture-a'], 'mmo-server');
    expect(byDeployId['dd-fixture-a'].ids).to.deep.equal(['mmo-server']);
    expect(byDeployId['dd-fixture-a'].hosts).to.deep.equal(['server.fixture.test']);
  });

  it('selects a single variant by its concrete id', () => {
    const { byDeployId, unmatched } = clusterInstancesFactory(['dd-fixture-a'], 'mmo-server-forest');
    expect(byDeployId['dd-fixture-a'].ids).to.deep.equal(['mmo-server-forest']);
    expect(unmatched).to.deep.equal([]);
  });

  it('reports an id no deploy declares instead of silently skipping it', () => {
    const { byDeployId, unmatched } = clusterInstancesFactory(['dd-fixture-a'], 'mmo-server+nope');
    expect(byDeployId['dd-fixture-a'].ids).to.deep.equal(['mmo-server']);
    expect(unmatched).to.deep.equal(['nope']);
  });

  it('is a no-op when no instance list is given', () => {
    for (const list of ['', undefined, '+'])
      expect(clusterInstancesFactory(['dd-fixture-a'], list)).to.deep.equal({
        byDeployId: { 'dd-fixture-a': { ids: [], hosts: [] } },
        unmatched: [],
      });
  });

  it('treats a deploy with no conf.instances.json as having none', () => {
    const { byDeployId, unmatched } = clusterInstancesFactory(['dd-fixture-no-such-deploy'], 'mmo-server');
    expect(byDeployId['dd-fixture-no-such-deploy']).to.deep.equal({ ids: [], hosts: [] });
    expect(unmatched).to.deep.equal(['mmo-server']);
  });

  // The deploy's Gateway terminates every hostname the deploy declares, and the
  // environment provisions a certificate for each. The two sets are read from
  // one resolver so they cannot drift: a hostname on the Gateway with no
  // certificate leaves an unresolvable ref, which costs the whole listener.
  describe('deploy hostnames', () => {
    it('unions the server hosts with every instance host', () => {
      expect(deployHostsFactory('dd-fixture-a')).to.deep.equal([
        'app.fixture.test',
        'server.fixture.test',
        'client.fixture.test',
      ]);
    });

    // Not just the ones being deployed now: the Gateway is per deploy, not per run.
    it('returns a variant family once, however many variants it has', () => {
      const hosts = deployHostsFactory('dd-fixture-a');
      expect(hosts.filter((host) => host === 'server.fixture.test')).to.have.length(1);
    });

    it('falls back to the server hosts when a deploy declares no instances', () => {
      expect(deployHostsFactory('dd-fixture-no-such-deploy')).to.deep.equal([]);
    });
  });

  // A status page is built and versioned by the project its instance runs, so
  // `hostPath` resolves against that project's checkout — not the engine root.
  describe('instance status pages', () => {
    it('roots hostPath at the project the instance runs', () => {
      expect(instanceProjectPathFactory({ metadata: { repository: 'underpostnet/fixture-server' } })).to.equal(
        './fixture-server',
      );
      expect(instanceProjectPathFactory({ runtime: 'fixture-runtime' })).to.equal('./fixture-runtime');
      expect(instanceProjectPathFactory({ id: 'bare' })).to.equal('./bare');
    });

    // Every variant gets its own document, at the path its own rule rewrites to.
    it('places one document per variant, where that variant is routed', () => {
      const entries = instanceStatusPageEntriesFactory({ instances: loadConfInstances('dd-fixture-a') });
      expect(entries.map((entry) => entry.assetPath)).to.deep.equal([
        'server.fixture.test/root/status-pages/404/index.html',
        'server.fixture.test/FOREST/status-pages/404/index.html',
      ]);
      expect([...new Set(entries.map((entry) => entry.sourcePath))]).to.deep.equal([
        'fixture-server/public/404/index.html',
      ]);
    });

    // The destination is the rewrite target, read from the same factory the
    // HTTPRoute rule uses, so a document can never land where nothing routes.
    it('agrees with the route rewrite target', () => {
      for (const entry of instanceStatusPageEntriesFactory({ instances: loadConfInstances('dd-fixture-a') }))
        expect(entry.assetPath).to.equal(
          statusPageAssetPathFactory({ host: entry.host, path: entry.path, status: entry.status }).assetPath,
        );
    });

    it('honours an explicit project path', () => {
      const [entry] = instanceStatusPageEntriesFactory({
        instances: loadConfInstances('dd-fixture-a'),
        projectPath: './elsewhere',
      });
      expect(entry.sourcePath).to.equal('elsewhere/public/404/index.html');
    });

    it('skips instances and entries that declare no page', () => {
      expect(instanceStatusPageEntriesFactory({ instances: loadConfInstances('dd-fixture-b') })).to.deep.equal([]);
      expect(
        instanceStatusPageEntriesFactory({
          instances: [{ host: 'h', path: '/', customStatusPages: [{ status: '404' }, { hostPath: './x' }] }],
        }),
      ).to.deep.equal([]);
    });

    it('uses the custom status document while the instance backend is unavailable', () => {
      expect(instanceInterceptStatusesFactory(loadConfInstances('dd-fixture-a')[0])).to.deep.equal({
        404: 'status-pages/404',
        502: 'status-pages/404',
        503: 'status-pages/404',
        504: 'status-pages/404',
      });
      expect(instanceInterceptStatusesFactory(loadConfInstances('dd-fixture-b')[0])).to.deep.equal({});
    });
  });

  describe('cluster gateway bootstrap order', () => {
    const source = fs.readFileSync(new URL('../src/cli/run.js', import.meta.url), 'utf8');
    const clusterRunner = source.slice(source.indexOf('cluster: async'), source.indexOf("'gateway-status': async"));

    it('tests the ingress-only fallback before applying any workload Deployment', () => {
      const ingressOnly = clusterRunner.indexOf('--disable-update-deployment ${deployFlags}');
      const checkpoint = clusterRunner.indexOf('gatewayFallbackProbeRunner({');
      const workloadsOnly = clusterRunner.indexOf('--disable-update-proxy ${deployFlags}');
      expect(ingressOnly).to.be.greaterThan(-1);
      expect(checkpoint).to.be.greaterThan(ingressOnly);
      expect(workloadsOnly).to.be.greaterThan(checkpoint);
    });

    it('bootstraps instance routes before the no-backend checkpoint', () => {
      const instanceGateway = clusterRunner.indexOf("RUNNERS['instance-promote']");
      const checkpoint = clusterRunner.indexOf('gatewayFallbackProbeRunner({');
      const instanceRuntime = clusterRunner.indexOf('RUNNERS.instance(');
      expect(instanceGateway).to.be.greaterThan(-1);
      expect(checkpoint).to.be.greaterThan(instanceGateway);
      expect(instanceRuntime).to.be.greaterThan(checkpoint);
    });

    it('enforces the same ingress/fallback/workload order in direct sync', () => {
      const syncRunner = source.slice(source.indexOf('sync: async'), source.indexOf('stop: async'));
      const ingressOnly = syncRunner.indexOf('--disable-update-deployment');
      const checkpoint = syncRunner.indexOf('gatewayFallbackProbeRunner');
      const workloadsOnly = syncRunner.indexOf('--disable-update-proxy');
      expect(ingressOnly).to.be.greaterThan(-1);
      expect(checkpoint).to.be.greaterThan(ingressOnly);
      expect(workloadsOnly).to.be.greaterThan(checkpoint);
    });

    it('proves direct instance fallback before rendering or applying deployment YAML', () => {
      const instanceRunner = source.slice(source.indexOf('instance: async'), source.indexOf("'deploy-key':"));
      const staticAssets = instanceRunner.indexOf('placeInstanceStaticAssets');
      const instanceGateway = instanceRunner.indexOf("RUNNERS['instance-promote']");
      const checkpoint = instanceRunner.indexOf('gatewayFallbackProbeRunner');
      const deploymentYaml = instanceRunner.indexOf('let deploymentYaml');
      expect(staticAssets).to.be.greaterThan(-1);
      expect(instanceGateway).to.be.greaterThan(staticAssets);
      expect(checkpoint).to.be.greaterThan(instanceGateway);
      expect(deploymentYaml).to.be.greaterThan(checkpoint);
    });

    it('marks cluster-invoked instances so they do not repeat the gateway probe', () => {
      expect(clusterRunner.indexOf('gatewayBootstrapComplete: true')).to.be.greaterThan(-1);
    });
  });

  // The Gateway API with QUIC/HTTP3 is the platform's stack; HTTPProxy is what a
  // caller opts into. Every runner resolves it from one place, so none of them
  // can default to a different stack than the one that deployed the routes.
  describe('routing stack default', () => {
    it('is on unless explicitly disabled', () => {
      expect(gatewayApiEnabledFactory({})).to.equal(true);
      expect(gatewayApiEnabledFactory({ dev: true })).to.equal(true);
      expect(gatewayApiEnabledFactory({ gatewayApi: true })).to.equal(true);
      expect(gatewayApiEnabledFactory({ disableGatewayApi: true })).to.equal(false);
    });

    // An explicit request is never second-guessed.
    it('lets an explicit --gateway-api win over the opt-out', () => {
      expect(gatewayApiEnabledFactory({ gatewayApi: true, disableGatewayApi: true })).to.equal(true);
    });
  });

  // An in-process runner reads the cluster type from these flags alone. When
  // none is set every consumer independently falls back to kind: the image pull
  // shells into `kind-worker`, and hostPath `nodeAffinity` pins to that same
  // non-existent node.
  describe('cluster context', () => {
    // Mirrors the three reads inside `run instance`.
    const consumers = (options) => ({
      pullsIntoKind: !!(options.kind || (!options.nodeName && !options.kubeadm && !options.k3s)),
      resolvesKindNode: !!(options.kind || (!options.kubeadm && !options.k3s)),
      volumeContext: clusterTypeFactory(options),
    });

    it('carries each cluster type as exactly one flag', () => {
      expect(clusterContextFactory('kubeadm')).to.deep.equal({ kind: false, kubeadm: true, k3s: false });
      expect(clusterContextFactory('k3s')).to.deep.equal({ kind: false, kubeadm: false, k3s: true });
      expect(clusterContextFactory('kind')).to.deep.equal({ kind: true, kubeadm: false, k3s: false });
    });

    it('round-trips through the flags it reads back', () => {
      for (const clusterType of ['kind', 'kubeadm', 'k3s'])
        expect(clusterTypeFactory(clusterContextFactory(clusterType))).to.equal(clusterType);
    });

    // The cluster runner never provisions kind, so it names its own fallback.
    it('falls back to the type the caller names', () => {
      expect(clusterTypeFactory({})).to.equal('kind');
      expect(clusterTypeFactory({}, 'kubeadm')).to.equal('kubeadm');
      expect(clusterTypeFactory({ k3s: true }, 'kubeadm')).to.equal('k3s');
    });

    it('takes every consumer off the kind default', () => {
      expect(consumers({ dev: true })).to.deep.equal({
        pullsIntoKind: true,
        resolvesKindNode: true,
        volumeContext: 'kind',
      });
      expect(consumers({ dev: true, ...clusterContextFactory('kubeadm') })).to.deep.equal({
        pullsIntoKind: false,
        resolvesKindNode: false,
        volumeContext: 'kubeadm',
      });
      expect(consumers({ dev: true, ...clusterContextFactory('k3s') })).to.deep.equal({
        pullsIntoKind: false,
        resolvesKindNode: false,
        volumeContext: 'k3s',
      });
    });

    it('overrides an inherited flag rather than merging with it', () => {
      expect({ kind: true, ...clusterContextFactory('kubeadm') }).to.deep.equal({
        kind: false,
        kubeadm: true,
        k3s: false,
      });
    });
  });
});
