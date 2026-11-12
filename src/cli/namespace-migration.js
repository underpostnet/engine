/**
 * Namespace migration: a plan that moves each Underpost resource of an environment from the namespaces
 * where a capture observes it to a target placement, and an executor that recreates it there, one unit
 * at a time and in dependency order: datastores, workloads, releases, operations, observability, then
 * the platform.
 *
 * A unit deletes its source installation and the objects only it uses, installs it again in its
 * destination with the Underpost command that installs it, waits until it is ready, places it there,
 * restarts its consumers, and verifies that nothing of it stays in the source. It backs up, copies and
 * restores no data, and suspends no schedule: the plan names what the installer does with the data of each
 * claim it deletes ({@link DATA_OUTCOMES}), and the Jobs that block it while they run. Each run reads the
 * live cluster and continues from what it finds, so an interrupted run resumes without deleting anything
 * twice. One plan runs at a time in a cluster: it holds the Lease {@link MIGRATION_LEASE}.
 *
 * A unit places its resource in its source until its destination is ready, then in its destination;
 * the namespace resolver reads that, so every command and the endpoint layer follow. The configuration
 * changes when the last unit of a resource completes.
 *
 * @module src/cli/namespace-migration.js
 * @namespace UnderpostNamespaceMigration
 */
import crypto from 'node:crypto';
import os from 'node:os';
import nodePath from 'node:path';
import fs from 'fs-extra';
import { cli } from '../server/build/execution.js';
import { readDeployRoutes } from '../server/network/router.js';
import { acquireHostLock, hostLockName } from '../server/runtime/host-lock.js';
import { CLUSTER_CONF_PATH, CLUSTER_MIGRATIONS_PATH, loadConfInstances } from '../server/runtime/conf.js';
import { shellExec } from '../server/runtime/process.js';
import { DATASTORE_CRON_JOBS, cronJobOf } from '../server/ops/cron.js';
import {
  DATA_LIFECYCLES,
  NAMESPACE_RESOURCES,
  applyNamespaceSteps,
  baseOf,
  clusterConfChecksum,
  flagOf,
  keyOf,
  kubectlFactory,
  namespaceSteps,
  objectId,
  ownerOf,
  ownsNamespace,
  placeResources,
  placementOf,
  readClusterConf,
  refusal,
  stamp,
  writePrivateJson,
} from './namespace.js';
import { EDGE_NODES_PATH } from './wireguard.js';
import { blockingTaints } from '../server/runtime/pod-scheduling.js';
import Underpost from '../index.js';

/** The schema version of a plan. */
const PLAN_VERSION = 9;

/** The install commands that can ship volume data to the node of their unit. */
const SHIPS_VOLUMES = /^(deploy|run instance) /;

/** The resource states a plan moves: the resource runs, but not only in its target. */
const MOVING = Object.freeze(['pending-migration', 'destination-prepared', 'duplicate']);

/** The order of a full migration by role: each resource after the ones it depends on. */
const ORDER = Object.freeze(['datastore', 'workload', 'release', 'operations', 'observability', 'platform']);

/** The status of a unit while each operation runs. */
const OPERATION_STATUS = Object.freeze({
  prepare: 'preparing-destination',
  delete: 'deleting-source',
  clean: 'cleaning-source',
  install: 'installing-destination',
  await: 'waiting-ready',
  place: 'updating-endpoints',
  rollout: 'restarting-consumers',
});

/** The statuses a resume continues: a unit a run started and did not complete. */
const IN_PROGRESS = Object.freeze([...Object.values(OPERATION_STATUS), 'blocked', 'failed']);

/** The kinds a unit deletes as controllers: their pods go with them. */
const CONTROLLERS = Object.freeze(['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob', 'Job']);

/** The order of the other source objects of a unit: routes first, data last. */
const CLEAN_ORDER = Object.freeze([
  'HTTPRoute',
  'HTTPProxy',
  'Ingress',
  'ClientTrafficPolicy',
  'BackendTrafficPolicy',
  'Gateway',
  'Service',
  'Certificate',
  'Secret',
  'ConfigMap',
  'RoleBinding',
  'Role',
  'ServiceAccount',
  'PersistentVolumeClaim',
  'PersistentVolume',
]);

/** The kinds whose deletion destroys persistent data. */
const DATA = Object.freeze(['PersistentVolumeClaim', 'PersistentVolume']);

/** The data lifecycles that lose the data of the source whatever its volumes hold. */
const DISCARDING = Object.freeze(['reset', 'memory']);

/** The `app` label of a release Job: it writes the datastores of its deployment. */
const RELEASE_JOB = 'underpost-release';

/** The Lease that admits one migration at a time in a cluster, from any host. */
const MIGRATION_LEASE = Object.freeze({ name: 'underpost-namespace-migration', namespace: 'kube-system' });

const planDirectory = (id) => nodePath.join(CLUSTER_MIGRATIONS_PATH, id);

/** The digest of a plan without its own `integrity`: a plan whose file changed after planning differs. */
const integrityOf = ({ integrity, ...planned }) =>
  `sha256:${crypto.createHash('sha256').update(JSON.stringify(planned)).digest('hex')}`;
const underpost = (args) => `${cli('underpost', { local: true })} ${args}`;
const listOf = (objects) => objects.map(objectId).join(', ');
const byRole = (a, b) =>
  ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || (a.role === 'workload' ? a.id.localeCompare(b.id) : 0);

/** Whether a controller runs as its spec asks: a CronJob active, any other with its replicas ready. */
const ready = ({ kind, suspended, ready: count, replicas }) =>
  kind === 'CronJob' ? !suspended : (count ?? 0) >= Math.max(1, replicas ?? 1);

/** The units of the latest plan of each environment, kept while its files stay as they were. */
const unitsCache = new Map();

/**
 * Where the latest plan of an environment places each unit: its source until it is placed, then its
 * destination. A resource with units of its own, the workloads, is in its destination once all of them
 * are; each deployment of a unit resolves to that unit.
 */
const activeUnits = (environment) => {
  const latest = fs.existsSync(CLUSTER_MIGRATIONS_PATH)
    ? fs
        .readdirSync(CLUSTER_MIGRATIONS_PATH)
        .filter((id) => id.includes(`-${environment}-`))
        .sort()
        .at(-1)
    : undefined;
  const files = latest ? ['plan.json', 'state.json'].map((name) => nodePath.join(planDirectory(latest), name)) : [];
  if (!files.length || !files.every((file) => fs.existsSync(file))) return new Map();
  const key = files.map((file) => fs.statSync(file).mtimeMs).join(':');
  if (unitsCache.get(latest)?.key === key) return unitsCache.get(latest).units;
  const [planned, state] = files.map((file) => fs.readJsonSync(file));
  const units = new Map();
  if (planned.schema === PLAN_VERSION) {
    for (const unit of planned.units) {
      const { status, placedAt } = state.units[unit.id];
      const entry = {
        resource: unit.resource,
        plan: planned.id,
        unit: unit.id,
        status,
        from: unit.from[0],
        to: unit.to,
        placed: Boolean(placedAt),
        namespace: placedAt ? unit.to : unit.from[0],
      };
      units.set(unit.id, entry);
      for (const deployId of unit.deployIds) units.set(`workloads/${deployId}`, entry);
    }
    for (const [resource, group] of Map.groupBy(planned.units, (unit) => unit.resource)) {
      const entries = group.map(({ id }) => units.get(id));
      units.set(resource, entries.find(({ placed }) => !placed) ?? entries.at(-1));
    }
  }
  unitsCache.set(latest, { key, units });
  return units;
};

/**
 * The unit of the latest plan that places a resource. A deployment of the workloads resolves to the unit
 * of its group; a deployment the plan does not move follows the configuration.
 * @param {{environment:string, resource:string, deployId?:string}} params
 * @returns {{resource:string, plan:string, unit:string, status:string, from:string, to:string,
 *   placed:boolean, namespace:string}|undefined}
 * @memberof UnderpostNamespaceMigration
 */
export function migrationPlacement({ environment, resource, deployId = '' }) {
  const units = activeUnits(environment);
  if (resource === 'workloads' && deployId) return units.get(`workloads/${deployId}`);
  return units.get(resource);
}

/** The namespace the configuration names for a resource, without a migration. */
const configuredOf = (resource, environment, path) =>
  Underpost.namespace.of(resource, { environment, path, sections: readClusterConf(path) });

/** The cluster type option of the commands a plan runs. */
const clusterFlagOf = ({ context, cluster }) =>
  cluster.version.includes('+k3s') ? '--k3s' : context.startsWith('kind-') ? '--kind' : '--kubeadm';

/** The colour of a blue/green workload name. */
const colourOf = (name) => /-(blue|green)$/.exec(name)?.[1] ?? '';

/** The objects of an observation a unit can own, by id. */
const objectsOf = (observation) =>
  new Map(
    [
      ...observation.controllers,
      ...observation.services.map((service) => ({ ...service, kind: 'Service' })),
      ...observation.storage.claims.map((claim) => ({ ...claim, kind: 'PersistentVolumeClaim' })),
      ...observation.storage.volumes.map((volume) => ({ ...volume, kind: 'PersistentVolume' })),
      ...observation.config.secrets,
      ...observation.config.configMaps,
      ...observation.access,
      ...Object.values(observation.routing).flatMap((group) => group ?? []),
    ].map((object) => [objectId(object), object]),
  );

/** What controllers and Gateways use: the objects their dependencies name, their service accounts, their TLS Secrets. */
const usesOf = (controllers, gateways, observation) => {
  const ids = controllers.map(objectId);
  return new Set([
    ...observation.dependencies.filter(({ from, via }) => ids.includes(from) && via !== 'storage').map(({ to }) => to),
    ...controllers
      .filter(({ serviceAccount }) => serviceAccount !== 'default')
      .map(({ namespace, serviceAccount }) => `ServiceAccount/${namespace}/${serviceAccount}`),
    ...gateways
      .flatMap(({ listeners }) => listeners.flatMap(({ certificates }) => certificates))
      .map((ref) => `Secret/${ref}`),
  ]);
};

/**
 * The source installation of a unit: its controllers, the Services that select them or that its resource
 * names, its Gateways and the routes that reach them, and the Secrets, ConfigMaps, service accounts and
 * their bindings, claims and volumes its controllers use, and what happens to the data of each claim
 * ({@link dataOf}).
 * @returns {{objects:Object[], data:Object[]}}
 */
const sourceOf = ({ resource, controllers, labels, from, observation, targets }) => {
  const live = objectsOf(observation);
  const inSource = ({ namespace }) => from.includes(namespace);
  const gateways = (observation.routing.gateways ?? []).filter(
    (gateway) => inSource(gateway) && labels.includes(gateway.name),
  );
  const used = usesOf(controllers, gateways, observation);
  const services = observation.services
    .map((service) => ({ ...service, kind: 'Service' }))
    .filter(
      (service) =>
        inSource(service) &&
        (used.has(objectId(service)) || NAMESPACE_RESOURCES[resource].services.includes(service.name)),
    );
  const names = services.map(({ name }) => name);
  const parents = gateways.map(({ namespace, name }) => `${namespace}/${name}`);
  const reaches = (backends) => backends.length > 0 && backends.every((name) => names.includes(name));
  const bindings = observation.access.filter(
    (binding) =>
      binding.kind === 'RoleBinding' &&
      inSource(binding) &&
      binding.subjects.length > 0 &&
      binding.subjects.every((subject) => used.has(subject)),
  );
  const ids = new Set([
    ...used,
    ...[
      ...services,
      ...gateways,
      ...(observation.routing.routes ?? []).filter(
        (route) => inSource(route) && route.parents.some((ref) => parents.includes(ref)),
      ),
      ...(observation.routing.proxies ?? []).filter((proxy) => inSource(proxy) && reaches(proxy.services)),
      ...(observation.routing.policies ?? []).filter(
        (policy) =>
          inSource(policy) &&
          gateways.some(
            ({ namespace, name }) => namespace === policy.namespace && policy.targets.includes(`Gateway/${name}`),
          ),
      ),
      ...observation.routing.ingresses.filter((ingress) => inSource(ingress) && reaches(ingress.backends)),
      ...(observation.routing.certificates ?? []).filter(
        (certificate) => inSource(certificate) && used.has(`Secret/${certificate.namespace}/${certificate.secretName}`),
      ),
      ...bindings,
    ].map(objectId),
    ...bindings.map(({ namespace, role }) => `Role/${namespace}/${role}`),
  ]);
  const objects = [...ids]
    .filter((id) => live.has(id))
    .map((id) => live.get(id))
    .sort((a, b) => CLEAN_ORDER.indexOf(a.kind) - CLEAN_ORDER.indexOf(b.kind));
  return {
    objects: [...controllers, ...objects].map(({ kind, namespace, name, uid = '' }) => ({
      kind,
      namespace,
      name,
      uid,
    })),
    data: objects
      .filter(({ kind }) => kind === 'PersistentVolumeClaim')
      .map((claim) => dataOf(claim, observation, { resource, targets })),
  };
};

/**
 * The outcomes of the data of a claim a unit deletes. The unit always deletes the claim and its volume
 * objects; the outcome says what the data on the storage backend becomes. Underpost backs up, copies and
 * restores no data, so it plans no `copy` and no `restore`.
 */
export const DATA_OUTCOMES = Object.freeze({
  /** The claim holds no volume: there is no data. */
  none: 'none',
  /** The installer mounts the same host path on the same nodes again: the destination starts with this data. */
  reuse: 'reuse',
  /** The data stays on the storage backend, and nothing mounts it: an operator reclaims or removes it. */
  retainUnattached: 'retain-unattached',
  /** The provisioner deletes the data with the volume, or the installer empties its host path. */
  discard: 'discard',
  /** The planner cannot tell what the data becomes: the unit is blocked. */
  unknown: 'unknown',
});

/**
 * What a unit does to the data of a claim it deletes: the volume that holds it, its reclaim policy, the
 * nodes and host path of its data, and its outcome ({@link DATA_OUTCOMES}) from the data lifecycle of the
 * installer ({@link DATA_LIFECYCLES}) and the nodes of the destination.
 */
const dataOf = ({ namespace, name }, { storage, nodes: clusterNodes }, { resource, targets }) => {
  const claim = `${namespace}/${name}`;
  const volume = storage.volumes.find((entry) => entry.claim === claim);
  if (!volume)
    return { claim, volume: '', reclaim: '', location: '', nodes: [], outcome: DATA_OUTCOMES.none, reason: '' };
  const provisioner = storage.classes.find((entry) => entry.name === volume.storageClass)?.provisioner ?? '';
  // A host path volume without node affinity holds its data on the node of the pod that mounts it.
  const nodes =
    volume.affinity === 'none' && volume.hostPath
      ? [...new Set(storage.mounts.filter((mount) => mount.claim === claim).map((mount) => mount.node))].sort()
      : volume.nodes;
  const destination = targets.length ? targets : clusterNodes.length === 1 ? [clusterNodes[0].name] : [];
  const location = volume.hostPath ? `${nodes.length ? `${nodes.join(',')}:` : ''}${volume.hostPath}` : '';
  const entry = { claim, volume: volume.name, reclaim: volume.reclaim, location, nodes };
  const outcome = (key, reason) => ({ ...entry, outcome: DATA_OUTCOMES[key], reason });
  const { data: lifecycle, install } = NAMESPACE_RESOURCES[resource];
  if (!lifecycle) return outcome('unknown', `the installer of ${resource} has no verified data lifecycle`);
  if (volume.affinity === 'other') return outcome('unknown', 'its volume names a node topology Underpost cannot read');
  if (volume.reclaim === 'Delete')
    return provisioner && provisioner !== 'kubernetes.io/no-provisioner'
      ? { ...outcome('discard', `${provisioner} deletes it with the volume`), provisioner }
      : outcome('unknown', 'its reclaim policy is Delete, and no provisioner deletes it');
  if (volume.reclaim !== 'Retain') return outcome('unknown', `the reclaim policy ${volume.reclaim || 'is missing'}`);
  const stays = `the data stays on ${location || `the volume ${volume.name}`}, where nothing mounts it`;
  if (lifecycle === 'fresh') return outcome('retainUnattached', `its installer provisions a new volume, and ${stays}`);
  if (lifecycle === 'memory')
    return outcome('unknown', `its installer keeps no volume, and ${claim} holds data it does not name`);
  if (!volume.hostPath) return outcome('unknown', `its installer acts on host paths, and ${volume.name} has none`);
  if (!nodes.length) return outcome('unknown', 'no live pod or volume affinity names the node of its host path');
  if (!destination.length)
    return outcome('unknown', 'the scheduler chooses the destination node: it may or may not hold the data');
  if (!destination.every((node) => nodes.includes(node)))
    return outcome('retainUnattached', `the destination runs on ${destination.join(', ')}, and ${stays}`);
  return lifecycle === 'reset'
    ? outcome('discard', `its installer (${install}) empties ${volume.hostPath} on ${destination.join(', ')}`)
    : outcome(
        'reuse',
        `its installer mounts ${volume.hostPath} on ${destination.join(', ')} again: the destination starts with this data`,
      );
};

/**
 * The source objects of a unit that a controller, a Gateway or a RoleBinding outside the unit uses in
 * its namespaces: they stay until the last unit that uses them goes.
 */
const sharedOf = (unit, observation) => {
  const ids = unit.objects.map(objectId);
  const outside = (objects) =>
    objects.filter((object) => unit.from.includes(object.namespace) && !ids.includes(objectId(object)));
  const used = new Set([
    ...usesOf(outside(observation.controllers), outside(observation.routing.gateways ?? []), observation),
    ...outside(observation.access.filter(({ kind }) => kind === 'RoleBinding')).map(
      ({ namespace, role }) => `Role/${namespace}/${role}`,
    ),
  ]);
  return ids.filter((id) => used.has(id));
};

/**
 * A workload group as it runs: the controller of its deployment that serves, and its instances by family.
 * A label serves the colour its traffic Service selects, else the colour of its first controller. A family
 * is a template of `conf.instances.json`: `run instance` deploys it at once, in one colour, the colour of
 * its default instance. `reasons` names what no Underpost command deploys.
 */
const groupOf = ({ owner, members, observation, environment, routes }) => {
  const instanceOf = ({ labels }) => baseOf(labels['deploy-id'], environment).slice(owner.length + 1);
  const serving = [...Map.groupBy(members, ({ labels }) => labels['deploy-id'])].map(([label, controllers]) => {
    const traffic = observation.services.find(
      ({ namespace, name }) => namespace === controllers[0].namespace && name === `${label}-traffic-service`,
    );
    const colour = colourOf(traffic?.selector?.app ?? '') || colourOf(controllers[0].name);
    return controllers.find(({ name }) => colourOf(name) === colour) ?? controllers[0];
  });
  const instances = serving.filter((live) => instanceOf(live));
  const conf = `./engine-private/conf/${owner}/conf.instances.json`;
  const templates = new Map(
    instances.length && fs.existsSync(conf)
      ? loadConfInstances(owner).map(({ id, templateId }) => [id, templateId ?? id])
      : [],
  );
  const families = [...Map.groupBy(instances, (live) => templates.get(instanceOf(live)) ?? '')].map(
    ([template, lives]) => ({
      template,
      colour: colourOf((lives.find((live) => instanceOf(live) === template) ?? lives[0]).name),
      members: lives.map((live) => ({ id: instanceOf(live), live })),
    }),
  );
  return {
    owner,
    deployment: serving.find((live) => !instanceOf(live)),
    families,
    reasons: [
      ...(routes.includes(owner) ? [] : [`${owner} is not in the route table: no deploy configuration installs it`]),
      ...families
        .filter(({ template }) => !template)
        .map(({ members: lost }) => `${lost.map(({ id }) => id).join(', ')} is not in ${conf}: nothing installs it`),
    ],
  };
};

/**
 * The Underpost commands that deploy a workload group: the deploy pipeline of its deployment in the colour
 * that serves and the TLS of its hosts, then each instance family in its colour. `publish` republishes their routes in the same
 * colours and keeps their workloads. Without `namespace`, each command reaches the effective placement. The
 * scheduling of the configuration places each, never the node of its source.
 */
const deployCommands = ({ group: { owner, deployment, families }, plan, namespace = '', publish = false }) => {
  const scope = namespace ? ` ${flagOf('workloads')} ${namespace}` : '';
  const dev = plan.environment === 'development' ? ' --dev' : '';
  const colour = deployment && colourOf(deployment.name);
  const flags =
    deployment &&
    `${plan.clusterFlag} --replicas ${deployment.replicas ?? 1}` +
      `${deployment.image ? ` --image ${deployment.image}` : ''} --versions ${colour}`;
  return [
    ...(deployment
      ? [
          `deploy ${flags} --build-manifest --info-router --traffic ${colour}${scope} ${owner} ${plan.environment}`,
          `deploy ${flags}${publish ? ' --disable-update-deployment' : ''}${scope} ${owner} ${plan.environment}`,
          ...(publish ? [] : [`tls reconcile --deploy-id ${owner} --env ${plan.environment} --apply${scope}`]),
        ]
      : []),
    ...families.map(({ template, colour: familyColour, members: [{ live }] }) =>
      publish
        ? `run instance-promote ${owner},${template}${dev} ${plan.clusterFlag} --traffic ${familyColour}${scope}`
        : `run instance${dev} ${plan.clusterFlag} --deploy-id ${owner} --instance-id ${template} --traffic ${familyColour} ` +
          `--replicas ${live.replicas ?? 1}${scope}`,
    ),
  ];
};

/** The Underpost command that installs a resource in a namespace with the replicas of its source. */
const installOf = ({ resource, to, members, plan }) => {
  const { install } = NAMESPACE_RESOURCES[resource];
  if (!install) return [];
  const replicas = install.startsWith('cluster ')
    ? ` --replicas ${Math.max(1, ...members.map((controller) => controller.replicas ?? 1))}`
    : '';
  return [
    `${install}${plan.environment === 'development' ? ' --dev' : ''} ${plan.clusterFlag}${replicas} ${flagOf(resource)} ${to}`,
  ];
};

/**
 * The consumers a unit restarts once it is placed: for a datastore, each workload whose environment names
 * one of its endpoints, which takes the endpoint layer again; for the platform, each workload group, whose
 * routes reach its Service.
 */
const consumersOf = ({ unit, observation, plan }) => {
  const routes = readDeployRoutes();
  const workloads = observation.controllers.filter(({ kind, labels }) => kind === 'Deployment' && labels['deploy-id']);
  if (unit.role === 'platform')
    return [...Map.groupBy(workloads, ({ labels }) => ownerOf(baseOf(labels['deploy-id'], plan.environment), routes))]
      .filter(([owner]) => owner)
      .map(([owner, members]) => {
        const group = groupOf({ owner, members, observation, environment: plan.environment, routes });
        return {
          id: owner,
          commands: deployCommands({ group, plan, publish: true }),
          reasons: [
            ...group.reasons,
            ...group.families
              .filter(({ members: family }) => new Set(family.map(({ live }) => colourOf(live.name))).size > 1)
              .map(
                ({ template }) => `recreate workloads/${owner} first: the instances of ${template} serve two colours`,
              ),
          ],
        };
      });
  if (unit.role !== 'datastore') return [];
  return [...Map.groupBy(workloads, ({ labels }) => labels['deploy-id'])].flatMap(([label, controllers]) => {
    const base = baseOf(label, plan.environment);
    const owner = ownerOf(base, routes);
    if (!owner) return [];
    const context = {
      env: plan.environment,
      args: { 'deploy-id': owner, ...(owner === base ? {} : { 'instance-id': base.slice(owner.length + 1) }) },
    };
    if (!fs.existsSync(Underpost.app.envPath(context))) return [];
    const { values } = Underpost.app.ociEnv(context);
    return NAMESPACE_RESOURCES[unit.resource].endpoints.some((key) => values[key])
      ? [{ id: label, context, controllers }]
      : [];
  });
};

/** The units of a resource that runs outside its target: one per workload group, a deployment with its instances. */
const unitsOf = ({ entry, capture, routes, plan }) => {
  const definition = NAMESPACE_RESOURCES[entry.resource];
  const from = entry.observed.filter((namespace) => namespace !== entry.target);
  const owned = entry.controllers.filter(({ namespace }) => from.includes(namespace)).map(objectId);
  const controllers = capture.controllers.filter((controller) => owned.includes(objectId(controller)));
  const groups =
    entry.resource === 'workloads'
      ? [
          ...Map.groupBy(controllers, ({ labels }) => {
            const base = baseOf(labels['deploy-id'], plan.environment);
            return ownerOf(base, routes) || base;
          }),
        ]
      : [['', controllers]];
  return groups.map(([owner, members]) => {
    const labels = [...new Set(members.map(({ labels: own }) => own['deploy-id']).filter(Boolean))];
    const group = owner && groupOf({ owner, members, observation: capture, environment: plan.environment, routes });
    const blockers = [...(group ? group.reasons : []), ...(entry.node.message ? [entry.node.message] : [])];
    const install = blockers.length
      ? []
      : group
        ? deployCommands({ group, plan, namespace: entry.target })
        : installOf({ resource: entry.resource, to: entry.target, members, plan });
    const expected = !install.length
      ? []
      : group
        ? [
            ...(group.deployment ? [`Deployment/${group.deployment.name}`] : []),
            ...group.families.flatMap(({ colour, members: family }) =>
              family.map(({ id }) => `Deployment/${owner}-${id}-${plan.environment}-${colour}`),
            ),
          ]
        : members.map(({ kind, name }) => `${kind}/${name}`);
    const unit = {
      id: owner ? `workloads/${owner}` : keyOf(entry.resource).replace('.', '/'),
      resource: entry.resource,
      role: definition.role,
      label: owner ? `the deployment ${owner}` : definition.label,
      from,
      to: entry.target,
      deployIds: labels.map((label) => baseOf(label, plan.environment)),
      node: {
        group: entry.node.group,
        mode: entry.node.mode,
        rule: entry.node.rule,
        members: entry.node.members,
        targets: entry.node.targets,
        observed: Object.fromEntries(members.map((controller) => [objectId(controller), controller.pods.nodes])),
      },
      ...sourceOf({
        resource: entry.resource,
        controllers: members,
        labels,
        from,
        observation: capture,
        targets: entry.node.targets,
      }),
      copy: (capture.routing.gateways ?? [])
        .filter(({ namespace, name }) => from.includes(namespace) && labels.includes(name))
        .flatMap(({ listeners }) => listeners.flatMap(({ certificates }) => certificates))
        .map((ref) => ({ namespace: ref.split('/')[0], name: ref.split('/')[1] })),
      install,
      destination: {
        controllers: expected,
        services: (install.length ? definition.services : []).filter((name) =>
          capture.services.some((service) => from.includes(service.namespace) && service.name === name),
        ),
      },
      blockers,
    };
    unit.blockers.push(
      ...unit.data
        .filter(({ outcome }) => outcome === DATA_OUTCOMES.unknown)
        .map(({ claim, reason }) => `what happens to the data of ${claim} is unknown: ${reason}`),
    );
    unit.shared = sharedOf(unit, capture);
    unit.lifecycle = definition.data;
    unit.schedules = schedulesOf(unit, capture).map(({ namespace, name, schedule, suspended }) => ({
      id: objectId({ kind: 'CronJob', namespace, name }),
      schedule,
      suspended,
    }));
    unit.destructive = unit.objects.some(({ kind }) => DATA.includes(kind)) || DISCARDING.includes(definition.data);
    unit.consumers = consumersOf({ unit, observation: capture, plan }).map(({ id }) => id);
    return unit;
  });
};

/**
 * Plans the migration of an environment from a capture to a target placement, and stores it in
 * `engine-private/deploy/migrations/<id>/`. Reads only the capture, the configuration, the route table
 * and the deployment environments.
 * @param {Object} params
 * @param {string} [params.capture] - A capture id, or `latest`.
 * @param {string} [params.target] - `configured`, or a profile of the configuration.
 * @param {Object} [params.options] - Command options: `env`, `dev`.
 * @param {string} [params.path] - The configuration file.
 * @returns {{plan:Object, state:Object, directory:string}}
 * @memberof UnderpostNamespaceMigration
 */
export function plan({ capture: captureId = 'latest', target = 'recommended', path = CLUSTER_CONF_PATH, ...params }) {
  const capture = Underpost.namespace.readCapture({ ...params, path, id: captureId });
  const { environment } = capture;
  const sections = Underpost.namespace.targetSections(target, path);
  const comparison = Underpost.namespace.compare({ observation: capture, sections, path });
  const routes = readDeployRoutes();
  const context = { environment, clusterFlag: clusterFlagOf(capture) };
  const moving = comparison.resources.filter(({ state }) => MOVING.includes(state));
  const units = moving
    .filter(({ strategy }) => strategy === 'recreate')
    .flatMap((entry) => unitsOf({ entry, capture, routes, plan: context }))
    .sort(byRole);
  const id = `${stamp()}-${environment}-${target}`;
  const planned = {
    schema: PLAN_VERSION,
    id,
    environment,
    target,
    createdAt: new Date().toISOString(),
    underpost: Underpost.version,
    cluster: { fingerprint: capture.cluster.fingerprint, context: capture.context, server: capture.cluster.server },
    clusterFlag: context.clusterFlag,
    capture: { id: capture.id, createdAt: capture.createdAt },
    configuration: { path, checksum: clusterConfChecksum(path) },
    sections: { [environment]: sections[environment] },
    warnings: [
      ...comparison.blockers.filter(({ code }) => !code.startsWith('endpoint-')).map(({ message }) => message),
      ...moving
        .filter(({ strategy }) => strategy !== 'recreate')
        .map(
          ({ label, observed, target: to }) =>
            `${label} runs in ${observed.join(', ')}, not in ${to}: its installer owns its namespace, so no unit moves it`,
        ),
    ],
    units,
  };
  planned.integrity = integrityOf(planned);
  const directory = planDirectory(id);
  const state = {
    configuration: planned.configuration.checksum,
    units: Object.fromEntries(units.map((unit) => [unit.id, { status: 'pending', history: [] }])),
  };
  writePrivateJson(nodePath.join(directory, 'plan.json'), planned);
  writePrivateJson(nodePath.join(directory, 'state.json'), state);
  return { plan: planned, state, directory };
}

/**
 * Reads a plan of an environment and the state of its units.
 * @param {{environment:string, id?:string}} params - `id`: a plan id or `latest`; without it, the
 *   latest plan or null.
 * @returns {{plan:Object, state:Object, directory:string}|null}
 * @throws {Error} When the plan `id` names does not exist.
 * @memberof UnderpostNamespaceMigration
 */
export function readPlan({ environment, id }) {
  const plans = fs.existsSync(CLUSTER_MIGRATIONS_PATH)
    ? fs
        .readdirSync(CLUSTER_MIGRATIONS_PATH)
        .sort()
        .filter((entry) => fs.existsSync(nodePath.join(planDirectory(entry), 'plan.json')))
        .map((entry) => fs.readJsonSync(nodePath.join(planDirectory(entry), 'plan.json')))
        .filter((entry) => entry.environment === environment)
    : [];
  const chosen = !id || id === 'latest' ? plans.at(-1) : plans.find((entry) => entry.id === id);
  if (!chosen) {
    if (!id) return null;
    throw refusal(`No plan ${id} of ${environment}: run node bin namespace plan --env ${environment}`);
  }
  const directory = planDirectory(chosen.id);
  return { plan: chosen, state: fs.readJsonSync(nodePath.join(directory, 'state.json')), directory };
}

/** Records the status of a unit: the journal holds every operation and its result. */
const record = (migration, id, status, entry = {}) => {
  const previous = migration.state.units[id];
  const at = new Date().toISOString();
  migration.state.units[id] = {
    ...previous,
    status,
    updatedAt: at,
    history: [...previous.history, { at, status, ...entry }],
  };
  writePrivateJson(nodePath.join(migration.directory, 'state.json'), migration.state);
};

/** The controllers of a unit in an observation: those of its resource, and of its deployments. */
const controllersOf = (unit, observation, environment) => {
  const owned = placementOf(unit.resource, observation.controllers).controllers.map(objectId);
  const labels = unit.deployIds.map((deployId) => `${deployId}-${environment}`);
  return observation.controllers.filter(
    (controller) =>
      owned.includes(objectId(controller)) && (!labels.length || labels.includes(controller.labels['deploy-id'])),
  );
};

/** Whether a live object is a source object of a unit: a volume has no namespace, so its claim decides. */
const inSourceOf = (unit, object) =>
  object.kind !== 'PersistentVolume' || unit.from.includes(object.claim.split('/')[0]);

/**
 * The source objects of a unit that still exist: those it has to delete, those it keeps while they are
 * shared, and those with another UID than the plan names, which something created again after the plan.
 */
const cleanupOf = (unit, observation) => {
  const live = objectsOf(observation);
  const shared = sharedOf(unit, observation);
  const present = unit.objects.filter(
    (object) => live.has(objectId(object)) && inSourceOf(unit, live.get(objectId(object))),
  );
  return {
    remaining: present.filter((object) => !shared.includes(objectId(object))),
    preserved: present.map(objectId).filter((id) => shared.includes(id)),
    recreated: present
      .filter((object) => object.uid && live.get(objectId(object)).uid && live.get(objectId(object)).uid !== object.uid)
      .map(objectId),
  };
};

/**
 * The destination of a unit: whether each controller its install creates runs and is ready, the Services
 * it lacks, why the scheduler cannot place its pods, and the controllers with pods off a required node group.
 */
const destinationOf = ({ unit, observation }) => {
  const controllers = unit.destination.controllers.map((id) =>
    observation.controllers.find(
      (controller) => controller.namespace === unit.to && `${controller.kind}/${controller.name}` === id,
    ),
  );
  const live = controllers.filter(Boolean);
  return {
    installed: live.length === controllers.length,
    ready: live.length === controllers.length && live.every(ready),
    missing: unit.destination.services.filter(
      (name) => !observation.services.some((service) => service.namespace === unit.to && service.name === name),
    ),
    unschedulable: [...new Set(live.flatMap(({ pods }) => pods.unschedulable))],
    misplaced:
      unit.node.mode === 'required'
        ? live.filter(({ pods }) => pods.nodes.some((name) => !unit.node.targets.includes(name)))
        : [],
  };
};

/** Whether the Jobs that read or write the datastores reach a unit: its resource holds a database provider. */
const holdsDatabases = ({ resource }) => NAMESPACE_RESOURCES[resource].providers.length > 0;

/**
 * The Underpost CronJobs whose Jobs reach a unit: for a resource with database providers, those of the cron
 * jobs that read or write the datastores ({@link DATASTORE_CRON_JOBS}); for any unit, the CronJobs it deletes.
 * A migration suspends none: the operator runs the unit outside their schedules.
 */
const schedulesOf = (unit, { controllers }) => {
  const own = unit.objects.filter(({ kind }) => kind === 'CronJob').map(objectId);
  return controllers.filter(
    (controller) =>
      controller.kind === 'CronJob' &&
      controller.labels['managed-by'] === 'underpost' &&
      (own.includes(objectId(controller)) ||
        (holdsDatabases(unit) && DATASTORE_CRON_JOBS.includes(cronJobOf(controller.name)))),
  );
};

/** Why a unit cannot delete a claim yet: each pod that still mounts it, a writer that has not stopped. */
const mountsOf = (objects, { storage }) => {
  const claims = objects
    .filter(({ kind }) => kind === 'PersistentVolumeClaim')
    .map(({ namespace, name }) => `${namespace}/${name}`);
  return (storage.mounts ?? [])
    .filter(({ claim }) => claims.includes(claim))
    .map(({ pod, claim }) => `pod ${pod} still mounts ${claim}: wait until it stops, or stop it, then run again`);
};

/**
 * Why a unit cannot delete its source yet: each active Job of its {@link schedulesOf}, and for a resource with
 * database providers each active release Job.
 */
const jobBlockers = (unit, observation) => {
  const schedules = schedulesOf(unit, observation).map(({ namespace, name }) => `${namespace}/${name}`);
  return observation.controllers
    .filter(
      ({ kind, active, namespace, labels }) =>
        kind === 'Job' &&
        active > 0 &&
        (schedules.includes(`${namespace}/${labels.app}`) || (holdsDatabases(unit) && labels.app === RELEASE_JOB)),
    )
    .map((job) => `${objectId(job)} runs and reaches ${unit.label}: wait until it ends, then run again`);
};

/** Why the Secrets of a unit cannot reach its destination: a stored manifest that is missing or that this host cannot open. */
const secretBlockers = ({ resource }, environment) => {
  if (!['sops', 'shared'].includes(Underpost.namespace.secretSource({ resource, environment }))) return [];
  const held = Underpost.secret.localRecipients();
  return NAMESPACE_RESOURCES[resource].secrets.flatMap(({ id }) => {
    const path = Underpost.secret.manifestPath({ resource, id }, environment);
    if (!fs.existsSync(path)) return [`${environment} stores the Secrets of ${resource}, and ${path} does not exist`];
    return Underpost.secret.decryptable(path, held)
      ? []
      : [`${path} is sealed to Age recipients this host does not hold`];
  });
};

/**
 * Why the target nodes of a unit cannot take it: a node the cluster lacks, or no node that is Ready, not
 * cordoned and without a taint nothing tolerates.
 */
const nodeBlockers = ({ node: { targets } }, { nodes }) => {
  const members = targets.map((target) => [target, nodes.find(({ name }) => name === target)]);
  const missing = members.filter(([, node]) => !node).map(([target]) => `the cluster has no node ${target}`);
  if (missing.length || !targets.length) return missing;
  const reasons = members.map(([target, node]) => [
    ...(node.ready ? [] : [`node ${target} is not Ready`]),
    ...(node.unschedulable ? [`node ${target} is cordoned`] : []),
    ...blockingTaints(node.taints).map((taint) => `node ${target} has the taint ${taint}, which nothing tolerates`),
  ]);
  return reasons.some((reason) => !reason.length) ? [] : reasons.flat();
};

/** Why a destination runs off its node group: the nodes of each misplaced controller. */
const misplacedOf = ({ unit }, { misplaced }) =>
  misplaced.map(
    (controller) =>
      `${objectId(controller)} runs on ${controller.pods.nodes.join(', ')}, not on ${unit.node.targets.join(', ')}`,
  );

/** Creates and labels the destination namespace of a unit. */
const prepareNamespace = async ({ unit, observation, kubectl }) => {
  const live = observation.namespaces.find(({ name }) => name === unit.to);
  const steps = namespaceSteps([
    {
      namespace: unit.to,
      roles: [unit.role],
      resources: [unit.resource],
      owned: ownsNamespace(unit.role, unit.to),
      exists: Boolean(live),
      labeled: live?.owned === true,
    },
  ]);
  await applyNamespaceSteps(kubectl, steps, true);
  return steps.map(({ action, namespace }) => `${action} namespace ${namespace}`);
};

/** Restarts a consumer: republishes the routes of a group, or projects the endpoints of a workload and restarts its pods. */
const rollConsumer = async (run, { id, commands, context, controllers }) => {
  if (commands) {
    for (const command of commands) shellExec(underpost(command));
    return `publish the routes of ${id}`;
  }
  await Underpost.app.apply(context);
  for (const { kind, name, namespace } of controllers) {
    await run.kubectl(['rollout', 'restart', `${kind.toLowerCase()}/${name}`, '-n', namespace]);
    await run.kubectl(['rollout', 'status', `${kind.toLowerCase()}/${name}`, '-n', namespace, '--timeout=10m']);
  }
  return `project the endpoints of ${id} and restart it`;
};

/** The operations of a unit. Each acts on what the live cluster still holds, so a repeat deletes nothing twice. */
const OPERATIONS = {
  /**
   * Prepares the destination before anything is deleted: its namespace, the Secrets of its resource from the
   * source the environment declares, and the TLS of the hosts of its Gateways ({@link UnderpostTls.prepare}).
   */
  async prepare(run) {
    const { unit, observation, kubectl, plan: planned } = run;
    const done = await prepareNamespace(run);
    if (NAMESPACE_RESOURCES[unit.resource].secrets.length) {
      const { source } = Underpost.secret.provide({
        resource: unit.resource,
        namespace: unit.to,
        options: { env: planned.environment },
      });
      done.push(`provide the Secrets of ${unit.resource} from its ${source} source in ${unit.to}`);
    }
    done.push(
      ...(await Underpost.tls.prepare({
        kubectl,
        observation,
        hosts: [...new Set(unit.copy.map(({ name }) => name))],
        to: unit.to,
        options: { env: planned.environment },
      })),
    );
    run.update({ preparedAt: new Date().toISOString() });
    return done;
  },
  /** Deletes the source controllers and waits for their pods. */
  async delete({ unit, observation, kubectl }) {
    const done = [];
    for (const { kind, namespace, name } of cleanupOf(unit, observation).remaining.filter((object) =>
      CONTROLLERS.includes(object.kind),
    )) {
      if (kind === 'StatefulSet') await kubectl(['scale', 'statefulset', name, '-n', namespace, '--replicas=0']);
      await kubectl([
        'delete',
        kind.toLowerCase(),
        name,
        '-n',
        namespace,
        '--cascade=foreground',
        '--wait=true',
        '--timeout=10m',
        '--ignore-not-found',
      ]);
      done.push(`delete ${kind}/${namespace}/${name} and its pods`);
    }
    return done;
  },
  /** Deletes the other source objects, routes first and volumes last, and waits for each. */
  async clean({ unit, observation, kubectl }) {
    const objects = cleanupOf(unit, observation).remaining;
    for (const { kind, namespace, name } of objects)
      await kubectl([
        'delete',
        kind.toLowerCase(),
        name,
        ...(namespace ? ['-n', namespace] : []),
        '--wait=true',
        '--timeout=5m',
        '--ignore-not-found',
      ]);
    return objects.map((object) => `delete ${objectId(object)}`);
  },
  async install({ unit }) {
    for (const command of unit.install) shellExec(underpost(command));
    return unit.install.map((command) => `underpost ${command}`);
  },
  async await({ unit, kubectl }) {
    const waits = unit.destination.controllers.filter((id) => !id.startsWith('CronJob/'));
    for (const id of waits) await kubectl(['rollout', 'status', id.toLowerCase(), '-n', unit.to, '--timeout=10m']);
    return waits.map((id) => `wait for ${id} in ${unit.to}`);
  },
  async place(run) {
    run.update({ placedAt: new Date().toISOString(), rolled: [] });
    return [`place ${run.unit.label} in ${run.unit.to}: every command and endpoint reaches it there`];
  },
  async rollout(run) {
    const done = [];
    for (const consumer of consumersOf(run).filter(({ id }) => !run.state.rolled.includes(id))) {
      done.push(await rollConsumer(run, consumer));
      run.update({ rolled: [...run.state.rolled, consumer.id] });
    }
    return done;
  },
};

/** The state one step of a unit reads: the plan, the unit, its recorded state and the live cluster. */
const runOf = ({ migration, unit, observation, kubectl, access = [] }) => ({
  plan: migration.plan,
  unit,
  observation,
  kubectl,
  access,
  get state() {
    return migration.state.units[unit.id];
  },
  update(fields) {
    migration.state.units[unit.id] = { ...migration.state.units[unit.id], ...fields };
    writePrivateJson(nodePath.join(migration.directory, 'state.json'), migration.state);
  },
});

/** The status of a unit in an observation, the operation that advances it, and why it stops. */
const nextOf = (run) => {
  const { unit, observation, state, plan: planned } = run;
  const { remaining, recreated } = cleanupOf(unit, observation);
  const destination = destinationOf(run);
  const blocked = (reasons) => ({ status: 'blocked', reasons });
  if (!state.placedAt) {
    const reasons = [
      ...unit.blockers,
      ...nodeBlockers(unit, observation),
      ...secretBlockers(unit, planned.environment),
      ...run.access,
      ...consumersOf(run).flatMap((consumer) => consumer.reasons ?? []),
    ];
    if (reasons.length) return blocked(reasons);
    const named = unit.objects.map(objectId);
    const unplanned = controllersOf(unit, observation, planned.environment)
      .filter((controller) => unit.from.includes(controller.namespace) && !named.includes(objectId(controller)))
      .map(objectId);
    if (unplanned.length)
      return blocked([
        `${unplanned.join(', ')} runs in ${unit.from.join(', ')}, but plan ${planned.id} does not name it: ` +
          'capture and plan again',
      ]);
    if (recreated.length)
      return blocked([
        `${recreated.join(', ')} was created again after plan ${planned.id}: the unit deletes no object the plan ` +
          'did not observe; capture and plan again',
      ]);
    const jobs = remaining.length ? jobBlockers(unit, observation) : [];
    if (jobs.length) return blocked(jobs);
    const operation = !state.preparedAt
      ? 'prepare'
      : remaining.some(({ kind }) => CONTROLLERS.includes(kind))
        ? 'delete'
        : remaining.length
          ? 'clean'
          : !destination.installed
            ? 'install'
            : !destination.ready
              ? 'await'
              : '';
    const mounted = operation === 'clean' ? mountsOf(remaining, observation) : [];
    if (mounted.length) return blocked(mounted);
    if (operation)
      return {
        status: OPERATION_STATUS[operation],
        operation,
        reasons: operation === 'await' ? destination.unschedulable : [],
      };
    if (destination.missing.length)
      return blocked([`${unit.to} runs ${unit.label} without the Service ${destination.missing.join(', ')}`]);
    if (destination.misplaced.length) return blocked(misplacedOf(run, destination));
    return { status: OPERATION_STATUS.place, operation: 'place', reasons: [] };
  }
  if (consumersOf(run).some(({ id }) => !state.rolled.includes(id)))
    return { status: OPERATION_STATUS.rollout, operation: 'rollout', reasons: [] };
  const reasons = [
    ...(remaining.length ? [`${listOf(remaining)} remains in ${unit.from.join(', ')}`] : []),
    ...(destination.ready ? [] : [`${unit.label} is not ready in ${unit.to}`]),
    ...misplacedOf(run, destination),
  ];
  return reasons.length ? blocked(reasons) : { status: 'completed', reasons };
};

/** Places a resource in the configuration once its last unit completes. */
const placeCompleted = (migration, unit, path) => {
  const units = migration.plan.units.filter(({ resource }) => resource === unit.resource);
  if (!units.every(({ id }) => migration.state.units[id].status === 'completed')) return [];
  if (configuredOf(unit.resource, migration.plan.environment, path) === unit.to) return [];
  const backup = placeResources(path, migration.plan.environment, { [unit.resource]: unit.to });
  migration.state.configuration = clusterConfChecksum(path);
  writePrivateJson(nodePath.join(migration.directory, 'state.json'), migration.state);
  return [`place ${unit.resource} in ${unit.to}${backup ? `; the previous conf.cluster.json is ${backup}` : ''}`];
};

/**
 * Why this machine cannot ship volume data to each remote target node of a unit: the node has no record
 * with a peer, or its peer connection cannot write there ({@link UnderpostSSH.writeAccess}).
 */
const accessBlockers = async ({ node: { targets }, install }) => {
  if (!install.some((command) => SHIPS_VOLUMES.test(command))) return [];
  const reasons = [];
  for (const target of targets)
    try {
      const { via, host, port, user, keyPath } = Underpost.event.kubernetesNodeTarget(target);
      if (via !== 'local' && !(await Underpost.ssh.writeAccess({ host, port, user, keyPath })))
        reasons.push(
          `${via} refuses a command${user === 'root' ? '' : ' through sudo'}: the install cannot ship volume data ` +
            `to node ${target}`,
        );
    } catch (error) {
      reasons.push(`the install cannot reach node ${target}: ${error.message}`);
    }
  return reasons;
};

/**
 * Takes the {@link MIGRATION_LEASE} of the cluster for a plan. Its holder names the host and the plan, so the
 * same plan takes it again on the same host after an interrupted run, and any other plan is refused.
 * @returns {Promise<() => Promise<void>>} Gives the Lease back.
 */
const holdLease = async (kubectl, planId) => {
  const { name, namespace } = MIGRATION_LEASE;
  const holder = `${os.hostname()}/${planId}`;
  const holderOf = async () =>
    (
      await kubectl(['get', 'lease', name, '-n', namespace, '-o', 'jsonpath={.spec.holderIdentity}'], {
        silentOnError: true,
      })
    ).stdout.trim();
  const created = await kubectl(['create', '-f', '-'], {
    silentOnError: true,
    input: JSON.stringify({
      apiVersion: 'coordination.k8s.io/v1',
      kind: 'Lease',
      metadata: { name, namespace, labels: { 'app.kubernetes.io/managed-by': 'underpost' } },
      spec: { holderIdentity: holder, acquireTime: new Date().toISOString().replace('Z', '000Z') },
    }),
  });
  if (created.code !== 0) {
    if (!/AlreadyExists|already exists/.test(created.stderr)) throw refusal(created.stderr.trim());
    const current = await holderOf();
    if (current !== holder)
      throw refusal(
        `${current || 'another process'} holds the migration Lease ${namespace}/${name} of this cluster: wait until ` +
          `it ends; if no process runs it, remove it with kubectl delete lease ${name} -n ${namespace}`,
      );
  }
  return async () => {
    if ((await holderOf()) === holder) await kubectl(['delete', 'lease', name, '-n', namespace, '--ignore-not-found']);
  };
};

/** Advances one unit through each operation the live cluster asks for; a dry run names the next one and executes nothing. */
const advance = async ({ migration, unit, apply, observe, kubectl, path }) => {
  const done = [];
  const access = migration.state.units[unit.id].placedAt ? [] : await accessBlockers(unit);
  let run;
  let next;
  let last;
  for (;;) {
    run = runOf({ migration, unit, observation: await observe(), kubectl, access });
    next = nextOf(run);
    if (next.operation && next.operation === last)
      next.reasons.push(`${last} made no progress: check the cluster, then run again`);
    if (!next.operation || next.operation === last) break;
    if (!apply) {
      done.push(next.operation);
      break;
    }
    record(migration, unit.id, next.status, { operation: next.operation });
    try {
      const lines = await OPERATIONS[next.operation](run);
      record(migration, unit.id, next.status, { operation: next.operation, done: lines });
      done.push(...lines);
    } catch (error) {
      record(migration, unit.id, 'failed', {
        operation: next.operation,
        error: error.message,
        ...(error.stderr?.trim() ? { stderr: error.stderr.trim() } : {}),
      });
      throw error;
    }
    last = next.operation;
  }
  const cleanup = cleanupOf(unit, run.observation);
  const remaining = cleanup.remaining.map(objectId);
  if (apply) {
    record(migration, unit.id, next.status, { remaining, ...(next.reasons.length ? { checks: next.reasons } : {}) });
    if (next.status === 'completed') done.push(...placeCompleted(migration, unit, path));
  }
  return { unit, status: next.status, done, reasons: next.reasons, remaining, preserved: cleanup.preserved };
};

/**
 * Runs a migration plan. `status` and `list` read the plan and its journal offline. Otherwise each run
 * reaches the cluster of the plan through its context and refuses another cluster or a configuration
 * changed outside the plan. `preview` names the next operation of each unit; `verify` reads the status of
 * each unit from the live cluster; an apply advances `resource`, each unit in progress with `resume`, or
 * every unit in plan order, and stops at the first that does not complete. A unit that deletes persistent
 * data runs only with `confirmDestructive`.
 * @param {Object} params
 * @param {string} [params.id] - A plan id, or `latest`.
 * @param {string} [params.resource] - A unit id: `datastores/mongodb`, `workloads/<deploy-id>`, `platform`.
 * @param {'preview'|'status'|'list'|'verify'|'resume'} [params.view]
 * @param {boolean} [params.apply] - Execute the operations; a dry run otherwise.
 * @param {boolean} [params.confirmDestructive] - Accept the deletion of persistent data.
 * @param {Object} [params.options] - Command options: `env`, `dev`.
 * @param {string} [params.path] - The configuration file.
 * @returns {Promise<Object>} `plan`, `state` and `view`; for a run also `results` and `applied`.
 * @memberof UnderpostNamespaceMigration
 */
export async function migrate({
  id = 'latest',
  resource,
  view = 'preview',
  apply = false,
  confirmDestructive = false,
  path = CLUSTER_CONF_PATH,
  ...params
}) {
  const { environment } = Underpost.namespace.cluster({ ...params, path });
  const migration = readPlan({ environment, id });
  if (!migration) throw refusal(`No plan of ${environment}: run node bin namespace plan --env ${environment}`);
  if (migration.plan.schema !== PLAN_VERSION)
    throw refusal(
      `Plan ${migration.plan.id} has schema ${migration.plan.schema}; this Underpost runs schema ${PLAN_VERSION}: ` +
        `its files in ${migration.directory} stay as its record; run node bin namespace capture, then node bin namespace plan`,
    );
  if (migration.plan.integrity !== integrityOf(migration.plan))
    throw refusal(
      `Plan ${migration.plan.id} ${migration.plan.integrity ? 'changed after planning' : 'has no integrity digest'}: ` +
        `keep ${migration.directory} as a record, then run node bin namespace capture, then node bin namespace plan`,
    );
  const unit = resource && migration.plan.units.find((entry) => entry.id === resource);
  if (resource && !unit)
    throw refusal(
      `Plan ${migration.plan.id} has no unit ${resource}: ${migration.plan.units.map((entry) => entry.id).join(', ')}`,
    );
  if (['status', 'list'].includes(view)) return { ...migration, view };
  const statusOf = (entry) => migration.state.units[entry.id].status;
  const units = unit
    ? [unit]
    : migration.plan.units.filter(
        (entry) =>
          view === 'verify' ||
          (view === 'resume' ? IN_PROGRESS.includes(statusOf(entry)) : statusOf(entry) !== 'completed'),
      );
  const executing = apply && view !== 'verify';
  const destructive = units.filter((entry) => entry.destructive && statusOf(entry) !== 'completed');
  if (executing && destructive.length && !confirmDestructive)
    throw refusal(
      `${destructive.map((entry) => entry.id).join(', ')} deletes or discards data: review ` +
        `node bin namespace migrate --env ${environment}, then add --confirm-destructive`,
    );
  const { context } = migration.plan.cluster;
  const lock = executing
    ? await acquireHostLock({ name: hostLockName('namespace-migration', migration.directory), timeoutMs: 1 })
    : null;
  if (executing && !lock) throw refusal(`Another process runs plan ${migration.plan.id}: wait for it to end`);
  let releaseLease;
  try {
    const observe = async () => {
      const observation = await Underpost.namespace.observe({ ...params, path, context });
      if (observation.cluster.fingerprint !== migration.plan.cluster.fingerprint)
        throw refusal(
          `The cluster ${observation.cluster.fingerprint} is not the cluster of plan ${migration.plan.id} ` +
            `(${migration.plan.cluster.fingerprint}): check the context ${context || 'current'}`,
        );
      return observation;
    };
    const observation = await observe();
    if (clusterConfChecksum(path) !== migration.state.configuration)
      throw refusal(
        `${path} changed outside plan ${migration.plan.id}: review it, then run node bin namespace plan again`,
      );
    if (executing && context)
      Underpost.namespace.pin({
        environment: migration.plan.environment,
        context,
        source: `plan ${migration.plan.id}`,
        cluster: { fingerprint: migration.plan.cluster.fingerprint, servers: [] },
      });
    const kubectl = kubectlFactory(context, { log: executing });
    if (executing) releaseLease = await holdLease(kubectl, migration.plan.id);
    const results = [];
    for (const entry of units) {
      if (view === 'verify') {
        const next = nextOf(runOf({ migration, unit: entry, observation, kubectl }));
        const { remaining, preserved } = cleanupOf(entry, observation);
        results.push({
          unit: entry,
          status: next.status,
          done: next.operation ? [next.operation] : [],
          reasons: next.reasons,
          remaining: remaining.map(objectId),
          preserved,
        });
        continue;
      }
      const result = await advance({ migration, unit: entry, apply: executing, observe, kubectl, path });
      results.push(result);
      if (executing && result.status !== 'completed') break;
    }
    return { ...migration, view: view === 'verify' ? 'verify' : 'run', results, applied: executing };
  } finally {
    await releaseLease?.();
    lock?.release();
  }
}

/** The nodes the source pods of a unit run on. */
const observedNodes = ({ node }) => [...new Set(Object.values(node.observed).flat())].sort();

/** The nodes a unit runs on in its destination, and the node group that names them. */
const nodeTarget = ({ node }) =>
  node.targets.length
    ? `${node.targets.join(', ')}${node.group ? ` (${node.group}, ${node.mode})` : ''}`
    : 'the scheduler';

/** Where the target nodes of a unit come from: its rule, the node records of its group and their nodes. */
const nodeChainOf = ({ node }, environment) =>
  node.group
    ? [
        `   node group: ${node.group} from ${node.rule}; environments.${environment}.nodes.groups.${node.group} → ` +
          `${node.members.map((member) => `${EDGE_NODES_PATH}/${member}.json`).join(', ')} → ${node.targets.join(', ')}`,
      ]
    : [];

/** The lines of a unit in the plan: its nodes, what it deletes and keeps, how it installs, and what it restarts. */
const unitLines = (unit, { status }, environment) => [
  `${unit.id}  ${status}  ${unit.from.join(', ')} → ${unit.to}${unit.destructive ? '  destructive' : ''}`,
  `   node: ${observedNodes(unit).join(', ') || 'none'} → ${nodeTarget(unit)}`,
  ...nodeChainOf(unit, environment),
  `   delete: ${listOf(unit.objects)}`,
  ...(unit.shared.length ? [`   keep while another controller uses them: ${unit.shared.join(', ')}`] : []),
  ...(unit.lifecycle ? [`   data: ${DATA_LIFECYCLES[unit.lifecycle]}`] : []),
  ...unit.data.map((entry) => `   data: ${dataText(entry)}`),
  ...unit.schedules.map(
    ({ id, schedule, suspended }) =>
      `   schedule: ${id} "${schedule}"${suspended ? ' (suspended)' : ''}: a Job of it blocks the unit while it runs`,
  ),
  ...unit.install.map((command) => `   install: underpost ${command}`),
  ...(unit.install.length || unit.blockers.length
    ? []
    : [`   install: none; ${unit.label} start again in ${unit.to} when they next run`]),
  ...(unit.consumers.length ? [`   restart: ${unit.consumers.join(', ')}`] : []),
  ...unit.blockers.map((reason) => `   blocked: ${reason}`),
];

/** What happens to the data of a claim ({@link dataOf}), as text. */
const dataText = ({ claim, volume, reclaim, location, outcome, reason }) =>
  outcome === DATA_OUTCOMES.none
    ? `${claim} is bound to no volume: it holds no data`
    : `${claim} → PersistentVolume/${volume} (${reclaim}${location ? `, ${location}` : ''}): the claim and the volume ` +
      `objects are deleted; data ${outcome}: ${reason}`;

/** The source cleanup of a unit after a run or a verification. */
const cleanupLines = ({ unit, remaining, preserved }) => {
  const kept = unit.data.filter(({ outcome }) =>
    [DATA_OUTCOMES.reuse, DATA_OUTCOMES.retainUnattached].includes(outcome),
  );
  return [
    '  Source namespace cleanup:',
    `    Managed resources found: ${unit.objects.length}`,
    `    Managed resources remaining: ${remaining.length}${remaining.length ? ` (${remaining.join(', ')})` : ''}`,
    `    Shared resources preserved: ${preserved.length}`,
    `    Data kept on the storage backend: ${kept.length}${kept.length ? ` (${kept.map(({ location, volume }) => location || volume).join(', ')})` : ''}`,
  ];
};

/**
 * The text of a migration: the plan and its journal, the order of its units, or the result of a run.
 * @param {Object} result - {@link migrate} or {@link plan} output.
 * @returns {string}
 * @memberof UnderpostNamespaceMigration
 */
export const migrationText = ({ plan: planned, state, directory, view = 'status', results = [], applied }) => {
  const command = `node bin namespace migrate --env ${planned.environment}`;
  const footer = [
    '',
    'A unit deletes its source before it installs its destination: it is down until its destination is ready.',
    'Underpost backs up, copies and restores no data, and suspends no schedule. Before a destructive unit: back',
    'up its datastore with node bin db, stop each writer outside the cluster, and run it outside its schedules.',
    'Each data line names what the data becomes: reuse, retain-unattached (an operator reclaims or removes it),',
    'discard or unknown (the unit is blocked).',
    `Run one unit: ${command} --resource <unit> --apply; run every unit in order: ${command} --apply --confirm-destructive`,
  ];
  if (['run', 'verify'].includes(view))
    return [
      `Plan ${planned.id} · cluster ${planned.cluster.fingerprint} verified${view === 'run' && !applied ? ' · dry run' : ''}`,
      ...results.flatMap((result) => [
        ...(view === 'run' && !applied
          ? unitLines(result.unit, state.units[result.unit.id], planned.environment)
          : [`${result.unit.id}: ${result.status}`]),
        ...(result.done.length
          ? [applied ? '  Done:' : '  Next operation:', ...result.done.map((line) => `    ${line}`)]
          : []),
        ...(applied || view === 'verify' ? cleanupLines(result) : []),
        ...result.reasons.map((reason) => `  ${reason}`),
      ]),
      ...(results.length ? [] : ['No unit to run.']),
      ...(view === 'run' && !applied && results.length ? footer : []),
    ].join('\n');
  return [
    `Plan ${planned.id}${directory ? ` (${directory})` : ''}`,
    `Environment ${planned.environment} · target ${planned.target} · profile ` +
      `${planned.sections[planned.environment]?.profile || 'none'} · context ${planned.cluster.context || 'current'} · ` +
      `cluster ${planned.cluster.fingerprint} · capture ${planned.capture.id}`,
    ...(planned.warnings.length ? ['Warnings:', ...planned.warnings.map((warning) => `  ${warning}`)] : []),
    '',
    ...(planned.units.length ? [] : ['Nothing to migrate: the capture runs in the target placement.']),
    ...(view === 'list'
      ? planned.units.map(
          (unit, index) =>
            `${`${index + 1}.`.padEnd(4)}${unit.id.padEnd(36)} ${state.units[unit.id].status.padEnd(22)} ` +
            `${unit.from.join(', ')} → ${unit.to} on ${nodeTarget(unit)}${unit.destructive ? '  destructive' : ''}`,
        )
      : planned.units.flatMap((unit) => {
          const last = state.units[unit.id].history.at(-1);
          return [
            ...unitLines(unit, state.units[unit.id], planned.environment),
            ...(last
              ? [
                  `   last: ${last.at} ${last.status}${last.operation ? ` ${last.operation}` : ''}` +
                    `${last.error ? `: ${last.error}` : ''}`,
                ]
              : []),
          ];
        })),
    ...footer,
  ].join('\n');
};
