/**
 * Kubernetes placement: the context, the DNS domain, the namespace and the node group of each Underpost
 * resource, for each environment; its resolution for a command; the context pin of a process; the DNS
 * name of a Service as its consumers address it; a read-only observation of a live cluster, its
 * comparison with a placement, and the operations built on both: status, audit, capture, adoption,
 * namespace reconciliation and drift repair.
 *
 * A placement profile (`underpost.cluster.config.js`, or `engine-private/deploy/profiles` beside the
 * configuration) names a namespace per resource and a node group per category, never a machine.
 * `engine-private/deploy/conf.cluster.json` selects a profile per environment, overrides it, and lists
 * the node records of `engine-private/deploy/nodes` in each group. Each environment is independent: a key
 * its profile does not name takes the legacy profile, so nothing moves until the configuration names it.
 * A namespace never comes from a kubeconfig context. No operation of this module moves a workload: a
 * resource that runs in another namespace than its placement is a migration, which
 * {@link module:src/cli/namespace-migration.js} plans and recreates unit by unit. While a plan moves a
 * resource, the resource resolves to its source until its destination is ready.
 *
 * @module src/cli/namespace.js
 * @namespace UnderpostNamespace
 */
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import nodePath from 'node:path';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import { MONGODB_SERVICE_NAME, MONGODB_STATEFULSET_NAME } from '../db/mongo/mongoose-db.js';
import { loggerFactory } from '../server/ops/logger.js';
import { UNDERPOST_MONITORING } from '../server/ops/monitoring.js';
import { cronEnvSecretName, cronSshSecretName } from '../server/ops/cron.js';
import { readDeployRoutes } from '../server/network/router.js';
import { DEFAULT_CLUSTER_DOMAIN, serviceDnsName } from '../server/network/service-dns.js';
import { UNDERPOST_INGRESS } from '../server/network/underpost-ingress.js';
import {
  CLUSTER_CAPTURES_PATH,
  CLUSTER_CONF_PATH,
  deployEnvContentFactory,
  deployEnvFilePath,
  deployOciEnvFilePath,
  loadConfServerJson,
} from '../server/runtime/conf.js';
import {
  activeExecutionProfile,
  activeExecutionTarget,
  setExecutionTarget,
  targetIdentityRefusal,
} from '../server/build/execution.js';
import { isOciRuntime } from '../server/runtime/environment.js';
import { HOSTNAME_LABEL, podSchedulingFactory } from '../server/runtime/pod-scheduling.js';
import { volumeRecord } from '../server/runtime/storage-placement.js';
import { liveClusterOf, runCommand, shellArgumentFactory, shellExec } from '../server/runtime/process.js';
import { migrate, migrationPlacement, migrationText, plan, readPlan } from './namespace-migration.js';
import { certificateFacts, TLS_ISSUERS, TLS_POLICIES } from './tls.js';
import clusterConfig from '../../underpost.cluster.config.js';
import { EDGE_NODES_PATH, nodeIdentityFactory, readNodeConfigs, writeNodeIdentity } from './wireguard.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/** The cluster configuration Underpost ships; its `profiles` are the built-in placement profiles. */
const CLUSTER_CONFIG_FILE = 'underpost.cluster.config.js';

/** The schema version of a capture. */
const CAPTURE_VERSION = 3;

/** The field manager of every object a reconciliation, a repair or a migration changes. */
const FIELD_MANAGER = 'underpost';

const MANAGED_BY = Object.freeze({ 'app.kubernetes.io/managed-by': 'underpost' });
const ROLE_LABEL = 'underpost.net/namespace-role';
const RESOURCES_ANNOTATION = 'underpost.net/resources';

/** The namespaces Kubernetes owns: Underpost places resources there, and labels none. */
const SYSTEM_NAMESPACES = Object.freeze(['default', 'kube-system', 'kube-public', 'kube-node-lease']);

/** A DNS-1123 label: the name rule of a namespace. */
const NAME = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** A DNS-1123 subdomain: the name rule of a cluster domain. */
const DOMAIN = /^(?=.{1,253}$)[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?(\.[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?)*$/;

/** A cluster DNS name in free text: `<name>.<namespace>.svc`, a member before it, a domain after it. */
const SERVICE_REFERENCE = /\b(?:[a-z0-9](?:[-a-z0-9]*[a-z0-9])?\.){2,}svc(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*\b/g;

export const ENVIRONMENTS = Object.freeze(['production', 'development', 'test']);

/** The profile a key no other profile names falls back to: where Underpost has always placed each resource. */
const LEGACY_PROFILE = 'legacy';

/** The scheduling mode that leaves a category to the Kubernetes scheduler. */
export const SCHEDULER = 'scheduler';

/** The scheduling modes: only on the nodes of the group, those nodes first, or anywhere the scheduler chooses. */
const MODES = Object.freeze(['required', 'preferred', SCHEDULER]);

/** The plan target that names the configuration as it is; no profile takes its name. */
const CONFIGURED = 'configured';

/** The keys of a configuration section that group the namespaces of a role by resource id. */
const ROLE_GROUPS = Object.freeze({ datastores: 'datastore', addons: 'addon' });

/** The roles whose namespaces their installers create and own. Underpost owns every other. */
const UPSTREAM_ROLES = Object.freeze(['addon', 'system']);

/** The resources whose pods read the deployment environment and connect to the datastores. */
const CONSUMERS = Object.freeze(['workloads', 'releases']);

/**
 * The severity of each endpoint state in the audit and in `app apply`: an error stops the projection of
 * a Secret, a warning reports, and a correct endpoint has none.
 */
const ENDPOINT_SEVERITY = Object.freeze({
  placed: '',
  external: '',
  unknown: 'warning',
  'missing-service': 'error',
  stale: 'error',
});

/**
 * What the installer of a resource does with its data when a migration recreates it in another namespace.
 * @memberof UnderpostNamespace
 */
export const DATA_LIFECYCLES = Object.freeze({
  reset: 'its installer empties the host paths it mounts: the destination starts empty',
  reuse: 'its installer mounts the same host paths again: the destination starts with what they hold',
  fresh: 'its installer provisions new volumes: the destination starts empty',
  memory: 'it keeps its data in memory only: the data goes with its pods',
});

const resource = ({
  role,
  fixed = '',
  optional = false,
  install = '',
  workloads = [],
  services = [],
  clusterScoped = [],
  endpoints = [],
  providers = [],
  secrets = [],
  hostPathData = false,
  data = '',
  label,
}) =>
  Object.freeze({
    role,
    fixed,
    optional,
    install,
    hostPathData,
    data,
    workloads: Object.freeze(workloads),
    services: Object.freeze(services),
    clusterScoped: Object.freeze(clusterScoped),
    endpoints: Object.freeze(endpoints),
    providers: Object.freeze(providers),
    secrets: Object.freeze(secrets.map((secret) => Object.freeze(secret))),
    label,
  });

/**
 * The resources Underpost places, and the upstream ones it reads.
 *
 * - A placement profile names the namespace of every other resource. A `fixed` resource runs in the
 *   namespace its manifest names.
 * - An `optional` resource is installed on demand: its namespace is expected only while it runs.
 * - `install` is the Underpost command that installs it in the namespace of its `--namespace-<resource>`
 *   option; a migration recreates it with it. The workloads install per deployment through the deploy
 *   pipeline, and the next release Job runs where the placement names.
 * - `workloads` identify it in the cluster: `kind/name`, `kind:label=value` or `kind:label`.
 * - `services` are its Services; consumers address the first one.
 * - `clusterScoped` are the objects without a namespace it applies.
 * - `endpoints` are the environment keys, and `providers` the `conf.server.json` database providers,
 *   that address its first Service. `node bin db` backs up the data of a provider.
 * - `secrets` are the Kubernetes Secrets it consumes: a logical `id`, stable across namespaces and the key
 *   of its encrypted manifest, and the Kubernetes `name`.
 * - `hostPathData`: it keeps its data on a static host path volume without node affinity, so it runs on one
 *   node ({@link UnderpostNamespace.podScheduling}).
 * - `data`: what `install` does with the data of the resource in another namespace ({@link DATA_LIFECYCLES}).
 *   A migration of a resource without one cannot tell, so it refuses to delete its claims.
 * @memberof UnderpostNamespace
 */
export const NAMESPACE_RESOURCES = Object.freeze({
  workloads: resource({
    role: 'workload',
    workloads: ['deployment:deploy-id'],
    data: 'reuse',
    label: 'the application workloads',
  }),
  releases: resource({
    role: 'release',
    optional: true,
    workloads: ['job:app=underpost-release'],
    label: 'the release Jobs',
  }),
  platform: resource({
    role: 'platform',
    optional: true,
    install: 'cluster --gateway-api',
    workloads: ['deployment/underpost-gateway', `deployment/${UNDERPOST_INGRESS.name}`],
    services: ['underpost-gateway-service'],
    clusterScoped: ['persistentvolume/pv-underpost-gateway'],
    data: 'reuse',
    label: 'the Underpost gateway and ingress',
  }),
  operations: resource({
    role: 'operations',
    optional: true,
    install: 'cron --apply',
    workloads: ['cronjob:managed-by=underpost'],
    secrets: [
      { id: 'environment', name: cronEnvSecretName },
      { id: 'ssh-key', name: cronSshSecretName },
    ],
    label: 'the operational CronJobs',
  }),
  observability: resource({
    role: 'observability',
    optional: true,
    install: 'cluster --grafana',
    workloads: [
      ...['prometheus', 'grafana', 'alertmanager', 'blackbox'].map(
        (component) => `deployment/${UNDERPOST_MONITORING[component].name}`,
      ),
      `daemonset/${UNDERPOST_MONITORING.nodeExporter.name}`,
    ],
    services: ['prometheus', 'grafana', 'alertmanager', 'blackbox'].map(
      (component) => UNDERPOST_MONITORING[component].name,
    ),
    clusterScoped: [
      `clusterrole/${UNDERPOST_MONITORING.prometheus.name}`,
      `clusterrolebinding/${UNDERPOST_MONITORING.prometheus.name}`,
    ],
    secrets: [{ id: 'grafana-admin', name: UNDERPOST_MONITORING.grafana.adminSecretName }],
    data: 'fresh',
    label: 'the monitoring stack',
  }),
  mongodb: resource({
    role: 'datastore',
    optional: true,
    install: 'cluster --mongodb --reset-mongodb',
    workloads: [`statefulset/${MONGODB_STATEFULSET_NAME}`],
    services: [MONGODB_SERVICE_NAME],
    clusterScoped: ['storageclass/mongodb-storage-class'],
    endpoints: ['DB_HOST'],
    providers: ['mongoose'],
    secrets: [
      { id: 'credentials', name: 'mongodb-secret' },
      { id: 'keyfile', name: 'mongodb-keyfile' },
    ],
    hostPathData: true,
    data: 'reset',
    label: 'MongoDB',
  }),
  mariadb: resource({
    role: 'datastore',
    optional: true,
    install: 'cluster --mariadb',
    workloads: ['statefulset/mariadb-statefulset'],
    services: ['mariadb'],
    clusterScoped: ['storageclass/mariadb-storage-class'],
    endpoints: ['MARIADB_HOST'],
    providers: ['mariadb'],
    secrets: [{ id: 'credentials', name: 'mariadb-secret' }],
    hostPathData: true,
    data: 'fresh',
    label: 'MariaDB',
  }),
  mysql: resource({
    role: 'datastore',
    optional: true,
    install: 'cluster --mysql',
    workloads: ['statefulset/mysql'],
    services: ['mysql'],
    secrets: [{ id: 'credentials', name: 'mysql-secret' }],
    hostPathData: true,
    // No data lifecycle: manifests/mysql binds its only volume to mysql-pv-claim, not to the claim template.
    label: 'MySQL',
  }),
  postgresql: resource({
    role: 'datastore',
    optional: true,
    install: 'cluster --postgresql',
    workloads: ['statefulset/postgres'],
    services: ['postgres-service'],
    secrets: [{ id: 'credentials', name: 'postgres-secret' }],
    hostPathData: true,
    // No data lifecycle: manifests/postgresql/pv.yaml binds its volume to a claim in the namespace default only.
    label: 'PostgreSQL',
  }),
  valkey: resource({
    role: 'datastore',
    optional: true,
    install: 'cluster --valkey',
    workloads: ['statefulset/valkey-service'],
    services: ['valkey-service'],
    endpoints: ['VALKEY_HOST'],
    data: 'memory',
    label: 'Valkey',
  }),
  ipfs: resource({
    role: 'datastore',
    optional: true,
    install: 'cluster --ipfs',
    workloads: ['statefulset/ipfs-cluster'],
    services: ['ipfs-cluster'],
    clusterScoped: ['storageclass/ipfs-storage-class'],
    endpoints: ['IPFS_API_URL', 'IPFS_CLUSTER_API_URL', 'IPFS_GATEWAY_URL'],
    secrets: [{ id: 'cluster', name: 'ipfs-cluster-secret' }],
    data: 'fresh',
    label: 'IPFS Cluster',
  }),
  kafka: resource({
    role: 'datastore',
    fixed: 'kafka',
    optional: true,
    workloads: ['statefulset/kafka'],
    services: ['kafka-svc'],
    label: 'Kafka',
  }),
  contour: resource({
    role: 'addon',
    fixed: 'projectcontour',
    optional: true,
    workloads: ['deployment/contour'],
    services: ['envoy'],
    label: 'Project Contour',
  }),
  envoyGateway: resource({
    role: 'addon',
    optional: true,
    workloads: ['deployment/envoy-gateway'],
    label: 'Envoy Gateway',
  }),
  certManager: resource({
    role: 'addon',
    optional: true,
    workloads: ['deployment/cert-manager'],
    label: 'cert-manager',
  }),
  calico: resource({
    role: 'system',
    fixed: 'calico-system',
    optional: true,
    workloads: ['daemonset/calico-node'],
    label: 'Calico',
  }),
  calicoApiserver: resource({
    role: 'system',
    fixed: 'calico-apiserver',
    optional: true,
    workloads: ['deployment/calico-apiserver'],
    label: 'the Calico API server',
  }),
  tigeraOperator: resource({
    role: 'system',
    fixed: 'tigera-operator',
    optional: true,
    workloads: ['deployment/tigera-operator'],
    label: 'the Tigera operator',
  }),
  coreDns: resource({
    role: 'system',
    fixed: 'kube-system',
    workloads: ['deployment/coredns'],
    label: 'CoreDNS',
  }),
  localPathStorage: resource({
    role: 'system',
    fixed: 'local-path-storage',
    optional: true,
    workloads: ['deployment/local-path-provisioner'],
    clusterScoped: ['storageclass/local-path'],
    label: 'the Local Path Provisioner',
  }),
});

export const refusal = (message) => Object.assign(new Error(message), { expected: true });

/** The option of a resource override: `namespaceMongodb` for `--namespace-mongodb`. */
const optionKey = (id) => `namespace${id[0].toUpperCase()}${id.slice(1)}`;
export const flagOf = (id) => `--namespace-${id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
/** The shell variable of a resource namespace: `UNDERPOST_NAMESPACE_ENVOY_GATEWAY` for `envoyGateway`. */
const variableOf = (id) => `UNDERPOST_NAMESPACE_${id.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;

/** Whether Underpost owns the namespace of a resource role: neither an installer nor Kubernetes does. */
export const ownsNamespace = (role, namespace) =>
  !UPSTREAM_ROLES.includes(role) && !SYSTEM_NAMESPACES.includes(namespace);

/** Whether the configuration can place a resource: its manifest does not fix its namespace. */
const configurable = ({ fixed }) => !fixed;
/** The configuration key of a resource: its group, or its id at the top of `namespaces`. */
export const keyOf = (id) => {
  const group = Object.keys(ROLE_GROUPS).find((key) => ROLE_GROUPS[key] === NAMESPACE_RESOURCES[id].role);
  return group ? `${group}.${id}` : id;
};

/** The scheduling category of a resource: its configuration key or group; '' for one its installer places. */
const categoryOf = (id) => (UPSTREAM_ROLES.includes(NAMESPACE_RESOURCES[id].role) ? '' : keyOf(id).split('.')[0]);

/** The keys of `scheduling`: one per category of the catalog. */
const SCHEDULING = Object.freeze([...new Set(Object.keys(NAMESPACE_RESOURCES).map(categoryOf).filter(Boolean))]);

const assertName = (value, where) => {
  if (typeof value !== 'string' || !NAME.test(value))
    throw refusal(`${where} is not a Kubernetes namespace name (lowercase DNS label, at most 63 characters): ${value}`);
  return value;
};

/** A scheduling rule: a node group and its mode, or the scheduler mode alone. */
const parseRule = (rule, key) => {
  const { group, mode, ...rest } = rule ?? {};
  if (Object.keys(rest).length || !MODES.includes(mode))
    throw refusal(`${key} is not { group, mode } with a mode of ${MODES.join(', ')}`);
  if (mode === SCHEDULER) {
    if (group !== undefined) throw refusal(`${key}: the ${SCHEDULER} mode names no group`);
    return { mode };
  }
  if (typeof group !== 'string' || !NAME.test(group))
    throw refusal(`${key}.group is not a node group name (a DNS label): ${group}`);
  return { group, mode };
};

/**
 * The namespaces and the scheduling of a profile or of the overrides of an environment, validated:
 * `namespaces` holds one key per placed resource, the datastores and the addons grouped by resource id;
 * `scheduling` holds a rule per category of {@link SCHEDULING}: `{ group, mode }` with the mode
 * `required` or `preferred`, or `{ mode: 'scheduler' }`.
 * @param {Object} placement
 * @param {string} path - The file of the placement, for the messages.
 * @param {string} where - The key of the placement in the file; '' for a whole profile file.
 * @returns {{namespaces:Object<string,string>, scheduling:Object<string,Object>}} The namespaces flat by
 *   resource id.
 * @memberof UnderpostNamespace
 */
export const parsePlacement = ({ namespaces = {}, scheduling = {}, ...rest } = {}, path, where) => {
  const at = (key) => `${path}: ${where ? `${where}.` : ''}${key}`;
  if (Object.keys(rest).length)
    throw refusal(`${where ? `${path}: ${where}` : path} has unknown keys ${Object.keys(rest)}`);
  const flat = {};
  const place = (id, name, key) => {
    const definition = NAMESPACE_RESOURCES[id];
    if (!definition) throw refusal(`${at(key)} names no placed resource`);
    if (!configurable(definition)) throw refusal(`${at(key)}: ${definition.label} runs where its manifest names`);
    if (key !== `namespaces.${keyOf(id)}`)
      throw refusal(`${at(key)}: place ${definition.label} at ${where ? `${where}.` : ''}namespaces.${keyOf(id)}`);
    flat[id] = assertName(name, at(key));
  };
  for (const [key, value] of Object.entries(namespaces)) {
    if (!ROLE_GROUPS[key]) place(key, value, `namespaces.${key}`);
    else for (const [id, name] of Object.entries(value ?? {})) place(id, name, `namespaces.${key}.${id}`);
  }
  const rules = {};
  for (const [category, rule] of Object.entries(scheduling)) {
    if (!SCHEDULING.includes(category))
      throw refusal(`${at(`scheduling.${category}`)} is not a category (${SCHEDULING.join(', ')})`);
    rules[category] = parseRule(rule, at(`scheduling.${category}`));
  }
  return { namespaces: flat, scheduling: rules };
};

/** A complete placement ({@link parsePlacement}): every configurable resource and every category. */
const completePlacement = (placement, path, where) => {
  const parsed = parsePlacement(placement, path, where);
  const missing = [
    ...Object.keys(NAMESPACE_RESOURCES)
      .filter((resource) => configurable(NAMESPACE_RESOURCES[resource]) && !parsed.namespaces[resource])
      .map((resource) => `namespaces.${keyOf(resource)}`),
    ...SCHEDULING.filter((category) => !parsed.scheduling[category]).map((category) => `scheduling.${category}`),
  ];
  if (missing.length)
    throw refusal(
      `${where ? `${path}: ${where}` : path} lacks ${missing.join(', ')}: a profile places every resource and category`,
    );
  return parsed;
};

/** A custom profile file: its id is its file name, and it holds a complete placement and nothing else. */
const parseProfile = (file, id, placement) => ({ id, file, label: file, ...completePlacement(placement, file, '') });

/** The profile files of a directory; none without the directory. */
const profileFiles = (directory) =>
  fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => nodePath.join(directory, name))
    : [];

let builtins;

/** The `profiles` of {@link CLUSTER_CONFIG_FILE}, validated, each with the label its sources name. */
const builtinProfiles = () => {
  if (builtins) return builtins;
  builtins = Object.fromEntries(
    Object.entries(clusterConfig.profiles).map(([id, placement]) => [
      id,
      {
        id,
        file: CLUSTER_CONFIG_FILE,
        label: `the ${id} profile`,
        ...completePlacement(placement, CLUSTER_CONFIG_FILE, `profiles.${id}`),
      },
    ]),
  );
  return builtins;
};

/**
 * A built-in profile.
 * @param {string} id
 * @returns {{id:string, file:string, label:string, namespaces:Object<string,string>, scheduling:Object<string,Object>}}
 * @throws {Error} On an id Underpost does not ship.
 * @memberof UnderpostNamespace
 */
export const builtinProfile = (id) => {
  const profile = builtinProfiles()[id];
  if (!profile) throw refusal(`${id} is not a built-in profile: ${Object.keys(builtinProfiles()).join(', ')}`);
  return profile;
};

/** The directory of the custom profiles of a configuration: `profiles` beside it. */
export const profilesDirectory = (path) => nodePath.join(nodePath.dirname(path), 'profiles');

/**
 * Every profile a configuration can select: the built-in ones, and the custom ones of
 * {@link profilesDirectory}. A custom profile with the id of a built-in one refuses.
 * @param {string} path - The configuration file.
 * @returns {Object<string,Object>} By id.
 * @memberof UnderpostNamespace
 */
export const profilesOf = (path) => {
  const custom = Object.fromEntries(
    profileFiles(profilesDirectory(path)).map((file) => {
      const id = nodePath.basename(file, '.json');
      return [id, parseProfile(file, id, fs.readJsonSync(file))];
    }),
  );
  for (const { id, file } of Object.values(custom))
    if (builtinProfiles()[id])
      throw refusal(`${file}: ${id} is a built-in profile; give the custom profile another id`);
  return { ...builtinProfiles(), ...custom };
};

/**
 * Reads and validates the cluster configuration ({@link parseClusterConf}): the section of each environment.
 * @param {string} [path]
 * @returns {Object<string, Object>} By environment, its context, cluster domain, profile and node groups,
 *   the namespace of each resource id and the rule of each category after its overrides, and the
 *   configuration key of each value; empty without a file.
 * @memberof UnderpostNamespace
 */
export function readClusterConf(path = CLUSTER_CONF_PATH) {
  return clusterConf(path).sections;
}

/** The parsed configuration of each file, kept while it and its custom profiles stay as they were. */
const parsed = new Map();

/** The profiles and the sections of a configuration file: every profile and no section without a file. */
const clusterConf = (path = CLUSTER_CONF_PATH) => {
  const state = [path, ...profileFiles(profilesDirectory(path))]
    .map((file) => {
      if (!fs.existsSync(file)) return '-';
      const { ino, size, mtimeMs } = fs.statSync(file);
      return `${ino}:${size}:${mtimeMs}`;
    })
    .join('|');
  const cached = parsed.get(path);
  if (cached?.state === state) return cached.conf;
  const conf = fs.existsSync(path)
    ? parseClusterConf(path, fs.readJsonSync(path))
    : { profiles: profilesOf(path), sections: {} };
  parsed.set(path, { state, conf });
  return conf;
};

/** The node groups of an environment: each group a list of distinct node record ids. */
const parseGroups = ({ groups = {}, ...rest } = {}, path, where) => {
  if (Object.keys(rest).length) throw refusal(`${path}: ${where} has unknown keys ${Object.keys(rest)}`);
  for (const [group, members] of Object.entries(groups)) {
    const key = `${path}: ${where}.groups.${group}`;
    if (!NAME.test(group)) throw refusal(`${key} is not a node group name (a DNS label)`);
    if (
      !Array.isArray(members) ||
      members.some((member) => typeof member !== 'string' || !member) ||
      new Set(members).size !== members.length
    )
      throw refusal(`${key} is not a list of distinct node record ids`);
  }
  return structuredClone(groups);
};

/**
 * The source of the Secrets of each resource in an environment. `sops` applies the encrypted manifests of
 * the environment, `shared` those every environment shares, `seed` projects the origin seed files, and
 * `unmanaged` leaves the Secrets as the cluster holds them. A resource the section does not name seeds.
 */
export const SECRET_SOURCES = Object.freeze(['sops', 'shared', 'seed', 'unmanaged']);
const DEFAULT_SECRET_SOURCE = 'seed';

/**
 * How an environment terminates TLS. `cert-manager` issues each certificate from an ACME ClusterIssuer,
 * `self-signed` issues one this machine trusts, and `none` serves HTTP only.
 */
export const TLS_MODES = Object.freeze(['cert-manager', 'self-signed', 'none']);

/** The TLS policy a new configuration names for each environment. */
const TEMPLATE_TLS = Object.freeze({
  production: { mode: 'cert-manager', issuer: 'letsencrypt-prod' },
  development: { mode: 'self-signed' },
  test: { mode: 'self-signed' },
});

/** The routing providers: the Gateway API through Envoy Gateway, or Contour HTTPProxies. */
export const ROUTING_PROVIDERS = Object.freeze(['gateway-api', 'contour']);

/** The TLS policy of an environment: `{mode}`, and `issuer` (a ClusterIssuer Underpost ships) in the cert-manager mode. */
const parseTls = (tls, path, where) => {
  if (tls === undefined || tls === null) return null;
  if (typeof tls !== 'object' || Array.isArray(tls))
    throw refusal(`${path}: ${where} is not a TLS policy: ${TLS_POLICIES}`);
  const { mode, issuer, ...rest } = tls;
  if (Object.keys(rest).length) throw refusal(`${path}: ${where} has unknown keys ${Object.keys(rest)}`);
  if (!TLS_MODES.includes(mode))
    throw refusal(
      `${path}: ${where}.mode ${mode === undefined ? 'is missing' : `is not a TLS mode: ${mode}`} (${TLS_MODES.join(', ')})`,
    );
  if (mode !== 'cert-manager') {
    if (issuer !== undefined) throw refusal(`${path}: ${where}.issuer applies to the cert-manager mode only`);
    return { mode };
  }
  if (!TLS_ISSUERS.includes(issuer))
    throw refusal(
      `${path}: ${where}.issuer ${issuer === undefined ? 'is missing' : `is not a ClusterIssuer Underpost ships: ${issuer}`} ` +
        `(${TLS_ISSUERS.join(', ')})`,
    );
  return { mode, issuer };
};

/** The routing of an environment: `{provider}`, one of {@link ROUTING_PROVIDERS}. */
const parseRouting = (routing, path, where) => {
  if (routing === undefined || routing === null) return null;
  const { provider, ...rest } = routing && typeof routing === 'object' && !Array.isArray(routing) ? routing : {};
  if (Object.keys(rest).length) throw refusal(`${path}: ${where} has unknown keys ${Object.keys(rest)}`);
  if (!ROUTING_PROVIDERS.includes(provider))
    throw refusal(
      `${path}: ${where}.provider ${provider === undefined ? 'is missing' : `is not a routing provider: ${provider}`} ` +
        `(${ROUTING_PROVIDERS.join(', ')})`,
    );
  return { provider };
};

/** The UID of the `kube-system` namespace: the identity of a cluster. */
const FINGERPRINT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The cluster an environment must reach: the `fingerprint` (the UID of `kube-system`) and, when every client
 * reaches it through known endpoints, the API `servers`.
 */
const parseIdentity = (cluster, path, where) => {
  if (cluster === undefined || cluster === null) return null;
  const {
    fingerprint,
    servers = [],
    ...rest
  } = cluster && typeof cluster === 'object' && !Array.isArray(cluster) ? cluster : {};
  if (Object.keys(rest).length) throw refusal(`${path}: ${where} has unknown keys ${Object.keys(rest)}`);
  if (!FINGERPRINT.test(`${fingerprint ?? ''}`))
    throw refusal(
      `${path}: ${where}.fingerprint ${fingerprint === undefined ? 'is missing' : 'is not a UID'}: ` +
        'the UID of the kube-system namespace (node bin namespace target --env <env> prints it)',
    );
  if (!Array.isArray(servers) || servers.some((server) => !/^https:\/\/\S+$/.test(`${server}`)))
    throw refusal(`${path}: ${where}.servers is not a list of https API server URLs`);
  return { fingerprint, servers: [...servers] };
};

/** The secret sources of an environment: each key a resource with Secrets, each value a source. */
const parseSecretSources = (sources, path, where) => {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources))
    throw refusal(`${path}: ${where} is not a map of resource to secret source`);
  for (const [id, source] of Object.entries(sources)) {
    if (!NAMESPACE_RESOURCES[id]?.secrets.length)
      throw refusal(
        `${path}: ${where}.${id} is not a resource with Secrets ` +
          `(${Object.keys(NAMESPACE_RESOURCES).filter((key) => NAMESPACE_RESOURCES[key].secrets.length)})`,
      );
    if (!SECRET_SOURCES.includes(source))
      throw refusal(`${path}: ${where}.${id} is not a secret source: ${source} (${SECRET_SOURCES.join(', ')})`);
  }
  return { ...sources };
};

/**
 * Validates a cluster configuration. Each section of `environments` holds `context`,
 * `clusterDomain`, `profile` (an id of {@link profilesOf}), `nodes.groups` (the node records of
 * `engine-private/deploy/nodes` in each node group), `overrides` (a placement over its profile), `secrets`
 * (the {@link SECRET_SOURCES} of its resources), `routing` (`{provider}`, one of {@link ROUTING_PROVIDERS}) and
 * `tls` (`{mode}` of {@link TLS_MODES}, with the `issuer` of the cert-manager mode) and `cluster` (the
 * `fingerprint` and the API `servers` of the cluster it reaches). Only `profile` is required here. `null`, or
 * no key, leaves `context`, `cluster`, `routing` or `tls` not configured; any other value must be valid, and an
 * empty string is not a value. The cluster target refuses a command in an environment without a context, and a
 * change without `routing`, `tls`, or, in production, `cluster` ({@link UnderpostNamespace.target}).
 * @param {string} path - Where it comes from, for the messages.
 * @param {Object} conf
 * @param {Object<string,Object>} [profiles] - The profiles it can select.
 * @returns {{profiles:Object<string,Object>, sections:Object<string,Object>}}
 * @throws {Error} On an unknown key, profile, environment, category or resource, or an
 *   invalid name.
 * @memberof UnderpostNamespace
 */
export function parseClusterConf(path, conf, profiles = profilesOf(path)) {
  const { environments = {}, ...unknown } = conf ?? {};
  if (Object.keys(unknown).length)
    throw refusal(
      `${path} has unknown keys ${Object.keys(unknown)}` +
        `${'profiles' in unknown ? `: a custom profile is a file of ${profilesDirectory(path)}` : ''}`,
    );
  const sections = {};
  for (const [environment, section] of Object.entries(environments)) {
    if (!ENVIRONMENTS.includes(environment))
      throw refusal(`${path}: ${environment} is not an environment (${ENVIRONMENTS.join(', ')})`);
    const where = `environments.${environment}`;
    const {
      context = null,
      clusterDomain = DEFAULT_CLUSTER_DOMAIN,
      profile,
      nodes = {},
      overrides = {},
      secrets = {},
      routing,
      tls,
      cluster,
      ...rest
    } = section ?? {};
    if (Object.keys(rest).length) throw refusal(`${path}: ${where} has unknown keys ${Object.keys(rest)}`);
    if (context !== null && (typeof context !== 'string' || !context || /\s/.test(context)))
      throw refusal(
        `${path}: ${where}.context ${context === '' ? 'is empty' : 'is not a kubeconfig context name'}: ` +
          'name the context of its cluster, or write null while the environment has none',
      );
    if (typeof clusterDomain !== 'string' || !DOMAIN.test(clusterDomain))
      throw refusal(`${path}: ${where}.clusterDomain is not a DNS domain: ${clusterDomain}`);
    if (!profiles[profile])
      throw refusal(
        `${path}: ${where}.profile ${profile === undefined ? 'is missing' : `names no profile: ${profile}`} ` +
          `(${Object.keys(profiles).join(', ')})`,
      );
    sections[environment] = sectionFactory({
      environment,
      context: context ?? '',
      clusterDomain,
      profile: profiles[profile],
      groups: parseGroups(nodes, path, `${where}.nodes`),
      overrides: parsePlacement(overrides, path, `${where}.overrides`),
      secrets: parseSecretSources(secrets, path, `${where}.secrets`),
      routing: parseRouting(routing, path, `${where}.routing`),
      tls: parseTls(tls, path, `${where}.tls`),
      cluster: parseIdentity(cluster, path, `${where}.cluster`),
    });
  }
  return { profiles, sections };
}

/** The section of an environment: its profile under its overrides, with the configuration key of each value. */
const sectionFactory = ({
  environment,
  context,
  clusterDomain,
  profile,
  groups,
  overrides,
  secrets = {},
  routing = null,
  tls = null,
  cluster = null,
}) => {
  const merged = (field, keyFactory) => {
    const values = { ...profile[field], ...overrides[field] };
    const sources = Object.fromEntries(
      Object.keys(values).map((key) => [
        key,
        key in overrides[field]
          ? `environments.${environment}.overrides.${field}.${keyFactory(key)}`
          : `${profile.label}: ${field}.${keyFactory(key)}`,
      ]),
    );
    return { values, sources };
  };
  const namespaces = merged('namespaces', keyOf);
  const scheduling = merged('scheduling', (category) => category);
  return {
    context,
    clusterDomain,
    profile: profile.id,
    groups,
    overrides,
    secrets,
    routing,
    tls,
    cluster,
    namespaces: namespaces.values,
    scheduling: scheduling.values,
    sources: { namespaces: namespaces.sources, scheduling: scheduling.sources },
  };
};

/** The section of an environment: its configuration, else the legacy profile without a context. */
const sectionOf = (sections, environment) =>
  sections[environment] ??
  sectionFactory({
    environment,
    context: '',
    clusterDomain: DEFAULT_CLUSTER_DOMAIN,
    profile: builtinProfile(LEGACY_PROFILE),
    groups: {},
    overrides: { namespaces: {}, scheduling: {} },
  });

/**
 * The node groups of an environment against the node registry, and against the live nodes when they are
 * known: each member with its record, its Kubernetes node and its state, and the findings.
 * @param {{environment:string, section:Object, records:Object[], live?:Object[]|null}} params
 * @returns {{groups:Array<{group:string, members:Object[]}>, findings:Object[]}}
 * @memberof UnderpostNamespace
 */
export const groupFindings = ({ environment, section, records, live = null }) => {
  const findings = [];
  const used = new Set(Object.values(section.scheduling).flatMap(({ group }) => (group ? [group] : [])));
  const groups = [...new Set([...Object.keys(section.groups), ...used])].map((group) => {
    const members = section.groups[group] ?? [];
    if (!members.length && used.has(group))
      findings.push(
        finding(
          'error',
          'group-empty',
          `environments.${environment}.nodes.groups.${group} has no member: list its node records there`,
        ),
      );
    return {
      group,
      members: members.map((member) => {
        const record = records.find(({ nodeName }) => nodeName === member);
        const node = record?.kubernetesNodeName ?? '';
        const observed = node && live?.find(({ name }) => name === node);
        const state = !record
          ? 'no record'
          : !node
            ? 'no node'
            : !live
              ? 'unknown'
              : !observed
                ? 'missing'
                : nodeState(observed);
        if (!record) findings.push(finding('error', 'record-missing', `${recordFile(member)} does not exist`));
        else if (!node)
          findings.push(
            finding(
              'error',
              'node-unnamed',
              `${recordFile(member)} names no Kubernetes node: ${identifyCommand(member)}`,
            ),
          );
        else if (state === 'missing')
          findings.push(
            finding('error', 'node-missing', `the cluster has no node ${node}, which ${recordFile(member)} names`),
          );
        else if (!['Ready', 'unknown'].includes(state))
          findings.push(finding('warning', 'node-not-ready', `node ${node} of the group ${group} is ${state}`));
        return { record: member, kubernetesNode: node, state, ...(record ? { peerId: record.peerId } : {}) };
      }),
    };
  });
  for (const [node, owners] of Map.groupBy(
    records.filter(({ kubernetesNodeName }) => kubernetesNodeName),
    ({ kubernetesNodeName }) => kubernetesNodeName,
  ))
    if (owners.length > 1)
      findings.push(
        finding(
          'error',
          'node-duplicate',
          `${owners.map(({ nodeName }) => nodeName).join(' and ')} name one node: ${node}`,
        ),
      );
  return { groups, findings };
};

/** The `namespaces` of a configuration section from the namespace of each resource id. */
export const sectionNamespaces = (flat) => {
  const namespaces = {};
  for (const [id, name] of Object.entries(flat)) {
    const [group, key] = keyOf(id).includes('.') ? keyOf(id).split('.') : ['', id];
    if (group) namespaces[group] = { ...namespaces[group], [key]: name };
    else namespaces[key] = name;
  }
  return namespaces;
};

/**
 * The environment of a command: the one it names, its `--env`, else `--dev` or production.
 * @throws {Error} On `--dev` with another `--env`.
 */
export const environmentOf = ({ environment, options = {} }) => {
  if (options.dev && options.env && options.env !== 'development')
    throw refusal(`--dev names the development environment, and --env names ${options.env}: give one of them`);
  return environment || options.env || (options.dev ? 'development' : 'production');
};

/** The Kubernetes distributions a command can name. */
export const CLUSTER_RUNTIMES = Object.freeze(['kind', 'kubeadm', 'k3s']);

/**
 * The Kubernetes distribution a command names with `--kind`, `--kubeadm` or `--k3s`; '' when it names none.
 * @throws {Error} When it names more than one.
 */
export const runtimeOf = (options = {}) => {
  const named = CLUSTER_RUNTIMES.filter((runtime) => options[runtime] === true);
  if (named.length > 1) throw refusal(`--${named.join(' and --')} name two Kubernetes distributions: give one`);
  return named[0] ?? '';
};

/** The directory of the context pins of this user. */
const pinDirectory = () => nodePath.join(os.tmpdir(), `underpost-kubecontext-${process.getuid()}`);

/** The kubeconfig files kubectl reads in this process, without a context pin. */
const kubeconfigFiles = () => {
  const files = `${process.env.KUBECONFIG ?? ''}`
    .split(nodePath.delimiter)
    .filter((file) => file && nodePath.dirname(file) !== pinDirectory());
  return files.length ? files : [nodePath.join(os.homedir(), '.kube', 'config')];
};

/**
 * A kubeconfig that holds only `current-context`. Listed first in `KUBECONFIG`, it sets the current
 * context of the merged configuration and leaves every kubeconfig file as it is.
 */
const pinFile = (context) => {
  const directory = pinDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)
    throw refusal(`${directory} is not a private directory of this user: remove it`);
  const file = nodePath.join(
    directory,
    `${crypto.createHash('sha256').update(context).digest('hex').slice(0, 16)}.json`,
  );
  const staged = `${file}.${process.pid}`;
  fs.writeFileSync(staged, JSON.stringify({ apiVersion: 'v1', kind: 'Config', 'current-context': context }), {
    mode: 0o600,
  });
  fs.renameSync(staged, file);
  return file;
};

/** The `KUBECONFIG` that reaches a context: its pin ahead of the kubeconfig files of this process. */
const kubeconfigOf = (context) => [pinFile(context), ...kubeconfigFiles()].join(nodePath.delimiter);

/** The nodes of the cluster as kubectl prints them; none when the cluster does not answer. */
const liveNodeObjects = () => {
  const stdout = `${
    shellExec('kubectl get nodes -o json', { stdout: true, silent: true, silentOnError: true, disableLog: true }) || ''
  }`.trim();
  return stdout.startsWith('{') ? (JSON.parse(stdout).items ?? []) : [];
};

/** The command that records the Kubernetes node of a node record. */
const identifyCommand = (record, node = '<node>') =>
  `node bin namespace nodes identify ${record} --kubernetes-node ${node}`;

/**
 * The Kubernetes nodes the records of a node group name, in order. A record that does not exist, that
 * names no Kubernetes node, or whose node another record also names refuses.
 */
const kubernetesNodesOf = (members) => {
  const records = readNodeConfigs();
  return [
    ...new Set(
      members.map((member) => {
        const record = records.find(({ nodeName }) => nodeName === member);
        if (!record) throw refusal(`${EDGE_NODES_PATH}/${member}.json does not exist`);
        if (!record.kubernetesNodeName)
          throw refusal(`${EDGE_NODES_PATH}/${member}.json names no Kubernetes node: ${identifyCommand(member)}`);
        const owners = records.filter(({ kubernetesNodeName }) => kubernetesNodeName === record.kubernetesNodeName);
        if (owners.length > 1)
          throw refusal(
            `${owners.map(({ nodeName }) => nodeName).join(' and ')} name one Kubernetes node: ${record.kubernetesNodeName}`,
          );
        return record.kubernetesNodeName;
      }),
    ),
  ];
};

/**
 * An endpoint value split around its hosts: the scheme and the credential before them, the path and the
 * query after them. Each host keeps its port.
 */
const endpointParts = (value) => {
  const [, prefix, list, suffix] = /^((?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/]*@)?)([^/?#]*)(.*)$/i.exec(`${value}`);
  return {
    prefix,
    suffix,
    hosts: list
      .split(',')
      .map((member) => member.trim())
      .filter(Boolean)
      .map((member) => {
        const [, host, port = ''] = /^(.*?)(:\d+)?$/.exec(member);
        return { host: host.toLowerCase(), port };
      }),
  };
};

/**
 * What a host names: `external`, `unknown`, or a Service of the placement (`service`, `member`) in a
 * namespace (`namespace`, '' for a short name), and whether the name is in the domain of the cluster.
 */
const hostTarget = (host, { services, clusterDomain }) => {
  if (net.isIP(host) || host === 'localhost') return { kind: 'unknown' };
  const labels = host.split('.');
  const at = labels.findIndex((label, index) => index < 2 && services.includes(label));
  if (at < 0)
    return {
      kind:
        labels.length === 1 || labels.includes('svc') || host.endsWith(`.${clusterDomain}`) ? 'unknown' : 'external',
    };
  const [namespace = '', svc, ...domain] = labels.slice(at + 1);
  if (svc !== undefined && svc !== 'svc') return { kind: 'external' };
  return {
    kind: 'service',
    service: labels[at],
    member: at ? labels[0] : '',
    namespace,
    inDomain: !domain.length || domain.join('.') === clusterDomain,
  };
};

/** The fully qualified name of a Service host in the namespace of its placement. */
const placedHost = ({ service, member }, { namespace, clusterDomain }) =>
  serviceDnsName({ service, member, namespace, clusterDomain });

/**
 * The effective value of an endpoint: each host that names the Service of its placement becomes its
 * fully qualified name in the namespace of the placement. Everything else stays as it is.
 */
const effectiveValue = (value, placement) => {
  const { prefix, hosts, suffix } = endpointParts(value);
  const resolved = hosts.map(({ host, port }) => {
    const target = hostTarget(host, placement);
    return { host, port, target, effective: target.kind === 'service' ? placedHost(target, placement) : host };
  });
  return {
    hosts: resolved,
    value: resolved.some(({ host, effective }) => host !== effective)
      ? `${prefix}${resolved.map(({ effective, port }) => `${effective}${port}`).join(',')}${suffix}`
      : `${value}`,
  };
};

/** Whether a controller is a workload of a resource: `kind/name`, `kind:label=value` or `kind:label`. */
const matches = (workload, { kind, labels = {}, name }) => {
  const [type, rest] = workload.split(/[/:]/);
  if (kind.toLowerCase() !== type) return false;
  if (workload.includes('/')) return name === rest;
  const [label, value] = rest.split('=');
  return value === undefined ? label in labels : labels[label] === value;
};

/** Where each workload of a resource runs, and the CronJobs that run active in more than one namespace. */
export const placementOf = (id, controllers) => {
  const owned = controllers.filter((controller) =>
    NAMESPACE_RESOURCES[id].workloads.some((workload) => matches(workload, controller)),
  );
  const byName = Map.groupBy(
    owned.filter(({ kind, suspended }) => kind === 'CronJob' && !suspended),
    ({ name }) => `CronJob/${name}`,
  );
  return {
    namespaces: [...new Set(owned.map(({ namespace }) => namespace))].sort(),
    controllers: owned.map(({ kind, namespace, name, suspended }) => ({ kind, namespace, name, suspended })),
    duplicates: [...byName]
      .filter(([, copies]) => copies.length > 1)
      .map(([controller, copies]) => ({ controller, namespaces: copies.map(({ namespace }) => namespace).sort() })),
  };
};

/**
 * The state of a resource against its placement: `fixed` or `not-deployed`; `duplicate` when a CronJob
 * runs active in more than one namespace, so its schedule runs twice; else `placed`,
 * `destination-prepared` (it runs in its placement and elsewhere) or `pending-migration`.
 */
const resourceState = (definition, target, observed) => {
  if (!observed.namespaces.length) return 'not-deployed';
  if (!configurable(definition)) return 'fixed';
  if (observed.duplicates.length) return 'duplicate';
  if (observed.namespaces.length === 1 && observed.namespaces[0] === target) return 'placed';
  return observed.namespaces.includes(target) ? 'destination-prepared' : 'pending-migration';
};

/** {@link UnderpostNamespace.schedule}, with the message of a configuration it refuses in place of nodes. */
const scheduleOf = (params) => {
  try {
    return { ...UnderpostNamespace.API.schedule(params), error: '' };
  } catch (error) {
    if (!error.expected) throw error;
    return { resource: params.resource, group: '', mode: '', members: [], nodes: [], source: '', error: error.message };
  }
};

/**
 * Where the pods of a resource run against its scheduling: the nodes they use, the target nodes the cluster
 * lacks, and one state: `placed`; `node-mismatch` when a pod of a required group runs off it; `unbound`
 * when the configuration gives a group no node; `node-missing` when the cluster lacks a node of the group;
 * `node-not-ready` when no node of the group is Ready; `scheduler-pending` when the scheduler cannot place
 * a pod; `daemonset` when only a DaemonSet runs it, which places a pod on every eligible node; null where
 * the scheduler places the pods, or nothing runs.
 */
const nodePlacement = ({ targets, mode, error, controllers, nodes }) => {
  const scheduled = controllers.filter(({ kind }) => kind !== 'DaemonSet');
  const observed = [...new Set(scheduled.flatMap(({ pods }) => pods.nodes))].sort();
  const members = targets.map((name) => nodes.find((node) => node.name === name));
  const missing = targets.filter((name, index) => !members[index]);
  const state =
    !controllers.length || (scheduled.length && !targets.length && !error)
      ? null
      : !scheduled.length
        ? 'daemonset'
        : error
          ? 'unbound'
          : missing.length
            ? 'node-missing'
            : !members.some(({ ready }) => ready)
              ? 'node-not-ready'
              : scheduled.some(({ pods }) => pods.unschedulable.length)
                ? 'scheduler-pending'
                : mode === 'required' && observed.some((name) => !targets.includes(name))
                  ? 'node-mismatch'
                  : 'placed';
  return { observed, missing, state };
};

/** The node states that keep the pods of a resource from running, and what each means. */
const NODE_BLOCKERS = Object.freeze({
  unbound: ({ message }) => message,
  'node-missing': ({ group, missing }) =>
    `the cluster has no node ${missing.join(', ')}, which ${group ? `the node group ${group}` : 'an option'} names`,
  'node-not-ready': ({ targets }) => `no node of ${targets.join(', ')} is Ready`,
  'scheduler-pending': ({ targets }) => `the scheduler cannot place a pod on ${targets.join(', ')}`,
});

/** A record of a namespaced object: its kind, namespace and name. */
const objectOf = ({ kind, metadata }) => ({
  kind,
  namespace: metadata.namespace,
  name: metadata.name,
  uid: metadata.uid ?? '',
});
/** The deploy id of a workload: its `deploy-id` label without the environment. */
export const baseOf = (label, environment) =>
  label.endsWith(`-${environment}`) ? label.slice(0, -environment.length - 1) : label;

/** The deployment of the route table that owns a deploy id: itself, or the parent of an instance. */
export const ownerOf = (base, routes) =>
  routes.includes(base)
    ? base
    : (routes.filter((route) => base.startsWith(`${route}-`)).sort((a, b) => b.length - a.length)[0] ?? '');

export const objectId = ({ kind, namespace, name }) => `${kind}/${namespace ? `${namespace}/` : ''}${name}`;

/** The cluster DNS names a text holds. */
const serviceReferences = (text) => [...new Set(`${text ?? ''}`.toLowerCase().match(SERVICE_REFERENCE) ?? [])];

/** The record a capture keeps of a controller: identity, state, references, and the cluster names its env holds. */
const controllerRecord = (item) => {
  const template = item.spec?.jobTemplate?.spec?.template ?? item.spec?.template ?? {};
  const pod = template.spec ?? {};
  const containers = [...(pod.initContainers ?? []), ...(pod.containers ?? [])];
  const volumes = pod.volumes ?? [];
  const collect = (values) => [...new Set(values.filter(Boolean))].sort();
  return {
    ...objectOf(item),
    labels: item.metadata.labels ?? {},
    templateLabels: template.metadata?.labels ?? {},
    replicas: item.spec?.replicas ?? null,
    ready: item.status?.readyReplicas ?? item.status?.numberReady ?? null,
    suspended: item.kind === 'CronJob' ? item.spec?.suspend === true : false,
    active: item.kind === 'Job' ? (item.status?.active ?? 0) : 0,
    schedule: item.spec?.schedule ?? '',
    lastSuccess: item.status?.lastSuccessfulTime ?? '',
    node: (
      pod.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms?.[0]
        ?.matchExpressions?.[0]?.values ?? [pod.nodeSelector?.[HOSTNAME_LABEL] ?? pod.nodeName ?? '']
    ).join(', '),
    image: pod.containers?.[0]?.image ?? '',
    hostNetwork: pod.hostNetwork === true,
    hostPorts: containers
      .flatMap((container) => (container.ports ?? []).map(({ hostPort }) => hostPort))
      .filter(Boolean),
    serviceAccount: pod.serviceAccountName ?? 'default',
    secrets: collect([
      ...volumes.map((volume) => volume.secret?.secretName),
      ...volumes.flatMap((volume) => volume.projected?.sources?.map((source) => source.secret?.name) ?? []),
      ...(pod.imagePullSecrets ?? []).map(({ name }) => name),
      ...containers.flatMap((container) => [
        ...(container.envFrom ?? []).map((source) => source.secretRef?.name),
        ...(container.env ?? []).map((entry) => entry.valueFrom?.secretKeyRef?.name),
      ]),
    ]),
    configMaps: collect([
      ...volumes.map((volume) => volume.configMap?.name),
      ...volumes.flatMap((volume) => volume.projected?.sources?.map((source) => source.configMap?.name) ?? []),
      ...containers.flatMap((container) => [
        ...(container.envFrom ?? []).map((source) => source.configMapRef?.name),
        ...(container.env ?? []).map((entry) => entry.valueFrom?.configMapKeyRef?.name),
      ]),
    ]),
    claims: collect(volumes.map((volume) => volume.persistentVolumeClaim?.claimName)),
    claimTemplates: collect((item.spec?.volumeClaimTemplates ?? []).map(({ metadata }) => metadata?.name)),
    hosts: containers.flatMap((container) =>
      (container.env ?? []).flatMap((entry) =>
        serviceReferences(entry.value).map((host) => ({ field: `env.${entry.name}`, host })),
      ),
    ),
  };
};

/** The record a capture keeps of a node: its readiness, roles, taints and whether it takes new pods. */
const nodeRecord = ({ metadata, spec, status }) => ({
  name: metadata.name,
  ready: (status?.conditions ?? []).some(({ type, status: value }) => type === 'Ready' && value === 'True'),
  roles: Object.keys(metadata.labels ?? {})
    .filter((label) => label.startsWith('node-role.kubernetes.io/'))
    .map((label) => label.split('/')[1]),
  taints: (spec?.taints ?? []).map(({ key, value = '', effect }) => ({ key, value, effect })),
  unschedulable: spec?.unschedulable === true,
});

/** What a capture needs of a pod: its namespace and labels, its node, and why the scheduler cannot place it. */
const podRecord = ({ metadata, spec, status }) => ({
  namespace: metadata.namespace,
  name: metadata.name,
  labels: metadata.labels ?? {},
  node: spec?.nodeName ?? '',
  claims: (spec?.volumes ?? []).map((volume) => volume.persistentVolumeClaim?.claimName).filter(Boolean),
  unschedulable:
    (status?.conditions ?? []).find(({ type, status: value }) => type === 'PodScheduled' && value === 'False')
      ?.message ?? '',
});

/** The nodes the pods of a controller run on, and the messages of the ones the scheduler cannot place. */
const podsOf = ({ namespace, templateLabels }, pods) => {
  const own = Object.keys(templateLabels).length
    ? pods.filter(
        (pod) =>
          pod.namespace === namespace &&
          Object.entries(templateLabels).every(([key, value]) => pod.labels[key] === value),
      )
    : [];
  return {
    nodes: [...new Set(own.map(({ node }) => node).filter(Boolean))].sort(),
    unschedulable: [...new Set(own.map(({ unschedulable }) => unschedulable).filter(Boolean))],
  };
};

/** The objects a capture reads in every namespace, with the record it keeps of each. */
const NAMESPACED_READS = Object.freeze({
  controllers: { kinds: 'deployments,statefulsets,daemonsets,cronjobs,jobs', record: controllerRecord },
  services: {
    kinds: 'services',
    record: (item) => ({
      ...objectOf(item),
      headless: item.spec?.clusterIP === 'None',
      selector: item.spec?.selector ?? {},
      ports: (item.spec?.ports ?? []).map(({ port }) => port),
    }),
  },
  claims: {
    kinds: 'persistentvolumeclaims',
    record: (item) => ({
      ...objectOf(item),
      storageClass: item.spec?.storageClassName ?? '',
      volume: item.spec?.volumeName ?? '',
      phase: item.status?.phase ?? '',
      capacity: item.status?.capacity?.storage ?? '',
    }),
  },
  access: {
    kinds: 'serviceaccounts,roles,rolebindings,networkpolicies,resourcequotas',
    record: (item) => ({
      ...objectOf(item),
      ...(item.kind === 'RoleBinding'
        ? {
            role: item.roleRef?.name ?? '',
            subjects: (item.subjects ?? []).map(
              (subject) => `${subject.kind}/${subject.namespace ?? ''}/${subject.name}`,
            ),
          }
        : {}),
    }),
  },
  ingresses: {
    kinds: 'ingresses',
    record: (item) => ({
      ...objectOf(item),
      hosts: (item.spec?.rules ?? []).map(({ host }) => host).filter(Boolean),
      backends: (item.spec?.rules ?? []).flatMap(
        (rule) => rule.http?.paths?.map((path) => path.backend?.service?.name).filter(Boolean) ?? [],
      ),
    }),
  },
  configMaps: {
    kinds: 'configmaps',
    record: (item) => ({
      ...objectOf(item),
      keys: Object.keys(item.data ?? {}).sort(),
      hosts: Object.entries(item.data ?? {}).flatMap(([key, value]) =>
        serviceReferences(value).map((host) => ({ field: `data.${key}`, host })),
      ),
    }),
  },
});

/** The conditions of an object status, by type. */
const conditionsOf = (conditions = []) =>
  Object.fromEntries(
    conditions.map(({ type, status, reason = '', message = '' }) => [type, { status, reason, message }]),
  );

/**
 * The record a capture keeps of an Envoy Gateway policy: its labels, the objects it targets as `<kind>/<name>`,
 * and the listener sections it targets as `<kind>/<name>/<section>`.
 */
const policyRecord = (item) => {
  const refs = [...(item.spec?.targetRefs ?? []), ...(item.spec?.targetRef ? [item.spec.targetRef] : [])];
  return {
    ...objectOf(item),
    labels: item.metadata.labels ?? {},
    targets: refs.map(({ kind, name }) => `${kind}/${name}`),
    sections: refs
      .filter(({ sectionName }) => sectionName)
      .map(({ kind, name, sectionName }) => `${kind}/${name}/${sectionName}`),
  };
};

/** The custom objects a capture reads when the cluster serves their CRD. */
const CUSTOM_READS = Object.freeze({
  'gateways.gateway.networking.k8s.io': {
    group: 'gateways',
    record: (item) => ({
      ...objectOf(item),
      labels: item.metadata.labels ?? {},
      className: item.spec?.gatewayClassName ?? '',
      conditions: conditionsOf(item.status?.conditions),
      listeners: (item.spec?.listeners ?? []).map((listener) => ({
        name: listener.name,
        hostname: listener.hostname ?? '',
        protocol: listener.protocol ?? '',
        port: listener.port ?? 0,
        allowedRoutes: listener.allowedRoutes?.namespaces?.from ?? 'Same',
        certificates: (listener.tls?.certificateRefs ?? []).map(
          (ref) => `${ref.namespace ?? item.metadata.namespace}/${ref.name}`,
        ),
        conditions: conditionsOf(item.status?.listeners?.find(({ name }) => name === listener.name)?.conditions),
      })),
    }),
  },
  'httproutes.gateway.networking.k8s.io': {
    group: 'routes',
    record: (item) => ({
      ...objectOf(item),
      labels: item.metadata.labels ?? {},
      hostnames: item.spec?.hostnames ?? [],
      parents: (item.spec?.parentRefs ?? []).map((ref) => `${ref.namespace ?? item.metadata.namespace}/${ref.name}`),
      backends: (item.spec?.rules ?? []).flatMap((rule) =>
        (rule.backendRefs ?? []).map(
          (ref) => `${ref.namespace ?? item.metadata.namespace}/${ref.name}:${ref.port ?? ''}`,
        ),
      ),
      unresolved: (item.status?.parents ?? []).some((parent) =>
        (parent.conditions ?? []).some(
          ({ type, status }) => ['Accepted', 'ResolvedRefs'].includes(type) && status !== 'True',
        ),
      ),
      accepted:
        (item.status?.parents ?? []).length > 0 &&
        item.status.parents.every((parent) =>
          ['Accepted', 'ResolvedRefs'].every((type) =>
            (parent.conditions ?? []).some((condition) => condition.type === type && condition.status === 'True'),
          ),
        ),
    }),
  },
  'referencegrants.gateway.networking.k8s.io': {
    group: 'grants',
    record: (item) => ({
      ...objectOf(item),
      from: (item.spec?.from ?? []).map((from) => `${from.kind}/${from.namespace}`),
      to: (item.spec?.to ?? []).map((to) => `${to.kind}/${to.name ?? '*'}`),
    }),
  },
  'httpproxies.projectcontour.io': {
    group: 'proxies',
    record: (item) => ({
      ...objectOf(item),
      fqdn: item.spec?.virtualhost?.fqdn ?? '',
      tls: item.spec?.virtualhost?.tls?.secretName ?? '',
      services: (item.spec?.routes ?? []).flatMap((route) => (route.services ?? []).map(({ name }) => name)),
      status: item.status?.currentStatus ?? '',
      description: item.status?.description ?? '',
    }),
  },
  'clienttrafficpolicies.gateway.envoyproxy.io': { group: 'clientPolicies', record: policyRecord },
  'backendtrafficpolicies.gateway.envoyproxy.io': { group: 'backendPolicies', record: policyRecord },
  'certificates.cert-manager.io': {
    group: 'certificates',
    record: (item) => ({
      ...objectOf(item),
      labels: item.metadata.labels ?? {},
      secretName: item.spec?.secretName ?? '',
      dnsNames: item.spec?.dnsNames ?? [],
      issuer: item.spec?.issuerRef ? `${item.spec.issuerRef.kind ?? 'Issuer'}/${item.spec.issuerRef.name}` : '',
      conditions: conditionsOf(item.status?.conditions),
      notAfter: item.status?.notAfter ?? '',
      renewalTime: item.status?.renewalTime ?? '',
    }),
  },
  'clusterissuers.cert-manager.io': {
    group: 'issuers',
    record: (item) => {
      const solvers = item.spec?.acme?.solvers ?? [];
      return {
        ...objectOf(item),
        conditions: conditionsOf(item.status?.conditions),
        solvers: solvers.map(({ http01 }) =>
          http01?.gatewayHTTPRoute ? 'gateway' : http01?.ingress ? 'ingress' : 'other',
        ),
        parentRefs: solvers.flatMap(({ http01 }) =>
          (http01?.gatewayHTTPRoute?.parentRefs ?? []).map(({ namespace = '', name }) => ({ namespace, name })),
        ),
      };
    },
  },
  'challenges.acme.cert-manager.io': {
    group: 'challenges',
    record: (item) => ({
      ...objectOf(item),
      dnsName: item.spec?.dnsName ?? '',
      state: item.status?.state ?? '',
      reason: item.status?.reason ?? '',
      created: item.metadata.creationTimestamp ?? '',
      parentRefs: (item.spec?.solver?.http01?.gatewayHTTPRoute?.parentRefs ?? []).map(
        (ref) => `${ref.namespace ?? item.metadata.namespace}/${ref.name}`,
      ),
    }),
  },
  'volumesnapshots.snapshot.storage.k8s.io': {
    group: 'snapshots',
    record: (item) => ({ ...objectOf(item), claim: item.spec?.source?.persistentVolumeClaimName ?? '' }),
  },
});

/**
 * The observation records of the routing objects of one custom resource, as {@link UnderpostNamespace.observe}
 * keeps them.
 * @param {string} crd - A custom resource of the observation: `httproutes.gateway.networking.k8s.io`, ….
 * @param {Object[]} items - Its objects as the API returns them.
 * @returns {Object[]}
 * @memberof UnderpostNamespace
 */
export const routingRecordsOf = (crd, items) => items.map(CUSTOM_READS[crd].record);

/**
 * The TLS Secrets of the cluster as a go-template prints them: namespace, name and the public certificate.
 * The private key is never read.
 */
const TLS_CERTIFICATES_TEMPLATE =
  '{{range .items}}{{.metadata.namespace}}{{"\\t"}}{{.metadata.name}}{{"\\t"}}{{index .data "tls.crt"}}{{"\\n"}}{{end}}';

/** The names and the expiry of each TLS certificate; one that does not parse names nothing. */
const tlsCertificatesOf = (lines) =>
  lines
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [namespace, name, encoded = ''] = line.split('\t');
      try {
        const { names, notAfter } = certificateFacts(Buffer.from(encoded, 'base64'));
        return { namespace, name, names, notAfter };
      } catch {
        return { namespace, name, names: [], notAfter: '' };
      }
    });

/** The Secrets of the cluster as a go-template prints them: namespace, name, type and keys, never a value. */
const SECRET_KEYS_TEMPLATE =
  '{{range .items}}{{.metadata.namespace}}{{"\\t"}}{{.metadata.name}}{{"\\t"}}{{.type}}{{"\\t"}}' +
  '{{range $key, $value := .data}}{{$key}},{{end}}{{"\\n"}}{{end}}';

/**
 * The objects each controller depends on: the Services that select its pods, its Secrets, ConfigMaps
 * and claims, the volumes of its claims, and their storage classes.
 */
const dependenciesOf = ({ controllers, services, storage }) =>
  controllers.flatMap((controller) => {
    const from = objectId(controller);
    const claims = [
      ...controller.claims,
      ...storage.claims
        .filter(
          ({ namespace, name }) =>
            namespace === controller.namespace &&
            controller.claimTemplates.some((template) => name.startsWith(`${template}-${controller.name}-`)),
        )
        .map(({ name }) => name),
    ];
    return [
      ...services
        .filter(
          (service) =>
            service.namespace === controller.namespace &&
            Object.keys(service.selector).length &&
            Object.entries(service.selector).every(([key, value]) => controller.templateLabels[key] === value),
        )
        .map((service) => ({ from, to: objectId({ kind: 'Service', ...service }), via: 'selector' })),
      ...controller.secrets.map((name) => ({ from, to: `Secret/${controller.namespace}/${name}`, via: 'reference' })),
      ...controller.configMaps.map((name) => ({
        from,
        to: `ConfigMap/${controller.namespace}/${name}`,
        via: 'reference',
      })),
      ...claims.flatMap((name) => {
        const claim = storage.claims.find((entry) => entry.namespace === controller.namespace && entry.name === name);
        const volume = storage.volumes.find((entry) => entry.name === claim?.volume);
        return [
          { from, to: `PersistentVolumeClaim/${controller.namespace}/${name}`, via: 'volume' },
          ...(volume ? [{ from, to: `PersistentVolume/${volume.name}`, via: 'claim' }] : []),
          ...(volume?.storageClass ? [{ from, to: `StorageClass/${volume.storageClass}`, via: 'storage' }] : []),
        ];
      }),
    ];
  });

/** A time stamp an id can hold and sort by. */
export const stamp = (date = new Date()) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');

/** A digest of a value, for checksums and identities. */
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

/** The cluster configuration as its file holds it: an empty one without a file. */
export const rawClusterConf = (path) => (fs.existsSync(path) ? fs.readJsonSync(path) : { environments: {} });

/** A digest of the cluster configuration file: what a migration checks before it writes. */
export const clusterConfChecksum = (path = CLUSTER_CONF_PATH) =>
  digest(fs.existsSync(path) ? fs.readFileSync(path) : '');

/** Copies a file to a private backup beside it. */
export const backupFile = (path) => {
  const backup = `${path}.${stamp()}.bak`;
  fs.copyFileSync(path, backup);
  fs.chmodSync(backup, 0o600);
  return backup;
};

/**
 * Writes a cluster configuration: validated, the previous file kept as a private backup beside it, then
 * replaced atomically.
 * @returns {string} The backup; '' when there was no file.
 */
export const writeClusterConf = (path, conf) => {
  parseClusterConf(path, conf);
  const backup = fs.existsSync(path) ? backupFile(path) : '';
  writePrivateJson(path, conf);
  return backup;
};

/**
 * Places resources of an environment in the configuration as overrides of its profile: each key it names
 * changes, an override equal to the profile goes, and every other key and section stays. A new section
 * takes the legacy profile.
 * @param {string} path
 * @param {string} environment
 * @param {Object<string,string>} flat - A namespace by resource id.
 * @returns {string} The backup of the previous file.
 */
export const placeResources = (path, environment, flat) => {
  const conf = rawClusterConf(path);
  const { profiles, sections } = clusterConf(path);
  const raw = conf.environments?.[environment] ?? { profile: LEGACY_PROFILE };
  return writeClusterConf(path, {
    ...conf,
    environments: {
      ...conf.environments,
      [environment]: withNamespaceOverrides(
        raw,
        { ...sections[environment]?.overrides.namespaces, ...flat },
        profiles[raw.profile].namespaces,
      ),
    },
  });
};

/**
 * Declares the secret source of resources of an environment: each resource it names changes, and every
 * other key and section stays. A new section takes the legacy profile.
 * @param {string} path
 * @param {string} environment
 * @param {Object<string,string>} sources - A {@link SECRET_SOURCES} value by resource id.
 * @returns {string} The backup of the previous file.
 */
export const declareSecretSources = (path, environment, sources) => {
  const conf = rawClusterConf(path);
  const raw = conf.environments?.[environment] ?? { profile: LEGACY_PROFILE };
  return writeClusterConf(path, {
    ...conf,
    environments: { ...conf.environments, [environment]: { ...raw, secrets: { ...raw.secrets, ...sources } } },
  });
};

/** A raw section with the namespace overrides that differ from its profile; empty overrides go. */
const withNamespaceOverrides = ({ overrides: { namespaces, ...overrides } = {}, ...section } = {}, flat, base) => {
  const own = Object.fromEntries(Object.entries(flat).filter(([id, name]) => base[id] !== name));
  const next = { ...overrides, ...(Object.keys(own).length ? { namespaces: sectionNamespaces(own) } : {}) };
  return { ...section, ...(Object.keys(next).length ? { overrides: next } : {}) };
};

/** Writes a private file atomically: a staged copy renamed over the target. */
export const writePrivateJson = (path, value) => {
  fs.mkdirSync(nodePath.dirname(path), { recursive: true, mode: 0o700 });
  const staged = `${path}.${process.pid}.tmp`;
  fs.writeFileSync(staged, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(staged, path);
  return path;
};

class UnderpostNamespace {
  static API = {
    /**
     * The cluster section of an environment: its configured kubeconfig context ('' when it names none), its DNS
     * domain, its routing, its TLS policy and the identity of its cluster (null when it names none).
     * {@link UnderpostNamespace.target} resolves the context a command reaches.
     * @param {{environment?:string, options?:Object, path?:string}} [params]
     * @returns {{environment:string, context:string, clusterDomain:string, routing:{provider:string}|null,
     *   tls:{mode:string, issuer?:string}|null, cluster:{fingerprint:string, servers:string[]}|null}}
     * @memberof UnderpostNamespace
     */
    cluster({ environment, options = {}, path = CLUSTER_CONF_PATH } = {}) {
      const env = environmentOf({ environment, options });
      const { context, clusterDomain, routing, tls, cluster } = sectionOf(readClusterConf(path), env);
      return { environment: env, context, clusterDomain, routing, tls, cluster };
    },

    /**
     * Where a resource runs for a command. A fixed resource runs where its manifest names. For any
     * other, the first that names it wins: its own option (`--namespace-<resource>`), the legacy
     * `--namespace` (every resource but an addon), the migration that moves it, the overrides and the
     * profile of the environment; an environment the configuration lacks takes the legacy profile. A migration places a resource in
     * its source until its destination is ready, then in its destination; `deployId` selects the
     * deployment group a plan moves alone. A target placement in `sections` ignores the migration.
     * @param {Object} params
     * @param {string} params.resource - A key of {@link NAMESPACE_RESOURCES}.
     * @param {string} [params.environment] - `production`, `development` or `test`; from `options.env`
     *   or `options.dev` by default.
     * @param {Object} [params.options] - Parsed command options.
     * @param {string} [params.path] - The configuration file.
     * @param {Object} [params.sections] - Sections that stand for the file: a target placement.
     * @param {string} [params.deployId] - For the workloads: the deployment, or `<deploy-id>-<instance>`;
     *   `options.deployId` by default.
     * @returns {{resource:string, role:string, namespace:string, desired:string, services:string[],
     *   context:string, clusterDomain:string, environment:string, source:string, migration?:Object}}
     *   `namespace` is the effective one; `desired` is what the configuration names; `source` names the
     *   option, the migration, the configuration key or the placement it comes from; `migration` is the
     *   unit of the plan that moves it.
     * @throws {Error} On an unknown resource or an invalid name.
     * @memberof UnderpostNamespace
     */
    resolve({
      resource: id,
      environment,
      options = {},
      path = CLUSTER_CONF_PATH,
      sections,
      deployId = options.deployId ?? '',
    }) {
      const definition = NAMESPACE_RESOURCES[id];
      if (!definition) throw refusal(`${id} is not a placed resource: ${Object.keys(NAMESPACE_RESOURCES).join(', ')}`);
      const env = environmentOf({ environment, options });
      const configured = sections ?? readClusterConf(path);
      const section = sectionOf(configured, env);
      const answer = (namespace, source, desired = namespace, migration) => ({
        resource: id,
        role: definition.role,
        namespace: assertName(namespace, source),
        desired,
        services: definition.services,
        environment: env,
        context: section.context,
        clusterDomain: section.clusterDomain,
        source,
        ...(migration ? { migration } : {}),
      });
      if (!configurable(definition)) return answer(definition.fixed, 'fixed by its manifest');
      if (options[optionKey(id)]) return answer(options[optionKey(id)], `option ${flagOf(id)}`);
      if (id === 'workloads' && options.namespace) return answer(options.namespace, 'option --namespace');
      const desired = { namespace: section.namespaces[id], source: section.sources.namespaces[id] };
      const migration = sections ? undefined : migrationPlacement({ environment: env, resource: id, deployId });
      return migration
        ? answer(
            migration.namespace,
            `plan ${migration.plan}: ${migration.unit} ${migration.placed ? 'is placed in its destination' : 'runs in its source'}`,
            desired.namespace,
            migration,
          )
        : answer(desired.namespace, desired.source);
    },

    /**
     * The namespace of a resource for a command: {@link UnderpostNamespace.resolve} as a name.
     * @param {string} resource
     * @param {{environment?:string, options?:Object, path?:string, sections?:Object}} [params]
     * @returns {string}
     * @memberof UnderpostNamespace
     */
    of(resource, params = {}) {
      return UnderpostNamespace.API.resolve({ ...params, resource }).namespace;
    },

    /**
     * The Kubernetes Secrets of the catalog, with the resource each belongs to.
     * @returns {Array<{resource:string, id:string, name:string}>}
     * @memberof UnderpostNamespace
     */
    secrets() {
      return Object.entries(NAMESPACE_RESOURCES).flatMap(([resource, { secrets }]) =>
        secrets.map((secret) => ({ resource, ...secret })),
      );
    },

    /**
     * The source of the Secrets of a resource in an environment: one of {@link SECRET_SOURCES}.
     * @param {{resource:string, environment?:string, options?:Object, path?:string}} params
     * @returns {string}
     * @memberof UnderpostNamespace
     */
    secretSource({ resource: id, environment, options = {}, path = CLUSTER_CONF_PATH }) {
      return (
        sectionOf(readClusterConf(path), environmentOf({ environment, options })).secrets[id] ?? DEFAULT_SECRET_SOURCE
      );
    },

    /**
     * Declares the secret source of resources of an environment in its configuration ({@link declareSecretSources}).
     * @param {{environment:string, sources:Object<string,string>, path?:string}} params
     * @returns {string} The backup of the previous file.
     * @memberof UnderpostNamespace
     */
    declareSecretSources({ environment, sources, path = CLUSTER_CONF_PATH }) {
      return declareSecretSources(path, environment, sources);
    },

    /**
     * The nodes a resource runs on for a command. A command option (`node`) names one Kubernetes node.
     * Otherwise the category of the resource takes its rule from the profile of the environment under its
     * overrides: the `scheduler` mode, or no rule, leaves the pods to the Kubernetes scheduler; the
     * `required` and `preferred` modes name a node group, whose members in `nodes.groups` are records of
     * `engine-private/deploy/nodes`, and the `kubernetesNodeName` of each record is a node. An upstream
     * resource has no category: its installer places it.
     * @param {Object} params
     * @param {string} params.resource - A key of {@link NAMESPACE_RESOURCES}.
     * @param {string} [params.node] - The node a command option names: `--node`, `--node-name`.
     * @param {string} [params.environment]
     * @param {Object} [params.options]
     * @param {string} [params.path]
     * @param {Object} [params.sections] - A target placement.
     * @returns {{resource:string, category:string, profile:string, group:string, mode:string,
     *   members:string[], nodes:string[], source:string}} `nodes` is empty where the scheduler places the
     *   pods; `source` names the option or the configuration key of the rule.
     * @throws {Error} When a group has no member, or a member no single Kubernetes node.
     * @memberof UnderpostNamespace
     */
    schedule({ resource: id, node = '', environment, options = {}, path = CLUSTER_CONF_PATH, sections }) {
      if (!NAMESPACE_RESOURCES[id])
        throw refusal(`${id} is not a placed resource: ${Object.keys(NAMESPACE_RESOURCES).join(', ')}`);
      const env = environmentOf({ environment, options });
      const section = sectionOf(sections ?? readClusterConf(path), env);
      const category = categoryOf(id);
      const answer = (fields) => ({
        resource: id,
        category,
        profile: section.profile,
        group: '',
        mode: SCHEDULER,
        members: [],
        nodes: [],
        source: '',
        ...fields,
      });
      if (node) return answer({ mode: 'required', nodes: [node], source: 'option' });
      if (!category) return answer({ source: 'its installer' });
      const { group, mode } = section.scheduling[category] ?? { mode: SCHEDULER };
      const source = section.sources.scheduling[category] ?? 'the scheduler';
      if (mode === SCHEDULER) return answer({ source });
      const members = section.groups[group] ?? [];
      if (!members.length)
        throw refusal(
          `${source} places ${category} on the node group ${group}, which environments.${env}.nodes.groups.${group} ` +
            'gives no member: list its node records there',
        );
      return answer({ group, mode, members, nodes: kubernetesNodesOf(members), source });
    },

    /**
     * The pod scheduling of a resource for a manifest: {@link UnderpostNamespace.schedule}, a node affinity
     * on the `kubernetes.io/hostname` label of its nodes in its mode, and a toleration of the control-plane
     * taint when one of them carries it. The labels and the taints come from the cluster; without it, a
     * label is the node name.
     * @param {Object} params - {@link UnderpostNamespace.schedule} parameters.
     * @returns {{nodes:string[], group:string, mode:string, affinity?:Object, tolerations?:Object[]}}
     * @throws {Error} When a resource with `hostPathData` has more than one node.
     * @memberof UnderpostNamespace
     */
    podScheduling(params) {
      const { nodes, group, mode } = UnderpostNamespace.API.schedule(params);
      const { hostPathData, label } = NAMESPACE_RESOURCES[params.resource];
      if (hostPathData && nodes.length > 1)
        throw refusal(
          `${label} keeps its data on a host path volume of one node, and the node group ${group} names ` +
            `${nodes.join(', ')}: a member placed on another node starts on an empty directory. Give the group one member`,
        );
      if (!nodes.length) return { nodes, group, mode };
      const live = liveNodeObjects();
      const objects = nodes.map((name) => live.find(({ metadata }) => metadata.name === name));
      return {
        nodes,
        group,
        mode,
        ...podSchedulingFactory({
          hostnames: nodes.map((name, index) => objects[index]?.metadata.labels?.[HOSTNAME_LABEL] || name),
          mode,
          taints: objects.flatMap((object) => object?.spec?.taints ?? []),
        }),
      };
    },

    /**
     * The one node of a resource that keeps its state on a host path or listens on the host network.
     * @param {string[]} nodes - The nodes of its scheduling.
     * @param {string} what - The resource, for the message.
     * @returns {string} '' where the scheduler places it.
     * @throws {Error} When its node group has more than one member.
     * @memberof UnderpostNamespace
     */
    soleNode(nodes, what) {
      if (nodes.length > 1)
        throw refusal(
          `${what} runs on one node, and its node group names ${nodes.join(', ')}: give the group one member, ` +
            'or name the node with the option of the command',
        );
      return nodes[0] ?? '';
    },

    /**
     * The resolution of every placed resource.
     * @param {{environment?:string, options?:Object, path?:string, sections?:Object}} [params]
     * @returns {Array<ReturnType<UnderpostNamespace.API.resolve>>}
     * @memberof UnderpostNamespace
     */
    resolveAll(params = {}) {
      return Object.keys(NAMESPACE_RESOURCES).map((id) => UnderpostNamespace.API.resolve({ ...params, resource: id }));
    },

    /**
     * The sections of a target placement: the configuration as it is, or each environment on another
     * profile with its cluster, its node groups and its scheduling overrides, and without its namespace
     * overrides.
     * @param {string} [target] - `configured`, or a profile of the configuration.
     * @param {string} [path]
     * @returns {Object} Sections {@link UnderpostNamespace.resolve} takes.
     * @throws {Error} On a target that names no profile.
     * @memberof UnderpostNamespace
     */
    targetSections(target = CONFIGURED, path = CLUSTER_CONF_PATH) {
      const { profiles, sections } = clusterConf(path);
      if (target === CONFIGURED) return sections;
      if (!profiles[target])
        throw refusal(`${target} is not a target: ${[...Object.keys(profiles), CONFIGURED].join(', ')}`);
      return Object.fromEntries(
        ENVIRONMENTS.map((environment) => {
          const section = sectionOf(sections, environment);
          return [
            environment,
            sectionFactory({
              ...section,
              environment,
              profile: profiles[target],
              overrides: { namespaces: {}, scheduling: section.overrides.scheduling },
            }),
          ];
        }),
      );
    },

    /**
     * The fully qualified DNS name of a Service in the cluster of an environment.
     * @param {Object} params
     * @param {string} params.service
     * @param {string} params.namespace
     * @param {string} [params.member] - A member of the StatefulSet of a headless Service.
     * @param {number|string} [params.port]
     * @param {string} [params.environment]
     * @param {Object} [params.options]
     * @param {string} [params.path]
     * @returns {string}
     * @memberof UnderpostNamespace
     */
    serviceFqdn({ service, namespace, member, port, ...params }) {
      return serviceDnsName({
        service,
        namespace,
        member,
        port,
        clusterDomain: UnderpostNamespace.API.cluster(params).clusterDomain,
      });
    },

    /**
     * The DNS name of a resource Service as its consumers address it: the short name when the workloads
     * and the release Jobs run in its namespace, else its fully qualified name.
     * @param {Object} params
     * @param {string} params.resource
     * @param {string} [params.service] - Another Service of the resource than the first.
     * @param {string} [params.member] - A member of the StatefulSet of a headless Service: `mongodb-0`.
     * @param {string} [params.environment]
     * @param {Object} [params.options]
     * @param {string} [params.path] - The configuration file.
     * @param {Object} [params.sections] - A target placement.
     * @returns {string}
     * @memberof UnderpostNamespace
     */
    serviceHost({ resource: id, service, member = '', ...params }) {
      const placement = UnderpostNamespace.API.resolve({ ...params, resource: id });
      const name = service ?? placement.services[0];
      return CONSUMERS.every((consumer) => UnderpostNamespace.API.of(consumer, params) === placement.namespace)
        ? `${member ? `${member}.` : ''}${name}`
        : serviceDnsName({
            service: name,
            member,
            namespace: placement.namespace,
            clusterDomain: placement.clusterDomain,
          });
    },

    /**
     * The environment keys that address the Service of a resource: the endpoint layer owns their values.
     * @returns {string[]}
     * @memberof UnderpostNamespace
     */
    endpointKeys() {
      return Object.values(NAMESPACE_RESOURCES).flatMap(({ endpoints }) => endpoints);
    },

    /**
     * The endpoint layer of a container environment: each endpoint key of the catalog whose hosts name
     * the Service of its resource, set to their fully qualified names in the namespace where the resource
     * runs now. Credentials, members, ports, paths and query options stay; any other value stays as it
     * is. `app apply` projects it over the OCI overlay, so no environment file names a namespace.
     * @param {{values:Object<string,string>, environment?:string, options?:Object, path?:string}} params
     * @returns {{values:Object<string,string>, changes:Array<{key:string, resource:string, from:string[],
     *   to:string[]}>}} `values` holds the keys it changes; `changes` names their hosts, never a credential.
     * @memberof UnderpostNamespace
     */
    endpointLayer({ values, ...params }) {
      const changes = Object.entries(NAMESPACE_RESOURCES).flatMap(([id, { endpoints }]) =>
        endpoints
          .filter((key) => values[key])
          .flatMap((key) => {
            const { value, hosts } = effectiveValue(
              values[key],
              UnderpostNamespace.API.resolve({ ...params, resource: id }),
            );
            return value === values[key]
              ? []
              : [
                  {
                    key,
                    resource: id,
                    value,
                    from: hosts.map(({ host }) => host),
                    to: hosts.map(({ effective }) => effective),
                  },
                ];
          }),
      );
      return {
        values: Object.fromEntries(changes.map(({ key, value }) => [key, value])),
        changes: changes.map(({ value, ...change }) => change),
      };
    },

    /**
     * Classifies each host of each endpoint of an environment against the effective placement: `placed`;
     * `missing-service` when the namespace where its resource runs holds no such Service; `external`;
     * `unknown`; and `stale` for a literal database host of `conf.server.json`, which Underpost does not
     * project, that names another namespace. Only hosts leave it.
     * @param {Object} params
     * @param {Object<string,string>} params.values - Endpoint values: environment keys, and
     *   `db.host:<provider>` for a literal database host.
     * @param {{base:string, overlay?:string}} params.files - The file the values come from, and the OCI
     *   overlay that sets the keys it holds.
     * @param {Array<{namespace:string, name:string}>} [params.services] - The Services of the cluster;
     *   without them, nothing is checked against the cluster.
     * @param {string} [params.environment]
     * @param {Object} [params.options]
     * @param {string} [params.path]
     * @param {Object} [params.sections]
     * @returns {Array<Object>} `source`, `environment`, `key`, `resource`, `service`, `namespace`, `host`,
     *   `effective` (the host the pods reach), `state`, `severity`, `verified` and `message` of each host.
     * @memberof UnderpostNamespace
     */
    endpoints({ values, files: { base, overlay }, services, ...params }) {
      const overlayKeys =
        overlay && fs.existsSync(overlay) ? Object.keys(dotenv.parse(fs.readFileSync(overlay, 'utf8'))) : [];
      const consumers = CONSUMERS.map(
        (consumer) => UnderpostNamespace.API.resolve({ ...params, resource: consumer }).namespace,
      );
      const keyed = Object.entries(NAMESPACE_RESOURCES).flatMap(([id, definition]) => [
        ...definition.endpoints.map((key) => ({ id, key, projected: true })),
        ...definition.providers.map((provider) => ({ id, key: `db.host:${provider}`, projected: false })),
      ]);
      return keyed
        .filter(({ key }) => values[key])
        .flatMap(({ id, key, projected }) => {
          const placement = UnderpostNamespace.API.resolve({ ...params, resource: id });
          return effectiveValue(values[key], placement).hosts.map(({ host, target, effective }) => {
            const named =
              target.namespace || (consumers.every((namespace) => namespace === consumers[0]) ? consumers[0] : '');
            const runs = services?.filter(({ name }) => name === target.service).map(({ namespace }) => namespace);
            const state =
              target.kind !== 'service'
                ? target.kind
                : !projected && !(named === placement.namespace && target.inDomain)
                  ? 'stale'
                  : runs && !runs.includes(placement.namespace)
                    ? 'missing-service'
                    : 'placed';
            const entry = {
              source: overlayKeys.includes(key) ? overlay : base,
              environment: placement.environment,
              key,
              resource: id,
              service: target.service ?? placement.services[0],
              namespace: placement.namespace,
              host,
              effective: projected ? effective : host,
              placed: target.kind === 'service' ? effective : host,
              state,
              severity: ENDPOINT_SEVERITY[state],
              verified: Boolean(services),
            };
            return { ...entry, message: entry.severity ? endpointMessage(entry) : '' };
          });
        });
    },

    /**
     * The endpoints of each deployment as its pods reach them: the keys of its env file with its OCI
     * overlay and the endpoint layer, which the Secrets of its workloads and of its release Jobs carry,
     * and each literal database host of its `conf.server.json`. Each logical endpoint is one entry with
     * the consumers that read it.
     * @param {{environment?:string, options?:Object, path?:string, sections?:Object, deployIds?:string[],
     *   services?:Array<{namespace:string, name:string}>}} [params]
     * @returns {Array<Object>} {@link UnderpostNamespace.endpoints} entries with `readers`: each
     *   deployment and file that reads the endpoint.
     * @memberof UnderpostNamespace
     */
    deployEndpoints({ deployIds = readDeployRoutes(), ...params } = {}) {
      const { environment } = UnderpostNamespace.API.cluster(params);
      const entries = deployIds.flatMap((deployId) => {
        const envPath = deployEnvFilePath(deployId, environment);
        const confPath = `./engine-private/conf/${deployId}/conf.server.json`;
        const fromEnv = fs.existsSync(envPath)
          ? UnderpostNamespace.API.endpoints({
              ...params,
              values: deployEnvContentFactory(deployId, environment, '', { oci: true }).values,
              files: { base: envPath, overlay: deployOciEnvFilePath(deployId, environment) },
            })
          : [];
        const databases = fs.existsSync(confPath)
          ? Object.values(loadConfServerJson(confPath))
              .flatMap((paths) => Object.values(paths).map((entry) => entry?.db))
              .filter((db) => db?.host && !`${db.host}`.startsWith('env:'))
          : [];
        const fromConf = databases.flatMap(({ provider, host }) =>
          UnderpostNamespace.API.endpoints({
            ...params,
            values: { [`db.host:${provider}`]: host },
            files: { base: confPath },
          }),
        );
        return [...fromEnv, ...fromConf].map((entry) => ({ ...entry, readers: [{ deployId, source: entry.source }] }));
      });
      const grouped = Map.groupBy(entries, ({ resource: id, key, host }) => `${id}|${key}|${host}`);
      return [...grouped.values()].map(([first, ...rest]) => ({
        ...first,
        readers: [first, ...rest].flatMap(({ readers }) => readers),
      }));
    },

    /**
     * The cluster target of a command, resolved once and passed to every process it starts. The first that
     * applies wins: `context` (a plan, a new cluster or the sandbox names it, with the `cluster` it must
     * be), the target of the command that started this process for the same environment, `--context`,
     * `--current-context`, the service account inside a container, and `environments.<env>.context`. No
     * environment falls back to the current context: without one, `refusal` says how to name it, and the
     * process boundary refuses each cluster command that names no context of its own.
     * `blockers` say why the target refuses a change: an environment without `routing` or `tls`, or a
     * production cluster whose identity (`environments.production.cluster`) is not declared. The process
     * boundary verifies the declared identity before the first change ({@link targetIdentityRefusal}).
     * @param {{environment?:string, options?:Object, path?:string, context?:string, source?:string,
     *   cluster?:{fingerprint:string, servers?:string[]}, runtime?:string}} [params] - `source` names where
     *   `context` comes from; `runtime` is the Kubernetes distribution the command names ({@link runtimeOf}).
     * @returns {Readonly<{environment:string, context:string, source:string, override:boolean,
     *   kubeconfig:string[], cluster:{fingerprint:string, servers:string[]}|null, runtime:string, profile:string,
     *   configuration:string, blockers:string[], refusal:string}>} `context` is '' for the current context and
     *   the service account; `configuration` is a digest of the section of the environment.
     * @throws {Error} On both `--context` and `--current-context`, or a `--context` other than the inherited one.
     * @memberof UnderpostNamespace
     */
    target({ context, source = 'the command', cluster: expected, runtime = '', ...params } = {}) {
      const { options = {}, path = CLUSTER_CONF_PATH } = params;
      const section = UnderpostNamespace.API.cluster(params);
      const { environment } = section;
      if (options.context && options.currentContext) throw refusal('Use --context or --current-context, not both');
      const pod = isOciRuntime();
      const answer = (value, from, { override = false, identity = section.cluster, declared = true } = {}) => {
        const blockers = pod
          ? []
          : [
              ...(section.routing
                ? []
                : [
                    `environments.${environment}.routing is not configured: set it to {"provider": "<provider>"} ` +
                      `(${ROUTING_PROVIDERS.join(', ')})`,
                  ]),
              ...(section.tls
                ? []
                : [`environments.${environment}.tls is not configured: set it to one of ${TLS_POLICIES}`]),
              ...(environment === 'production' && declared && !identity
                ? [
                    'environments.production.cluster is not configured: set it to the declaration ' +
                      'node bin namespace target --env production --context <context> prints',
                  ]
                : []),
            ];
        return Object.freeze({
          environment,
          context: value,
          source: from,
          override,
          kubeconfig: pod ? [] : kubeconfigFiles(),
          cluster: identity ?? null,
          runtime,
          profile: activeExecutionProfile().name,
          configuration: digest(JSON.stringify(rawClusterConf(path).environments?.[environment] ?? null)),
          blockers,
          refusal: '',
        });
      };
      if (context) return answer(context, source, { identity: expected, declared: false });
      const inherited = activeExecutionTarget();
      if (inherited?.environment === environment && !inherited.refusal) {
        if (options.context && options.context !== inherited.context)
          throw refusal(
            `--context ${options.context} conflicts with the context ${inherited.context || '(current)'} ` +
              `the parent command resolved from ${inherited.source}`,
          );
        return inherited;
      }
      if (options.context) return answer(options.context, 'option --context', { override: true });
      if (options.currentContext) return answer('', 'option --current-context', { override: true });
      if (pod) return answer('', 'the service account of the pod');
      if (section.context) return answer(section.context, `environments.${environment}.context`);
      const missing = fs.existsSync(path)
        ? `environments.${environment}.context is not configured: set it to the context of its cluster ` +
          `(node bin namespace capture --env ${environment} --context <context>, then node bin namespace adopt ` +
          `--env ${environment} --write-config writes it with the cluster identity)`
        : `${path} does not exist: node bin new --cluster writes it with each environment, ` +
          `then set environments.${environment}.context`;
      return Object.freeze({
        ...answer('', ''),
        refusal: `${missing}, or name one with --context, or add --current-context`,
      });
    },

    /**
     * Resolves the cluster target of this process and of every process it starts ({@link UnderpostNamespace.target}):
     * each kubectl and Helm command then reaches its context, and no kubeconfig changes. A refused target
     * refuses each cluster command that does not name its own context.
     * @param {Object} [params] - {@link UnderpostNamespace.target} parameters.
     * @returns {Object} The target.
     * @memberof UnderpostNamespace
     */
    pin(params = {}) {
      const target = setExecutionTarget(UnderpostNamespace.API.target(params));
      if (target.context && !isOciRuntime()) process.env.KUBECONFIG = kubeconfigOf(target.context);
      return target;
    },

    /**
     * The cluster target of a command against the cluster its context reaches, read only: the target, the
     * live API server and fingerprint, and why a change would be refused. `declaration` is the
     * `environments.<env>.cluster` value of the live cluster.
     * @param {Object} [params] - {@link UnderpostNamespace.target} parameters.
     * @returns {{target:Object, live:{context:string, server:string, fingerprint:string}|null, refusal:string,
     *   declaration:{fingerprint:string, servers:string[]}|null}}
     * @memberof UnderpostNamespace
     */
    inspectTarget(params = {}) {
      const target = UnderpostNamespace.API.target(params);
      if (target.refusal) return { target, live: null, refusal: target.refusal, declaration: null };
      const live = liveClusterOf(target);
      return {
        target,
        live,
        refusal: targetIdentityRefusal(target, live),
        declaration: live.fingerprint
          ? { fingerprint: live.fingerprint, servers: live.server ? [live.server] : [] }
          : null,
      };
    },

    /**
     * The namespace options of a command: the legacy `--namespace` and each `--namespace-<resource>`,
     * to pass to a command that resolves the same placement.
     * @param {Object} options - Parsed command options.
     * @returns {Object}
     * @memberof UnderpostNamespace
     */
    overrides(options = {}) {
      return Object.fromEntries(
        ['namespace', ...Object.keys(NAMESPACE_RESOURCES).map(optionKey)]
          .filter((key) => options[key])
          .map((key) => [key, options[key]]),
      );
    },

    /**
     * The namespace options of a command as the arguments of a command it starts, so that both resolve
     * the same placement.
     * @param {Object} options - Parsed command options.
     * @returns {string} ` --namespace-mongodb 'underpost-data'` and so on; '' without options.
     * @memberof UnderpostNamespace
     */
    flags(options = {}) {
      return Object.entries(UnderpostNamespace.API.overrides(options))
        .map(
          ([key, value]) =>
            ` --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} ${shellArgumentFactory(value)}`,
        )
        .join('');
    },

    /**
     * Adds `--namespace-<resource>` for each configurable resource to a command.
     * @param {import('commander').Command} command
     * @returns {import('commander').Command}
     * @memberof UnderpostNamespace
     */
    options(command) {
      for (const [id, { label }] of Object.entries(NAMESPACE_RESOURCES).filter(([, definition]) =>
        configurable(definition),
      ))
        command.option(
          `${flagOf(id)} <namespace>`,
          `The namespace of ${label}; overrides ${id === 'workloads' ? '--namespace and ' : ''}conf.cluster.json.`,
        );
      return command;
    },

    /**
     * A portable configuration: every environment on a built-in profile, which it references and never
     * copies. Production lists each node group of the profile with no member: the operator lists the node
     * records. Development and test leave every category to the scheduler. Each environment routes through the
     * Gateway API; production issues its certificates from letsencrypt-prod, development and test self-sign
     * them. No machine, address or peer is named, and `context` and `cluster` are `null` until
     * {@link UnderpostNamespace.adopt} writes the ones a live cluster has.
     * @param {string} [profile] - `recommended`: one namespace per responsibility, the workloads on the
     *   `workers` group and the rest on the `control` group; `legacy`: where Underpost has always placed
     *   each resource.
     * @returns {Object} A valid `conf.cluster.json`.
     * @throws {Error} On an id Underpost does not ship.
     * @memberof UnderpostNamespace
     */
    template(profile = 'recommended') {
      const { scheduling } = builtinProfile(profile);
      const groups = [...new Set(Object.values(scheduling).flatMap(({ group }) => (group ? [group] : [])))];
      const scheduler = Object.fromEntries(Object.keys(scheduling).map((category) => [category, { mode: SCHEDULER }]));
      return {
        environments: Object.fromEntries(
          ENVIRONMENTS.map((environment) => [
            environment,
            {
              context: null,
              cluster: null,
              profile,
              routing: { provider: 'gateway-api' },
              tls: TEMPLATE_TLS[environment],
              ...(groups.length &&
                (environment === 'production'
                  ? { nodes: { groups: Object.fromEntries(groups.map((group) => [group, []])) } }
                  : { overrides: { scheduling: scheduler } })),
            },
          ]),
        ),
      };
    },

    /**
     * Reads the live cluster of an environment, read only: its identity and version, its namespaces and
     * nodes, its controllers with the nodes their pods run on, Services, storage, access objects, routing
     * objects, the keys of its ConfigMaps and Secrets, and the cluster DNS names its controllers and
     * ConfigMaps hold. It keeps no value of a
     * Secret, no ConfigMap value and no annotation. Every read names the context of the target.
     * @param {{environment?:string, options?:Object, path?:string, context?:string}} [params] - `context`
     *   names the context of a plan instead: the caller verifies the cluster identity.
     * @returns {Promise<Object>} An observation, the body of a capture.
     * @throws {Error} When the cluster does not answer, or the target is refused ({@link UnderpostNamespace.target}).
     * @memberof UnderpostNamespace
     */
    async observe(params = {}) {
      const { environment, context } = assertTarget({ ...params, source: 'the plan' });
      const kubectl = kubectlFactory(context);
      const read = (args, options) => kubectl(args, options).then(({ stdout }) => stdout.trim());
      const list = (kinds, scope = ['--all-namespaces']) =>
        kubectl(['get', kinds, ...scope, '-o', 'json']).then(({ stdout }) =>
          stdout.trim() ? (JSON.parse(stdout).items ?? []) : [],
        );
      let fingerprint;
      try {
        fingerprint = await read(['get', 'namespace', 'kube-system', '-o', 'jsonpath={.metadata.uid}']);
      } catch (error) {
        throw refusal(`The cluster does not answer: ${error.stderr?.trim() || error.message}`);
      }
      const crds = (await read(['get', 'crd', '-o', 'jsonpath={.items[*].metadata.name}'], { silentOnError: true }))
        .split(/\s+/)
        .filter(Boolean);
      const [
        currentContext,
        server,
        version,
        corefile,
        namespaces,
        secrets,
        tlsCertificates,
        claimsRaw,
        volumes,
        classes,
        nodes,
        pods,
      ] = await Promise.all([
        read(['config', 'current-context'], { silentOnError: true }),
        read(['config', 'view', '--minify', '-o', 'jsonpath={.clusters[0].cluster.server}'], { silentOnError: true }),
        read(['version', '-o', 'json'], { silentOnError: true }).then(
          (text) => (text ? JSON.parse(text).serverVersion?.gitVersion : '') ?? '',
        ),
        read(['get', 'configmap', 'coredns', '-n', 'kube-system', '-o', 'jsonpath={.data.Corefile}'], {
          silentOnError: true,
        }),
        list('namespaces', []),
        read(['get', 'secrets', '--all-namespaces', '-o', `go-template=${SECRET_KEYS_TEMPLATE}`], {
          silentOnError: true,
        }),
        read(
          [
            'get',
            'secrets',
            '--all-namespaces',
            '--field-selector',
            'type=kubernetes.io/tls',
            '-o',
            `go-template=${TLS_CERTIFICATES_TEMPLATE}`,
          ],
          { silentOnError: true },
        ),
        list(NAMESPACED_READS.claims.kinds),
        list('persistentvolumes', []),
        list('storageclasses', []),
        list('nodes', []),
        list('pods'),
      ]);
      const groups = Object.fromEntries(
        await Promise.all(
          Object.entries(NAMESPACED_READS)
            .filter(([group]) => group !== 'claims')
            .map(async ([group, { kinds, record }]) => [group, (await list(kinds)).map(record)]),
        ),
      );
      const custom = Object.fromEntries(
        await Promise.all(
          Object.entries(CUSTOM_READS).map(async ([crd, { group, record }]) => [
            group,
            crds.includes(crd) ? (await list(crd.split('.')[0])).map(record) : null,
          ]),
        ),
      );
      const storage = {
        claims: claimsRaw.map(NAMESPACED_READS.claims.record),
        volumes: volumes.map((item) => ({ ...volumeRecord(item), uid: item.metadata.uid ?? '' })),
        classes: classes.map((item) => ({
          name: item.metadata.name,
          provisioner: item.provisioner ?? '',
          reclaim: item.reclaimPolicy ?? '',
          binding: item.volumeBindingMode ?? '',
        })),
        snapshots: custom.snapshots,
      };
      const configMaps = groups.configMaps.map(({ hosts, ...entry }) => entry);
      const placed = pods.map(podRecord);
      storage.mounts = placed.flatMap(({ namespace, name, node, claims }) =>
        claims.map((claim) => ({ pod: `${namespace}/${name}`, claim: `${namespace}/${claim}`, node })),
      );
      const controllers = groups.controllers.map(({ hosts, ...entry }) => ({ ...entry, pods: podsOf(entry, placed) }));
      const observation = {
        environment,
        context: context || currentContext,
        cluster: {
          fingerprint,
          server,
          version,
          domain: /\bkubernetes\s+(\S+)/.exec(corefile)?.[1] ?? '',
        },
        namespaces: namespaces.map((item) => ({
          name: item.metadata.name,
          phase: item.status?.phase ?? '',
          owned: item.metadata.labels?.['app.kubernetes.io/managed-by'] === 'underpost',
        })),
        nodes: nodes.map(nodeRecord),
        controllers,
        services: groups.services,
        storage,
        access: groups.access,
        routing: {
          gateways: custom.gateways,
          routes: custom.routes,
          grants: custom.grants,
          proxies: custom.proxies,
          policies:
            custom.clientPolicies || custom.backendPolicies
              ? [...(custom.clientPolicies ?? []), ...(custom.backendPolicies ?? [])]
              : null,
          ingresses: groups.ingresses,
          certificates: custom.certificates,
          issuers: custom.issuers,
          challenges: custom.challenges,
        },
        config: {
          configMaps,
          secrets: secrets
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const [namespace, name, type, keys = ''] = line.split('\t');
              return { kind: 'Secret', namespace, name, type, keys: keys.split(',').filter(Boolean).sort() };
            }),
          tls: tlsCertificatesOf(tlsCertificates),
        },
        crds,
        references: [
          ...groups.controllers.flatMap((controller) =>
            controller.hosts.map(({ field, host }) => ({ object: objectId(controller), field, host })),
          ),
          ...groups.configMaps.flatMap((configMap) =>
            configMap.hosts.map(({ field, host }) => ({ object: objectId(configMap), field, host })),
          ),
        ],
      };
      return { ...observation, dependencies: dependenciesOf({ controllers, services: groups.services, storage }) };
    },

    /**
     * Compares an observation with a placement: the state, the namespaces and the migration strategy of
     * each resource (`recreate` when Underpost installs it, `fixed` when its manifest or its installer
     * places it, `not-deployed`), the endpoints of each deployment against the live Services, and the
     * blockers that stop a rollout.
     * @param {Object} params
     * @param {Object} params.observation - {@link UnderpostNamespace.observe} output, or a capture.
     * @param {Object} [params.sections] - The target placement; the configuration by default.
     * @param {string[]} [params.deployIds] - The deployments whose endpoints are checked.
     * @param {Object} [params.options]
     * @param {string} [params.path]
     * @returns {{resources: Object[], endpoints: Object[], namespaces: Object[], blockers: Object[]}}
     * @memberof UnderpostNamespace
     */
    compare({ observation, sections, deployIds, options = {}, path = CLUSTER_CONF_PATH }) {
      const params = { environment: observation.environment, options, path, sections };
      const resources = UnderpostNamespace.API.resolveAll(params).map((placement) => {
        const definition = NAMESPACE_RESOURCES[placement.resource];
        const observed = placementOf(placement.resource, observation.controllers);
        const state = resourceState(definition, placement.namespace, observed);
        const ids = observed.controllers.map(objectId);
        const scheduling = scheduleOf({ ...params, resource: placement.resource });
        const missing = ['placed', 'destination-prepared'].includes(state)
          ? definition.services.filter(
              (name) =>
                !observation.services.some(
                  (service) => service.name === name && service.namespace === placement.namespace,
                ),
            )
          : [];
        return {
          resource: placement.resource,
          label: definition.label,
          role: definition.role,
          target: placement.namespace,
          source: placement.source,
          desired: placement.desired,
          migration: placement.migration ?? null,
          state,
          strategy:
            state === 'not-deployed'
              ? 'not-deployed'
              : configurable(definition) && !UPSTREAM_ROLES.includes(definition.role)
                ? 'recreate'
                : 'fixed',
          observed: observed.namespaces,
          node: {
            group: scheduling.group,
            mode: scheduling.mode,
            rule: scheduling.source,
            members: scheduling.members,
            targets: scheduling.nodes,
            ...(scheduling.error ? { message: scheduling.error } : {}),
            ...nodePlacement({
              targets: scheduling.nodes,
              mode: scheduling.mode,
              error: scheduling.error,
              controllers: observation.controllers.filter((controller) => ids.includes(objectId(controller))),
              nodes: observation.nodes,
            }),
          },
          controllers: observed.controllers,
          duplicates: observed.duplicates,
          missingServices: missing,
        };
      });
      const endpoints = UnderpostNamespace.API.deployEndpoints({
        ...params,
        deployIds,
        services: observation.services,
      });
      const byName = new Map(observation.namespaces.map((entry) => [entry.name, entry]));
      const required = Map.groupBy(
        resources.filter(
          ({ state, resource: id }) =>
            ['placed', 'destination-prepared'].includes(state) ||
            (!NAMESPACE_RESOURCES[id].optional && configurable(NAMESPACE_RESOURCES[id])),
        ),
        ({ target }) => target,
      );
      const namespaces = [...required].map(([name, owners]) => {
        const stored = byName.get(name);
        return {
          namespace: name,
          resources: owners.map(({ resource: id }) => id),
          roles: [...new Set(owners.map(({ role }) => role))],
          exists: Boolean(stored),
          phase: stored?.phase ?? '',
          owned: owners.some(({ role }) => ownsNamespace(role, name)),
          labeled: stored?.owned === true,
        };
      });
      const blockers = [
        ...resources
          .filter(({ state }) => state === 'duplicate')
          .flatMap(({ label, duplicates }) =>
            duplicates.map(({ controller, namespaces: where }) => ({
              code: 'duplicate',
              namespaces: where,
              message: `${label}: ${controller} runs active in ${where.join(' and ')}`,
            })),
          ),
        ...resources
          .filter(({ missingServices }) => missingServices.length)
          .map(({ label, target, missingServices }) => ({
            code: 'missing-service',
            message: `${target} holds ${label} without the Service ${missingServices.join(', ')}`,
          })),
        ...endpoints
          .filter(({ severity }) => severity === 'error')
          .map((entry) => ({ code: `endpoint-${entry.state}`, message: `${readersOf(entry)}: ${entry.message}` })),
        ...namespaces
          .filter(({ phase }) => phase === 'Terminating')
          .map(({ namespace }) => ({
            code: 'namespace-terminating',
            message: `Namespace ${namespace} is terminating`,
          })),
        ...resources
          .filter(({ node }) => NODE_BLOCKERS[node.state])
          .map(({ label, node }) => ({ code: node.state, message: `${label}: ${NODE_BLOCKERS[node.state](node)}` })),
      ];
      return { resources, endpoints, namespaces, blockers };
    },

    /**
     * Captures the live cluster of an environment into a private, versioned file. Reads only.
     * @param {{environment?:string, options?:Object, path?:string}} [params]
     * @returns {Promise<{capture:Object, file:string}>}
     * @memberof UnderpostNamespace
     */
    async capture(params = {}) {
      const observation = await UnderpostNamespace.API.observe(params);
      const createdAt = new Date();
      const capture = {
        schema: CAPTURE_VERSION,
        id: `${stamp(createdAt)}-${observation.cluster.fingerprint.slice(0, 8)}`,
        createdAt: createdAt.toISOString(),
        underpost: Underpost.version,
        ...observation,
      };
      const file = writePrivateJson(
        nodePath.join(CLUSTER_CAPTURES_PATH, observation.environment, `${capture.id}.json`),
        capture,
      );
      return { capture, file };
    },

    /**
     * Reads a capture of an environment.
     * @param {{environment?:string, options?:Object, path?:string, id?:string}} params - `id`: a
     *   capture id, or `latest`.
     * @returns {Object}
     * @throws {Error} When no capture matches, or a capture has another schema.
     * @memberof UnderpostNamespace
     */
    readCapture({ id = 'latest', ...params }) {
      const { environment } = UnderpostNamespace.API.cluster(params);
      const directory = nodePath.join(CLUSTER_CAPTURES_PATH, environment);
      const ids = fs.existsSync(directory)
        ? fs
            .readdirSync(directory)
            .filter((name) => name.endsWith('.json'))
            .map((name) => name.slice(0, -5))
            .sort()
        : [];
      const chosen = id === 'latest' ? ids.at(-1) : ids.find((entry) => entry === id);
      if (!chosen)
        throw refusal(`No capture ${id} of ${environment}: run node bin namespace capture --env ${environment}`);
      const capture = fs.readJsonSync(nodePath.join(directory, `${chosen}.json`));
      if (capture.schema !== CAPTURE_VERSION)
        throw refusal(`Capture ${chosen} has schema ${capture.schema}; this Underpost reads schema ${CAPTURE_VERSION}`);
      return capture;
    },

    /**
     * The configuration section of the placement a capture observes: the namespace of each configurable
     * resource that runs in one namespace, as overrides of the profile of the environment, the context of
     * the capture, its cluster domain and its cluster identity. A resource that runs in more than one namespace takes the
     * namespace `mappings` names, else adoption refuses to guess. An optional resource that does not run
     * takes its profile. The profile, the scheduling and the node groups stay; a new section takes the
     * legacy profile.
     * @param {Object} params
     * @param {Object} params.capture
     * @param {Object<string,string>} [params.mappings] - A namespace by resource id.
     * @param {boolean} [params.write] - Write the section to the configuration.
     * @param {string} [params.path]
     * @returns {{environment:string, section:Object, changes:Object[], ambiguous:Object[], omitted:string[],
     *   written:boolean, backup:string}}
     * @throws {Error} On a write while a resource is ambiguous.
     * @memberof UnderpostNamespace
     */
    adopt({ capture, mappings = {}, write = false, path = CLUSTER_CONF_PATH }) {
      const { environment } = capture;
      const placed = Object.entries(NAMESPACE_RESOURCES).filter(([, entry]) => configurable(entry));
      const flat = {};
      const ambiguous = [];
      const omitted = [];
      for (const [id, definition] of placed) {
        const observed = placementOf(id, capture.controllers);
        if (mappings[id]) flat[id] = assertName(mappings[id], `--map ${id}`);
        else if (observed.namespaces.length === 1) flat[id] = observed.namespaces[0];
        else if (observed.namespaces.length > 1) ambiguous.push({ resource: id, namespaces: observed.namespaces });
        else if (!definition.optional) flat[id] = builtinProfile(LEGACY_PROFILE).namespaces[id];
        else omitted.push(id);
      }
      const { profiles, sections } = clusterConf(path);
      const current = rawClusterConf(path);
      const raw = current.environments?.[environment] ?? { profile: LEGACY_PROFILE };
      const servers = [...new Set([...(raw.cluster?.servers ?? []), capture.cluster.server].filter(Boolean))];
      const section = withNamespaceOverrides(
        {
          ...raw,
          context: capture.context,
          clusterDomain: capture.cluster.domain || DEFAULT_CLUSTER_DOMAIN,
          cluster: { fingerprint: capture.cluster.fingerprint, servers },
        },
        flat,
        profiles[raw.profile]?.namespaces ?? {},
      );
      const next = { ...current, environments: { ...current.environments, [environment]: section } };
      const after = parseClusterConf(path, next).sections;
      const before = sectionOf(sections, environment);
      const namespaceOf = (id, configured) =>
        UnderpostNamespace.API.resolve({ resource: id, environment, sections: configured }).namespace;
      const changes = [
        ...['context', 'clusterDomain']
          .filter((key) => before[key] !== after[environment][key])
          .map((key) => ({ key, from: before[key], to: after[environment][key] })),
        ...(before.cluster?.fingerprint === capture.cluster.fingerprint &&
        before.cluster.servers.join() === servers.join()
          ? []
          : [
              {
                key: 'cluster',
                from: before.cluster ? JSON.stringify(before.cluster) : '',
                to: JSON.stringify(after[environment].cluster),
              },
            ]),
        ...placed
          .map(([id]) => ({
            key: `namespaces.${keyOf(id)}`,
            from: namespaceOf(id, sections),
            to: namespaceOf(id, after),
          }))
          .filter(({ from, to }) => from !== to),
      ];
      if (write && ambiguous.length)
        throw refusal(
          `Name the namespace of ${ambiguous.map(({ resource: id }) => id).join(', ')} with --map <resource>=<namespace>`,
        );
      const backup = write ? writeClusterConf(path, next) : '';
      return { environment, section, changes, ambiguous, omitted, written: write, backup };
    },

    /**
     * An operational summary of an environment: its cluster, its placement, the state of each resource,
     * its endpoints, its migration and its blockers, with the next command to run.
     * @param {{environment?:string, options?:Object, path?:string, deployIds?:string[]}} [params]
     * @returns {Promise<Object>}
     * @memberof UnderpostNamespace
     */
    async status({ deployIds, ...params } = {}) {
      const { environment, context } = UnderpostNamespace.API.cluster(params);
      const path = params.path ?? CLUSTER_CONF_PATH;
      const observation = await UnderpostNamespace.API.observe(params);
      const comparison = UnderpostNamespace.API.compare({ ...params, observation, deployIds });
      const migration = readPlan({ environment });
      const count = (entries) =>
        Object.fromEntries(
          [...Map.groupBy(entries, ({ state }) => state)].map(([state, group]) => [state, group.length]),
        );
      const missing = comparison.namespaces
        .filter(({ owned, exists }) => owned && !exists)
        .map(({ namespace }) => namespace);
      const duplicate = comparison.blockers.some(({ code }) => code === 'duplicate');
      const pending = comparison.resources.some(({ state }) =>
        ['pending-migration', 'destination-prepared'].includes(state),
      );
      return {
        environment,
        context: { configured: context, used: observation.context },
        cluster: observation.cluster,
        configuration: { path, section: Boolean(readClusterConf(path)[environment]) },
        resources: count(comparison.resources),
        endpoints: count(comparison.endpoints),
        nodes: count(comparison.resources.map(({ node }) => node).filter(({ state }) => state)),
        missingNamespaces: missing,
        notDeployed: comparison.resources.filter(({ state }) => state === 'not-deployed').map(({ resource: id }) => id),
        migration: migration
          ? {
              id: migration.plan.id,
              units: count(Object.values(migration.state.units).map(({ status }) => ({ state: status }))),
            }
          : null,
        blockers: comparison.blockers,
        next: duplicate
          ? `node bin namespace repair --env ${environment}`
          : missing.length
            ? `node bin namespace reconcile --env ${environment}`
            : migration
              ? `node bin namespace migrate --env ${environment} --list`
              : pending
                ? `node bin namespace capture --env ${environment}, then node bin namespace plan --env ${environment}`
                : '',
        comparison,
      };
    },

    /**
     * Compares the live cluster and the endpoints of the deployments with the placement of the
     * environment. Reads only.
     * @param {{environment?:string, options?:Object, path?:string, deployIds?:string[]}} [params]
     * @returns {Promise<Object>} `environment`, `context`, `cluster`, `namespaces`, `resources`,
     *   `clusterScoped`, `endpoints` and `findings`.
     * @memberof UnderpostNamespace
     */
    async audit({ deployIds, ...params } = {}) {
      const { context: configured } = UnderpostNamespace.API.cluster(params);
      const { environment, context, source, refusal: refused } = UnderpostNamespace.API.target(params);
      const report = {
        environment,
        context: { configured, target: context, source, available: false },
        cluster: { reachable: false },
      };
      const findings = [];
      if (!context) {
        if (!refused)
          findings.push(
            finding(
              'warning',
              'context-unset',
              `conf.cluster.json names no context for ${environment}: kubectl uses the current one (${source})`,
            ),
          );
      } else {
        const contexts = (await kubectlFactory('')(['config', 'get-contexts', '-o', 'name'], { silentOnError: true }))
          .stdout;
        report.context.available = contexts.split('\n').includes(context);
        if (!report.context.available)
          findings.push(finding('error', 'context-missing', `The kubeconfig has no context ${context}`));
      }
      let observation;
      try {
        observation = await UnderpostNamespace.API.observe(params);
      } catch (error) {
        report.cluster.error = error.message;
        report.endpoints = UnderpostNamespace.API.deployEndpoints({ ...params, deployIds });
        return {
          ...report,
          namespaces: [],
          resources: [],
          clusterScoped: [],
          findings: [
            finding('error', 'cluster', error.message),
            ...findings,
            ...report.endpoints
              .filter(({ severity }) => severity)
              .map((entry) =>
                finding(entry.severity, `endpoint-${entry.state}`, `${readersOf(entry)}: ${entry.message}`),
              ),
          ],
        };
      }
      report.cluster = { reachable: true, ...observation.cluster };
      const comparison = UnderpostNamespace.API.compare({ ...params, observation, deployIds });
      for (const { label, state, target, observed, node } of comparison.resources) {
        if (['pending-migration', 'destination-prepared'].includes(state))
          findings.push(
            finding(
              'warning',
              state,
              `${observed.join(', ')} holds ${label}, which the placement puts in ${target}: plan its migration`,
            ),
          );
        if (node.state === 'node-mismatch')
          findings.push(
            finding(
              'warning',
              node.state,
              `${label} runs on ${node.observed.join(', ')}, which the scheduling puts on ${node.target}: recreate it`,
            ),
          );
      }
      for (const entry of comparison.endpoints.filter(({ severity }) => severity === 'warning'))
        findings.push(finding('warning', `endpoint-${entry.state}`, `${readersOf(entry)}: ${entry.message}`));
      for (const blocker of comparison.blockers) findings.push(finding('error', blocker.code, blocker.message));
      findings.push(...dependencyFindings({ observation, options: params.options, path: params.path }));
      for (const { namespace, exists, owned, labeled, resources } of comparison.namespaces) {
        if (!exists && owned)
          findings.push(
            finding(
              'warning',
              'namespace-missing',
              `Namespace ${namespace} does not exist (${resources}): reconcile creates it`,
            ),
          );
        if (exists && owned && !labeled)
          findings.push(
            finding('warning', 'namespace-unlabeled', `Namespace ${namespace} has no Underpost ownership label`),
          );
      }
      const present = (kind, name) =>
        [
          ...observation.storage.classes.map((entry) => ({ kind: 'storageclass', ...entry })),
          ...observation.storage.volumes.map((entry) => ({ kind: 'persistentvolume', ...entry })),
        ].some((entry) => entry.kind === kind && entry.name === name);
      return {
        ...report,
        namespaces: comparison.namespaces,
        resources: comparison.resources,
        clusterScoped: Object.entries(NAMESPACE_RESOURCES).flatMap(([id, { clusterScoped }]) =>
          clusterScoped.map((object) => {
            const [kind, name] = object.split('/');
            return {
              kind,
              name,
              resource: id,
              present: ['storageclass', 'persistentvolume'].includes(kind) ? present(kind, name) : null,
            };
          }),
        ),
        endpoints: comparison.endpoints,
        findings,
      };
    },

    /**
     * Creates the missing namespaces Underpost owns, and labels the ones it owns without its label, with
     * server-side apply under the field manager `underpost`. A dry run sends each change as a server dry
     * run. It changes namespaces only: no workload, data, endpoint or volume.
     * @param {{environment?:string, options?:Object, path?:string, apply?:boolean, deployIds?:string[]}} [params]
     * @returns {Promise<{plan:Object[], applied:boolean, audit:Object}>} `audit` is read after an apply.
     * @throws {Error} When the cluster does not answer, or the API server refuses a change.
     * @memberof UnderpostNamespace
     */
    async reconcile({ apply = false, ...params } = {}) {
      const before = await UnderpostNamespace.API.audit(params);
      if (!before.cluster.reachable) throw refusal(`The cluster does not answer: ${before.cluster.error}`);
      const steps = namespaceSteps(before.namespaces);
      await applyNamespaceSteps(kubectlFactory(before.context.target), steps, apply);
      const audit = apply && steps.length ? await UnderpostNamespace.API.audit(params) : before;
      if (apply)
        for (const { namespace } of steps) {
          const result = audit.namespaces.find((entry) => entry.namespace === namespace);
          if (!result?.exists || !result.labeled)
            throw new Error(`Namespace ${namespace} is not in place after the apply`);
        }
      return { plan: steps.map(({ manifest, ...step }) => step), applied: apply, audit };
    },

    /**
     * Repairs the drift Underpost owns and can undo: the namespaces of {@link UnderpostNamespace.reconcile};
     * each Underpost CronJob that runs active outside the namespace of the operations while its copy there
     * runs, which it suspends so that one copy owns each schedule; the TLS of each host
     * ({@link UnderpostTls.reconcile}); and the stale routing ({@link UnderpostIngress.reconcile}). It deletes
     * no workload, data or volume. A dry run sends each change as a server dry run.
     * @param {{environment?:string, options?:Object, path?:string, apply?:boolean, deployIds?:string[]}} [params]
     * @returns {Promise<{plan:Object[], applied:boolean, unchanged:string[]}>} `unchanged` names what it
     *   leaves: the blockers of the comparison, each TLS and routing error, and the Certificates not Ready.
     * @memberof UnderpostNamespace
     */
    async repair({ apply = false, ...params } = {}) {
      const observation = await UnderpostNamespace.API.observe(params);
      // The context this observation read, named on every change, so none reaches another cluster.
      const { context } = observation;
      const comparison = UnderpostNamespace.API.compare({ ...params, observation });
      const kubectl = kubectlFactory(context);
      const operations = comparison.resources.find(({ resource: id }) => id === 'operations');
      const extra = duplicateCopies(operations, observation.controllers);
      const { routing, tls } = dependencyPlans({ observation, options: params.options, path: params.path });
      const steps = [
        ...namespaceSteps(comparison.namespaces),
        ...extra.map((copy) => ({
          action: 'suspend',
          object: objectId(copy),
          keep: `${operations.target}/${copy.name}`,
        })),
      ];
      await applyNamespaceSteps(
        kubectl,
        steps.filter(({ manifest }) => manifest),
        apply,
      );
      await setSuspended(kubectl, extra, { suspend: true, apply });
      // The TLS first: a Secret moves to its routing object before the stale routing that served it goes.
      const { done, unready } = await Underpost.tls.applySteps(kubectl, tls.steps, apply);
      await Underpost.ingress.applySteps(kubectl, routing.steps, apply);
      // A repair is verified against the cluster it changed.
      const after = apply
        ? dependencyPlans({
            observation: await UnderpostNamespace.API.observe({ ...params, context }),
            options: params.options,
            path: params.path,
          })
        : { routing, tls };
      return {
        context,
        plan: [
          ...steps.map(({ manifest, ...step }) => step),
          ...done.map(({ manifest, ...step }) => ({ ...step, domain: 'tls' })),
          ...routing.steps.map((step) => ({ ...step, domain: 'ingress' })),
        ],
        applied: apply,
        unchanged: [
          ...comparison.blockers
            .filter(({ code, namespaces }) => code !== 'duplicate' || !namespaces.includes(operations.target))
            .map(({ message }) => message),
          ...Underpost.tls.unchanged(after.tls.findings, apply).map(({ message }) => message),
          ...Underpost.ingress.unchanged(after.routing.findings, apply).map(({ message }) => message),
          ...unready.map((id) => `${id} is not Ready yet: a Certificate it replaces stays`),
        ],
      };
    },

    /**
     * Makes sure the namespace of one owned resource exists before a command deploys into it.
     * @param {{resource:string, environment?:string, options?:Object}} params
     * @returns {Promise<string>} The namespace.
     * @memberof UnderpostNamespace
     */
    async ensure(params) {
      const placement = UnderpostNamespace.API.resolve(params);
      if (!ownsNamespace(placement.role, placement.namespace)) return placement.namespace;
      const kubectl = kubectlFactory(placement.context);
      const found = await kubectl(['get', 'namespace', placement.namespace, '-o', 'name'], { silentOnError: true });
      if (found.code === 0) return placement.namespace;
      await kubectl(['apply', '--server-side', `--field-manager=${FIELD_MANAGER}`, '-f', '-'], {
        input: JSON.stringify(
          namespaceManifest({
            namespace: placement.namespace,
            roles: [placement.role],
            resources: [placement.resource],
          }),
        ),
      });
      logger.info(`Created namespace ${placement.namespace} for ${NAMESPACE_RESOURCES[placement.resource].label}`);
      return placement.namespace;
    },

    /**
     * The Services of the live cluster of an environment; null when it does not answer, when the
     * execution profile does not let this process read it, or when it is a production cluster the
     * configuration does not name.
     * @param {{environment?:string, options?:Object, path?:string}} [params]
     * @returns {Promise<Array<{namespace:string, name:string}>|null>}
     * @memberof UnderpostNamespace
     */
    async services(params = {}) {
      const { context, refusal: refused } = UnderpostNamespace.API.target(params);
      if (refused) return null;
      const result = await kubectlFactory(context)(
        [
          'get',
          'services',
          '--all-namespaces',
          '--request-timeout=10s',
          '-o',
          'jsonpath={range .items[*]}{.metadata.namespace}/{.metadata.name}{"\\n"}{end}',
        ],
        { silentOnError: true },
      ).catch(() => ({ code: 1 }));
      if (result.code !== 0 || result.elided) return null;
      return result.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [namespace, name] = line.split('/');
          return { namespace, name };
        });
    },

    /**
     * The namespaces outside `namespace` that run an active Underpost CronJob of each name: a copy
     * applied in `namespace` would run its schedule twice.
     * @param {{names:string[], namespace:string, environment?:string, options?:Object, path?:string}} params
     * @returns {Promise<Map<string, string[]>>}
     * @memberof UnderpostNamespace
     */
    async activeSchedules({ names, namespace, ...params }) {
      const { context } = UnderpostNamespace.API.cluster(params);
      const { stdout } = await kubectlFactory(context)([
        'get',
        'cronjobs',
        '--all-namespaces',
        '-l',
        'managed-by=underpost',
        '-o',
        'json',
      ]);
      const owners = new Map();
      for (const { metadata, spec } of stdout.trim() ? JSON.parse(stdout).items : [])
        if (names.includes(metadata.name) && metadata.namespace !== namespace && spec?.suspend !== true)
          owners.set(metadata.name, [...(owners.get(metadata.name) ?? []), metadata.namespace]);
      return owners;
    },

    plan,
    migrate,

    /**
     * The profiles a configuration can select.
     * @param {string} [path] - The configuration file.
     * @returns {Array<{id:string, origin:'built-in'|'custom', file:string, groups:string[]}>}
     * @memberof UnderpostNamespace
     */
    profiles(path = CLUSTER_CONF_PATH) {
      return Object.values(profilesOf(path)).map(({ id, file, scheduling }) => ({
        id,
        origin: builtinProfiles()[id] ? 'built-in' : 'custom',
        file,
        groups: [...new Set(Object.values(scheduling).flatMap(({ group }) => (group ? [group] : [])))],
      }));
    },

    /**
     * One profile as its file holds it.
     * @param {string} id
     * @param {string} [path] - The configuration file.
     * @returns {{id:string, origin:string, file:string, namespaces:Object, scheduling:Object}}
     * @throws {Error} On an unknown id.
     * @memberof UnderpostNamespace
     */
    profile(id, path = CLUSTER_CONF_PATH) {
      const profiles = profilesOf(path);
      if (!profiles[id]) throw refusal(`${id} is not a profile: ${Object.keys(profiles).join(', ')}`);
      const { file, namespaces, scheduling } = profiles[id];
      return {
        id,
        origin: builtinProfiles()[id] ? 'built-in' : 'custom',
        file,
        namespaces: sectionNamespaces(namespaces),
        scheduling,
      };
    },

    /**
     * The node groups of an environment against the node registry and the live cluster: each member with
     * its record, its Kubernetes node, the connection of its peer and the state of its node, and the
     * findings: an empty group the scheduling uses, a missing record, a record without a Kubernetes node,
     * two records with one node, a node the cluster lacks or that is not Ready, and a live node no record
     * names, with the record that can name it. Reads only.
     * @param {{environment?:string, options?:Object, path?:string}} [params]
     * @returns {Promise<{environment:string, reachable:boolean, groups:Object[], findings:Object[]}>}
     * @memberof UnderpostNamespace
     */
    async nodes(params = {}) {
      const { environment } = UnderpostNamespace.API.cluster(params);
      const section = sectionOf(readClusterConf(params.path ?? CLUSTER_CONF_PATH), environment);
      const records = readNodeConfigs();
      const live = await liveNodes(params);
      const { groups, findings } = groupFindings({ environment, section, records, live });
      for (const { name } of live ?? [])
        if (!records.some(({ kubernetesNodeName }) => kubernetesNodeName === name)) {
          const match = records.find(({ nodeName, kubernetesNodeName }) => nodeName === name && !kubernetesNodeName);
          findings.push(
            finding(
              'warning',
              'node-unrecorded',
              `no node record names the node ${name}${match ? `; ${match.nodeName} can: ${identifyCommand(match.nodeName, name)}` : ''}`,
            ),
          );
        }
      return {
        environment,
        reachable: Boolean(live),
        groups: groups.map(({ group, members }) => ({
          group,
          members: members.map(({ peerId, ...member }) => ({
            ...member,
            peer: peerId === undefined ? '-' : peerOf({ peerId }),
          })),
        })),
        findings,
      };
    },

    /**
     * Records the Kubernetes node of a node record, after a check that the cluster of the environment has
     * it, when the cluster answers. A dry run writes nothing; an apply backs up the record, then replaces it.
     * @param {Object} params
     * @param {string} params.record - A record of `engine-private/deploy/nodes`.
     * @param {string} params.kubernetesNode
     * @param {boolean} [params.apply]
     * @param {Object} [params.options]
     * @returns {Promise<{record:string, file:string, from:string, to:string, checked:boolean, applied:boolean,
     *   backup:string}>}
     * @throws {Error} On a missing record, an invalid name, a node another record names, or a node the
     *   cluster lacks.
     * @memberof UnderpostNamespace
     */
    async identifyNode({ record, kubernetesNode, apply = false, ...params }) {
      if (!record || !kubernetesNode)
        throw refusal(
          'Name the record and its node: node bin namespace nodes identify <record> --kubernetes-node <node>',
        );
      const records = readNodeConfigs();
      const current = records.find(({ nodeName }) => nodeName === record);
      if (!current) throw refusal(`${recordFile(record)} does not exist`);
      let identity;
      try {
        identity = nodeIdentityFactory({ ...current, kubernetesNodeName: kubernetesNode });
      } catch (error) {
        throw refusal(error.message);
      }
      const twin = records.find(
        ({ nodeName, kubernetesNodeName }) => nodeName !== record && kubernetesNodeName === kubernetesNode,
      );
      if (twin) throw refusal(`${recordFile(twin.nodeName)} already names the node ${kubernetesNode}`);
      const live = await liveNodes(params);
      if (live && !live.some(({ name }) => name === kubernetesNode))
        throw refusal(`The cluster has no node ${kubernetesNode}: it has ${live.map(({ name }) => name).join(', ')}`);
      const result = {
        record,
        file: recordFile(record),
        from: current.kubernetesNodeName,
        to: kubernetesNode,
        checked: Boolean(live),
        applied: apply && current.kubernetesNodeName !== kubernetesNode,
        backup: '',
      };
      if (result.applied) {
        result.backup = backupFile(result.file);
        writeNodeIdentity(identity);
      }
      return result;
    },

    /**
     * The `underpost namespace` command.
     * @param {string} operation - `status`, `resolve`, `env`, `config`, `profile`, `nodes`, `audit`,
     *   `capture`, `adopt`, `plan`, `migrate`, `reconcile` or `repair`.
     * @param {string} [action] - For resolve: one resource; for config: `migrate`; for profile: `list` or
     *   `show`; for nodes: `audit` or `identify`.
     * @param {string} [name] - For profile show: a profile; for nodes identify: a node record.
     * @param {Object} [options]
     * @memberof UnderpostNamespace
     */
    async callback(operation, action, name, options = {}) {
      try {
        const params = { options };
        const apply = options.apply === true;
        if ((apply || options.writeConfig) && options.dryRun)
          throw refusal('Use --dry-run, or --apply and --write-config, not both');
        const run = {
          status: async () => print(await UnderpostNamespace.API.status(params), options, statusText),
          target: () => {
            const report = UnderpostNamespace.API.inspectTarget(params);
            print(report, options, targetText);
            process.exitCode = report.refusal ? 3 : 0;
          },
          resolve: () =>
            print(
              action
                ? [
                    {
                      ...UnderpostNamespace.API.resolve({ ...params, resource: action }),
                      scheduling: scheduleOf({ ...params, resource: action }),
                      observed: observedOf({ ...params, resource: action }),
                    },
                  ]
                : UnderpostNamespace.API.resolveAll(params).map((placement) => ({
                    ...placement,
                    scheduling: scheduleOf({ ...params, resource: placement.resource }),
                  })),
              options,
              resolveText,
            ),
          env: () => console.log(envText(params)),
          audit: async () => {
            const report = await UnderpostNamespace.API.audit(params);
            print(report, options, auditText);
            process.exitCode = report.findings.some(({ severity }) => severity === 'error') ? 3 : 0;
          },
          capture: async () => print(await UnderpostNamespace.API.capture(params), options, captureText),
          adopt: () =>
            print(
              UnderpostNamespace.API.adopt({
                capture: UnderpostNamespace.API.readCapture({ ...params, id: options.capture }),
                mappings: mappingsOf(options.map),
                write: options.writeConfig === true,
              }),
              options,
              adoptText,
            ),
          plan: async () =>
            print(
              await UnderpostNamespace.API.plan({ ...params, capture: options.capture, target: options.target }),
              options,
              migrationText,
            ),
          migrate: async () =>
            print(
              await UnderpostNamespace.API.migrate({
                ...params,
                id: options.plan,
                resource: options.resource,
                view: ['list', 'status', 'verify', 'resume'].find((view) => options[view]) ?? 'preview',
                apply,
                confirmDestructive: options.confirmDestructive === true,
              }),
              options,
              migrationText,
            ),
          profile: () => {
            if (action === 'show') return print(UnderpostNamespace.API.profile(name), options, profileText);
            if (action && action !== 'list') throw refusal('profile takes list or show <profile>');
            print(UnderpostNamespace.API.profiles(), options, profilesText);
          },
          nodes: async () => {
            if (action === 'identify')
              return print(
                await UnderpostNamespace.API.identifyNode({
                  ...params,
                  record: name,
                  kubernetesNode: options.kubernetesNode,
                  apply,
                }),
                options,
                identifyText,
              );
            if (action && action !== 'audit') throw refusal('nodes takes audit or identify <record>');
            const report = await UnderpostNamespace.API.nodes(params);
            print(report, options, action === 'audit' ? nodesAuditText : nodesText);
            if (action === 'audit')
              process.exitCode = report.findings.some(({ severity }) => severity === 'error') ? 3 : 0;
          },
          reconcile: async () =>
            print(await UnderpostNamespace.API.reconcile({ ...params, apply }), options, reconcileText),
          repair: async () => print(await UnderpostNamespace.API.repair({ ...params, apply }), options, repairText),
        }[operation];
        if (!run) throw refusal(`Unknown operation ${operation}: ${NAMESPACE_OPERATIONS.join(', ')}`);
        await run();
      } catch (error) {
        logger.error(error.message);
        if (error.stderr?.trim()) logger.error(error.stderr.trim());
        process.exitCode = error.expected ? 3 : 1;
      }
    },
  };
}

/** The operations of `underpost namespace`, in the order an operator meets them. */
const NAMESPACE_OPERATIONS = Object.freeze([
  'target',
  'status',
  'resolve',
  'env',
  'profile',
  'nodes',
  'audit',
  'capture',
  'adopt',
  'plan',
  'migrate',
  'reconcile',
  'repair',
]);

/**
 * The cluster target of a command ({@link UnderpostNamespace.target}).
 * @throws {Error} When the target is refused.
 */
const assertTarget = (params) => {
  const target = UnderpostNamespace.API.target(params);
  if (target.refusal) throw refusal(target.refusal);
  return target;
};

/** The nodes of the cluster of an environment ({@link nodeRecord}); null when it may not be read or does not answer. */
const liveNodes = async (params) => {
  const { context, refusal: refused } = UnderpostNamespace.API.target(params);
  if (refused) return null;
  const result = await kubectlFactory(context)(['get', 'nodes', '-o', 'json', '--request-timeout=10s'], {
    silentOnError: true,
  }).catch(() => ({ code: 1 }));
  if (result.code !== 0 || result.elided || !result.stdout.trim()) return null;
  return (JSON.parse(result.stdout).items ?? []).map(nodeRecord);
};

/** The state of a live node for a listing: `Ready`, `NotReady` or `cordoned`. */
const nodeState = ({ ready, unschedulable }) => (!ready ? 'NotReady' : unschedulable ? 'cordoned' : 'Ready');

/** How this machine reaches the machine of a node record: its peer connection, or why it cannot. */
const peerOf = (record) => {
  if (!record.peerId) return 'no peer';
  try {
    return Underpost.event.spokeTarget(record.peerId).via;
  } catch (error) {
    return `unresolved: ${error.message}`;
  }
};

/** The controllers of a resource in the latest capture of its environment and their nodes; null without a capture. */
const observedOf = ({ resource: id, ...params }) => {
  let capture;
  try {
    capture = UnderpostNamespace.API.readCapture({ ...params, id: 'latest' });
  } catch (error) {
    if (error.expected) return null;
    throw error;
  }
  const ids = placementOf(id, capture.controllers).controllers.map(objectId);
  return {
    capture: capture.id,
    controllers: capture.controllers
      .filter((controller) => ids.includes(objectId(controller)))
      .map((controller) => ({ id: objectId(controller), nodes: controller.pods?.nodes ?? [] })),
  };
};

/**
 * The routing plan of the observation and the TLS plan of every host of the route table. The TLS plan
 * ignores the Gateways the routing plan removes.
 */
const dependencyPlans = ({ observation, options = {}, path }) => {
  const routing = Underpost.ingress.plan(observation, readDeployRoutes(), {
    gatewayClass: Underpost.ingress.gatewayApiConfigFactory(options).gatewayClassName,
  });
  const tls = Underpost.tls.plan({
    observation,
    selection: Underpost.ingress.hosts(),
    options,
    path,
    retired: routing.retired,
  });
  return { routing, tls };
};

/**
 * The TLS and routing findings of an observation; a deployment no routing object serves is not a placement drift.
 * An environment without its routing provider or TLS policy is one finding.
 */
const dependencyFindings = (params) => {
  let plans;
  try {
    plans = dependencyPlans(params);
  } catch (error) {
    if (!error.expected) throw error;
    return [finding('error', 'environment-incomplete', error.message)];
  }
  const { routing, tls } = plans;
  return [...tls.findings.filter(({ code }) => code !== 'tls-unrouted'), ...routing.findings].map(
    ({ severity, code, message }) => finding(severity, code, message),
  );
};

/** The kubectl of a placement: explicit about its context when the configuration names one. `log` prints each command. */
export const kubectlFactory =
  (context, { log = false } = {}) =>
  (args, options = {}) =>
    runCommand('kubectl', [...(context ? ['--context', context] : []), ...args], { disableLog: !log, ...options });

/** The active Underpost CronJobs that run outside the namespace of the operations while their copy there runs. */
const duplicateCopies = (operations, controllers) => {
  if (!operations) return [];
  const active = controllers.filter(
    (controller) =>
      controller.kind === 'CronJob' && !controller.suspended && matches('cronjob:managed-by=underpost', controller),
  );
  return active.filter(
    (copy) =>
      copy.namespace !== operations.target &&
      active.some((owner) => owner.namespace === operations.target && owner.name === copy.name),
  );
};

/** Suspends or resumes CronJobs under the field manager `underpost`; a dry run asks the API server to validate only. */
export const setSuspended = async (kubectl, copies, { suspend, apply }) => {
  for (const copy of copies) {
    await kubectl([
      'patch',
      'cronjob',
      copy.name,
      '-n',
      copy.namespace,
      '--type=merge',
      '-p',
      JSON.stringify({ spec: { suspend } }),
      `--field-manager=${FIELD_MANAGER}`,
      ...(apply ? [] : ['--dry-run=server']),
    ]);
    logger.info(
      `${apply ? (suspend ? 'Suspended' : 'Resumed') : `Dry run: ${suspend ? 'suspend' : 'resume'}`} CronJob ` +
        `${copy.namespace}/${copy.name}`,
    );
  }
};

/** The namespace changes a set of expected namespaces needs: create the missing ones, label the unlabeled. */
export const namespaceSteps = (namespaces) =>
  namespaces
    .filter(({ owned, exists, labeled }) => owned && (!exists || !labeled))
    .map(({ namespace, roles, resources, exists }) => ({
      action: exists ? 'label' : 'create',
      namespace,
      manifest: namespaceManifest({ namespace, roles, resources }),
    }));

/** Applies namespace changes with server-side apply under the field manager `underpost`. */
export const applyNamespaceSteps = async (kubectl, steps, apply) => {
  for (const step of steps) {
    await kubectl(
      ['apply', '--server-side', `--field-manager=${FIELD_MANAGER}`, ...(apply ? [] : ['--dry-run=server']), '-f', '-'],
      { input: JSON.stringify(step.manifest) },
    );
    logger.info(`${apply ? 'Applied' : 'Dry run'}: ${step.action} namespace ${step.namespace}`);
  }
};

/** What an endpoint state means for its consumers, and the correction it asks for. */
const endpointMessage = ({ source, key, host, effective, placed, state, namespace, service, resource: id }) => {
  const { label, endpoints } = NAMESPACE_RESOURCES[id];
  return {
    'missing-service': `${source}: ${key} reaches ${effective}, but ${namespace} holds no Service ${service}`,
    stale:
      `${source}: ${key} names ${host}, but ${label} runs in ${namespace} (${placed}): ` +
      `name it env:${endpoints[0] ?? key}, which Underpost projects`,
    unknown: `${source}: ${key} names ${host}, which names no placed Service; check that it is ${label}`,
  }[state];
};

/** The deployments that read an endpoint, for a finding. */
const readersOf = ({ readers = [] }) => [...new Set(readers.map(({ deployId }) => deployId))].join(', ');

/** The namespace of each resource `--map` names: `resource=namespace,...`. */
const mappingsOf = (value) => {
  const pairs = pairsOf(value, 'map');
  for (const [id, namespace] of Object.entries(pairs))
    if (!NAMESPACE_RESOURCES[id]) throw refusal(`--map ${id}=${namespace}: ${id} is not a placed resource`);
  return pairs;
};

/** The pairs of a `--<flag> key=value,...` option. */
const pairsOf = (value = '', flag) =>
  Object.fromEntries(
    `${value}`
      .split(',')
      .filter(Boolean)
      .map((entry) => {
        const [key, item] = entry.split('=');
        if (!key || !item) throw refusal(`--${flag} ${entry} is not <key>=<value>`);
        return [key, item];
      }),
  );

const finding = (severity, code, message) => ({ severity, code, message });

const namespaceManifest = ({ namespace, roles, resources }) => ({
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: {
    name: namespace,
    labels: { ...MANAGED_BY, [ROLE_LABEL]: [...new Set(roles)].sort().join('.') },
    annotations: { [RESOURCES_ANNOTATION]: [...resources].sort().join(',') },
  },
});

/** Prints a report: JSON with `--json`, else its text. */
export const print = (value, options, text) => console.log(options.json ? JSON.stringify(value, null, 2) : text(value));

/** One line per finding, its severity first. */
export const findingLines = (findings, none = '  none') =>
  findings.length ? findings.map(({ severity, message }) => `  ${severity.padEnd(8)} ${message}`) : [none];

/**
 * One line of shell assignments: the pinned `KUBECONFIG`, the cluster, the namespace of each resource and
 * the Kubernetes nodes of each category with a node group, separated by spaces.
 */
const envText = (params) => {
  const { context } = assertTarget(params);
  const { clusterDomain } = UnderpostNamespace.API.cluster(params);
  return Object.entries({
    UNDERPOST_KUBECONFIG: context && !isOciRuntime() ? kubeconfigOf(context) : (process.env.KUBECONFIG ?? ''),
    UNDERPOST_CONTEXT: context,
    UNDERPOST_CLUSTER_DOMAIN: clusterDomain,
    ...Object.fromEntries(
      UnderpostNamespace.API.resolveAll(params).map(({ resource: id, namespace }) => [variableOf(id), namespace]),
    ),
    ...Object.fromEntries(
      Object.keys(NAMESPACE_RESOURCES)
        .map((id) => UnderpostNamespace.API.schedule({ ...params, resource: id }))
        .filter(({ category, nodes }) => category && nodes.length)
        .map(({ category, nodes }) => [`UNDERPOST_NODES_${category.toUpperCase()}`, nodes.join(' ')]),
    ),
  })
    .map(([key, value]) => `${key}=${shellArgumentFactory(value)}`)
    .join(' ');
};

const counts = (value) =>
  Object.entries(value)
    .map(([state, count]) => `${state} ${count}`)
    .join(' · ') || 'none';

/** A node record file. */
const recordFile = (record) => `${EDGE_NODES_PATH}/${record}.json`;

/** Where the nodes of a resource come from: its node group and mode, the records of the group and their nodes. */
const nodeChain = ({ group, mode, members, nodes, source, error }) =>
  error ||
  (group
    ? `group ${group}, ${mode} (${source}) → ${members.map(recordFile).join(', ')} → ${nodes.join(', ')}`
    : `${nodes.join(', ') || mode} (${source})`);

const resolveText = (value) =>
  value.length === 1
    ? resolveDetailText(value[0])
    : [
        `${'RESOURCE'.padEnd(17)} ${'NAMESPACE'.padEnd(24)} ${'NODES'.padEnd(24)} SOURCE`,
        ...value.map(
          ({ resource: id, namespace, desired, context, environment, source, scheduling }) =>
            `${id.padEnd(17)} ${namespace.padEnd(24)} ${(scheduling.nodes.join(',') || '-').padEnd(24)} ${source}` +
            `${desired === namespace ? '' : `; desired ${desired}`}` +
            `${context ? ` (context ${context}, ${environment})` : ` (${environment})`}\n` +
            `${''.padEnd(17)} node: ${nodeChain(scheduling)}`,
        ),
      ].join('\n');

/** The placement of one resource, one source per line: its profile, its namespace, its nodes, what runs and its migration. */
const resolveDetailText = ({
  resource: id,
  namespace,
  desired,
  environment,
  source,
  scheduling,
  observed,
  migration,
}) =>
  [
    `${id} (${environment})`,
    ...[
      ['profile', scheduling.profile || '-'],
      ['namespace', `${namespace} (${source})${desired === namespace ? '' : `; desired ${desired}`}`],
      ...(scheduling.error
        ? [['nodes', scheduling.error]]
        : scheduling.group
          ? [
              ['node group', `${scheduling.group}, ${scheduling.mode} (${scheduling.source})`],
              ['group members', scheduling.members.map(recordFile).join(', ')],
              ['Kubernetes nodes', scheduling.nodes.join(', ')],
            ]
          : [['nodes', nodeChain(scheduling)]]),
      [
        'observed',
        observed
          ? `${observed.controllers.map(({ id: controller, nodes }) => `${controller} on ${nodes.join(', ') || 'no node'}`).join('; ') || 'nothing runs'} (capture ${observed.capture})`
          : 'no capture: node bin namespace capture',
      ],
      ...(migration
        ? [
            [
              'migration',
              `plan ${migration.plan}: ${migration.unit} ${migration.from} → ${migration.to}, ` +
                `${migration.placed ? 'placed in its destination' : 'runs in its source'}`,
            ],
          ]
        : []),
    ].map(([key, value]) => `  ${key.padEnd(17)} ${value}`),
  ].join('\n');

const resourceLines = (resources) =>
  resources.map(
    ({ resource: id, target, state, observed, migration, node }) =>
      `  ${id.padEnd(17)} ${target.padEnd(24)} ${state}${observed.length && !(state === 'placed' || state === 'fixed') ? ` (runs in ${observed.join(', ')})` : ''}` +
      `${migration ? ` (${migration.unit}: ${migration.from} → ${migration.to}, ${migration.status})` : ''}` +
      `${node.state ? `; node ${node.role || node.target || '-'} ${node.state}${node.state === 'placed' || node.state === 'daemonset' ? '' : ` (runs on ${node.observed.join(', ') || 'none'}, target ${node.target || 'none'})`}` : ''}`,
  );

const endpointLines = (endpoints) =>
  endpoints.length
    ? endpoints.map(
        (entry) =>
          `  ${`${entry.key} ${entry.effective}`.padEnd(64)} ${entry.state}${entry.verified ? '' : ' (not checked against the cluster)'}` +
          `${entry.effective === entry.host ? '' : ` (the file names ${entry.host})`}  ${readersOf(entry)}`,
      )
    : ['  none'];

const targetText = ({ target, live, refusal: refused, declaration }) =>
  [
    `Environment    ${target.environment}`,
    `Context        ${live?.context || target.context || '(none)'} (${target.source || 'refused'})`,
    `Kubeconfig     ${target.kubeconfig.join(nodePath.delimiter) || 'the service account of the pod'}`,
    `Runtime        ${target.runtime || 'not named'}`,
    `Profile        ${target.profile}`,
    `Configuration  ${target.configuration}`,
    `Cluster        ${live ? `${live.server || 'unknown server'}${live.fingerprint ? ` (kube-system ${live.fingerprint})` : ', not answering'}` : 'not read'}`,
    `Declared       ${target.cluster ? `${target.cluster.fingerprint}${target.cluster.servers.length ? ` at ${target.cluster.servers.join(', ')}` : ''}` : 'none'}`,
    `State          ${refused || (target.cluster ? 'verified' : 'identity not declared')}`,
    ...(target.blockers.length
      ? ['', 'A change is refused:', ...target.blockers.map((blocker) => `  ${blocker}`)]
      : []),
    ...(declaration && !target.cluster
      ? ['', `Declare it in environments.${target.environment}.cluster:`, `  ${JSON.stringify(declaration)}`]
      : []),
  ].join('\n');

const statusText = (status) =>
  [
    `Environment  ${status.environment}`,
    `Context      ${status.context.used || 'current'}${status.context.configured ? '' : ' (conf.cluster.json names none)'}`,
    `Cluster      ${status.cluster.fingerprint}  ${status.cluster.version}  ${status.cluster.server}`,
    `Placement    ${status.configuration.path}${status.configuration.section ? ` ${status.environment}` : ' (no section: legacy placement)'}`,
    `Resources    ${counts(status.resources)}`,
    `Endpoints    ${counts(status.endpoints)}`,
    `Nodes        ${counts(status.nodes)}`,
    `Namespaces   ${status.missingNamespaces.length ? `missing ${status.missingNamespaces.join(', ')}` : 'in place'}`,
    `Optional     not deployed: ${status.notDeployed.join(', ') || 'none'}`,
    `Migration    ${status.migration ? `${status.migration.id}: ${counts(status.migration.units)}` : 'none'}`,
    '',
    'Resources:',
    ...resourceLines(status.comparison.resources),
    '',
    'Blockers:',
    ...(status.blockers.length ? status.blockers.map(({ message }) => `  ${message}`) : ['  none']),
    ...(status.next ? ['', `Next: ${status.next}`] : []),
  ].join('\n');

const auditText = (report) =>
  [
    `Environment: ${report.environment}`,
    `Context: ${report.context.target || 'current'}${report.context.target && !report.context.available ? ' (missing)' : ''} (${report.context.source || 'refused'})`,
    `Cluster: ${report.cluster.reachable ? `reachable ${report.cluster.fingerprint}` : `unreachable: ${report.cluster.error}`}`,
    '',
    'Namespaces:',
    ...report.namespaces.map(
      ({ namespace, exists, phase, labeled, owned, resources }) =>
        `  ${namespace.padEnd(24)} ${exists ? phase || 'present' : 'missing'}${owned ? (labeled ? ', owned' : ', unlabeled') : ''}  ${resources.join(', ')}`,
    ),
    '',
    'Resources:',
    ...resourceLines(report.resources),
    '',
    'Endpoints:',
    ...endpointLines(report.endpoints),
    '',
    'Findings:',
    ...findingLines(report.findings),
  ].join('\n');

/** The node record of a live node: the one that names it, else a possible match by the name of its record. */
const recordOfNode = (records, name) => {
  const named = records.find(({ kubernetesNodeName }) => kubernetesNodeName === name);
  if (named) return `record ${named.nodeName}`;
  return records.some(({ nodeName, kubernetesNodeName }) => nodeName === name && !kubernetesNodeName)
    ? `possible record ${name}: ${identifyCommand(name, name)}`
    : 'no record';
};

const captureText = ({ capture, file }) =>
  [
    `Captured ${capture.environment} into ${file}`,
    `Context ${capture.context || 'current'}, cluster ${capture.cluster.fingerprint}, ${capture.cluster.version}`,
    'Nodes:',
    ...capture.nodes.map(
      ({ name, ready, roles }) =>
        `  ${name} (${[...roles, ready ? 'Ready' : 'NotReady'].join(', ')}): ${recordOfNode(readNodeConfigs(), name)}`,
    ),
    `${capture.controllers.length} controllers, ${capture.services.length} Services, ${capture.storage.claims.length} claims, ` +
      `${capture.config.secrets.length} Secrets (keys only), ${capture.references.length} cluster DNS references`,
    `Next: node bin namespace adopt --env ${capture.environment} --capture ${capture.id}`,
  ].join('\n');

const adoptText = ({ environment, changes, ambiguous, omitted, written, backup }) =>
  [
    `Placement of ${environment} the capture observes:`,
    ...(changes.length
      ? changes.map(({ key, from, to }) => `  ${key.padEnd(40)} ${from || '-'} → ${to || '-'}`)
      : ['  no change']),
    ...(omitted.length ? [`Not deployed, left out: ${omitted.join(', ')}`] : []),
    ...ambiguous.map(
      ({ resource: id, namespaces }) =>
        `Ambiguous: ${id} runs in ${namespaces.join(', ')}: name one with --map ${id}=<namespace>`,
    ),
    written
      ? `Written to ${CLUSTER_CONF_PATH}${backup ? `; the previous file is ${backup}` : ''}. No workload changed.`
      : 'Preview only: add --write-config to write it. No workload changes either way.',
  ].join('\n');

/** The profiles, one line each: id, origin and the node groups they use. */
const profilesText = (profiles) =>
  [
    `${'PROFILE'.padEnd(20)} ${'ORIGIN'.padEnd(9)} ${'NODE GROUPS'.padEnd(20)} FILE`,
    ...profiles.map(
      ({ id, origin, groups, file }) =>
        `${id.padEnd(20)} ${origin.padEnd(9)} ${(groups.join(', ') || '-').padEnd(20)} ${file}`,
    ),
    'Show one: node bin namespace profile show <profile>',
  ].join('\n');

/** One profile: the namespace of each resource and the rule of each category. */
const profileText = ({ id, origin, file, namespaces, scheduling }) =>
  [
    `Profile ${id} (${origin}: ${file})`,
    'Namespaces:',
    ...Object.entries(namespaces).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [`  ${key.padEnd(28)} ${value}`]
        : Object.entries(value).map(([resource, name]) => `  ${`${key}.${resource}`.padEnd(28)} ${name}`),
    ),
    'Scheduling:',
    ...Object.entries(scheduling).map(
      ([category, { group, mode }]) => `  ${category.padEnd(28)} ${group ? `${group}, ${mode}` : mode}`,
    ),
  ].join('\n');

/** The node groups of an environment, one member per line. */
const nodesText = ({ environment, reachable, groups }) =>
  [
    `Node groups of ${environment}${reachable ? '' : ' (the cluster was not read: node states unknown)'}`,
    `${'GROUP'.padEnd(12)} ${'RECORD'.padEnd(28)} ${'KUBERNETES NODE'.padEnd(28)} ${'STATE'.padEnd(10)} PEER`,
    ...groups.flatMap(({ group, members }) =>
      members.length
        ? members.map(
            ({ record, kubernetesNode, state, peer }) =>
              `${group.padEnd(12)} ${record.padEnd(28)} ${(kubernetesNode || '-').padEnd(28)} ${state.padEnd(10)} ${peer}`,
          )
        : [`${group.padEnd(12)} -`],
    ),
    'Check them: node bin namespace nodes audit',
  ].join('\n');

const nodesAuditText = ({ environment, reachable, findings }) =>
  [
    `Node groups of ${environment}${reachable ? '' : ' (the cluster was not read)'}:`,
    ...findingLines(findings, '  no finding'),
  ].join('\n');

const identifyText = ({ file, from, to, checked, applied, backup }) =>
  [
    `${file}: kubernetesNodeName ${from || '-'} → ${to}${checked ? '' : ' (the cluster was not read: not checked)'}`,
    from === to
      ? 'Nothing to change.'
      : applied
        ? `Written; the previous record is ${backup}.`
        : 'Preview only: add --apply to write it, after a backup of the record.',
  ].join('\n');

const reconcileText = ({ plan: steps, applied }) =>
  [
    ...(steps.length
      ? steps.map(({ action, namespace }) => `${applied ? 'applied' : 'would'} ${action} namespace ${namespace}`)
      : ['Nothing to change']),
    ...(applied || !steps.length ? [] : ['Run again with --apply to make these changes']),
    'Unchanged by design: workloads, data, endpoints and volumes. node bin namespace plan moves them.',
  ].join('\n');

const repairText = ({ context, plan: steps, applied, unchanged }) =>
  [
    `Context ${context || '(current)'}`,
    ...(steps.length
      ? steps.map((step) =>
          step.domain
            ? Underpost[step.domain].stepText(step, applied)
            : step.action === 'suspend'
              ? `${applied ? 'suspended' : 'would suspend'} ${step.object}: ${step.keep} owns its schedule`
              : `${applied ? 'applied' : 'would'} ${step.action} namespace ${step.namespace}`,
        )
      : ['Nothing to repair']),
    ...(applied || !steps.length ? [] : ['Run again with --apply to make these changes']),
    ...(unchanged.length ? ['Not repaired here:', ...unchanged.map((message) => `  ${message}`)] : []),
  ].join('\n');

export default UnderpostNamespace;
