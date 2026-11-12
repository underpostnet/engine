// A sequential destructive namespace migration from a capture to the recommended placement, against a
// cluster that the shell harness answers: the plan in dependency order with the exact source objects of
// each unit, the placement that follows the migration, a datastore recreated empty with the restart of
// its consumers, a deployment recreated through the deploy pipeline, a full ordered run, the resume of an
// interrupted unit, and the refusals that protect a cluster. No real kubectl or Underpost command runs;
// every file lives in a scratch checkout.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import Underpost from '../../../src/index.js';
import { migrationText } from '../../../src/cli/namespace-migration.js';
import {
  certificateItem,
  claimItem,
  controllerItem,
  cronJobItem,
  gatewayItem,
  kubeCluster,
  namespaceItem,
  routeItem,
  serviceItem,
  nodeItem,
  policyItem,
  tlsLine,
  tlsPair,
  tlsSecretItem,
  volumeItem,
} from '../../support/kube-cluster.js';

vi.mock('../../../src/server/runtime/host-lock.js', async (original) => ({
  ...(await original()),
  acquireHostLock: vi.fn(async () => ({ release: () => {}, attach: () => {} })),
}));

const CONF = './engine-private/deploy/conf.cluster.json';
const ENV = './engine-private/conf/dd-core/.env.production';
const DB = 'mongodb-0.mongodb-service';

/**
 * The production placement an adoption writes for a cluster that runs everything in default: the
 * recommended profile, overridden where the cluster runs today, with one control node and two workers.
 */
const GROUPS = { control: ['control-a'], workers: ['worker-b', 'worker-c'] };
const ROUTING = { provider: 'gateway-api' };
const TLS = { mode: 'cert-manager', issuer: 'letsencrypt-prod' };
const ADOPTED = {
  environments: {
    production: {
      context: 'underpost-production',
      clusterDomain: 'cluster.local',
      profile: 'recommended',
      routing: ROUTING,
      tls: TLS,
      nodes: { groups: GROUPS },
      overrides: {
        namespaces: {
          workloads: 'default',
          platform: 'default',
          operations: 'default',
          datastores: { mongodb: 'default', valkey: 'default' },
        },
      },
    },
    development: { context: 'kind-kind', profile: 'legacy', routing: ROUTING, tls: { mode: 'self-signed' } },
  },
};

/** The node records of the control node on node-a, here, and of the workers on node-b and node-c, through their peer. */
const RECORDS = {
  'control-a': { role: 'control', kubernetesNodeName: 'node-a' },
  'worker-b': { role: 'worker', kubernetesNodeName: 'node-b' },
  'worker-c': { role: 'worker', kubernetesNodeName: 'node-c' },
};
const PEER = { via: 'admin@192.0.2.2:22', host: '192.0.2.2', port: 22, user: 'admin', keyPath: '/keys/peer' };

const pod = ({ secrets = [], claims = [], ...spec } = {}) => ({
  containers: [{ image: 'engine:v4', envFrom: secrets.map((name) => ({ secretRef: { name } })) }],
  volumes: claims.map((claimName) => ({ name: claimName, persistentVolumeClaim: { claimName } })),
  ...spec,
});
const deployment = (name, namespace, { labels = {}, replicas = 1, ...spec } = {}) =>
  controllerItem('Deployment', name, namespace, {
    labels,
    spec: { replicas, template: { metadata: { labels: { app: name } }, spec: pod(spec) } },
    status: { readyReplicas: replicas },
  });
const workload = (name, namespace, label, spec = {}) =>
  deployment(name, namespace, { labels: { 'deploy-id': label }, secrets: ['underpost-config'], ...spec });
const statefulSet = (name, namespace, { secrets = [], claimTemplates = [] } = {}) =>
  controllerItem('StatefulSet', name, namespace, {
    spec: {
      replicas: 1,
      template: { metadata: { labels: { app: name } }, spec: pod({ secrets }) },
      volumeClaimTemplates: claimTemplates.map((template) => ({ metadata: { name: template } })),
    },
    status: { readyReplicas: 1 },
  });
const secretLine = (namespace, name) => `${namespace}\t${name}\tOpaque\tvalue,`;

let scratch;
let cwd;
let harness;
let kubeconfig;
let nodeTarget;
let peerCommand;
let pair;

beforeAll(() => {
  pair = tlsPair(['core.test']);
});

beforeEach(() => {
  cwd = process.cwd();
  kubeconfig = process.env.KUBECONFIG;
  // The host env seeds no Secret: each cron scope key it carries is blank.
  for (const name of Object.keys(Underpost.secret.seedEnvKeys('underpost-cron-env'))) vi.stubEnv(name, '');
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-migration-'));
  process.chdir(scratch);
  fs.outputJsonSync(CONF, ADOPTED);
  for (const [name, record] of Object.entries(RECORDS))
    fs.outputJsonSync(`./engine-private/deploy/nodes/${name}.json`, {
      hubHost: '203.0.113.1',
      peerId: name,
      ...record,
    });
  // The peer connection of each node record: node-a is this machine, the workers answer over SSH.
  nodeTarget = vi
    .spyOn(Underpost.event, 'kubernetesNodeTarget')
    .mockImplementation((node) => (node === 'node-a' ? { via: 'local' } : PEER));
  peerCommand = vi.spyOn(Underpost.ssh, 'sshExecBatch').mockResolvedValue({ ok: true });
  fs.outputFileSync('./engine-private/deploy/dd.routes', 'dd-core,dd-cyberia');
  fs.outputJsonSync('./engine-private/conf/dd-core/conf.server.json', { 'core.test': { '/': {} } });
  // One instance family: mmo-client and its test variant, deployed at once by run instance.
  fs.outputJsonSync('./engine-private/conf/dd-cyberia/conf.instances.json', [
    { id: 'mmo-client', multiInstance: { variants: ['/', '/test'] } },
  ]);
  // The overlay already names the target namespace: the endpoint layer, not the operator, corrects it.
  fs.outputFileSync(
    ENV,
    `DB_HOST=mongodb://app:s3cret@${DB}.underpost-data.svc.cluster.local:27017/app?replicaSet=rs0\n` +
      'VALKEY_HOST=valkey-service.underpost-data.svc.cluster.local\n',
  );
  harness = kubeCluster(
    {
      contexts: 'underpost-production\n',
      namespaces: [namespaceItem('default'), namespaceItem('kube-system')],
      nodes: [
        nodeItem('node-a', { roles: ['control-plane'] }),
        nodeItem('node-b', { roles: ['worker'] }),
        nodeItem('node-c', { roles: ['worker'] }),
      ],
      // A MongoDB member runs on the worker: the plan moves it to the control node.
      pods: [{ metadata: { namespace: 'default', labels: { app: 'mongodb' } }, spec: { nodeName: 'node-b' } }],
      crds: [
        'gateways.gateway.networking.k8s.io',
        'httproutes.gateway.networking.k8s.io',
        'certificates.cert-manager.io',
        'clusterissuers.cert-manager.io',
        'clienttrafficpolicies.gateway.envoyproxy.io',
      ],
      certificates: [certificateItem('core.test', 'default')],
      policies: [policyItem('dd-core-production-http3', 'default', { gateway: 'dd-core-production' })],
      controllers: [
        workload('dd-core-production-blue', 'default', 'dd-core-production', {
          secrets: ['underpost-config', 'dd-core-production-env'],
          nodeSelector: { 'kubernetes.io/hostname': 'node-a' },
        }),
        workload('dd-core-production-green', 'default', 'dd-core-production', { replicas: 0 }),
        workload('dd-cyberia-production-blue', 'default', 'dd-cyberia-production'),
        workload('dd-cyberia-mmo-client-production-green', 'default', 'dd-cyberia-mmo-client-production'),
        workload('dd-cyberia-mmo-client-test-production-blue', 'default', 'dd-cyberia-mmo-client-test-production'),
        deployment('underpost-ingress', 'default', { hostNetwork: true }),
        deployment('underpost-gateway', 'default', { claims: ['underpost-gateway-pvc'] }),
        statefulSet('mongodb', 'default', { secrets: ['mongodb-secret'], claimTemplates: ['mongodb-storage'] }),
        statefulSet('valkey-service', 'default'),
        cronJobItem('dd-cron-backup', 'default'),
      ],
      services: [
        serviceItem('mongodb-service', 'default', { app: 'mongodb' }),
        serviceItem('valkey-service', 'default', { app: 'valkey-service' }),
        serviceItem('dd-core-production-blue-service', 'default', { app: 'dd-core-production-blue' }),
        serviceItem('dd-core-production-green-service', 'default', { app: 'dd-core-production-green' }),
        serviceItem('dd-core-production-traffic-service', 'default', { app: 'dd-core-production-blue' }),
        serviceItem('dd-cyberia-production-blue-service', 'default', { app: 'dd-cyberia-production-blue' }),
        serviceItem('underpost-gateway-service', 'default', { app: 'underpost-gateway' }),
      ],
      claims: [
        claimItem('mongodb-storage-mongodb-0', 'default', 'mongodb-pv-0'),
        claimItem('underpost-gateway-pvc', 'default', 'pv-underpost-gateway'),
      ],
      volumes: [
        volumeItem('mongodb-pv-0', { claim: 'default/mongodb-storage-mongodb-0', hostPath: '/data/mongodb/v0' }),
        volumeItem('pv-underpost-gateway', {
          claim: 'default/underpost-gateway-pvc',
          hostPath: '/srv/gateway',
          nodes: ['node-a'],
        }),
      ],
      gateways: [
        gatewayItem('dd-core-production', 'default', { hosts: ['core.test'], certificates: ['core.test'] }),
        gatewayItem('dd-cyberia-production', 'default', { hosts: ['cyberia.test'] }),
      ],
      routes: [
        routeItem('core.test', 'default', { gateway: 'dd-core-production', hosts: ['core.test'] }),
        routeItem('cyberia.test', 'default', { gateway: 'dd-cyberia-production', hosts: ['cyberia.test'] }),
        routeItem('mmo.cyberia.test', 'default', { gateway: 'dd-cyberia-production', hosts: ['mmo.cyberia.test'] }),
      ],
      secrets: [
        tlsLine('default', 'core.test'),
        secretLine('default', 'underpost-config'),
        secretLine('default', 'dd-core-production-env'),
        secretLine('default', 'mongodb-secret'),
      ],
      secretObjects: { 'default/core.test': tlsSecretItem('default', 'core.test', pair.data) },
    },
    {
      onApply: (cluster, call) => {
        const name = /"name":"([^"]+)"/.exec(harness.inputs[harness.calls.indexOf(call)] ?? '')?.[1];
        if (name && !cluster.namespaces.some(({ metadata }) => metadata.name === name))
          cluster.namespaces.push(namespaceItem(name, { owned: true }));
      },
    },
  );
  // The installers and the deploy pipeline the executor runs, as their effect on the cluster.
  const on = (pattern, effect) =>
    harness.route({ match: (call) => (pattern.test(call) && effect(pattern.exec(call)), false) });
  const add = (kind, ...items) => harness.state[kind].push(...items);
  // The MongoDB install recreates its volume with the name of the source volume.
  on(/ cluster --mongodb --reset-mongodb --kubeadm --replicas 1 --namespace-mongodb (\S+)$/, ([, namespace]) => {
    add('controllers', statefulSet('mongodb', namespace, { secrets: ['mongodb-secret'] }));
    add('services', serviceItem('mongodb-service', namespace, { app: 'mongodb' }));
    add('claims', claimItem('mongodb-storage-mongodb-0', namespace, 'mongodb-pv-0'));
    add('volumes', volumeItem('mongodb-pv-0', { claim: `${namespace}/mongodb-storage-mongodb-0` }));
  });
  // Valkey comes up after its install returns: the executor waits for its rollout.
  on(/ cluster --valkey --kubeadm --replicas 1 --namespace-valkey (\S+)$/, ([, namespace]) => {
    add('controllers', { ...statefulSet('valkey-service', namespace), status: { readyReplicas: 0 } });
    add('services', serviceItem('valkey-service', namespace, { app: 'valkey-service' }));
  });
  on(/ rollout status statefulset\/valkey-service -n (\S+) /, ([, namespace]) => {
    harness.state.controllers.find(
      ({ kind, metadata }) =>
        kind === 'StatefulSet' && metadata.name === 'valkey-service' && metadata.namespace === namespace,
    ).status.readyReplicas = 1;
  });
  on(/ --versions blue --namespace-workloads (\S+) dd-core production$/, ([, namespace]) => {
    add(
      'controllers',
      workload('dd-core-production-blue', namespace, 'dd-core-production', {
        nodeSelector: { 'kubernetes.io/hostname': 'node-b' },
      }),
    );
    add(
      'services',
      serviceItem('dd-core-production-blue-service', namespace, { app: 'dd-core-production-blue' }),
      serviceItem('dd-core-production-traffic-service', namespace, { app: 'dd-core-production-blue' }),
    );
    add(
      'gateways',
      gatewayItem('dd-core-production', namespace, { hosts: ['core.test'], certificates: ['core.test'] }),
    );
    add('routes', routeItem('core.test', namespace, { gateway: 'dd-core-production', hosts: ['core.test'] }));
  });
  on(/ --versions blue --namespace-workloads (\S+) dd-cyberia production$/, ([, namespace]) => {
    add(
      'controllers',
      workload('dd-cyberia-production-blue', namespace, 'dd-cyberia-production', {
        nodeSelector: { 'kubernetes.io/hostname': 'node-b' },
      }),
    );
    add(
      'services',
      serviceItem('dd-cyberia-production-blue-service', namespace, { app: 'dd-cyberia-production-blue' }),
    );
  });
  on(
    / run instance --kubeadm --deploy-id dd-cyberia --instance-id mmo-client --traffic green .*--namespace-workloads (\S+)$/,
    ([, ns]) =>
      add(
        'controllers',
        workload('dd-cyberia-mmo-client-production-green', ns, 'dd-cyberia-mmo-client-production', {
          nodeSelector: { 'kubernetes.io/hostname': 'node-b' },
        }),
        workload('dd-cyberia-mmo-client-test-production-green', ns, 'dd-cyberia-mmo-client-test-production', {
          nodeSelector: { 'kubernetes.io/hostname': 'node-b' },
        }),
      ),
  );
  on(/ cron --apply --kubeadm --namespace-operations (\S+)$/, ([, namespace]) =>
    add('controllers', cronJobItem('dd-cron-backup', namespace)),
  );
  on(/ cluster --gateway-api --kubeadm --replicas 1 --namespace-platform (\S+)$/, ([, namespace]) => {
    add('controllers', deployment('underpost-ingress', namespace), deployment('underpost-gateway', namespace));
    add('services', serviceItem('underpost-gateway-service', namespace, { app: 'underpost-gateway' }));
  });
  // App apply recreates its Secret.
  on(/^kubectl create secret generic (\S+) .* -n (\S+)$/, ([, name, namespace]) =>
    add('secrets', secretLine(namespace, name)),
  );
});

afterEach(() => {
  harness.restore();
  nodeTarget.mockRestore();
  peerCommand.mockRestore();
  process.chdir(cwd);
  fs.removeSync(scratch);
  if (kubeconfig === undefined) delete process.env.KUBECONFIG;
  else process.env.KUBECONFIG = kubeconfig;
  vi.unstubAllEnvs();
});

const planned = async () => {
  await Underpost.namespace.capture();
  return Underpost.namespace.plan({ target: 'recommended' });
};
const run = (resource, flags = {}) => Underpost.namespace.migrate({ resource, ...flags });
const statusOf = async (unit) => (await Underpost.namespace.migrate({ view: 'status' })).state.units[unit].status;
const commands = (pattern) =>
  harness.calls.filter((call) => pattern.test(call)).map((call) => call.replace(/^.*bin\/index\.js /, ''));
const ids = (objects) =>
  objects.map(({ kind, namespace, name }) => `${kind}/${namespace ? `${namespace}/` : ''}${name}`);
/** The calls that change the cluster, without the migration Lease a run holds while it runs. */
const changes = (pattern) => harness.calls.filter((call) => pattern.test(call) && !call.includes(' lease '));
const ofDeploy = (deployId) => Underpost.namespace.of('workloads', { options: { deployId } });
const inDefault = (kind) =>
  harness.state[kind].filter(({ metadata }) => metadata.namespace === 'default').map(({ metadata }) => metadata.name);

describe('a sequential destructive namespace migration', () => {
  it('plans one recreate unit per resource and deployment group in dependency order, and reads offline', async () => {
    const { plan, state } = await planned();
    expect(plan).toMatchObject({ schema: 9, clusterFlag: '--kubeadm', cluster: { context: 'underpost-production' } });
    // Valkey keeps its data in memory: recreating it discards the data, so it is destructive too.
    expect(plan.units.map(({ id, from, to, destructive }) => [id, from.join(), to, destructive])).toEqual([
      ['datastores/mongodb', 'default', 'underpost-data', true],
      ['datastores/valkey', 'default', 'underpost-data', true],
      ['workloads/dd-core', 'default', 'underpost-workloads', false],
      ['workloads/dd-cyberia', 'default', 'underpost-workloads', false],
      ['operations', 'default', 'underpost-operations', false],
      ['platform', 'default', 'underpost-platform', true],
    ]);
    const unit = (id) => plan.units.find((entry) => entry.id === id);
    expect(unit('datastores/mongodb')).toMatchObject({
      shared: [],
      data: [
        {
          claim: 'default/mongodb-storage-mongodb-0',
          volume: 'mongodb-pv-0',
          reclaim: 'Retain',
          location: 'node-a:/data/mongodb/v0',
          outcome: 'discard',
          reason: 'its installer (cluster --mongodb --reset-mongodb) empties /data/mongodb/v0 on node-a',
        },
      ],
      lifecycle: 'reset',
      // The backup CronJob reads MongoDB: a Job of it blocks the unit, and no schedule is suspended.
      schedules: [{ id: 'CronJob/default/dd-cron-backup', schedule: '0 * * * *', suspended: false }],
      install: ['cluster --mongodb --reset-mongodb --kubeadm --replicas 1 --namespace-mongodb underpost-data'],
      destination: { controllers: ['StatefulSet/mongodb'], services: ['mongodb-service'] },
      consumers: ['dd-core-production'],
      blockers: [],
      node: {
        group: 'control',
        mode: 'required',
        rule: 'the recommended profile: scheduling.datastores',
        members: ['control-a'],
        targets: ['node-a'],
        observed: { 'StatefulSet/default/mongodb': ['node-a', 'node-b'] },
      },
    });
    // The scheduling places each destination, never the node of its source.
    expect(unit('workloads/dd-core').node).toMatchObject({
      group: 'workers',
      members: ['worker-b', 'worker-c'],
      targets: ['node-b', 'node-c'],
    });
    expect(plan.units.flatMap(({ install }) => install).filter((command) => / --node(-name)? /.test(command))).toEqual(
      [],
    );
    expect(ids(unit('datastores/mongodb').objects)).toEqual([
      'StatefulSet/default/mongodb',
      'Service/default/mongodb-service',
      'Secret/default/mongodb-secret',
      'PersistentVolumeClaim/default/mongodb-storage-mongodb-0',
      'PersistentVolume/mongodb-pv-0',
    ]);
    // The serving colour is recreated; the idle one only goes. A Secret another deployment uses stays
    // until the last deployment that uses it goes.
    expect(unit('workloads/dd-core')).toMatchObject({
      deployIds: ['dd-core'],
      shared: ['Secret/default/underpost-config'],
      copy: [{ namespace: 'default', name: 'core.test' }],
      install: [
        'deploy --kubeadm --replicas 1 --image engine:v4 --versions blue --build-manifest --info-router ' +
          '--traffic blue --namespace-workloads underpost-workloads dd-core production',
        'deploy --kubeadm --replicas 1 --image engine:v4 --versions blue ' +
          '--namespace-workloads underpost-workloads dd-core production',
        'tls reconcile --deploy-id dd-core --env production --apply --namespace-workloads underpost-workloads',
      ],
      destination: { controllers: ['Deployment/dd-core-production-blue'], services: [] },
    });
    expect(ids(unit('workloads/dd-core').objects)).toEqual([
      'Deployment/default/dd-core-production-blue',
      'Deployment/default/dd-core-production-green',
      'HTTPRoute/default/core.test',
      'ClientTrafficPolicy/default/dd-core-production-http3',
      'Gateway/default/dd-core-production',
      'Service/default/dd-core-production-blue-service',
      'Service/default/dd-core-production-traffic-service',
      'Service/default/dd-core-production-green-service',
      'Certificate/default/core.test',
      'Secret/default/dd-core-production-env',
      'Secret/default/underpost-config',
      'Secret/default/core.test',
    ]);
    // A deployment moves with its instances: their routes attach to its Gateway. One run deploys a family,
    // in the colour of its default instance.
    expect(unit('workloads/dd-cyberia').deployIds).toEqual([
      'dd-cyberia',
      'dd-cyberia-mmo-client',
      'dd-cyberia-mmo-client-test',
    ]);
    expect(unit('workloads/dd-cyberia').install.slice(3)).toEqual([
      'run instance --kubeadm --deploy-id dd-cyberia --instance-id mmo-client --traffic green --replicas 1 ' +
        '--namespace-workloads underpost-workloads',
    ]);
    expect(unit('workloads/dd-cyberia').destination.controllers).toEqual([
      'Deployment/dd-cyberia-production-blue',
      'Deployment/dd-cyberia-mmo-client-production-green',
      'Deployment/dd-cyberia-mmo-client-test-production-green',
    ]);
    expect(ids(unit('workloads/dd-cyberia').objects)).toContain('HTTPRoute/default/mmo.cyberia.test');
    expect(unit('operations').install).toEqual(['cron --apply --kubeadm --namespace-operations underpost-operations']);
    expect(unit('platform')).toMatchObject({
      install: ['cluster --gateway-api --kubeadm --replicas 1 --namespace-platform underpost-platform'],
      consumers: ['dd-core', 'dd-cyberia'],
      // The gateway installer binds the same host path on the same node again.
      lifecycle: 'reuse',
      data: [
        expect.objectContaining({
          volume: 'pv-underpost-gateway',
          outcome: 'reuse',
          reason: 'its installer mounts /srv/gateway on node-a again: the destination starts with this data',
        }),
      ],
      schedules: [],
    });
    expect(unit('datastores/valkey')).toMatchObject({ lifecycle: 'memory', data: [] });
    expect(unit('operations').schedules).toEqual([
      { id: 'CronJob/default/dd-cron-backup', schedule: '0 * * * *', suspended: false },
    ]);
    expect(Object.values(state.units).every(({ status }) => status === 'pending')).toBe(true);

    harness.calls.length = 0;
    const status = migrationText(await Underpost.namespace.migrate({ view: 'status' }));
    expect(status).toContain('datastores/mongodb  pending  default → underpost-data  destructive');
    expect(status).toContain('Environment production · target recommended · profile recommended · context');
    expect(status).toContain('   node: node-a, node-b → node-a (control, required)');
    expect(status).toContain(
      '   node group: control from the recommended profile: scheduling.datastores; ' +
        'environments.production.nodes.groups.control → ./engine-private/deploy/nodes/control-a.json → node-a',
    );
    expect(status).toContain(
      '   data: default/mongodb-storage-mongodb-0 → PersistentVolume/mongodb-pv-0 (Retain, node-a:/data/mongodb/v0): ' +
        'the claim and the volume objects are deleted; data discard: its installer ' +
        '(cluster --mongodb --reset-mongodb) empties /data/mongodb/v0 on node-a',
    );
    expect(status).toContain('   data: its installer empties the host paths it mounts: the destination starts empty\n');
    expect(status).toContain('   data: it keeps its data in memory only: the data goes with its pods');
    expect(status).toContain(
      '   schedule: CronJob/default/dd-cron-backup "0 * * * *": a Job of it blocks the unit while it runs',
    );
    expect(status).toContain('   restart: dd-core, dd-cyberia');
    expect(status).toContain('Underpost backs up, copies and restores no data, and suspends no schedule.');
    expect(migrationText(await Underpost.namespace.migrate({ view: 'list' }))).toMatch(
      /^1\.\s+datastores\/mongodb\s+pending\s+default → underpost-data on node-a \(control, required\) {2}destructive$/m,
    );
    expect(harness.calls).toEqual([]);
  });

  it('resolves each unit in its source until it is placed, and projects the endpoints there', async () => {
    fs.outputJsonSync(CONF, Underpost.namespace.template('recommended'));
    harness.state.context = 'kubernetes-admin@kubernetes';
    await Underpost.namespace.capture({ options: { currentContext: true } });
    Underpost.namespace.plan({ target: 'recommended' });
    const resolved = Underpost.namespace.resolve({ resource: 'mongodb' });
    expect(resolved).toMatchObject({ namespace: 'default', desired: 'underpost-data' });
    expect(resolved.migration).toMatchObject({
      unit: 'datastores/mongodb',
      from: 'default',
      to: 'underpost-data',
      placed: false,
    });
    expect(ofDeploy('dd-core')).toBe('default');
    expect(ofDeploy('dd-cyberia-mmo-client')).toBe('default');
    // A deployment the plan does not move follows the configuration.
    expect(ofDeploy('dd-new')).toBe('underpost-workloads');
    expect(Underpost.db.placementOf({ deployId: 'dd-core' })).toMatchObject({
      mongoose: 'default',
      workloads: 'default',
    });
    // The OCI overlay names underpost-data; the pods reach where MongoDB and Valkey run now.
    const { values, endpoints } = Underpost.app.ociEnv({ env: 'production', args: { 'deploy-id': 'dd-core' } });
    expect(values.DB_HOST).toBe(`mongodb://app:s3cret@${DB}.default.svc.cluster.local:27017/app?replicaSet=rs0`);
    expect(values.VALKEY_HOST).toBe('valkey-service.default.svc.cluster.local');
    expect(endpoints.map(({ key }) => key)).toEqual(['DB_HOST', 'VALKEY_HOST']);
    expect(fs.readFileSync(ENV, 'utf8')).toContain('underpost-data');
  });

  it('recreates MongoDB empty in its destination, restarts its consumers and writes the configuration', async () => {
    await planned();
    const preview = migrationText(await run('datastores/mongodb'));
    expect(preview).toContain('· dry run');
    expect(preview).toContain('   install: underpost cluster --mongodb --reset-mongodb --kubeadm --replicas 1');
    expect(preview).toMatch(/Next operation:\n {4}prepare/);
    expect(harness.calls.some((call) => / (delete|apply|patch|scale) /.test(call))).toBe(false);
    await expect(run('datastores/mongodb', { apply: true })).rejects.toThrow(
      'datastores/mongodb deletes or discards data: review node bin namespace migrate --env production, then add ' +
        '--confirm-destructive',
    );

    harness.calls.length = 0;
    const result = await run('datastores/mongodb', { apply: true, confirmDestructive: true });
    expect(result.results[0]).toMatchObject({ status: 'completed', remaining: [], reasons: [] });
    expect(result.results[0].done.slice(0, -1)).toEqual([
      'create namespace underpost-data',
      // The destination holds the Secrets of MongoDB before anything is deleted.
      'provide the Secrets of mongodb from its seed source in underpost-data',
      'delete StatefulSet/default/mongodb and its pods',
      'delete Service/default/mongodb-service',
      'delete Secret/default/mongodb-secret',
      'delete PersistentVolumeClaim/default/mongodb-storage-mongodb-0',
      'delete PersistentVolume/mongodb-pv-0',
      'underpost cluster --mongodb --reset-mongodb --kubeadm --replicas 1 --namespace-mongodb underpost-data',
      'place MongoDB in underpost-data: every command and endpoint reaches it there',
      'project the endpoints of dd-core-production and restart it',
    ]);
    expect(result.results[0].done.at(-1)).toMatch(
      /^place mongodb in underpost-data; the previous conf\.cluster\.json is .+\.bak$/,
    );
    const kubectl = harness.calls.filter((call) => call.startsWith('kubectl --context underpost-production'));
    const scaled = kubectl.findIndex((call) => call.includes('scale statefulset mongodb -n default --replicas=0'));
    expect(scaled).toBeGreaterThanOrEqual(0);
    expect(kubectl[scaled + 1]).toContain('delete statefulset mongodb -n default --cascade=foreground --wait=true');
    expect(kubectl.find((call) => call.includes('delete persistentvolume mongodb-pv-0'))).not.toContain(' -n ');
    expect(commands(/ rollout restart deployment\/dd-core-production-blue -n default/)).toHaveLength(1);
    expect(inDefault('controllers')).not.toContain('mongodb');
    expect(kubectl.filter((call) => call.includes('delete persistentvolume mongodb-pv-0'))).toHaveLength(1);
    expect(harness.state.volumes.find(({ metadata }) => metadata.name === 'mongodb-pv-0').spec.claimRef.namespace).toBe(
      'underpost-data',
    );

    // The placement equals the profile now: the override goes.
    expect(fs.readJsonSync(CONF).environments.production.overrides.namespaces.datastores).toEqual({
      valkey: 'default',
    });
    expect(Underpost.namespace.of('mongodb')).toBe('underpost-data');
    expect(Underpost.app.ociEnv({ env: 'production', args: { 'deploy-id': 'dd-core' } }).values.DB_HOST).toContain(
      `${DB}.underpost-data.svc.cluster.local`,
    );
    const report = migrationText(result);
    expect(report).toContain('    Managed resources found: 5\n    Managed resources remaining: 0');
    expect(report).toContain('    Data kept on the storage backend: 0');
    // A migration suspends no schedule, and holds the migration Lease of the cluster only while it runs.
    expect(commands(/ patch cronjob /)).toEqual([]);
    const lease = harness.calls.findIndex((call) => call.endsWith(' create -f -'));
    expect(JSON.parse(harness.inputs[lease])).toMatchObject({
      kind: 'Lease',
      metadata: { name: 'underpost-namespace-migration', namespace: 'kube-system' },
      spec: { holderIdentity: `${os.hostname()}/${result.plan.id}` },
    });
    expect(harness.calls.filter((call) => call.includes(' lease ')).at(-1)).toBe(
      'kubectl --context underpost-production delete lease underpost-namespace-migration -n kube-system --ignore-not-found',
    );
    expect(harness.state.leases).toEqual([]);
    expect(await statusOf('datastores/mongodb')).toBe('completed');
  });

  it('keeps the source of a datastore while a Job that reaches it runs, and suspends no schedule', async () => {
    await planned();
    const job = (name, app, active = 1) =>
      controllerItem('Job', name, 'default', { labels: { app, 'managed-by': 'underpost' }, status: { active } });
    harness.state.controllers.push(
      job('dd-cron-backup-29001', 'dd-cron-backup'),
      // A DNS update reaches no datastore; a release Job writes them.
      job('dd-cron-dns-29001', 'dd-cron-dns'),
      controllerItem('Job', 'dd-cyberia-release-v1', 'underpost-releases', {
        labels: { app: 'underpost-release', 'deploy-id': 'dd-cyberia' },
        status: { active: 1 },
      }),
    );
    const { results } = await run('datastores/mongodb', { apply: true, confirmDestructive: true });
    expect(results[0]).toMatchObject({
      status: 'blocked',
      reasons: [
        'Job/default/dd-cron-backup-29001 runs and reaches MongoDB: wait until it ends, then run again',
        'Job/underpost-releases/dd-cyberia-release-v1 runs and reaches MongoDB: wait until it ends, then run again',
      ],
    });
    expect(changes(/ (delete|scale|patch) /)).toEqual([]);
    expect(inDefault('controllers')).toContain('mongodb');
    // An unrelated Job blocks no unit: Valkey moves while the backup runs.
    const valkey = await run('datastores/valkey', { apply: true, confirmDestructive: true });
    expect(valkey.results[0].status).toBe('completed');
  });

  it('runs one plan at a time in a cluster: another holder of the migration Lease refuses it', async () => {
    const { plan } = await planned();
    harness.state.leases.push({
      kind: 'Lease',
      metadata: { name: 'underpost-namespace-migration', namespace: 'kube-system' },
      spec: { holderIdentity: 'control-a/20261110T000000Z-production-recommended' },
    });
    await expect(run('datastores/valkey', { apply: true, confirmDestructive: true })).rejects.toThrow(
      'control-a/20261110T000000Z-production-recommended holds the migration Lease kube-system/' +
        'underpost-namespace-migration of this cluster: wait until it ends; if no process runs it, remove it with ' +
        'kubectl delete lease underpost-namespace-migration -n kube-system',
    );
    expect(await statusOf('datastores/valkey')).toBe('pending');
    // An interrupted run of the same plan on this host holds it already, and takes it again.
    harness.state.leases[0].spec.holderIdentity = `${os.hostname()}/${plan.id}`;
    expect((await run('datastores/valkey', { apply: true, confirmDestructive: true })).results[0].status).toBe(
      'completed',
    );
    expect(harness.state.leases).toEqual([]);
    // A dry run and a verification take no Lease.
    harness.calls.length = 0;
    await run('datastores/mongodb');
    await Underpost.namespace.migrate({ view: 'verify' });
    expect(harness.calls.some((call) => / (create -f -|delete lease)/.test(call))).toBe(false);
  });

  it('never deletes a source object created again after the plan, nor a claim a pod still mounts', async () => {
    const statefulSet = harness.state.controllers.find(
      ({ metadata }) => metadata.name === 'mongodb' && metadata.namespace === 'default',
    );
    statefulSet.metadata.uid = 'uid-planned';
    await planned();
    statefulSet.metadata.uid = 'uid-recreated';
    const recreated = await run('datastores/mongodb', { apply: true, confirmDestructive: true });
    expect(recreated.results[0].status).toBe('blocked');
    expect(recreated.results[0].reasons[0]).toMatch(
      /^StatefulSet\/default\/mongodb was created again after plan \S+: the unit deletes no object the plan did not observe/,
    );
    expect(changes(/ (delete|scale|patch) /)).toEqual([]);

    statefulSet.metadata.uid = 'uid-planned';
    harness.state.pods.push({
      kind: 'Pod',
      metadata: { name: 'debug', namespace: 'default', labels: {} },
      spec: {
        nodeName: 'node-a',
        volumes: [{ name: 'd', persistentVolumeClaim: { claimName: 'mongodb-storage-mongodb-0' } }],
      },
    });
    const mounted = await run('datastores/mongodb', { apply: true, confirmDestructive: true });
    expect(mounted.results[0]).toMatchObject({
      status: 'blocked',
      reasons: [
        'pod default/debug still mounts default/mongodb-storage-mongodb-0: wait until it stops, or stop it, then run again',
      ],
    });
    expect(commands(/ delete statefulset mongodb /)).toHaveLength(1);
    expect(commands(/ delete persistentvolumeclaim /)).toEqual([]);
  });

  it('blocks a claim whose data outcome is unknown, and refuses a plan changed after planning', async () => {
    harness.state.volumes.find(({ metadata }) => metadata.name === 'mongodb-pv-0').spec.persistentVolumeReclaimPolicy =
      'Recycle';
    const { plan, directory } = await planned();
    const unit = plan.units.find(({ id }) => id === 'datastores/mongodb');
    expect(unit.data[0]).toMatchObject({ outcome: 'unknown', reason: 'the reclaim policy Recycle' });
    expect(unit.blockers).toContain(
      'what happens to the data of default/mongodb-storage-mongodb-0 is unknown: the reclaim policy Recycle',
    );
    expect((await run('datastores/mongodb', { apply: true, confirmDestructive: true })).results[0].status).toBe(
      'blocked',
    );
    expect(plan.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
    const file = nodePath.join(directory, 'plan.json');
    fs.writeJsonSync(file, { ...fs.readJsonSync(file), target: 'legacy' });
    await expect(run('datastores/valkey')).rejects.toThrow(`Plan ${plan.id} changed after planning: keep ${directory}`);
  });

  it('names what each installer does with the data, and blocks an installer without a verified data lifecycle', async () => {
    harness.state.controllers.push(
      statefulSet('mariadb-statefulset', 'default', { claimTemplates: ['mariadb-storage'] }),
      controllerItem('StatefulSet', 'postgres', 'default', {
        spec: {
          replicas: 1,
          template: { metadata: { labels: { app: 'postgres' } }, spec: pod({ claims: ['postgres-pv-claim'] }) },
        },
        status: { readyReplicas: 1 },
      }),
    );
    harness.state.claims.push(
      claimItem('mariadb-storage-mariadb-statefulset-0', 'default', 'pvc-0a1b'),
      claimItem('postgres-pv-claim', 'default', 'postgres-pv-volume'),
    );
    harness.state.volumes.push(
      volumeItem('pvc-0a1b', {
        claim: 'default/mariadb-storage-mariadb-statefulset-0',
        hostPath: '/opt/local-path/pvc-0a1b',
        nodes: ['node-a'],
      }),
      volumeItem('postgres-pv-volume', { claim: 'default/postgres-pv-claim', hostPath: '/data/postgresql' }),
    );
    const { plan } = await planned();
    const unit = (id) => plan.units.find((entry) => entry.id === id);
    // A claim template in another namespace is a new volume: the destination starts empty, the old data stays.
    expect(unit('datastores/mariadb')).toMatchObject({
      lifecycle: 'fresh',
      destructive: true,
      blockers: [],
      data: [
        {
          claim: 'default/mariadb-storage-mariadb-statefulset-0',
          outcome: 'retain-unattached',
          reason:
            'its installer provisions a new volume, and the data stays on node-a:/opt/local-path/pvc-0a1b, where ' +
            'nothing mounts it',
        },
      ],
    });
    const unknown = 'the installer of postgresql has no verified data lifecycle';
    expect(unit('datastores/postgresql')).toMatchObject({
      lifecycle: '',
      data: [{ claim: 'default/postgres-pv-claim', outcome: 'unknown', reason: unknown }],
    });
    expect(unit('datastores/postgresql').blockers).toContain(
      `what happens to the data of default/postgres-pv-claim is unknown: ${unknown}`,
    );
    expect((await run('datastores/postgresql', { apply: true, confirmDestructive: true })).results[0].status).toBe(
      'blocked',
    );
    expect(changes(/ (delete|scale|patch) /)).toEqual([]);
  });

  it('blocks a unit whose stored Secrets are missing, before it deletes anything', async () => {
    await planned();
    const source = vi
      .spyOn(Underpost.namespace, 'secretSource')
      .mockImplementation(({ resource }) => (resource === 'mongodb' ? 'sops' : 'seed'));
    const { results } = await run('datastores/mongodb', { apply: true, confirmDestructive: true });
    expect(results[0]).toMatchObject({
      status: 'blocked',
      reasons: ['credentials', 'keyfile'].map(
        (id) =>
          `production stores the Secrets of mongodb, and ./engine-private/secrets/production/mongodb/${id}.enc.yaml ` +
          'does not exist',
      ),
    });
    expect(changes(/ (delete|apply|scale) /)).toEqual([]);
    source.mockRestore();
  });

  it('recreates a deployment through the deploy pipeline, with its TLS and without the Secrets it shares', async () => {
    await planned();
    const result = await run('workloads/dd-core', { apply: true });
    expect(result.results[0]).toMatchObject({ status: 'completed', remaining: [] });
    expect(result.results[0].done.slice(0, 6)).toEqual([
      'create namespace underpost-workloads',
      'copy Secret/default/core.test into underpost-workloads',
      'apply Certificate/underpost-workloads/core.test',
      'delete Deployment/default/dd-core-production-blue and its pods',
      'delete Deployment/default/dd-core-production-green and its pods',
      'delete HTTPRoute/default/core.test',
    ]);
    expect(commands(/ (deploy|tls) /)).toEqual(
      fs.readJsonSync(nodePath.join(result.directory, 'plan.json')).units.find(({ id }) => id === 'workloads/dd-core')
        .install,
    );
    const copied = harness.calls.findIndex((call) => call.endsWith(' apply -f -'));
    expect(JSON.parse(harness.inputs[copied]).metadata).toEqual({
      name: 'core.test',
      namespace: 'underpost-workloads',
      labels: {},
      annotations: { 'cert-manager.io/certificate-name': 'core.test' },
    });
    expect(harness.calls.join('\n')).not.toContain(pair.data['tls.key']);
    // The Certificate renews the copy in its new namespace; the source goes with its Gateway policy.
    expect(harness.state.certificates.map(({ metadata }) => metadata.namespace)).toEqual(['underpost-workloads']);
    expect(harness.state.policies).toEqual([]);
    expect(harness.state.secrets.filter((line) => line.startsWith('default\t'))).toEqual([
      secretLine('default', 'underpost-config'),
      secretLine('default', 'mongodb-secret'),
    ]);
    expect(inDefault('routes')).toEqual(['cyberia.test', 'mmo.cyberia.test']);
    expect(ofDeploy('dd-core')).toBe('underpost-workloads');
    expect(ofDeploy('dd-cyberia')).toBe('default');
    // dd-cyberia stays in default, so the workloads keep their configuration.
    expect(fs.readJsonSync(CONF)).toEqual(ADOPTED);
  });

  it('runs every unit in dependency order, frees host ports before the platform installs, and republishes its routes', async () => {
    await planned();
    await expect(Underpost.namespace.migrate({ apply: true })).rejects.toThrow(
      'datastores/mongodb, datastores/valkey, platform deletes or discards data',
    );
    harness.calls.length = 0;
    const full = await Underpost.namespace.migrate({ apply: true, confirmDestructive: true });
    expect(full.results.map(({ unit, status }) => [unit.id, status])).toEqual([
      ['datastores/mongodb', 'completed'],
      ['datastores/valkey', 'completed'],
      ['workloads/dd-core', 'completed'],
      ['workloads/dd-cyberia', 'completed'],
      ['operations', 'completed'],
      ['platform', 'completed'],
    ]);
    const installs = commands(/ (cluster|cron|run instance) |--versions blue --namespace-workloads/);
    // The workload installs ship volume data through the peer of the worker record, which each checks first.
    expect(installs.filter((call) => call.includes('--ssh-key-path'))).toEqual([]);
    // Each workload unit checks the peer of every node of its group.
    expect(nodeTarget.mock.calls.map(([node]) => node)).toEqual(['node-b', 'node-c', 'node-b', 'node-c']);
    expect(peerCommand.mock.calls.map(([params]) => params)).toEqual(
      Array(4).fill({
        host: '192.0.2.2',
        port: 22,
        user: 'admin',
        keyPath: '/keys/peer',
        command: 'sudo -n true',
        retries: 1,
        connectTimeoutSec: 10,
      }),
    );
    expect(installs.map((call) => call.split(' ').slice(0, 2).join(' '))).toEqual([
      'cluster --mongodb',
      'cluster --valkey',
      'deploy --kubeadm',
      'deploy --kubeadm',
      'run instance',
      'cron --apply',
      'cluster --gateway-api',
    ]);
    const at = (pattern) => harness.calls.findIndex((call) => pattern.test(call));
    expect(at(/ cluster --valkey /)).toBeLessThan(at(/ rollout status statefulset\/valkey-service -n underpost-data /));
    expect(at(/delete deployment underpost-ingress -n default/)).toBeLessThan(at(/ cluster --gateway-api /));
    expect(commands(/--disable-update-deployment| instance-promote /)).toEqual([
      'deploy --kubeadm --replicas 1 --image engine:v4 --versions blue --disable-update-deployment dd-core production',
      'deploy --kubeadm --replicas 1 --image engine:v4 --versions blue --disable-update-deployment dd-cyberia production',
      'run instance-promote dd-cyberia,mmo-client --kubeadm --traffic green',
    ]);
    // Every resource runs where the profile places it: no override stays.
    expect(fs.readJsonSync(CONF).environments.production).toEqual({
      context: 'underpost-production',
      clusterDomain: 'cluster.local',
      profile: 'recommended',
      routing: ROUTING,
      tls: TLS,
      nodes: { groups: GROUPS },
    });
    // The last deployment that uses a shared Secret deletes it: nothing of a unit stays in default.
    expect(inDefault('controllers')).toEqual([]);
    expect(inDefault('services')).toEqual([]);
    expect(harness.state.secrets.filter((line) => line.startsWith('default\t'))).toEqual([]);
    const verified = await Underpost.namespace.migrate({ view: 'verify' });
    expect(verified.results.every(({ status, remaining }) => status === 'completed' && !remaining.length)).toBe(true);
    // A migration backs up, dumps, snapshots and restores nothing, and suspends no schedule.
    expect(commands(/bin\/index\.js db |dump|snapshot|restore| patch cronjob /)).toEqual([]);
  });

  it('resumes an interrupted unit without deleting its source twice, and refuses an unsafe run', async () => {
    const { directory } = await planned();
    let failing = true;
    harness.route({ match: (call) => failing && / cluster --mongodb /.test(call), throws: 'image pull failed' });
    await expect(run('datastores/mongodb', { apply: true, confirmDestructive: true })).rejects.toThrow(
      'image pull failed',
    );
    expect(await statusOf('datastores/mongodb')).toBe('failed');
    failing = false;
    harness.calls.length = 0;
    const resumed = await Underpost.namespace.migrate({ view: 'resume', apply: true, confirmDestructive: true });
    expect(resumed.results.map(({ unit, status }) => [unit.id, status])).toEqual([['datastores/mongodb', 'completed']]);
    expect(harness.calls.some((call) => / (delete|scale) statefulset mongodb /.test(call))).toBe(false);

    // A controller the plan does not name blocks its unit: the operator captures and plans again.
    harness.state.controllers.push(workload('dd-core-production-canary', 'default', 'dd-core-production'));
    const verified = await Underpost.namespace.migrate({ view: 'verify', resource: 'workloads/dd-core' });
    expect(verified.results[0]).toMatchObject({ status: 'blocked' });
    expect(verified.results[0].reasons[0]).toMatch(
      /Deployment\/default\/dd-core-production-canary runs in default, but plan .+ does not name it: capture and plan again/,
    );

    // The platform republishes the routes of a family in one colour: a family that serves two waits.
    const platform = await Underpost.namespace.migrate({ view: 'verify', resource: 'platform' });
    expect(platform.results[0]).toMatchObject({
      status: 'blocked',
      reasons: ['recreate workloads/dd-cyberia first: the instances of mmo-client serve two colours'],
    });

    // A target node the cluster lacks blocks its units before they delete anything.
    const worker = harness.state.nodes.pop();
    const preflight = await Underpost.namespace.migrate({ view: 'verify', resource: 'workloads/dd-cyberia' });
    expect(preflight.results[0]).toMatchObject({ status: 'blocked', reasons: ['the cluster has no node node-c'] });
    harness.state.nodes.push(worker);

    await expect(run('missing')).rejects.toThrow('has no unit missing: datastores/mongodb, datastores/valkey');
    harness.state.fingerprint = 'uid-9999';
    await expect(run('operations')).rejects.toThrow('The cluster uid-9999 is not the cluster of plan');
    await expect(run('datastores/mongodb', { apply: true, confirmDestructive: true })).rejects.toThrow(
      'is not the cluster of plan',
    );
    harness.state.fingerprint = '6f1c2a3b-0000-4111-8222-000011112222';
    fs.outputJsonSync(CONF, { ...ADOPTED, environments: { production: ADOPTED.environments.production } });
    await expect(run('operations', { apply: true })).rejects.toThrow('changed outside plan');
    const file = nodePath.join(directory, 'plan.json');
    fs.writeJsonSync(file, { ...fs.readJsonSync(file), schema: 4 });
    await expect(run('operations')).rejects.toThrow('has schema 4; this Underpost runs schema 9');
  });

  it('blocks a unit whose group has no node, and one whose nodes their peer does not reach, before it deletes anything', async () => {
    fs.removeSync('./engine-private/deploy/nodes/worker-b.json');
    const { plan } = await planned();
    const unbound = plan.units.find(({ id }) => id === 'workloads/dd-core');
    expect(unbound).toMatchObject({
      install: [],
      blockers: ['./engine-private/deploy/nodes/worker-b.json does not exist'],
      node: { group: '', targets: [] },
    });
    expect((await run('workloads/dd-core')).results[0]).toMatchObject({
      status: 'blocked',
      reasons: ['./engine-private/deploy/nodes/worker-b.json does not exist'],
    });

    fs.outputJsonSync('./engine-private/deploy/nodes/worker-b.json', {
      hubHost: '203.0.113.1',
      peerId: 'worker-b',
      ...RECORDS['worker-b'],
    });
    await planned();
    peerCommand.mockResolvedValue({ ok: false });
    expect((await run('workloads/dd-core', { apply: true })).results[0]).toMatchObject({
      status: 'blocked',
      reasons: ['node-b', 'node-c'].map(
        (node) =>
          `admin@192.0.2.2:22 refuses a command through sudo: the install cannot ship volume data to node ${node}`,
      ),
    });
    nodeTarget.mockImplementation(() => {
      throw new Error("[event] node 'worker-b' has no peerId: it is no peer this machine reaches");
    });
    expect((await run('workloads/dd-core')).results[0].reasons).toEqual(
      ['node-b', 'node-c'].map(
        (node) =>
          `the install cannot reach node ${node}: [event] node 'worker-b' has no peerId: it is no peer this machine reaches`,
      ),
    );
    // A datastore install ships no volume data: it checks no peer.
    peerCommand.mockClear();
    expect((await run('datastores/valkey')).results[0].status).not.toBe('blocked');
    expect(peerCommand).not.toHaveBeenCalled();
    expect(harness.calls.some((call) => / delete (deployment|statefulset) /.test(call))).toBe(false);
  });
});
