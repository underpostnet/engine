/**
 * A live cluster that the shell harness answers: the reads of `Underpost.namespace.observe` and of the
 * Service listing come from a mutable state, and the patches and deletions of a migration change it, so
 * a test reads the cluster again after a change. A namespace apply calls `onApply`.
 *
 * @module test/support/kube-cluster.js
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import { shellHarness } from './shell-harness.js';

const list = (items) => JSON.stringify({ items });

/** A namespace object. */
export const namespaceItem = (name, { owned = false, phase = 'Active' } = {}) => ({
  kind: 'Namespace',
  metadata: { name, labels: owned ? { 'app.kubernetes.io/managed-by': 'underpost' } : {} },
  status: { phase },
});

/** A node: Ready unless `ready` is false, with its hostname label, its roles and its taints. */
export const nodeItem = (
  name,
  { ready = true, roles = [], taints = [], unschedulable = false, hostname = name } = {},
) => ({
  kind: 'Node',
  metadata: {
    name,
    labels: {
      'kubernetes.io/hostname': hostname,
      ...Object.fromEntries(roles.map((role) => [`node-role.kubernetes.io/${role}`, ''])),
    },
  },
  spec: { taints, unschedulable },
  status: { conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] },
});

/** A controller object; `spec` and `status` are its own. */
export const controllerItem = (kind, name, namespace, { labels = {}, spec = {}, status = {} } = {}) => ({
  kind,
  metadata: { name, namespace, labels },
  spec,
  status,
});

/** An Underpost CronJob. */
export const cronJobItem = (name, namespace, suspend = false) =>
  controllerItem('CronJob', name, namespace, {
    labels: { 'managed-by': 'underpost' },
    spec: { suspend, schedule: '0 * * * *', jobTemplate: { spec: { template: { spec: { containers: [] } } } } },
  });

/** A Service object. */
export const serviceItem = (name, namespace, selector = {}) => ({
  kind: 'Service',
  metadata: { name, namespace },
  spec: { selector, ports: [{ port: 80 }] },
});

/**
 * A PersistentVolume, bound to `claim` (`namespace/name`) when it names one, on `hostPath` when it names one,
 * pinned to `nodes` by a hostname affinity when it names some.
 */
export const volumeItem = (name, { claim = '', reclaim = 'Retain', hostPath = '', nodes = [] } = {}) => {
  const [namespace, claimName] = claim.split('/');
  return {
    kind: 'PersistentVolume',
    metadata: { name },
    spec: {
      storageClassName: 'manual',
      persistentVolumeReclaimPolicy: reclaim,
      ...(hostPath ? { hostPath: { path: hostPath } } : {}),
      ...(nodes.length
        ? {
            nodeAffinity: {
              required: {
                nodeSelectorTerms: [
                  { matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values: nodes }] },
                ],
              },
            },
          }
        : {}),
      ...(claim ? { claimRef: { namespace, name: claimName, uid: `uid-${claimName}` } } : {}),
    },
    status: { phase: claim ? 'Bound' : 'Available' },
  };
};

/** A PersistentVolumeClaim bound to a volume. */
export const claimItem = (name, namespace, volume) => ({
  kind: 'PersistentVolumeClaim',
  metadata: { name, namespace },
  spec: { storageClassName: 'manual', volumeName: volume },
  status: { phase: 'Bound' },
});

/**
 * A self-signed certificate for `names` and its key, generated for the run: the PEM files, and their base64 as
 * the data of a TLS Secret.
 */
export const tlsPair = (names) => {
  const directory = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-tls-pair-'));
  try {
    childProcess.execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-days',
        '3650',
        '-subj',
        `/CN=${names[0]}`,
        '-addext',
        `subjectAltName=${names.map((name) => `DNS:${name}`).join(',')}`,
        '-keyout',
        nodePath.join(directory, 'key.pem'),
        '-out',
        nodePath.join(directory, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    const cert = fs.readFileSync(nodePath.join(directory, 'cert.pem'));
    const key = fs.readFileSync(nodePath.join(directory, 'key.pem'));
    return { cert, key, data: { 'tls.crt': cert.toString('base64'), 'tls.key': key.toString('base64') } };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

/** A TLS Secret as `kubectl get secret -o json` prints it, with the annotations cert-manager writes. */
export const tlsSecretItem = (namespace, name, data) => ({
  apiVersion: 'v1',
  kind: 'Secret',
  type: 'kubernetes.io/tls',
  data,
  metadata: {
    name,
    namespace,
    annotations: {
      'cert-manager.io/certificate-name': name,
      'kubectl.kubernetes.io/last-applied-configuration': '{}',
    },
  },
});

/** The line of a TLS Secret as the go-template of the Secret keys prints it. */
export const tlsLine = (namespace, name) => `${namespace}\t${name}\tkubernetes.io/tls\ttls.crt,tls.key,`;

/** The labels of a routing object a deployment owns. */
export const owned = (deployId) => ({ 'app.kubernetes.io/managed-by': 'underpost', 'deploy-id': deployId });

/** Status conditions from `{ type: [status, reason] }`. */
const conditions = (table = {}) =>
  Object.entries(table).map(([type, [status, reason = '']]) => ({ type, status, reason, message: '' }));

/**
 * A Gateway with an HTTP and an HTTPS listener per host, as a deploy renders it. The HTTPS listener of a host
 * in `certificates` names the TLS Secret of its host; `listeners` and `httpListeners` give the status conditions
 * of the HTTPS and of the HTTP listener of a host. `http: false` renders the HTTPS listeners only.
 */
export const gatewayItem = (
  name,
  namespace,
  {
    hosts = [],
    certificates = [],
    labels = {},
    status = {},
    listeners = {},
    httpListeners = {},
    http = true,
    className = 'eg',
  } = {},
) => {
  const specs = hosts.flatMap((hostname, index) => [
    ...(http
      ? [
          {
            name: `http-${index}`,
            hostname,
            protocol: 'HTTP',
            port: 80,
            allowedRoutes: { namespaces: { from: 'Same' } },
          },
        ]
      : []),
    {
      name: `https-${index}`,
      hostname,
      protocol: 'HTTPS',
      port: 443,
      tls: { certificateRefs: certificates.includes(hostname) ? [{ name: hostname }] : [] },
    },
  ]);
  return {
    kind: 'Gateway',
    metadata: { name, namespace, labels },
    spec: { gatewayClassName: className, listeners: specs },
    status: {
      conditions: conditions(status),
      listeners: specs.map((listener) => ({
        name: listener.name,
        conditions: conditions((listener.protocol === 'HTTPS' ? listeners : httpListeners)[listener.hostname]),
      })),
    },
  };
};

/** An HTTPRoute attached to Gateways of its namespace, with one rule and its backends. */
export const routeItem = (
  name,
  namespace,
  { gateway, gateways = [gateway], hosts = [], backends = [], labels = {} },
) => ({
  kind: 'HTTPRoute',
  metadata: { name, namespace, labels },
  spec: {
    hostnames: hosts,
    parentRefs: gateways.map((parent) => ({ name: parent })),
    rules: [{ backendRefs: backends }],
  },
  status: { parents: [] },
});

/** A cert-manager Certificate that renews a TLS Secret, with its status conditions. */
export const certificateItem = (name, namespace, { secretName = name, labels = {}, status = {} } = {}) => ({
  apiVersion: 'cert-manager.io/v1',
  kind: 'Certificate',
  metadata: { name, namespace, labels, generation: 1, resourceVersion: '1' },
  spec: { secretName, dnsNames: [name], issuerRef: { name: 'letsencrypt-prod', kind: 'ClusterIssuer' } },
  status: { conditions: conditions(status) },
});

/** The Let's Encrypt ClusterIssuer, with the Gateway solver on `parentRefs` (`namespace/name`) or the Contour solver. */
export const issuerItem = (name, { parentRefs = [], solver = 'gateway', ready = true } = {}) => ({
  apiVersion: 'cert-manager.io/v1',
  kind: 'ClusterIssuer',
  metadata: { name },
  spec: {
    acme: {
      solvers:
        solver === 'ingress'
          ? [{ http01: { ingress: { class: 'contour' } } }]
          : parentRefs.length
            ? [
                {
                  http01: {
                    gatewayHTTPRoute: {
                      parentRefs: parentRefs.map((ref) => ({
                        namespace: ref.split('/')[0],
                        name: ref.split('/')[1],
                        kind: 'Gateway',
                      })),
                    },
                  },
                },
              ]
            : [],
    },
  },
  status: { conditions: conditions({ Ready: ready ? ['True', 'ACMEAccountRegistered'] : ['False', 'ErrRegister'] }) },
});

/** An ACME Challenge of a host, routed through the Gateways of `parentRefs` (`namespace/name`). */
export const challengeItem = (name, namespace, { host, state = 'pending', reason = '', created, parentRefs = [] }) => ({
  kind: 'Challenge',
  metadata: { name, namespace, creationTimestamp: created ?? new Date().toISOString() },
  spec: {
    dnsName: host,
    solver: {
      http01: {
        gatewayHTTPRoute: {
          parentRefs: parentRefs.map((ref) => ({ namespace: ref.split('/')[0], name: ref.split('/')[1] })),
        },
      },
    },
  },
  status: { state, reason },
});

/** An Envoy Gateway ClientTrafficPolicy that targets Gateways. */
export const policyItem = (name, namespace, { gateway, gateways = [gateway], labels = {} }) => ({
  apiVersion: 'gateway.envoyproxy.io/v1alpha1',
  kind: 'ClientTrafficPolicy',
  metadata: { name, namespace, labels },
  spec: {
    targetRefs: gateways.map((target) => ({ group: 'gateway.networking.k8s.io', kind: 'Gateway', name: target })),
  },
});

const CONTROLLER_KINDS = Object.freeze({
  deployment: 'Deployment',
  statefulset: 'StatefulSet',
  daemonset: 'DaemonSet',
  cronjob: 'CronJob',
  job: 'Job',
});

/** The state collection of each other kind a deletion removes from. */
const COLLECTIONS = Object.freeze({
  service: 'services',
  gateway: 'gateways',
  'gateways.gateway.networking.k8s.io': 'gateways',
  httproute: 'routes',
  'httproutes.gateway.networking.k8s.io': 'routes',
  certificate: 'certificates',
  'certificates.cert-manager.io': 'certificates',
  clienttrafficpolicy: 'policies',
  'clienttrafficpolicies.gateway.envoyproxy.io': 'policies',
  'challenges.acme.cert-manager.io': 'challenges',
  configmap: 'configMaps',
  persistentvolumeclaim: 'claims',
  persistentvolume: 'volumes',
});

/**
 * Installs the harness.
 * @param {Object} state - `fingerprint`, `context`, `contexts`, `namespaces`, `nodes`, `controllers`,
 *   `services`, `claims`, `volumes`, `classes`, `configMaps`, `crds`, `gateways`, `routes`, `certificates`,
 *   `policies` (ClientTrafficPolicies), `issuers`, `challenges`, `leases`, `secrets` as
 *   the go-template prints them, `secretObjects` by `namespace/name`, `pods` beside the one pod each
 *   controller runs on the first node of its affinity or its selector, else on `podNode`. A Secret, a
 *   Certificate or a ClusterIssuer a `kubectl apply -f -` sends joins the state with the status it had; a new
 *   one is Ready unless `unready` names it. A Lease a `kubectl create -f -` sends joins `leases`; a create while
 *   a Lease is held fails as AlreadyExists. `certManager` holds the args, the image, the configuration and the
 *   pod start times of its controller, and the creation time of the HTTPRoute CRD.
 * @param {{onApply?: Function, routes?: Object[]}} [options] - `routes` answer ahead of the cluster.
 * @returns {ReturnType<typeof shellHarness> & {state: Object}}
 */
export const kubeCluster = (state, { onApply = () => {}, routes = [] } = {}) => {
  const cluster = {
    fingerprint: '6f1c2a3b-0000-4111-8222-000011112222',
    context: '',
    contexts: '',
    namespaces: [],
    nodes: [],
    pods: [],
    podNode: 'node-a',
    controllers: [],
    services: [],
    claims: [],
    volumes: [],
    classes: [],
    configMaps: [],
    crds: [],
    gateways: [],
    routes: [],
    certificates: [],
    policies: [],
    issuers: [],
    challenges: [],
    leases: [],
    unready: [],
    certManager: { args: '', image: '', config: '', started: '', crd: '' },
    secrets: [],
    secretObjects: {},
    ...state,
  };
  const at = (items, name, namespace) =>
    items.find((item) => item.metadata.name === name && (!namespace || item.metadata.namespace === namespace));
  const without = (items, name, namespace) => items.filter((item) => item !== at(items, name, namespace));
  const upsert = (items, item) => [...without(items, item.metadata.name, item.metadata.namespace), item];
  /** The object of an apply joins the state once its input is known: after the command closes. */
  const settled = new Set();
  let seen = 0;
  const settle = () => {
    const calls = harness?.calls ?? [];
    // A test that clears the calls starts their indices again: the earlier indices and inputs are gone.
    if (calls.length < seen) {
      settled.clear();
      for (const index of Object.keys(harness.inputs)) delete harness.inputs[index];
    }
    seen = calls.length;
    calls.forEach((call, index) => {
      if (settled.has(index) || harness.inputs[index] === undefined) return;
      settled.add(index);
      if (!/^kubectl(?: --context \S+)? (?:apply|create) -f -$/.test(call)) return;
      const object = JSON.parse(harness.inputs[index]);
      const { name, namespace } = object.metadata;
      // A create of a Lease that exists failed: the holder stays.
      if (object.kind === 'Lease' && !at(cluster.leases, name, namespace)) cluster.leases.push(object);
      if (object.kind === 'Secret') {
        cluster.secretObjects[`${namespace}/${name}`] = object;
        if (!cluster.secrets.some((line) => line.startsWith(`${namespace}\t${name}\t`)))
          cluster.secrets.push(`${namespace}\t${name}\t${object.type}\t${Object.keys(object.data).join(',')},`);
      }
      // An apply keeps the status of an object; a new one is Ready unless `unready` names it.
      const statusOf = (items) =>
        at(items, name, namespace)?.status ?? {
          conditions: cluster.unready.includes(name) ? [] : conditions({ Ready: ['True', 'Ready'] }),
        };
      if (object.kind === 'Certificate')
        cluster.certificates = upsert(cluster.certificates, { ...object, status: statusOf(cluster.certificates) });
      if (object.kind === 'ClusterIssuer')
        cluster.issuers = upsert(cluster.issuers, { ...object, status: statusOf(cluster.issuers) });
    });
  };
  const change = (call) => {
    settle();
    if (!call.startsWith('kubectl') || call.includes('--dry-run')) return;
    if (/ apply --server-side /.test(call)) onApply(cluster, call);
    const [, verb, type, name, namespace] =
      /^kubectl(?: --context \S+)? (delete|patch) (\S+) (\S+)(?: -n (\S+))?/.exec(call) ?? [];
    if (!verb) return;
    const body = () => JSON.parse(/ -p (\S+)/.exec(call)[1]);
    const kind = CONTROLLER_KINDS[type];
    if (verb === 'patch' && kind) at(cluster.controllers, name, namespace).spec.suspend = body().spec.suspend;
    if (verb === 'delete' && kind)
      cluster.controllers = cluster.controllers.filter(
        (item) => !(item.kind === kind && item.metadata.name === name && item.metadata.namespace === namespace),
      );
    if (verb === 'delete' && COLLECTIONS[type])
      cluster[COLLECTIONS[type]] = without(cluster[COLLECTIONS[type]], name, namespace);
    if (verb === 'delete' && type === 'lease') cluster.leases = without(cluster.leases, name, namespace);
    if (verb === 'delete' && type === 'secret') {
      cluster.secrets = cluster.secrets.filter((line) => !line.startsWith(`${namespace}\t${name}\t`));
      delete cluster.secretObjects[`${namespace}/${name}`];
    }
    if (verb === 'delete' && type === 'persistentvolumeclaim')
      for (const volume of cluster.volumes)
        if (volume.spec.claimRef?.namespace === namespace && volume.spec.claimRef?.name === name)
          volume.status.phase = 'Released';
    if (verb === 'patch' && type === 'pv') {
      const volume = at(cluster.volumes, name);
      const patch = body();
      if (Array.isArray(patch)) volume.spec.claimRef = patch[0].value;
      else volume.spec.persistentVolumeReclaimPolicy = patch.spec.persistentVolumeReclaimPolicy;
    }
    if (verb === 'patch' && type === 'certificates.cert-manager.io')
      for (const { op, path, value } of JSON.parse(call.slice(call.indexOf(' -p ') + 4)))
        if (op !== 'test') {
          const certificate = at(cluster.certificates, name, namespace);
          if (path === '/status') certificate.status = value;
          else certificate.status.conditions = value;
        }
    if (verb === 'patch' && type === 'httproutes.gateway.networking.k8s.io')
      for (const { op, path } of body())
        if (op === 'remove')
          at(cluster.routes, name, namespace).spec.parentRefs.splice(Number(path.split('/').pop()), 1);
    if (verb === 'patch' && type === 'httproute')
      for (const { path, value } of body()) {
        const [, rule, backend] = /rules\/(\d+)\/backendRefs\/(\d+)/.exec(path);
        at(cluster.routes, name, namespace).spec.rules[rule].backendRefs[backend].namespace = value;
      }
  };
  const templateOf = ({ kind, spec }) => (kind === 'CronJob' ? spec.jobTemplate?.spec?.template : spec.template);
  const pods = () => [
    ...cluster.controllers.map((controller) => ({
      kind: 'Pod',
      metadata: {
        name: `${controller.metadata.name}-0`,
        namespace: controller.metadata.namespace,
        labels: templateOf(controller)?.metadata?.labels ?? {},
      },
      spec: {
        // The first ordinal of a StatefulSet mounts the claim of each of its claim templates.
        volumes: (controller.spec?.volumeClaimTemplates ?? []).map(({ metadata }) => ({
          name: metadata.name,
          persistentVolumeClaim: { claimName: `${metadata.name}-${controller.metadata.name}-0` },
        })),
        nodeName:
          templateOf(controller)?.spec?.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution
            ?.nodeSelectorTerms?.[0]?.matchExpressions?.[0]?.values?.[0] ??
          templateOf(controller)?.spec?.nodeSelector?.['kubernetes.io/hostname'] ??
          cluster.podNode,
      },
    })),
    ...cluster.pods,
  ];
  const read = (match, value) => ({
    match,
    get stdout() {
      return value();
    },
  });
  /** A route that answers a call from the groups its pattern captures. */
  const answer = (pattern, value) => {
    let groups = [];
    return {
      match: (call) => {
        const found = pattern.exec(call);
        if (found) groups = found.slice(1);
        return Boolean(found);
      },
      get stdout() {
        return value(...groups);
      },
    };
  };
  const leased = () => (settle(), cluster.leases.length > 0);
  const harness = shellHarness([
    { match: (call) => (change(call), false) },
    ...routes,
    {
      match: (call) => / create -f -$/.test(call),
      get code() {
        return leased() ? 1 : 0;
      },
      get stderr() {
        return leased() ? 'Error from server (AlreadyExists): leases.coordination.k8s.io already exists' : '';
      },
    },
    answer(
      / get lease (\S+) -n (\S+) -o jsonpath/,
      (name, namespace) => (settle(), at(cluster.leases, name, namespace)?.spec.holderIdentity ?? ''),
    ),
    answer(/ get secrets --field-selector type=kubernetes\.io\/tls -n (\S+) -o jsonpath/, (namespace) =>
      cluster.secrets
        .map((line) => line.split('\t'))
        .filter(([own, , type]) => own === namespace && type === 'kubernetes.io/tls')
        .map(([, name]) => name)
        .join(' '),
    ),
    answer(/ get certificates\.cert-manager\.io -n (\S+) -o jsonpath/, (namespace) =>
      cluster.certificates
        .filter(({ metadata }) => metadata.namespace === namespace)
        .map(({ spec }) => spec.secretName)
        .join(' '),
    ),
    answer(/ get certificates\.cert-manager\.io -n (\S+) -o json/, (namespace) =>
      list(cluster.certificates.filter(({ metadata }) => metadata.namespace === namespace)),
    ),
    read('containers[0].image', () => cluster.certManager.image),
    read('get deployment cert-manager', () => cluster.certManager.args),
    read('get configmap cert-manager', () => cluster.certManager.config),
    read('app.kubernetes.io/component=controller', () => cluster.certManager.started),
    read('get crd httproutes.gateway.networking.k8s.io', () => cluster.certManager.crd),
    answer(/ get httproute (\S+) -n (\S+) -o json/, (name, namespace) =>
      JSON.stringify(at(cluster.routes, name, namespace)),
    ),
    answer(/ get certificates\.cert-manager\.io (\S+) -n (\S+) -o json/, (name, namespace) =>
      JSON.stringify(at(cluster.certificates, name, namespace)),
    ),
    answer(/ get secret (\S+) -n (\S+) -o json/, (name, namespace) =>
      JSON.stringify(cluster.secretObjects[`${namespace}/${name}`]),
    ),
    answer(/ get pv ((?:\S+ )+)-o jsonpath/, (names) =>
      names
        .trim()
        .split(' ')
        .map((name) => `${name}=${at(cluster.volumes, name).spec.persistentVolumeReclaimPolicy}`)
        .join('\n'),
    ),
    read('get namespace kube-system', () => cluster.fingerprint),
    read('config get-contexts', () => cluster.contexts),
    read('config current-context', () => cluster.context),
    read('config view --minify', () => 'https://10.0.0.1:6443'),
    read('version -o json', () => JSON.stringify({ serverVersion: { gitVersion: 'v1.33.1' } })),
    read('get configmap coredns', () => '.:53 {\n    kubernetes cluster.local in-addr.arpa ip6.arpa\n}'),
    read('get crd', () => cluster.crds.join(' ')),
    read('get namespaces -o json', () => list(cluster.namespaces)),
    read('get nodes -o json', () => list(cluster.nodes)),
    read('get pods --all-namespaces', () => list(pods())),
    answer(/ get node '?([^'\s]+)'? -o json/, (name) => JSON.stringify(at(cluster.nodes, name) ?? {})),
    read('get secrets --all-namespaces --field-selector type=kubernetes.io/tls', () =>
      Object.values(cluster.secretObjects)
        .filter(({ type }) => type === 'kubernetes.io/tls')
        .map(({ metadata, data }) => `${metadata.namespace}\t${metadata.name}\t${data['tls.crt']}`)
        .join('\n'),
    ),
    read('get secrets', () => cluster.secrets.join('\n')),
    read('get persistentvolumeclaims', () => list(cluster.claims)),
    read('get persistentvolumes', () => list(cluster.volumes)),
    read('get storageclasses', () => list(cluster.classes)),
    read('get deployments,statefulsets', () => list(cluster.controllers)),
    read('get services --all-namespaces --request-timeout', () =>
      cluster.services.map(({ metadata }) => `${metadata.namespace}/${metadata.name}\n`).join(''),
    ),
    read('get services --all-namespaces -o json', () => list(cluster.services)),
    read('get cronjobs --all-namespaces', () => list(cluster.controllers.filter(({ kind }) => kind === 'CronJob'))),
    answer(
      / get cronjob (\S+) -n (\S+) -o jsonpath=\{\.spec\.suspend\}/,
      (name, namespace) => `${at(cluster.controllers, name, namespace)?.spec.suspend ?? ''}`,
    ),
    read('get jobs --all-namespaces -l managed-by=underpost', () =>
      list(
        cluster.controllers.filter(
          ({ kind, metadata }) => kind === 'Job' && metadata.labels?.['managed-by'] === 'underpost',
        ),
      ),
    ),
    read('get configmaps', () => list(cluster.configMaps)),
    read('get gateways --all-namespaces', () => list(cluster.gateways)),
    read('get httproutes --all-namespaces', () => list(cluster.routes)),
    read('get certificates --all-namespaces', () => list(cluster.certificates)),
    read('get clusterissuers --all-namespaces', () => list(cluster.issuers)),
    read('get challenges --all-namespaces', () => list(cluster.challenges)),
    read('get clienttrafficpolicies --all-namespaces', () => list(cluster.policies)),
    read('get backendtrafficpolicies --all-namespaces', () => list([])),
  ]);
  return Object.assign(harness, { state: cluster, settle });
};
