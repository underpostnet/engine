// The Kubernetes placement of Underpost: its configuration and profiles, its resolution, the context
// pin, the endpoint classification, and the observation, capture, adoption, audit, reconciliation and
// repair of a cluster that the shell harness answers. No real kubectl runs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import Underpost from '../../../src/index.js';
import {
  environmentOf,
  NAMESPACE_RESOURCES,
  placeResources,
  readClusterConf,
  runtimeOf,
} from '../../../src/cli/namespace.js';
import { UNDERPOST_GATEWAY } from '../../../src/server/network/underpost-gateway.js';
import { activeExecutionTarget, setExecutionTarget } from '../../../src/server/build/execution.js';
import clusterConfig from '../../../underpost.cluster.config.js';
import {
  controllerItem,
  cronJobItem,
  kubeCluster,
  namespaceItem,
  nodeItem,
  serviceItem,
} from '../../support/kube-cluster.js';

let scratch;
const write = (conf) => {
  const path = nodePath.join(scratch, `conf.cluster.${Math.random().toString(16).slice(2)}.json`);
  fs.writeJsonSync(path, conf);
  return path;
};
/** The UID of kube-system in the kube-cluster harness. */
const FINGERPRINT = '6f1c2a3b-0000-4111-8222-000011112222';
/** The routing and the TLS policy of a configured environment. */
const ROUTED = { routing: { provider: 'gateway-api' }, tls: { mode: 'cert-manager', issuer: 'letsencrypt-prod' } };
/** A configuration with each environment on the legacy profile, its namespaces as overrides. */
const conf = (environments) => ({
  environments: Object.fromEntries(
    Object.entries(environments).map(([name, { namespaces, ...section }]) => [
      name,
      { profile: 'legacy', ...ROUTED, ...section, ...(namespaces ? { overrides: { namespaces } } : {}) },
    ]),
  ),
});
const scheduled = (production) => ({ environments: { production: { ...ROUTED, ...production } } });

/** Writes node records of `engine-private/deploy/nodes` in the working directory. */
const nodeRecords = (records) => {
  for (const [name, record] of Object.entries(records))
    fs.outputJsonSync(`engine-private/deploy/nodes/${name}.json`, { hubHost: '203.0.113.1', peerId: name, ...record });
};

/** The control node `control-a` on the Kubernetes node node-a, and the worker `worker-b` on node-b. */
const RECORDS = {
  'control-a': { role: 'control', kubernetesNodeName: 'node-a' },
  'worker-b': { role: 'worker', kubernetesNodeName: 'node-b' },
};

/** Runs a function in the scratch directory. */
const inScratch = (run) => {
  const cwd = process.cwd();
  process.chdir(scratch);
  try {
    return run();
  } finally {
    process.chdir(cwd);
  }
};

/** The production placement of the separation case: workloads and operations apart from every datastore. */
const SEPARATED = conf({
  production: {
    context: 'underpost-production',
    namespaces: {
      workloads: 'dd-workloads',
      operations: 'dd-workloads',
      datastores: { mongodb: 'dd-data', mariadb: 'dd-data', ipfs: 'dd-data', valkey: 'dd-cache' },
    },
  },
  development: { context: 'kind-kind' },
});

const kubeconfig = process.env.KUBECONFIG;

beforeEach(() => {
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-namespace-'));
});

afterEach(() => {
  fs.removeSync(scratch);
  if (kubeconfig === undefined) delete process.env.KUBECONFIG;
  else process.env.KUBECONFIG = kubeconfig;
  setExecutionTarget(null);
});

const namespacesOf = (placements) =>
  Object.fromEntries(placements.map(({ resource, namespace }) => [resource, namespace]));

describe('the placement configuration', () => {
  it('keeps the legacy placement without a file: every resource where it has always run', () => {
    const path = nodePath.join(scratch, 'missing.json');
    expect(namespacesOf(Underpost.namespace.resolveAll({ path }))).toEqual({
      workloads: 'default',
      releases: 'default',
      platform: 'default',
      operations: 'default',
      observability: 'default',
      mongodb: 'default',
      mariadb: 'default',
      mysql: 'default',
      postgresql: 'default',
      valkey: 'default',
      ipfs: 'default',
      kafka: 'kafka',
      contour: 'projectcontour',
      envoyGateway: 'envoy-gateway-system',
      certManager: 'cert-manager',
      calico: 'calico-system',
      calicoApiserver: 'calico-apiserver',
      tigeraOperator: 'tigera-operator',
      coreDns: 'kube-system',
      localPathStorage: 'local-path-storage',
    });
    // Without a file, no environment names its routing, its TLS policy or its cluster.
    expect(Underpost.namespace.cluster({ path })).toEqual({
      environment: 'production',
      context: '',
      clusterDomain: 'cluster.local',
      routing: null,
      tls: null,
      cluster: null,
    });
  });

  it('generates a configuration that references a built-in profile and names no machine', () => {
    const scheduler = Object.fromEntries(
      ['workloads', 'releases', 'platform', 'operations', 'observability', 'datastores'].map((category) => [
        category,
        { mode: 'scheduler' },
      ]),
    );
    const recommended = Underpost.namespace.template();
    // No context or cluster identity until a live cluster is adopted.
    const unadopted = { context: null, cluster: null };
    expect(recommended).toEqual({
      environments: {
        production: {
          ...unadopted,
          profile: 'recommended',
          routing: { provider: 'gateway-api' },
          tls: { mode: 'cert-manager', issuer: 'letsencrypt-prod' },
          nodes: { groups: { workers: [], control: [] } },
        },
        development: {
          ...unadopted,
          profile: 'recommended',
          routing: { provider: 'gateway-api' },
          tls: { mode: 'self-signed' },
          overrides: { scheduling: scheduler },
        },
        test: {
          ...unadopted,
          profile: 'recommended',
          routing: { provider: 'gateway-api' },
          tls: { mode: 'self-signed' },
          overrides: { scheduling: scheduler },
        },
      },
    });
    const recommendedPath = write(recommended);
    expect(
      Underpost.namespace.resolve({ resource: 'mongodb', path: recommendedPath, environment: 'test' }),
    ).toMatchObject({ namespace: 'underpost-data', source: 'the recommended profile: namespaces.datastores.mongodb' });
    // An empty group refuses in production; test leaves the pods to the scheduler.
    expect(() => Underpost.namespace.schedule({ resource: 'mongodb', path: recommendedPath })).toThrow(
      'the recommended profile: scheduling.datastores places datastores on the node group control, which ' +
        'environments.production.nodes.groups.control gives no member: list its node records there',
    );
    expect(
      Underpost.namespace.schedule({ resource: 'mongodb', path: recommendedPath, environment: 'test' }),
    ).toMatchObject({ mode: 'scheduler', nodes: [], source: 'environments.test.overrides.scheduling.datastores' });
    // Adoption names where everything runs today: no resource moves.
    const legacy = Underpost.namespace.template('legacy');
    expect(legacy.environments).toEqual({
      production: { ...unadopted, profile: 'legacy', ...ROUTED },
      development: { ...unadopted, profile: 'legacy', routing: ROUTED.routing, tls: { mode: 'self-signed' } },
      test: { ...unadopted, profile: 'legacy', routing: ROUTED.routing, tls: { mode: 'self-signed' } },
    });
    const missing = nodePath.join(scratch, 'missing.json');
    for (const environment of ['production', 'development', 'test'])
      expect(namespacesOf(Underpost.namespace.resolveAll({ path: write(legacy), environment }))).toEqual(
        namespacesOf(Underpost.namespace.resolveAll({ path: missing, environment })),
      );
    expect(() => Underpost.namespace.template('modern')).toThrow(
      'modern is not a built-in profile: legacy, recommended',
    );
  });

  it('refuses another version, an unknown key, profile, group or rule, a misplaced or fixed resource, and an invalid name', () => {
    const on = (section) => scheduled({ profile: 'legacy', ...section });
    for (const [value, message] of [
      [{ version: 4, environments: {} }, 'has unknown keys version'],
      [{ profiles: {}, environments: {} }, 'has unknown keys profiles: a custom profile is a file of'],
      [on({ nodeBindings: { worker: 'node-a' } }), 'environments.production has unknown keys nodeBindings'],
      [scheduled({}), 'environments.production.profile is missing (legacy, recommended)'],
      [
        scheduled({ profile: 'modern' }),
        'environments.production.profile names no profile: modern (legacy, recommended)',
      ],
      [
        on({ overrides: { scheduling: { kafka: { mode: 'scheduler' } } } }),
        'environments.production.overrides.scheduling.kafka is not a category',
      ],
      [
        on({ overrides: { scheduling: { workloads: 'worker' } } }),
        'scheduling.workloads is not { group, mode } with a mode of required, preferred, scheduler',
      ],
      [
        on({ overrides: { scheduling: { workloads: { group: 'Bad Group', mode: 'required' } } } }),
        'scheduling.workloads.group is not a node group name (a DNS label): Bad Group',
      ],
      [
        on({ overrides: { scheduling: { workloads: { group: 'workers', mode: 'scheduler' } } } }),
        'scheduling.workloads: the scheduler mode names no group',
      ],
      [on({ nodes: { members: [] } }), 'environments.production.nodes has unknown keys members'],
      [on({ nodes: { groups: { Workers: ['node-a'] } } }), 'nodes.groups.Workers is not a node group name'],
      [
        on({ nodes: { groups: { workers: 'node-a' } } }),
        'nodes.groups.workers is not a list of distinct node record ids',
      ],
      [
        on({ nodes: { groups: { workers: ['node-a', 'node-a'] } } }),
        'nodes.groups.workers is not a list of distinct node record ids',
      ],
      [{ production: {} }, 'has unknown keys production'],
      [conf({ staging: {} }), 'staging is not an environment'],
      [conf({ production: { cluster: 'x' } }), 'production.cluster.fingerprint is missing'],
      [conf({ production: { cluster: { fingerprint: 'abc' } } }), 'production.cluster.fingerprint is not a UID'],
      [
        conf({ production: { cluster: { fingerprint: FINGERPRINT, servers: ['http://10.0.0.1:6443'] } } }),
        'production.cluster.servers is not a list of https API server URLs',
      ],
      [
        conf({ production: { cluster: { fingerprint: FINGERPRINT, name: 'x' } } }),
        'production.cluster has unknown keys name',
      ],
      [
        conf({ production: { namespaces: { mongodb: 'dd-data' } } }),
        'place MongoDB at environments.production.overrides.namespaces.datastores.mongodb',
      ],
      [
        conf({ production: { namespaces: { datastores: { workloads: 'x' } } } }),
        'place the application workloads at environments.production.overrides.namespaces.workloads',
      ],
      [conf({ production: { namespaces: { datastores: { redis: 'x' } } } }), 'names no placed resource'],
      [conf({ production: { namespaces: { workloads: 'Bad_Name' } } }), 'is not a Kubernetes namespace name'],
      [conf({ production: { namespaces: { workloads: 'a'.repeat(64) } } }), 'is not a Kubernetes namespace name'],
      [conf({ production: { namespaces: { datastores: { kafka: 'data' } } } }), 'Kafka runs where its manifest names'],
      [conf({ production: { namespaces: { addons: { calico: 'net' } } } }), 'Calico runs where its manifest names'],
      [conf({ production: { context: 'two words' } }), 'production.context is not a kubeconfig context name'],
      [conf({ production: { clusterDomain: 'Cluster_Local' } }), 'production.clusterDomain is not a DNS domain'],
      [conf({ production: { tls: 'cert-manager' } }), 'production.tls is not a TLS policy: {"mode": "cert-manager"'],
      [
        conf({ production: { routing: { provider: 'nginx' } } }),
        'production.routing.provider is not a routing provider: nginx',
      ],
      [
        conf({ production: { routing: 'gateway-api' } }),
        'production.routing.provider is missing (gateway-api, contour)',
      ],
    ])
      expect(() => readClusterConf(write(value)), message).toThrow(message);
  });

  it('describes each resource with workloads it can find and the names its owners give them', () => {
    expect(NAMESPACE_RESOURCES.platform.workloads).toContain(`deployment/${UNDERPOST_GATEWAY.name}`);
    expect(NAMESPACE_RESOURCES.platform.services).toEqual([UNDERPOST_GATEWAY.serviceName]);
    expect(NAMESPACE_RESOURCES.platform.clusterScoped).toEqual([`persistentvolume/${UNDERPOST_GATEWAY.volumeName}`]);
    for (const [id, definition] of Object.entries(NAMESPACE_RESOURCES)) {
      for (const workload of definition.workloads)
        expect(workload, id).toMatch(/^[a-z]+(\/[a-z0-9-]+|:[\w.-]+(=[\w.-]+)?)$/);
      if (definition.install) expect(definition.install, id).toMatch(/^(cluster|cron) --[a-z-]+( --[a-z-]+)*$/);
      if (['datastore', 'observability', 'platform', 'operations'].includes(definition.role) && !definition.fixed)
        expect(definition.install, id).toBeTruthy();
      for (const object of definition.clusterScoped) expect(object, id).toMatch(/^[a-z]+\/[a-z0-9.-]+$/);
      if (definition.endpoints.length || definition.providers.length)
        expect(definition.services.length, id).toBeGreaterThan(0);
      if (definition.fixed) expect(definition.fixed, id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

/** A configuration file in its own directory, beside the custom profiles it names by id. */
const withProfiles = (profiles, environments = {}) => {
  const directory = fs.mkdtempSync(nodePath.join(scratch, 'deploy-'));
  for (const [id, profile] of Object.entries(profiles))
    fs.outputJsonSync(nodePath.join(directory, 'profiles', `${id}.json`), profile);
  const path = nodePath.join(directory, 'conf.cluster.json');
  fs.writeJsonSync(path, { environments });
  return path;
};
const RECOMMENDED = clusterConfig.profiles.recommended;

describe('the placement profiles', () => {
  it('ships recommended and legacy in underpost.cluster.config.js, each a complete placement on abstract node groups', () => {
    const path = write(conf({}));
    expect(Underpost.namespace.profiles(path).map(({ id, origin, groups }) => [id, origin, groups])).toEqual([
      ['legacy', 'built-in', []],
      ['recommended', 'built-in', ['workers', 'control']],
    ]);
    const recommended = Underpost.namespace.profile('recommended', path);
    expect(recommended).toMatchObject({
      file: 'underpost.cluster.config.js',
      namespaces: RECOMMENDED.namespaces,
      scheduling: RECOMMENDED.scheduling,
    });
    expect(Object.keys(clusterConfig.profiles)).toEqual(['legacy', 'recommended']);
    expect(RECOMMENDED.scheduling).toEqual({
      workloads: { group: 'workers', mode: 'required' },
      releases: { group: 'control', mode: 'required' },
      platform: { group: 'control', mode: 'required' },
      operations: { group: 'control', mode: 'required' },
      observability: { group: 'control', mode: 'required' },
      datastores: { group: 'control', mode: 'required' },
    });
    expect(Object.keys(clusterConfig.profiles.recommended)).toEqual(['namespaces', 'scheduling']);
    expect(() => Underpost.namespace.profile('modern', path)).toThrow('modern is not a profile: legacy, recommended');
  });

  it('reads a custom profile beside the configuration, where a new node group needs no change of Underpost', () => {
    // A custom profile has the shape of a built-in one; its file name is its id.
    const edge = {
      ...RECOMMENDED,
      scheduling: { ...RECOMMENDED.scheduling, datastores: { group: 'storage', mode: 'required' } },
    };
    const path = withProfiles({ edge }, { production: { profile: 'edge' } });
    expect(Underpost.namespace.profiles(path).find(({ id }) => id === 'edge')).toMatchObject({
      origin: 'custom',
      groups: ['workers', 'control', 'storage'],
      file: nodePath.join(nodePath.dirname(path), 'profiles', 'edge.json'),
    });
    expect(Underpost.namespace.resolve({ resource: 'mongodb', path })).toMatchObject({
      namespace: 'underpost-data',
      source: `${nodePath.join(nodePath.dirname(path), 'profiles', 'edge.json')}: namespaces.datastores.mongodb`,
    });
    // A package update replaces only the built-in profiles; no custom profile takes the id of one.
    expect(Underpost.namespace.profile('recommended', path).file).toBe('underpost.cluster.config.js');
  });

  it('refuses a custom profile that shadows a built-in one, lacks a key, or holds anything else', () => {
    const { namespaces, scheduling } = RECOMMENDED;
    const { releases, ...partial } = namespaces;
    for (const [id, profile, message] of [
      ['recommended', RECOMMENDED, 'recommended is a built-in profile; give the custom profile another id'],
      ['partial', { namespaces: partial, scheduling }, 'lacks namespaces.releases'],
      [
        'machine',
        { ...RECOMMENDED, nodeBindings: { worker: 'hp-envy-iso-ram-rocky9' } },
        'has unknown keys nodeBindings',
      ],
      ['versioned', { ...RECOMMENDED, schemaVersion: 1 }, 'has unknown keys schemaVersion'],
    ])
      expect(() => Underpost.namespace.profiles(withProfiles({ [id]: profile })), id).toThrow(message);
    expect(releases).toBe('underpost-releases');
  });
});

describe('the resolution of a namespace', () => {
  it('takes the option of the resource, the overrides of the environment, then its profile', () => {
    const path = write(SEPARATED);
    const resolve = (resource, options = {}, environment) =>
      Underpost.namespace.resolve({ resource, options, environment, path });
    expect(resolve('mongodb')).toEqual({
      resource: 'mongodb',
      role: 'datastore',
      namespace: 'dd-data',
      desired: 'dd-data',
      services: ['mongodb-service'],
      context: 'underpost-production',
      clusterDomain: 'cluster.local',
      environment: 'production',
      source: 'environments.production.overrides.namespaces.datastores.mongodb',
    });
    // The legacy --namespace places the workloads only.
    expect(resolve('workloads', { namespace: 'legacy' })).toMatchObject({
      namespace: 'legacy',
      source: 'option --namespace',
    });
    expect(resolve('mongodb', { namespace: 'legacy' })).toMatchObject({ namespace: 'dd-data' });
    expect(resolve('mongodb', { namespace: 'legacy', namespaceMongodb: 'own' })).toMatchObject({
      namespace: 'own',
      source: 'option --namespace-mongodb',
    });
    // The profile places each resource the overrides do not name.
    expect(resolve('releases')).toMatchObject({
      namespace: 'default',
      source: 'the legacy profile: namespaces.releases',
    });
    expect(resolve('releases', { namespaceReleases: 'jobs' })).toMatchObject({ namespace: 'jobs' });
    expect(resolve('mysql')).toMatchObject({
      namespace: 'default',
      source: 'the legacy profile: namespaces.datastores.mysql',
    });
    // The legacy option moves every resource but an addon or a fixed one.
    expect(resolve('envoyGateway', { namespace: 'legacy' })).toMatchObject({ namespace: 'envoy-gateway-system' });
    expect(resolve('kafka', { namespace: 'legacy', namespaceKafka: 'x' })).toMatchObject({
      namespace: 'kafka',
      source: 'fixed by its manifest',
    });
    // `--dev` and `--env` select the section: development names no namespace of its own.
    for (const options of [{ dev: true }, { env: 'development' }])
      expect(resolve('mongodb', options)).toMatchObject({
        namespace: 'default',
        context: 'kind-kind',
        environment: 'development',
      });
    expect(() => resolve('redis')).toThrow('redis is not a placed resource');
    expect(() => resolve('workloads', { namespace: 'Bad;$(id)' })).toThrow('is not a Kubernetes namespace name');
  });

  it('names a Service by its short name only where the workloads and the release Jobs share its namespace', () => {
    const serviceHost = (params, value) => Underpost.namespace.serviceHost({ ...params, path: write(value) });
    expect(serviceHost({ resource: 'mongodb', member: 'mongodb-0' }, SEPARATED)).toBe(
      'mongodb-0.mongodb-service.dd-data.svc.cluster.local',
    );
    expect(serviceHost({ resource: 'ipfs' }, SEPARATED)).toBe('ipfs-cluster.dd-data.svc.cluster.local');
    const shared = { workloads: 'apps', releases: 'apps', datastores: { valkey: 'apps' } };
    expect(serviceHost({ resource: 'valkey' }, conf({ production: { namespaces: shared } }))).toBe('valkey-service');
    // A release Job apart from the workloads resolves no short name of theirs.
    expect(
      serviceHost({ resource: 'valkey' }, conf({ production: { namespaces: { ...shared, releases: 'jobs' } } })),
    ).toBe('valkey-service.apps.svc.cluster.local');
    // The cluster domain is the one the environment names.
    expect(
      serviceHost(
        { resource: 'mongodb' },
        conf({ production: { clusterDomain: 'edge.internal', namespaces: shared } }),
      ),
    ).toBe('mongodb-service.default.svc.edge.internal');
    expect(
      Underpost.namespace.serviceFqdn({
        service: 'grpc',
        namespace: 'obs',
        member: 'grpc-0',
        port: 50051,
        path: write(conf({ production: { clusterDomain: 'edge.internal' } })),
      }),
    ).toBe('grpc-0.grpc.obs.svc.edge.internal:50051');
  });

  it('passes the namespace options of one command to another, and adds one option per configurable resource', () => {
    expect(
      Underpost.namespace.overrides({ namespace: 'a', namespaceMongodb: 'b', dev: true, namespaceUnknown: 'c' }),
    ).toEqual({ namespace: 'a', namespaceMongodb: 'b' });
    const flags = [];
    Underpost.namespace.options({ option: (flag) => flags.push(flag.split(' ')[0]) && { option: () => {} } });
    expect(flags).toEqual([
      '--namespace-workloads',
      '--namespace-releases',
      '--namespace-platform',
      '--namespace-operations',
      '--namespace-observability',
      '--namespace-mongodb',
      '--namespace-mariadb',
      '--namespace-mysql',
      '--namespace-postgresql',
      '--namespace-valkey',
      '--namespace-ipfs',
      '--namespace-envoy-gateway',
      '--namespace-cert-manager',
    ]);
  });

  it('schedules each category on the nodes of its group, and leaves the rest to the scheduler or the installer', () =>
    inScratch(() => {
      nodeRecords({
        ...RECORDS,
        'worker-c': { role: 'worker', kubernetesNodeName: 'node-c' },
        'nas-1': { role: 'worker', kubernetesNodeName: 'nas-1' },
        'nas-2': { role: 'worker', kubernetesNodeName: 'nas-2' },
      });
      const groups = { control: ['control-a'], workers: ['worker-b', 'worker-c'] };
      const path = write(
        scheduled({
          profile: 'recommended',
          nodes: { groups },
          overrides: { scheduling: { releases: { mode: 'scheduler' } } },
        }),
      );
      const node = (resource, params = {}) =>
        Underpost.namespace.schedule({ resource, path, environment: 'production', ...params });
      // A group of several workers: the scheduler chooses among them.
      expect(node('workloads')).toEqual({
        resource: 'workloads',
        category: 'workloads',
        profile: 'recommended',
        group: 'workers',
        mode: 'required',
        members: ['worker-b', 'worker-c'],
        nodes: ['node-b', 'node-c'],
        source: 'the recommended profile: scheduling.workloads',
      });
      expect(node('mongodb')).toMatchObject({ category: 'datastores', group: 'control', nodes: ['node-a'] });
      expect(node('kafka')).toMatchObject({ category: 'datastores', nodes: ['node-a'] });
      expect(node('releases')).toMatchObject({
        mode: 'scheduler',
        nodes: [],
        source: 'environments.production.overrides.scheduling.releases',
      });
      expect(node('certManager')).toMatchObject({ category: '', nodes: [], source: 'its installer' });
      expect(node('workloads', { node: 'node-x' })).toMatchObject({ nodes: ['node-x'], source: 'option' });
      // Each environment is its own: no group of production reaches development.
      expect(node('workloads', { environment: 'development' })).toMatchObject({
        nodes: [],
        source: 'the legacy profile: scheduling.workloads',
      });

      // A future storage group, and a node in two groups, need only configuration.
      const storage = write(
        scheduled({
          profile: 'recommended',
          nodes: { groups: { ...groups, storage: ['nas-1', 'nas-2'], control: ['control-a', 'worker-b'] } },
          overrides: { scheduling: { datastores: { group: 'storage', mode: 'preferred' } } },
        }),
      );
      expect(Underpost.namespace.schedule({ resource: 'mongodb', path: storage })).toMatchObject({
        group: 'storage',
        mode: 'preferred',
        nodes: ['nas-1', 'nas-2'],
      });
      expect(Underpost.namespace.schedule({ resource: 'platform', path: storage }).nodes).toEqual(['node-a', 'node-b']);
      // A static host path volume holds the data of one node: a datastore on one takes a group of one member.
      expect(() => Underpost.namespace.podScheduling({ resource: 'mongodb', path: storage })).toThrow(
        'MongoDB keeps its data on a host path volume of one node, and the node group storage names nas-1, nas-2: ' +
          'a member placed on another node starts on an empty directory. Give the group one member',
      );
      expect(() =>
        Underpost.deploy.persistentVolumeFactory({
          hostPath: '/data/x',
          pvcId: 'pvc-x',
          nodeNames: ['nas-1', 'nas-2'],
        }),
      ).toThrow(
        'The host path volume pv-x keeps what its pods write on one node, and its node group names nas-1, nas-2',
      );

      // Two clusters share one profile, each with its own members.
      nodeRecords({ 'worker-z': { role: 'worker', kubernetesNodeName: 'zone-worker' } });
      const other = write(
        scheduled({ profile: 'recommended', nodes: { groups: { ...groups, workers: ['worker-z'] } } }),
      );
      expect(Underpost.namespace.schedule({ resource: 'workloads', path: other }).nodes).toEqual(['zone-worker']);

      // A group that resolves to no Kubernetes node refuses: no hostname, address or pod node stands in.
      const grouped = (workers) =>
        write(scheduled({ profile: 'recommended', nodes: { groups: { ...groups, workers } } }));
      expect(() => Underpost.namespace.schedule({ resource: 'workloads', path: grouped([]) })).toThrow(
        'which environments.production.nodes.groups.workers gives no member: list its node records there',
      );
      expect(() => Underpost.namespace.schedule({ resource: 'workloads', path: grouped(['gone']) })).toThrow(
        './engine-private/deploy/nodes/gone.json does not exist',
      );
      nodeRecords({ 'worker-n': { role: 'worker' } });
      expect(() => Underpost.namespace.schedule({ resource: 'workloads', path: grouped(['worker-n']) })).toThrow(
        'worker-n.json names no Kubernetes node: node bin namespace nodes identify worker-n --kubernetes-node <node>',
      );
      nodeRecords({ 'worker-twin': { role: 'worker', kubernetesNodeName: 'node-b' } });
      expect(() => Underpost.namespace.schedule({ resource: 'workloads', path })).toThrow(
        'worker-b and worker-twin name one Kubernetes node: node-b',
      );

      // A write keeps the profile, the groups and the scheduling, and stores only what differs from the profile.
      placeResources(path, 'production', { valkey: 'dd-cache', mongodb: 'underpost-data' });
      expect(fs.readJsonSync(path).environments.production).toEqual({
        ...ROUTED,
        profile: 'recommended',
        nodes: { groups },
        overrides: {
          scheduling: { releases: { mode: 'scheduler' } },
          namespaces: { datastores: { valkey: 'dd-cache' } },
        },
      });
      expect(readClusterConf(path).production.namespaces).toMatchObject({
        valkey: 'dd-cache',
        mongodb: 'underpost-data',
      });
    }));
});

describe('the endpoints of a deployment', () => {
  it('projects each endpoint the catalog places to the namespace of its Service, and keeps its credential and options', () => {
    const path = write(SEPARATED);
    const values = {
      DB_HOST:
        'mongodb://user:s3cret@mongodb-0.mongodb-service:27017,mongodb-1.mongodb-service.default.svc.cluster.local:27017,mongodb-2.mongodb-service.dd-data/app?replicaSet=rs0&authSource=admin',
      VALKEY_HOST: 'valkey-service.default.svc.cluster.local',
      MARIADB_HOST: 'db.example.com',
      IPFS_API_URL: 'http://10.96.4.2:5001',
      IPFS_GATEWAY_URL: 'http://ipfs-cluster.default.svc.cluster.local:8080/ipfs',
      SECRET: 'untouched',
    };
    const layer = Underpost.namespace.endpointLayer({ values, path });
    expect(layer.values).toEqual({
      DB_HOST:
        'mongodb://user:s3cret@mongodb-0.mongodb-service.dd-data.svc.cluster.local:27017,mongodb-1.mongodb-service.dd-data.svc.cluster.local:27017,mongodb-2.mongodb-service.dd-data.svc.cluster.local/app?replicaSet=rs0&authSource=admin',
      VALKEY_HOST: 'valkey-service.dd-cache.svc.cluster.local',
      IPFS_GATEWAY_URL: 'http://ipfs-cluster.dd-data.svc.cluster.local:8080/ipfs',
    });
    expect(layer.changes.find(({ key }) => key === 'VALKEY_HOST')).toEqual({
      key: 'VALKEY_HOST',
      resource: 'valkey',
      from: ['valkey-service.default.svc.cluster.local'],
      to: ['valkey-service.dd-cache.svc.cluster.local'],
    });
    expect(JSON.stringify(layer.changes)).not.toContain('s3cret');
    // A placement that already matches changes nothing.
    expect(Underpost.namespace.endpointLayer({ values: layer.values, path }).values).toEqual({});
  });

  it('classifies what the pods reach, its severity, and the file that sets the key, and never a credential', () => {
    const path = write(SEPARATED);
    const base = nodePath.join(scratch, '.env.production');
    const overlay = nodePath.join(scratch, '.env.production.oci');
    fs.writeFileSync(overlay, 'DB_HOST=x\nVALKEY_HOST=x\n');
    const rows = Underpost.namespace.endpoints({
      path,
      files: { base, overlay },
      services: [
        { namespace: 'dd-data', name: 'mongodb-service' },
        { namespace: 'dd-data', name: 'ipfs-cluster' },
      ],
      values: {
        DB_HOST: 'mongodb://user:s3cret@mongodb-0.mongodb-service.default:27017/app',
        VALKEY_HOST: 'valkey-service',
        MARIADB_HOST: 'db.example.com',
        IPFS_API_URL: 'http://10.96.4.2:5001',
      },
    });
    expect(
      rows.map(({ key, host, effective, state, severity, source }) => [key, host, effective, state, severity, source]),
    ).toEqual([
      [
        'DB_HOST',
        'mongodb-0.mongodb-service.default',
        'mongodb-0.mongodb-service.dd-data.svc.cluster.local',
        'placed',
        '',
        overlay,
      ],
      ['MARIADB_HOST', 'db.example.com', 'db.example.com', 'external', '', base],
      [
        'VALKEY_HOST',
        'valkey-service',
        'valkey-service.dd-cache.svc.cluster.local',
        'missing-service',
        'error',
        overlay,
      ],
      ['IPFS_API_URL', '10.96.4.2', '10.96.4.2', 'unknown', 'warning', base],
    ]);
    expect(rows.every(({ verified }) => verified)).toBe(true);
    expect(rows[2].message).toBe(
      `${overlay}: VALKEY_HOST reaches valkey-service.dd-cache.svc.cluster.local, but dd-cache holds no Service valkey-service`,
    );
    expect(JSON.stringify(rows)).not.toContain('s3cret');
    // Without the cluster, nothing is checked against it.
    const [unchecked] = Underpost.namespace.endpoints({
      path,
      files: { base },
      values: { VALKEY_HOST: 'valkey-service' },
    });
    expect(unchecked).toMatchObject({ state: 'placed', verified: false, message: '' });
  });

  it('forwards the namespace options of a command to the commands it starts', () => {
    expect(
      Underpost.namespace.flags({
        namespace: 'ns',
        namespaceWorkloads: 'w',
        namespaceEnvoyGateway: 'e',
        deployId: 'x',
      }),
    ).toBe(" --namespace 'ns' --namespace-workloads 'w' --namespace-envoy-gateway 'e'");
    expect(Underpost.namespace.flags({})).toBe('');
  });

  it('reports a literal database host of conf.server.json that names another namespace, which it cannot project', () => {
    const cwd = process.cwd();
    process.chdir(scratch);
    try {
      fs.outputJsonSync('engine-private/conf/dd-x/conf.server.json', {
        'x.test': {
          '/': { db: { provider: 'mongoose', host: 'mongodb://mongodb-service.default:27017' } },
          '/api': { db: { provider: 'mongoose', host: 'env:DB_HOST' } },
        },
      });
      fs.copySync('engine-private/conf/dd-x', 'engine-private/conf/dd-y');
      const rows = Underpost.namespace.deployEndpoints({ deployIds: ['dd-x', 'dd-y'], path: write(SEPARATED) });
      // One endpoint, with every deployment that reads it.
      expect(rows.map(({ key, host, state, readers }) => [key, host, state, readers])).toEqual([
        [
          'db.host:mongoose',
          'mongodb-service.default',
          'stale',
          [
            { deployId: 'dd-x', source: './engine-private/conf/dd-x/conf.server.json' },
            { deployId: 'dd-y', source: './engine-private/conf/dd-y/conf.server.json' },
          ],
        ],
      ]);
      expect(rows[0].message).toContain('name it env:DB_HOST, which Underpost projects');
      expect(Underpost.namespace.deployEndpoints({ deployIds: ['dd-x'], path: write(conf({})) })[0].state).toBe(
        'placed',
      );
    } finally {
      process.chdir(cwd);
    }
  });
});

describe('the cluster target', () => {
  it('takes the first of the context of the command, --context, --current-context, the configuration', () => {
    const path = write(SEPARATED);
    const target = (params) => Underpost.namespace.target({ path, ...params });
    expect(target({})).toMatchObject({
      environment: 'production',
      context: 'underpost-production',
      source: 'environments.production.context',
      override: false,
      refusal: '',
    });
    expect(target({ options: { context: 'other' } })).toMatchObject({ context: 'other', source: 'option --context' });
    expect(target({ options: { currentContext: true } })).toMatchObject({
      context: '',
      source: 'option --current-context',
      override: true,
    });
    expect(target({ context: 'plan-context', source: 'plan p1', options: { context: 'other' } })).toMatchObject({
      context: 'plan-context',
      source: 'plan p1',
    });
    expect(() => target({ options: { context: 'other', currentContext: true } })).toThrow('not both');
  });

  it('refuses every environment the configuration names no context for: no current context is implicit', () => {
    const path = write(conf({ production: {}, development: { context: null } }));
    expect(Underpost.namespace.target({ path }).refusal).toContain(
      'environments.production.context is not configured: set it to the context of its cluster ' +
        '(node bin namespace capture --env production --context <context>, then node bin namespace adopt ' +
        '--env production --write-config',
    );
    expect(Underpost.namespace.target({ path, environment: 'development' })).toMatchObject({
      context: '',
      source: '',
      refusal: expect.stringContaining('environments.development.context is not configured'),
    });
    expect(Underpost.namespace.target({ path, environment: 'test' }).refusal).toContain(
      'environments.test.context is not configured',
    );
  });

  it('names the command that writes the configuration when the file does not exist', () => {
    const path = nodePath.join(scratch, 'missing.json');
    expect(Underpost.namespace.target({ path, environment: 'development' }).refusal).toBe(
      `${path} does not exist: node bin new --cluster writes it with each environment, then set ` +
        'environments.development.context, or name one with --context, or add --current-context',
    );
  });

  it('reads null as not configured, and refuses an empty string as a configured value', () => {
    const path = write(conf({ production: { context: null, cluster: null, routing: null, tls: null } }));
    expect(Underpost.namespace.cluster({ path })).toMatchObject({
      context: '',
      cluster: null,
      routing: null,
      tls: null,
    });
    expect(Underpost.namespace.target({ path }).blockers).toHaveLength(3);
    expect(() => readClusterConf(write(conf({ production: { context: '' } })))).toThrow(
      'environments.production.context is empty: name the context of its cluster, or write null while the ' +
        'environment has none',
    );
    expect(() => readClusterConf(write(conf({ production: { tls: { mode: 'cert-manager', issuer: '' } } })))).toThrow(
      'environments.production.tls.issuer is not a ClusterIssuer Underpost ships: ',
    );
    expect(() => readClusterConf(write(conf({ production: { routing: { provider: '' } } })))).toThrow(
      'environments.production.routing.provider is not a routing provider: ',
    );
    expect(() => readClusterConf(write(conf({ production: { cluster: { fingerprint: '' } } })))).toThrow(
      'environments.production.cluster.fingerprint is not a UID',
    );
  });

  it('records the kubeconfig, the runtime, the profile, the declared cluster and a digest of the section', () => {
    process.env.KUBECONFIG = '/k/one:/k/two';
    const declared = { fingerprint: FINGERPRINT, servers: ['https://10.0.0.1:6443'] };
    const path = write(conf({ production: { context: 'prod', cluster: declared } }));
    const target = Underpost.namespace.target({ path, runtime: 'kubeadm' });
    expect(target).toMatchObject({
      kubeconfig: ['/k/one', '/k/two'],
      cluster: declared,
      runtime: 'kubeadm',
      profile: 'LIVE_CLUSTER',
      configuration: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      blockers: [],
    });
    expect(Object.isFrozen(target)).toBe(true);
    const changed = write(conf({ production: { context: 'prod', cluster: declared, clusterDomain: 'other.local' } }));
    expect(Underpost.namespace.target({ path: changed }).configuration).not.toBe(target.configuration);
  });

  it('refuses a change without routing, TLS or, in production, a declared cluster identity', () => {
    const bare = write({ environments: { production: { profile: 'legacy', context: 'prod' } } });
    expect(Underpost.namespace.target({ path: bare }).blockers).toEqual([
      expect.stringContaining('environments.production.routing is not configured'),
      expect.stringContaining('environments.production.tls is not configured'),
      expect.stringContaining('environments.production.cluster is not configured'),
    ]);
    const routed = write(conf({ development: { context: 'kind-kind' } }));
    expect(Underpost.namespace.target({ path: routed, environment: 'development' }).blockers).toEqual([]);
    // A plan names the identity it reaches; a new cluster has none to declare yet.
    const prod = write(conf({ production: { context: 'prod' } }));
    expect(Underpost.namespace.target({ path: prod }).blockers).toHaveLength(1);
    expect(Underpost.namespace.target({ path: prod, context: 'new', source: 'the new cluster' }).blockers).toEqual([]);
    expect(
      Underpost.namespace.target({ path: prod, context: 'p', source: 'plan', cluster: { fingerprint: FINGERPRINT } }),
    ).toMatchObject({ cluster: { fingerprint: FINGERPRINT }, blockers: [] });
  });

  it('keeps the target of the command that started this process, and refuses another --context', () => {
    const path = write(SEPARATED);
    setExecutionTarget({ environment: 'production', context: 'parent', source: 'option --context', refusal: '' });
    expect(Underpost.namespace.target({ path }).context).toBe('parent');
    expect(Underpost.namespace.target({ path, options: { context: 'parent' } }).context).toBe('parent');
    expect(Underpost.namespace.target({ path, options: { currentContext: true } }).context).toBe('parent');
    expect(() => Underpost.namespace.target({ path, options: { context: 'other' } })).toThrow(
      '--context other conflicts with the context parent the parent command resolved from option --context',
    );
    expect(Underpost.namespace.target({ path, environment: 'development' }).context).toBe('kind-kind');
    setExecutionTarget({ environment: 'production', context: '', source: '', refusal: 'refused' });
    expect(Underpost.namespace.target({ path }).context).toBe('underpost-production');
  });

  it('refuses --dev with another --env, and two Kubernetes distributions', () => {
    expect(environmentOf({ options: { dev: true } })).toBe('development');
    expect(environmentOf({ options: { dev: true, env: 'development' } })).toBe('development');
    expect(() => environmentOf({ options: { dev: true, env: 'production' } })).toThrow(
      '--dev names the development environment, and --env names production',
    );
    expect(runtimeOf({})).toBe('');
    expect(runtimeOf({ k3s: true })).toBe('k3s');
    expect(() => runtimeOf({ kind: true, kubeadm: true })).toThrow('--kind and --kubeadm name two');
  });

  it('pins a context ahead of the kubeconfig files, and never stacks pins', () => {
    const path = write(SEPARATED);
    const base = nodePath.join(scratch, 'config');
    process.env.KUBECONFIG = base;
    expect(Underpost.namespace.pin({ path }).context).toBe('underpost-production');
    expect(activeExecutionTarget()).toMatchObject({ environment: 'production', context: 'underpost-production' });
    const [pin, ...files] = process.env.KUBECONFIG.split(nodePath.delimiter);
    expect(files).toEqual([base]);
    expect(fs.readJsonSync(pin)).toEqual({
      apiVersion: 'v1',
      kind: 'Config',
      'current-context': 'underpost-production',
    });
    expect(fs.statSync(pin).mode & 0o777).toBe(0o600);
    expect(fs.statSync(nodePath.dirname(pin)).mode & 0o077).toBe(0);
    // A nested command pins again from the same files, and an explicit context wins.
    expect(Underpost.namespace.pin({ path, context: 'kind-kind' }).context).toBe('kind-kind');
    expect(process.env.KUBECONFIG.split(nodePath.delimiter).slice(1)).toEqual([base]);
  });

  it('leaves the kubeconfig as it is without a context, and inside a container', () => {
    process.env.KUBECONFIG = '/somewhere/config';
    expect(Underpost.namespace.pin({ path: write(conf({ production: {} })) }).refusal).not.toBe('');
    vi.stubEnv('KUBERNETES_SERVICE_HOST', '10.96.0.1');
    try {
      expect(Underpost.namespace.pin({ path: write(SEPARATED) })).toMatchObject({
        context: '',
        source: 'the service account of the pod',
      });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(process.env.KUBECONFIG).toBe('/somewhere/config');
  });

  it('prints one line of shell assignments for deploy scripts', async () => {
    const lines = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line) => lines.push(line));
    const cwd = process.cwd();
    process.chdir(scratch);
    try {
      fs.outputJsonSync('engine-private/deploy/conf.cluster.json', conf({ development: { context: 'kind-kind' } }));
      await Underpost.namespace.callback('env', undefined, undefined, { env: 'development' });
    } finally {
      process.chdir(cwd);
      log.mockRestore();
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^UNDERPOST_KUBECONFIG='.*' UNDERPOST_CONTEXT='.*' UNDERPOST_CLUSTER_DOMAIN='[a-z.]+'/);
    for (const variable of ['WORKLOADS', 'RELEASES', 'PLATFORM', 'OPERATIONS', 'OBSERVABILITY', 'ENVOY_GATEWAY'])
      expect(lines[0]).toContain(`UNDERPOST_NAMESPACE_${variable}='`);
  });
});

describe('the observation, audit, reconciliation and repair of a cluster', () => {
  let harness;
  let cwd;

  beforeEach(() => {
    cwd = process.cwd();
    process.chdir(scratch);
  });

  afterEach(() => {
    harness?.restore();
    harness = undefined;
    process.chdir(cwd);
  });

  /** A cluster where MongoDB and a CronJob still run in default, Valkey runs without its Service, and dd-workloads is missing. */
  const pending = (state = {}) =>
    kubeCluster({
      contexts: 'underpost-production\nkind-kind\n',
      namespaces: [
        namespaceItem('default'),
        namespaceItem('kube-system'),
        namespaceItem('dd-cache'),
        namespaceItem('envoy-gateway-system'),
      ],
      controllers: [
        controllerItem('StatefulSet', 'mongodb', 'default'),
        controllerItem('StatefulSet', 'valkey-service', 'dd-cache'),
        controllerItem('Deployment', 'envoy-gateway', 'envoy-gateway-system'),
        controllerItem('Deployment', 'coredns', 'kube-system'),
        cronJobItem('dd-cron-backup', 'default'),
      ],
      services: [serviceItem('mongodb-service', 'default', { app: 'mongodb' })],
      ...state,
    });

  const codes = (findings) => findings.map(({ severity, code }) => `${severity} ${code}`).sort();
  const workloadsNode = (audit) => audit.resources.find(({ resource }) => resource === 'workloads').node.state;

  it('reads the live cluster in the context it names, and keeps no value of a Secret or a ConfigMap', async () => {
    harness = pending({
      controllers: [
        controllerItem('StatefulSet', 'mongodb', 'default', {
          spec: {
            template: {
              metadata: { labels: { app: 'mongodb' } },
              spec: {
                containers: [
                  {
                    env: [
                      {
                        name: 'DB_HOST',
                        value: 'mongodb://user:s3cret@mongodb-0.mongodb-service.default.svc.cluster.local',
                      },
                      { name: 'PASSWORD', valueFrom: { secretKeyRef: { name: 'mongodb-secret', key: 'password' } } },
                    ],
                  },
                ],
              },
            },
            volumeClaimTemplates: [{ metadata: { name: 'data' } }],
          },
        }),
      ],
      claims: [
        {
          kind: 'PersistentVolumeClaim',
          metadata: { name: 'data-mongodb-0', namespace: 'default' },
          spec: { storageClassName: 'mongodb-storage-class', volumeName: 'pv-mongodb-0' },
          status: { phase: 'Bound' },
        },
      ],
      volumes: [
        {
          metadata: { name: 'pv-mongodb-0' },
          spec: { storageClassName: 'mongodb-storage-class', hostPath: { path: '/data/mongodb-0' } },
        },
      ],
      configMaps: [
        {
          kind: 'ConfigMap',
          metadata: {
            name: 'app',
            namespace: 'default',
            annotations: { 'kubectl.kubernetes.io/last-applied-configuration': '{"password":"s3cret"}' },
          },
          data: { 'app.conf': 'host=valkey-service.default.svc.cluster.local\npassword=hunter2' },
        },
      ],
      secrets: ['default\tmongodb-secret\tOpaque\tpassword,username,'],
    });
    const observation = await Underpost.namespace.observe({ path: write(SEPARATED) });
    expect(observation).toMatchObject({
      environment: 'production',
      context: 'underpost-production',
      cluster: { fingerprint: '6f1c2a3b-0000-4111-8222-000011112222', version: 'v1.33.1', domain: 'cluster.local' },
    });
    expect(harness.calls.every((call) => call.startsWith('kubectl --context underpost-production '))).toBe(true);
    expect(harness.calls.some((call) => /\b(apply|create|delete|patch|label)\b/.test(call))).toBe(false);
    const text = JSON.stringify(observation);
    for (const secret of ['s3cret', 'hunter2', 'last-applied']) expect(text).not.toContain(secret);
    expect(observation.config.secrets).toEqual([
      {
        kind: 'Secret',
        namespace: 'default',
        name: 'mongodb-secret',
        type: 'Opaque',
        keys: ['password', 'username'],
      },
    ]);
    expect(observation.config.configMaps).toEqual([
      { kind: 'ConfigMap', namespace: 'default', name: 'app', uid: '', keys: ['app.conf'] },
    ]);
    expect(observation.references).toEqual([
      {
        object: 'StatefulSet/default/mongodb',
        field: 'env.DB_HOST',
        host: 'mongodb-0.mongodb-service.default.svc.cluster.local',
      },
      { object: 'ConfigMap/default/app', field: 'data.app.conf', host: 'valkey-service.default.svc.cluster.local' },
    ]);
    expect(observation.dependencies.map(({ to, via }) => `${via} ${to}`)).toEqual([
      'selector Service/default/mongodb-service',
      'reference Secret/default/mongodb-secret',
      'volume PersistentVolumeClaim/default/data-mongodb-0',
      'claim PersistentVolume/pv-mongodb-0',
      'storage StorageClass/mongodb-storage-class',
    ]);
  });

  it('reports pending migrations as warnings and what breaks a rollout as errors, and changes nothing', async () => {
    harness = pending();
    const report = await Underpost.namespace.audit({ path: write(SEPARATED), deployIds: [] });
    expect(report.context).toEqual({
      configured: 'underpost-production',
      target: 'underpost-production',
      source: 'environments.production.context',
      available: true,
    });
    expect(harness.calls.some((call) => /\b(apply|create|delete|patch|label)\b/.test(call))).toBe(false);
    expect(codes(report.findings)).toEqual([
      'error missing-service',
      'warning namespace-missing',
      'warning namespace-unlabeled',
      'warning pending-migration',
      'warning pending-migration',
    ]);
    expect(report.findings.filter(({ code }) => code === 'pending-migration').map(({ message }) => message)).toEqual([
      'default holds the operational CronJobs, which the placement puts in dd-workloads: plan its migration',
      'default holds MongoDB, which the placement puts in dd-data: plan its migration',
    ]);
    const states = Object.fromEntries(report.resources.map(({ resource, state }) => [resource, state]));
    expect(states).toMatchObject({
      workloads: 'not-deployed',
      operations: 'pending-migration',
      mongodb: 'pending-migration',
      valkey: 'placed',
      envoyGateway: 'placed',
      coreDns: 'fixed',
      kafka: 'not-deployed',
    });
    // An addon namespace is its installer's: Underpost reports it and never claims it.
    expect(report.namespaces.find(({ namespace }) => namespace === 'envoy-gateway-system')).toMatchObject({
      owned: false,
      exists: true,
    });
    // A destination of a pending migration is the plan's to create.
    expect(report.namespaces.map(({ namespace }) => namespace)).not.toContain('dd-data');
  });

  it('reads no cluster that the configuration does not name, unless --current-context', async () => {
    harness = pending({ context: 'admin@laptop' });
    const path = write(conf({}));
    const refused = await Underpost.namespace.audit({ path, deployIds: [] });
    expect(refused.cluster.reachable).toBe(false);
    expect(refused.findings).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'cluster',
        message: expect.stringContaining('--current-context'),
      }),
    ]);
    expect(harness.calls).toEqual([]);
    await expect(Underpost.namespace.services({ path })).resolves.toBeNull();

    const opted = await Underpost.namespace.audit({ path, options: { currentContext: true }, deployIds: [] });
    expect(opted.cluster.reachable).toBe(true);
    expect(codes(opted.findings)).toContain('warning context-unset');
    expect(harness.calls.every((call) => !call.includes('--context'))).toBe(true);
    // Another environment reads no current context without the opt-in either.
    await expect(Underpost.namespace.observe({ path, environment: 'development' })).rejects.toThrow(
      'environments.development.context',
    );
  });

  it('reports a context the kubeconfig lacks', async () => {
    harness = pending({ contexts: 'kind-kind\n' });
    const report = await Underpost.namespace.audit({ path: write(SEPARATED), deployIds: [] });
    expect(report.context).toEqual({
      configured: 'underpost-production',
      target: 'underpost-production',
      source: 'environments.production.context',
      available: false,
    });
    expect(report.findings).toContainEqual({
      severity: 'error',
      code: 'context-missing',
      message: 'The kubeconfig has no context underpost-production',
    });
  });

  it('groups each endpoint of the deployments with the deployments that read it', async () => {
    for (const deployId of ['dd-x', 'dd-y'])
      fs.outputFileSync(
        `engine-private/conf/${deployId}/.env.production`,
        'DB_HOST=mongodb://mongodb-0.mongodb-service.dd-data.svc.cluster.local:27017\n',
      );
    harness = pending();
    const report = await Underpost.namespace.audit({ path: write(SEPARATED), deployIds: ['dd-x', 'dd-y'] });
    expect(report.endpoints.map(({ state, verified, readers }) => [state, verified, readers.length])).toEqual([
      ['missing-service', true, 2],
    ]);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'endpoint-missing-service',
        message: expect.stringMatching(/^dd-x, dd-y: /),
      }),
    );
  });

  it('captures a private, versioned record that adoption turns into the placement it observes', async () => {
    const path = write(SEPARATED);
    harness = pending({
      controllers: [
        controllerItem('Deployment', 'dd-core-production-blue', 'default', {
          labels: { 'deploy-id': 'dd-core-production' },
        }),
        controllerItem('StatefulSet', 'mongodb', 'default'),
        controllerItem('StatefulSet', 'valkey-service', 'default'),
        cronJobItem('dd-cron-backup', 'default'),
        cronJobItem('dd-cron-backup', 'dd-ops', true),
      ],
    });
    const { capture, file } = await Underpost.namespace.capture({ path });
    expect(file).toBe(`engine-private/deploy/captures/production/${capture.id}.json`);
    expect(capture).toMatchObject({ schema: 3, environment: 'production', context: 'underpost-production' });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.statSync(nodePath.dirname(file)).mode & 0o077).toBe(0);
    expect(Underpost.namespace.readCapture({ path, id: 'latest' })).toEqual(capture);
    expect(() => Underpost.namespace.readCapture({ path, environment: 'test' })).toThrow(
      'No capture latest of test: run node bin namespace capture --env test',
    );

    const preview = Underpost.namespace.adopt({ capture, path });
    expect(preview).toMatchObject({
      written: false,
      ambiguous: [{ resource: 'operations', namespaces: ['dd-ops', 'default'] }],
    });
    expect(preview.omitted).toContain('ipfs');
    // Everything runs where the legacy profile places it: no override stays.
    expect(preview.section).toEqual({
      ...ROUTED,
      profile: 'legacy',
      context: 'underpost-production',
      clusterDomain: 'cluster.local',
      cluster: { fingerprint: FINGERPRINT, servers: ['https://10.0.0.1:6443'] },
    });
    expect(preview.changes).toContainEqual({
      key: 'cluster',
      from: '',
      to: JSON.stringify({ fingerprint: FINGERPRINT, servers: ['https://10.0.0.1:6443'] }),
    });
    expect(preview.changes).toContainEqual({ key: 'namespaces.datastores.mongodb', from: 'dd-data', to: 'default' });
    expect(preview.changes).toContainEqual({ key: 'namespaces.datastores.ipfs', from: 'dd-data', to: 'default' });
    expect(fs.readJsonSync(path)).toEqual(SEPARATED);
    expect(() => Underpost.namespace.adopt({ capture, path, write: true })).toThrow(
      'Name the namespace of operations with --map <resource>=<namespace>',
    );

    const written = Underpost.namespace.adopt({ capture, path, write: true, mappings: { operations: 'default' } });
    expect(fs.readJsonSync(written.backup)).toEqual(SEPARATED);
    expect(fs.statSync(written.backup).mode & 0o777).toBe(0o600);
    const adopted = fs.readJsonSync(path);
    expect(adopted.environments.development).toEqual(SEPARATED.environments.development);
    expect(adopted.environments.production).toEqual(preview.section);
    // What the capture observes is now the placement: nothing is pending.
    const audit = await Underpost.namespace.audit({ path, deployIds: [] });
    expect(audit.resources.filter(({ state }) => state === 'pending-migration')).toEqual([]);
  });

  it('reports where the pods of each resource run against its node group, and tolerates the control-plane taint only', async () => {
    nodeRecords({ ...RECORDS, 'worker-c': { role: 'worker', kubernetesNodeName: 'node-c' } });
    const section = {
      context: 'underpost-production',
      profile: 'recommended',
      nodes: { groups: { control: ['control-a'], workers: ['worker-b', 'worker-c'] } },
      overrides: {
        namespaces: {
          workloads: 'default',
          operations: 'default',
          observability: 'default',
          datastores: { mongodb: 'default', valkey: 'default' },
        },
        scheduling: { releases: { mode: 'scheduler' }, platform: { mode: 'scheduler' } },
      },
    };
    const path = write(scheduled(section));
    const pod = (app, nodeSelector) => ({
      template: { metadata: { labels: { app } }, spec: { containers: [], ...(nodeSelector ? { nodeSelector } : {}) } },
    });
    harness = pending({
      nodes: [
        nodeItem('node-a', {
          roles: ['control-plane'],
          taints: [{ key: 'node-role.kubernetes.io/control-plane', effect: 'NoSchedule' }],
        }),
        nodeItem('node-b', { roles: ['worker'] }),
        nodeItem('node-c', { roles: ['worker'] }),
      ],
      controllers: [
        controllerItem('Deployment', 'dd-core-production-blue', 'default', {
          labels: { 'deploy-id': 'dd-core-production' },
          spec: pod('dd-core-production-blue'),
        }),
        controllerItem('StatefulSet', 'mongodb', 'default', {
          spec: pod('mongodb', { 'kubernetes.io/hostname': 'node-a' }),
        }),
        controllerItem('StatefulSet', 'valkey-service', 'default', { spec: pod('valkey-service') }),
        controllerItem('DaemonSet', 'node-exporter', 'default', { spec: pod('node-exporter') }),
        cronJobItem('dd-cron-backup', 'default'),
      ],
      pods: [
        {
          metadata: { namespace: 'default', labels: { app: 'valkey-service' } },
          spec: {},
          status: { conditions: [{ type: 'PodScheduled', status: 'False', message: '0/3 nodes are available' }] },
        },
      ],
    });
    const audit = await Underpost.namespace.audit({ path, deployIds: [] });
    const node = (id) => audit.resources.find(({ resource }) => resource === id).node;
    expect(node('workloads')).toEqual({
      group: 'workers',
      mode: 'required',
      rule: 'the recommended profile: scheduling.workloads',
      members: ['worker-b', 'worker-c'],
      targets: ['node-b', 'node-c'],
      observed: ['node-a'],
      missing: [],
      state: 'node-mismatch',
    });
    expect(node('mongodb')).toMatchObject({ targets: ['node-a'], observed: ['node-a'], state: 'placed' });
    expect(node('valkey')).toMatchObject({ state: 'scheduler-pending' });
    expect(node('observability')).toMatchObject({ state: 'daemonset' });
    expect(node('releases')).toMatchObject({ state: null });
    expect(codes(audit.findings)).toEqual(expect.arrayContaining(['warning node-mismatch', 'error scheduler-pending']));
    // A preferred group accepts a pod on another node.
    const preferred = write(
      scheduled({
        ...section,
        overrides: {
          ...section.overrides,
          scheduling: { ...section.overrides.scheduling, workloads: { group: 'workers', mode: 'preferred' } },
        },
      }),
    );
    expect(workloadsNode(await Underpost.namespace.audit({ path: preferred, deployIds: [] }))).toBe('placed');

    const { capture } = await Underpost.namespace.capture({ path });
    expect(capture.nodes.map(({ name, roles }) => [name, roles])).toEqual([
      ['node-a', ['control-plane']],
      ['node-b', ['worker']],
      ['node-c', ['worker']],
    ]);
    expect(capture.controllers.find(({ name }) => name === 'mongodb').pods).toEqual({
      nodes: ['node-a'],
      unschedulable: [],
    });

    const required = (...values) => ({
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [{ matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values }] }],
        },
      },
    });
    expect(Underpost.namespace.podScheduling({ resource: 'mongodb', path })).toEqual({
      nodes: ['node-a'],
      group: 'control',
      mode: 'required',
      affinity: required('node-a'),
      tolerations: [{ key: 'node-role.kubernetes.io/control-plane', operator: 'Exists', effect: 'NoSchedule' }],
    });
    expect(Underpost.namespace.podScheduling({ resource: 'workloads', path })).toEqual({
      nodes: ['node-b', 'node-c'],
      group: 'workers',
      mode: 'required',
      affinity: required('node-b', 'node-c'),
    });
    // The affinity names the hostname label each node carries, not its name.
    harness.state.nodes[1].metadata.labels['kubernetes.io/hostname'] = 'node-b.lan';
    expect(Underpost.namespace.podScheduling({ resource: 'workloads', path }).affinity).toEqual(
      required('node-b.lan', 'node-c'),
    );

    // One Ready member is enough; none is not.
    harness.state.nodes[1].status.conditions[0].status = 'False';
    expect(workloadsNode(await Underpost.namespace.audit({ path, deployIds: [] }))).toBe('node-mismatch');
    harness.state.nodes[2].status.conditions[0].status = 'False';
    expect(workloadsNode(await Underpost.namespace.audit({ path, deployIds: [] }))).toBe('node-not-ready');
    harness.state.nodes.pop();
    const missing = await Underpost.namespace.audit({ path, deployIds: [] });
    expect(workloadsNode(missing)).toBe('node-missing');
    expect(missing.findings).toContainEqual({
      severity: 'error',
      code: 'node-missing',
      message: 'the application workloads: the cluster has no node node-c, which the node group workers names',
    });

    // A member without a record blocks its resource; nothing falls back to another node.
    fs.removeSync('engine-private/deploy/nodes/worker-b.json');
    const unbound = await Underpost.namespace.audit({ path, deployIds: [] });
    expect(unbound.resources.find(({ resource }) => resource === 'workloads').node).toMatchObject({
      group: '',
      targets: [],
      state: 'unbound',
      message: './engine-private/deploy/nodes/worker-b.json does not exist',
    });
    expect(unbound.findings).toContainEqual({
      severity: 'error',
      code: 'unbound',
      message: 'the application workloads: ./engine-private/deploy/nodes/worker-b.json does not exist',
    });
  });

  it('lists the node groups against the records and the cluster, audits them and records a Kubernetes node', async () => {
    nodeRecords({
      ...RECORDS,
      'worker-c': { role: 'worker' },
      'node-d': { role: 'worker' },
    });
    const path = write(
      scheduled({
        context: 'underpost-production',
        profile: 'recommended',
        nodes: { groups: { control: ['control-a'], workers: ['worker-b', 'worker-c', 'gone'] } },
      }),
    );
    harness = pending({
      nodes: [
        nodeItem('node-a', { roles: ['control-plane'] }),
        nodeItem('node-b', { roles: ['worker'], ready: false }),
        nodeItem('node-d', { roles: ['worker'] }),
      ],
    });
    const report = await Underpost.namespace.nodes({ path });
    expect(
      report.groups.map(({ group, members }) => [
        group,
        members.map(({ record, kubernetesNode, state }) => [record, kubernetesNode, state]),
      ]),
    ).toEqual([
      ['control', [['control-a', 'node-a', 'Ready']]],
      [
        'workers',
        [
          ['worker-b', 'node-b', 'NotReady'],
          ['worker-c', '', 'no node'],
          ['gone', '', 'no record'],
        ],
      ],
    ]);
    expect(report.findings.map(({ severity, message }) => `${severity} ${message}`)).toEqual([
      'warning node node-b of the group workers is NotReady',
      'error ./engine-private/deploy/nodes/worker-c.json names no Kubernetes node: ' +
        'node bin namespace nodes identify worker-c --kubernetes-node <node>',
      'error ./engine-private/deploy/nodes/gone.json does not exist',
      'warning no node record names the node node-d; node-d can: node bin namespace nodes identify node-d --kubernetes-node node-d',
    ]);
    expect(harness.calls.some((call) => /\b(apply|create|delete|patch|label)\b/.test(call))).toBe(false);

    // Recording a Kubernetes node: a preview, then a write after a backup, and refusals.
    const identify = (record, kubernetesNode, apply) =>
      Underpost.namespace.identifyNode({ path, record, kubernetesNode, apply });
    expect(await identify('node-d', 'node-d')).toMatchObject({ from: '', to: 'node-d', checked: true, applied: false });
    expect(fs.readJsonSync('engine-private/deploy/nodes/node-d.json').kubernetesNodeName).toBeUndefined();
    const written = await identify('node-d', 'node-d', true);
    expect(written.applied).toBe(true);
    expect(fs.readJsonSync(written.backup)).toEqual({ hubHost: '203.0.113.1', peerId: 'node-d', role: 'worker' });
    expect(fs.readJsonSync('engine-private/deploy/nodes/node-d.json')).toMatchObject({ kubernetesNodeName: 'node-d' });
    await expect(identify('gone', 'node-d')).rejects.toThrow('./engine-private/deploy/nodes/gone.json does not exist');
    await expect(identify('worker-c', 'Node C')).rejects.toThrow("'Node C' is not a Kubernetes node name");
    await expect(identify('worker-c', 'node-b')).rejects.toThrow(
      './engine-private/deploy/nodes/worker-b.json already names the node node-b',
    );
    await expect(identify('worker-c', 'node-z')).rejects.toThrow(
      'The cluster has no node node-z: it has node-a, node-b, node-d',
    );

    // Deploy scripts read the nodes of each category with a group, separated by spaces.
    fs.outputJsonSync('engine-private/deploy/nodes/worker-c.json', {
      hubHost: '203.0.113.1',
      peerId: 'worker-c',
      role: 'worker',
      kubernetesNodeName: 'node-c',
    });
    fs.outputJsonSync(
      'engine-private/deploy/conf.cluster.json',
      scheduled({
        context: 'admin@prod',
        profile: 'recommended',
        nodes: { groups: { control: ['control-a'], workers: ['worker-b', 'worker-c'] } },
      }),
    );
    const lines = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line) => lines.push(line));
    try {
      await Underpost.namespace.callback('env', undefined, undefined, { env: 'production' });
    } finally {
      log.mockRestore();
    }
    expect(lines[0]).toContain("UNDERPOST_NODES_WORKLOADS='node-b node-c'");

    // One resource shows each source: profile, node group, records, Kubernetes nodes, observed and migration.
    const resolved = [];
    const resolveLog = vi.spyOn(console, 'log').mockImplementation((line) => resolved.push(line));
    try {
      await Underpost.namespace.callback('resolve', 'workloads', undefined, { env: 'production' });
    } finally {
      resolveLog.mockRestore();
    }
    const detail = resolved[0];
    expect(detail).toMatch(/^workloads \(production\)\n  profile\s+recommended\n/);
    expect(detail).toMatch(/^  node group\s+workers, required \(the recommended profile: scheduling\.workloads\)$/m);
    expect(detail).toMatch(
      /^  group members\s+\.\/engine-private\/deploy\/nodes\/worker-b\.json, \.\/engine-private\/deploy\/nodes\/worker-c\.json$/m,
    );
    expect(detail).toMatch(/^  Kubernetes nodes\s+node-b, node-c$/m);
    expect(detail).toMatch(/^  observed\s+no capture: node bin namespace capture$/m);
    expect(lines[0]).toMatch(/UNDERPOST_NODES_DATASTORES='?node-a'?/);
  });

  it('creates and labels the namespaces it owns as a server dry run, then applies and verifies them', async () => {
    const path = write(SEPARATED);
    harness = pending();
    const dryRun = await Underpost.namespace.reconcile({ path, deployIds: [] });
    expect(dryRun.plan).toEqual([
      { action: 'create', namespace: 'dd-workloads' },
      { action: 'label', namespace: 'dd-cache' },
    ]);
    const applies = harness.calls.flatMap((call, index) => (call.includes(' apply ') ? [index] : []));
    expect(applies.map((index) => harness.calls[index])).toEqual([
      'kubectl --context underpost-production apply --server-side --field-manager=underpost --dry-run=server -f -',
      'kubectl --context underpost-production apply --server-side --field-manager=underpost --dry-run=server -f -',
    ]);
    expect(JSON.parse(harness.inputs[applies[0]])).toEqual({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'dd-workloads',
        labels: { 'app.kubernetes.io/managed-by': 'underpost', 'underpost.net/namespace-role': 'workload' },
        annotations: { 'underpost.net/resources': 'workloads' },
      },
    });
    harness.restore();

    harness = kubeCluster(
      { ...pending().state, contexts: 'underpost-production\n' },
      {
        onApply: (cluster) => {
          cluster.namespaces = [
            ...cluster.namespaces.filter(({ metadata }) => !['dd-workloads', 'dd-cache'].includes(metadata.name)),
            namespaceItem('dd-workloads', { owned: true }),
            namespaceItem('dd-cache', { owned: true }),
          ];
        },
      },
    );
    const result = await Underpost.namespace.reconcile({ path, apply: true, deployIds: [] });
    expect(result.applied).toBe(true);
    expect(harness.calls.filter((call) => call.includes(' apply ')).every((call) => !call.includes('--dry-run'))).toBe(
      true,
    );
    expect(harness.calls.some((call) => /\b(delete|patch)\b/.test(call))).toBe(false);
    // The command states what a reconciliation never changes.
    const lines = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line) => lines.push(line));
    try {
      await Underpost.namespace.callback('reconcile', undefined, undefined, { currentContext: true });
    } finally {
      log.mockRestore();
    }
    expect(lines.join('\n')).toContain(
      'Nothing to change\nUnchanged by design: workloads, data, endpoints and volumes. node bin namespace plan moves them.',
    );
  });

  it('refuses to reconcile a cluster that does not answer', async () => {
    harness = kubeCluster(
      {},
      { routes: [{ match: 'get namespace kube-system', code: 1, stderr: 'connection refused' }] },
    );
    await expect(Underpost.namespace.reconcile({ path: write(SEPARATED), deployIds: [] })).rejects.toThrow(
      'The cluster does not answer',
    );
  });

  it('suspends the copy of a schedule that runs outside the operations namespace, and deletes nothing', async () => {
    const path = write(conf({ production: { context: 'underpost-production', namespaces: { operations: 'ops' } } }));
    const state = {
      namespaces: [namespaceItem('default'), namespaceItem('ops', { owned: true })],
      controllers: [cronJobItem('dd-cron-vultr', 'default'), cronJobItem('dd-cron-vultr', 'ops')],
    };
    harness = kubeCluster(state);
    const status = await Underpost.namespace.status({ path, deployIds: [] });
    expect(status.resources).toMatchObject({ duplicate: 1 });
    expect(status.next).toBe('node bin namespace repair --env production');

    const dryRun = await Underpost.namespace.repair({ path, deployIds: [] });
    expect(dryRun.plan).toEqual([
      { action: 'suspend', object: 'CronJob/default/dd-cron-vultr', keep: 'ops/dd-cron-vultr' },
    ]);
    expect(harness.calls.filter((call) => call.includes(' patch '))).toEqual([
      'kubectl --context underpost-production patch cronjob dd-cron-vultr -n default --type=merge -p {"spec":{"suspend":true}} --field-manager=underpost --dry-run=server',
    ]);
    expect(harness.state.controllers.every(({ spec }) => spec.suspend === false)).toBe(true);

    await Underpost.namespace.repair({ path, apply: true, deployIds: [] });
    expect(harness.state.controllers.map(({ metadata, spec }) => `${metadata.namespace} ${spec.suspend}`)).toEqual([
      'default true',
      'ops false',
    ]);
    expect(harness.calls.some((call) => /\b(delete|--force)\b/.test(call))).toBe(false);
    expect((await Underpost.namespace.status({ path, deployIds: [] })).blockers).toEqual([]);
  });

  it('refuses --dry-run together with a change, with the exit code of a refusal', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = process.exitCode;
    try {
      await Underpost.namespace.callback('adopt', undefined, undefined, { dryRun: true, writeConfig: true });
      expect(process.exitCode).toBe(3);
    } finally {
      process.exitCode = exitCode;
      error.mockRestore();
    }
  });
});
