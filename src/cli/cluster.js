/**
 * Cluster module for managing Kubernetes cluster initialization, configuration, and component deployment.
 * @module src/cli/cluster.js
 * @namespace UnderpostCluster
 */

import { clusterTypeFactory, resolveReplicaCount } from '../server/runtime/conf.js';
import { deployEnvFactory, getNpmRootPath, HOST_VOLUME_ROOT } from '../server/runtime/environment.js';
import { HOSTNAME_LABEL } from '../server/runtime/pod-scheduling.js';
import { loggerFactory } from '../server/ops/logger.js';
import {
  invokingUser,
  makeHostDirectory,
  removeHostPath,
  runCommand,
  shellArgumentFactory,
  shellExec,
  writeHostFile,
} from '../server/runtime/process.js';
import { CRICTL_PRIVILEGE, crictlCommandFactory, resolveCriSocket } from '../server/ops/cri.js';
import {
  controlHostService,
  DOCKER_PRIVILEGE,
  hostServiceExists,
  hostToolsFor,
  installHostTool,
  uninstallHostTool,
  updateHostPackages,
} from '../server/ops/host-tooling.js';
import {
  runSELinuxCommands,
  selinuxEnforcingCommandsFactory,
  selinuxPackagesCommandFactory,
  selinuxRestoreconCommandFactory,
} from '../server/security/selinux.js';
import ContainerStorageService, {
  containerStorageRootsFactory,
  ensureContainerStorage,
  localPathConfigCommandFactory,
  localPathRootsFactory,
} from '../server/security/container-storage.js';
import { UNDERPOST_GATEWAY, seedDefaultStatusPage } from '../server/network/underpost-gateway.js';
import {
  UNDERPOST_INGRESS,
  ingressBackendFactory,
  underpostIngressConfFactory,
  underpostIngressHostMapFactory,
  underpostIngressManifestsFactory,
} from '../server/network/underpost-ingress.js';
import { MONGODB_DEFAULT_REPLICA_COUNT } from '../db/mongo/mongoose-db.js';
import { MongoBootstrap } from '../db/mongo/mongo-bootstrap.js';
import { MongoExpress } from '../db/mongo/mongo-express.js';
import os from 'os';
import path from 'node:path';
import fs from 'fs-extra';
import Underpost from '../index.js';

/**
 * @constant CERT_MANAGER_RELEASES
 * @description The cert-manager compatibility policy. `installed` is the release `cluster --cert-manager`
 * installs. `minimum` is the first release whose controller configuration enables the Gateway API solver
 * (`enableGatewayAPI`). `supported` holds the minor lines upstream supports (https://cert-manager.io/docs/releases,
 * read 2026-11-10). `tested` holds the releases Underpost has evidence for. `solvers` holds the routing providers
 * whose ACME issuance and renewal passed against the Let's Encrypt staging server on a real cluster.
 * @memberof UnderpostCluster
 */
export const CERT_MANAGER_RELEASES = Object.freeze({
  installed: 'v1.17.0',
  minimum: 'v1.15.0',
  supported: Object.freeze(['1.20', '1.21']),
  tested: Object.freeze(['v1.17.0']),
  solvers: Object.freeze([]),
});

const logger = loggerFactory(import.meta);

/** The node image of the installed kind release (v0.29.0), pinned by digest. */
const KIND_NODE_IMAGE = 'kindest/node:v1.33.1@sha256:050072256b9a903bd914c0b2866828150cb229cea0efe5892e2b644d5dd3b34f';

/** The Docker repository of the Kind node images. */
const KIND_NODE_REPOSITORY = KIND_NODE_IMAGE.split(':')[0];

const GATEWAY_API_RELEASE = 'v1.5.1';
/** The kubeconfig each cluster type writes for its administrator. */
const KUBECONFIG_SOURCES = Object.freeze({ kubeadm: '/etc/kubernetes/admin.conf', k3s: '/etc/rancher/k3s/k3s.yaml' });
const ENVOY_GATEWAY_VERSION = 'v1.8.3';
const GPU_OPERATOR_VERSION = 'v25.3.1';
const SPARK_IMAGE = 'spark:3.5.5';
const KAFKA_IMAGE = 'doughgle/kafka-kraft';
const LOCAL_PATH_PROVISIONER_MANIFEST =
  'https://cdn.jsdelivr.net/gh/rancher/local-path-provisioner@master/deploy/local-path-storage.yaml';
const K3S_SELINUX_PATHS = [
  '/usr/local/bin/k3s',
  '/etc/rancher',
  '/var/lib/rancher',
  '/var/lib/kubelet',
  '/var/lib/cni',
];

// `semanage` and `restorecon` come from separate packages and neither is guaranteed on a minimal
// Rocky install. Installed before anything tries to register a mapping, because a missing
// `semanage` would otherwise turn every persistent labeling command into a hard failure.
const ensureSELinuxTooling = () =>
  shellExec(
    `if [ -f /etc/redhat-release ] && command -v dnf >/dev/null 2>&1 && { ! command -v restorecon >/dev/null 2>&1 || ! command -v semanage >/dev/null 2>&1; }; then ${selinuxPackagesCommandFactory()}; fi`,
    { privileged: 'installs the SELinux userspace' },
  );

const enforceSELinux = (paths = []) => {
  ensureSELinuxTooling();
  runSELinuxCommands(selinuxEnforcingCommandsFactory({ restorePaths: paths }), { execute: shellExec });
};

/** The nodes of the Kind cluster: names of Docker containers. */
const kindNodes = () =>
  shellExec('kind get nodes', { stdout: true, silent: true, silentOnError: true, privileged: DOCKER_PRIVILEGE })
    .split('\n')
    .map((node) => node.trim())
    .filter(Boolean);

/** Turns swap off now and at boot, as Kubernetes requires. */
const disableSwap = () => {
  shellExec('swapoff -a', { privileged: 'turns the swap of the host off' });
  writeHostFile({
    target: '/etc/fstab',
    content: fs
      .readFileSync('/etc/fstab', 'utf8')
      .split('\n')
      .filter((line) => !line.includes('swap'))
      .join('\n'),
  });
};

/** Deletes a network interface of this host when it exists. */
const deleteHostLink = (name) => {
  if (shellExec(`ip link show ${shellArgumentFactory(name)}`, { silent: true, silentOnError: true }).code === 0)
    shellExec(`ip link del ${shellArgumentFactory(name)}`, { privileged: `deletes the ${name} network interface` });
};

/** Stops a service of this host when the host has it. */
const stopHostService = (unit) => {
  if (hostServiceExists(unit)) controlHostService('stop', unit);
};

/**
 * The inotify limits a host keeps across reboots. Every kubelet, container runtime and
 * file watcher on the host takes an instance per process and a watch per file; the kernel
 * defaults (128 instances) run out on a node, and a watcher that cannot get an instance
 * fails with EMFILE.
 * @constant {string}
 * @memberof UnderpostCluster
 */
const INOTIFY_SYSCTL_PATH = '/etc/sysctl.d/99-underpost-inotify.conf';

export const ensureInotifyLimits = () => {
  writeHostFile({
    target: INOTIFY_SYSCTL_PATH,
    content:
      'fs.inotify.max_user_instances = 1024\nfs.inotify.max_user_watches = 1048576\nfs.inotify.max_queued_events = 65536\n',
  });
  shellExec(`sysctl -q -p ${INOTIFY_SYSCTL_PATH}`, { privileged: 'applies the inotify limits of the host' });
};

/** The sysctl file of a K3s host. */
const K3S_SYSCTL_PATH = '/etc/sysctl.d/99-k3s.conf';

/** The host configuration files of the cluster runtimes, which `--uninstall-host` removes. */
const HOST_CONFIGURATION_PATHS = Object.freeze([
  '/etc/kubernetes/pki',
  '/etc/containerd/config.toml',
  '/etc/sysctl.d/99-kubernetes.conf',
  K3S_SYSCTL_PATH,
  INOTIFY_SYSCTL_PATH,
]);

/**
 * @class UnderpostCluster
 * @description Manages Kubernetes cluster initialization, configuration, and component deployment.
 * This class provides a set of static methods to handle cluster initialization, configuration,
 * and optional component deployments.
 * @memberof UnderpostCluster
 */
class UnderpostCluster {
  static API = {
    /**
     * @method init
     * @description Initializes and configures the Kubernetes cluster based on provided options.
     * This method handles host prerequisites, cluster initialization (Kind, Kubeadm, or K3s),
     * and optional component deployments.
     * @param {string} [podName] - Optional name of a pod for specific operations (e.g., listing).
     * @param {object} [options] - Configuration options for cluster initialization.
     * @param {boolean} [options.mongodb=false] - Deploy MongoDB.
     * @param {boolean} [options.mongodb4=false] - Deploy MongoDB 4.4.
     * @param {boolean} [options.mongoExpress=false] - Deploy the mongo-express web client for inspecting the MongoDB StatefulSet collections.
     * @param {string} [options.serviceHost=''] - Set a custom host/IP for exposed MongoDB and Valkey clients.
     * @param {boolean} [options.mariadb=false] - Deploy MariaDB.
     * @param {boolean} [options.mysql=false] - Deploy MySQL.
     * @param {boolean} [options.postgresql=false] - Deploy PostgreSQL.
     * @param {boolean} [options.kafka=false] - Deploy the Kafka KRaft StatefulSet.
     * @param {boolean} [options.valkey=false] - Deploy Valkey.
     * @param {boolean} [options.ipfs=false] - Deploy ipfs-cluster statefulset.
     * @param {boolean} [options.info=false] - Display extensive Kubernetes cluster information.
     * @param {boolean} [options.certManager=false] - Deploy Cert-Manager for certificate management.
     * @param {boolean} [options.gatewayApi=false] - Install the Gateway API control plane (CRDs, Envoy Gateway, and the GatewayClass generated Gateways attach to). Exposure follows the environment: host network in `--dev`, NodePort otherwise.
     * @param {string} [options.gatewayClass=''] - GatewayClass name to provision; must match the one baked into generated manifests.
     * @param {boolean} [options.listPods=false] - List Kubernetes pods.
     * @param {boolean} [options.reset=false] - Perform a comprehensive reset of Kubernetes and container environments.
     * @param {boolean} [options.resetMongodb=false] - Perform a targeted reset of MongoDB components without restarting the entire cluster. Combined with `--mongodb` it instead wipes the retained volumes as part of that deploy.
     * @param {boolean} [options.dev=false] - Run in development mode (adjusts paths).
     * @param {string} [options.namespace] - The legacy namespace override of the workloads and datastores; conf.cluster.json places each one without it.
     * @param {boolean} [options.infoCapacity=false] - Display resource capacity information for the cluster.
     * @param {boolean} [options.infoCapacityPod=false] - Display resource capacity information for pods.
     * @param {boolean} [options.pullImage=false] - Pull necessary Docker images before deployment.
     * @param {boolean} [options.dedicatedGpu=false] - Configure for dedicated GPU usage (e.g., NVIDIA GPU Operator).
     * @param {boolean} [options.kubeadm=false] - Initialize the cluster using Kubeadm.
     * @param {string} [options.podNetworkCidr='192.168.0.0/16'] - Custom pod network CIDR for Kubeadm cluster initialization. Defaults to '192.168.0.0/16'.
     * @param {string} [options.controlPlaneEndpoint=''] - Custom control plane endpoint for Kubeadm cluster initialization. Defaults to '${os.hostname()}:6443'.
     * @param {boolean} [options.k3s=false] - Initialize the cluster using K3s.
     * @param {boolean} [options.initHost=false] - Perform initial host setup (install Docker, Podman, Kind, Kubeadm, Helm).
     * @param {boolean} [options.grafana=false] - Initialize the cluster with a Grafana deployment.
     * @param {string} [options.prom=''] - Initialize the cluster with a Prometheus Operator deployment and monitor scrap for specified hosts.
     * @param {boolean} [options.uninstallHost=false] - Uninstall all host components.
     * @param {boolean} [options.config=false] - Apply general host configuration (SELinux, containerd, sysctl, firewalld).
     * @param {boolean} [options.chown=false] - Set up kubectl configuration for the current user.
     * @param {boolean} [options.removeVolumeHostPaths=false] - Remove data from host paths used by Persistent Volumes.
     * @param {string} [options.hosts] - Set custom hosts entries.
     * @param {string} [options.replicas] - Set the number of replicas for certain deployments.
     * @param {boolean} [options.nodePort=false] - Expose enabled ready services (e.g. MongoDB 4.4, Valkey)
     *   to the host/public network via their NodePort Service manifest. The node port value lives directly
     *   in each manifest (mongodb-4.4/mongodb-nodeport.yaml, valkey/valkey-nodeport.yaml).
     * @param {string} [options.nodeName=''] - The Kubernetes node of every resource this run installs;
     *   overrides the scheduling of conf.cluster.json.
     * @memberof UnderpostCluster
     */
    async init(
      podName,
      options = {
        mongodb: false,
        mongodb4: false,
        mongoExpress: false,
        serviceHost: '',
        mariadb: false,
        mysql: false,
        postgresql: false,
        kafka: false,
        valkey: false,
        ipfs: false,
        info: false,
        certManager: false,
        listPods: false,
        reset: false,
        resetMongodb: false,
        dev: false,
        namespace: '',
        infoCapacity: false,
        infoCapacityPod: false,
        pullImage: false,
        dedicatedGpu: false,
        kubeadm: false,
        podNetworkCidr: '192.168.0.0/16',
        controlPlaneEndpoint: '',
        k3s: false,
        initHost: false,
        grafana: false,
        prom: '',
        uninstallHost: false,
        config: false,
        chown: false,
        removeVolumeHostPaths: false,
        hosts: '',
        replicas: '',
        nodePort: false,
        nodeName: '',
      },
    ) {
      const npmRoot = getNpmRootPath();
      const underpostRoot = options.dev ? '.' : `${npmRoot}/underpost`;

      if (options.initHost)
        return Underpost.cluster.initHost({ underpostRoot, runtime: clusterTypeFactory(options, '') });

      if (options.uninstallHost) return Underpost.cluster.uninstallHost();

      if (options.config) return options.k3s ? Underpost.cluster.configMinimalK3s() : Underpost.cluster.config();

      if (options.chown) return await Underpost.cluster.chown(clusterTypeFactory(options));
      const serviceHostInput = `${options.serviceHost || ''}`.trim();
      const serviceHost = Underpost.cluster.resolveServiceHost(options);

      if (options.listPods) return console.table(Underpost.kubectl.get(podName ?? undefined));
      const ns = (resource) => Underpost.namespace.of(resource, { options });
      // A resource deploys into its namespace, which the deploy creates when it is missing.
      const placed = (resource) => Underpost.namespace.ensure({ resource, options });
      const scheduling = (resource) => Underpost.namespace.podScheduling({ resource, options, node: options.nodeName });
      const applyScheduled = (resource, path, namespace) =>
        Underpost.kubectl.applyScheduled({
          path: `${underpostRoot}/${path}`,
          namespace,
          scheduling: scheduling(resource),
        });

      // Route reset to the per-type method. Each only touches what its runtime owns.
      if (options.reset) {
        if (options.k3s)
          return await Underpost.cluster.safeResetK3s({ underpostRoot, resetMode: options.resetMode || 'full' });
        if (options.kubeadm)
          return await Underpost.cluster.safeResetKubeadm({
            underpostRoot,
            removeVolumeHostPaths: options.removeVolumeHostPaths,
          });
        return await Underpost.cluster.safeResetKind({
          underpostRoot,
          removeVolumeHostPaths: options.removeVolumeHostPaths,
        });
      }

      // Targeted MongoDB-only reset (does not restart the whole node). Combined
      // with --mongodb it is a modifier instead: the deploy below wipes the
      // retained volumes before rolling the StatefulSet out. `--reset` cannot
      // serve that purpose — it short-circuits into the whole-node reset above,
      // which is why `initReplicaSet`'s reset branch was unreachable from the CLI.
      if (options.resetMongodb && !options.mongodb) {
        const clusterType = clusterTypeFactory(options);
        return await MongoBootstrap.reset({
          namespace: ns('mongodb'),
          clusterType,
          underpostRoot,
        });
      }

      // Check if a cluster (Kind, Kubeadm, or K3s) is already initialized by
      // inspecting nodes rather than probing add-on pods. See detectClusterRuntime.
      const runtime = Underpost.cluster.detectClusterRuntime();
      const alreadyCluster = runtime.type !== null;
      if (alreadyCluster) {
        logger.info(
          `Detected existing ${runtime.type} cluster (${runtime.ready ? 'Ready' : 'NotReady'}); skipping initialization.`,
        );
        // Initialization is skipped, but the labeling invariant is not: the node directories
        // backing PersistentVolumes outlive the bring-up that created them, and a policy update,
        // a full relabel or a directory recreated by kubelet resets them to the policy default.
        // Re-asserting it costs a `semanage` lookup and a `restorecon` pass, mutates no workload,
        // and never changes SELinux mode.
        Underpost.cluster.ensureContainerStorageContexts();
      }

      // --- Kubeadm/Kind/K3s Cluster Initialization ---
      // Host config is applied per cluster type (not shared) so the K3s path can
      // stay minimal and avoid the Docker/containerd/kubelet setup it does not need.
      if (!alreadyCluster) {
        // A control plane binds its node address into certificates and leases; it must not depend on a DHCP lease.
        if ((options.k3s || options.kubeadm) && !options.dev) await Underpost.dns.ensureStaticIpv4();
        if (options.k3s) {
          // K3s is self-contained (bundles containerd, kubelet, CNI, CoreDNS).
          // Apply ONLY minimal host config — see configMinimalK3s.
          Underpost.cluster.configMinimalK3s();
          logger.info('Initializing K3s control plane...');
          // Install K3s
          logger.info('Installing K3s...');
          // Disable the bundled traefik ingress and servicelb (Klipper) load
          // balancer. The platform exposes services explicitly via Project
          // Contour / Envoy and NodePort services (see --node-port); leaving the
          // K3s built-ins enabled would bind the same host ports and conflict.
          const installer = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-k3s-')), 'install.sh');
          try {
            shellExec(`curl -sfL -o ${shellArgumentFactory(installer)} https://get.k3s.io`);
            shellExec(
              `sh ${shellArgumentFactory(installer)} $(if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then printf '%s' '--selinux'; fi) --disable=traefik --disable=servicelb`,
              { privileged: 'installs K3s' },
            );
          } finally {
            fs.removeSync(path.dirname(installer));
          }
          logger.info('K3s installation completed.');
          runSELinuxCommands([selinuxRestoreconCommandFactory(K3S_SELINUX_PATHS)], { execute: shellExec });

          Underpost.namespace.pin({
            options,
            context: (await Underpost.cluster.chown('k3s')).context,
            source: 'the new cluster',
            runtime: 'k3s',
          });

          logger.info('Waiting for K3s to be ready...');
          shellExec(`systemctl is-active --wait k3s || systemctl wait --for=active k3s.service`);
          logger.info('K3s service is active.');
          // K3s manages its own CNI (flannel) and iptables rules. nat-iptables.sh
          // is neither needed nor desirable for a single K3s node in a VM.
        } else if (options.kubeadm) {
          Underpost.cluster.config();
          Underpost.cluster.natSetup({ underpostRoot });
          Underpost.cluster.ensureContainerStorageContexts({ controlPlane: true });
          logger.info('Initializing Kubeadm control plane...');
          // Set default values if not provided
          const podNetworkCidr = options.podNetworkCidr || '192.168.0.0/16';
          const controlPlaneEndpoint = options.controlPlaneEndpoint || `${os.hostname()}:6443`;

          // Initialize kubeadm control plane against whichever CRI runtime the
          // host actually exposes.
          const criSocket = resolveCriSocket(options);
          shellExec(
            `kubeadm init --pod-network-cidr=${shellArgumentFactory(podNetworkCidr)} --control-plane-endpoint=${shellArgumentFactory(controlPlaneEndpoint)} --cri-socket=${shellArgumentFactory(criSocket)}`,
            { privileged: 'initializes the kubeadm control plane' },
          );
          // The rest of this command acts on the new cluster; the current context of the user stays.
          Underpost.namespace.pin({
            options,
            context: (await Underpost.cluster.chown('kubeadm')).context,
            source: 'the new cluster',
            runtime: 'kubeadm',
          });

          // Install Calico CNI
          logger.info('Installing Calico CNI...');
          shellExec(
            `kubectl create -f https://cdn.jsdelivr.net/gh/projectcalico/calico@v3.29.3/manifests/tigera-operator.yaml`,
          );
          shellExec(
            `kubectl create -f https://cdn.jsdelivr.net/gh/projectcalico/calico@v3.29.3/manifests/custom-resources.yaml`,
          );
          shellExec(`kubectl apply -f ${underpostRoot}/manifests/kubeadm-calico-config.yaml`);

          // Untaint control plane node to allow scheduling pods
          const nodeName = os.hostname();
          shellExec(`kubectl taint nodes ${nodeName} node-role.kubernetes.io/control-plane:NoSchedule-`);
          // The CNI lands asynchronously, and the node stays NotReady until it
          // does. Block here so the deploy steps that follow (MongoDB and the
          // application workloads) schedule onto a node that can actually run
          // them, instead of racing the Calico rollout.
          logger.info('Waiting for the node to become Ready (Calico rollout)...');
          shellExec(`kubectl wait --for=condition=Ready node --all --timeout=300s`);
          Underpost.cluster.ensureLocalPathProvisioner();
        } else {
          await Underpost.cluster.createKind({ underpostRoot, replicas: options.replicas });
        }
      }

      // --- Optional Component Deployments (Databases, Ingress, Cert-Manager) ---
      // These deployments happen after the base cluster is up.

      if (options.dedicatedGpu) {
        Underpost.cluster.installGpuOperator();
        Underpost.cluster.installSparkOperator({ underpostRoot, options });
      }

      // Grafana and Prometheus are two faces of one stack, so either flag
      // converges the whole of it — including Alertmanager and the Blackbox
      // Exporter, which the alert rules and probes are useless without. The
      // scrape configuration is rendered from the deploy configuration and the
      // event registry by the monitor CLI; `--prom [hosts]` only adds hosts
      // that configuration does not name.
      if (options.grafana || options.prom) {
        await Underpost.monitor.deployObservability({
          ...Underpost.namespace.overrides(options),
          dev: options.dev,
          nodeName: options.nodeName,
          hosts: typeof options.prom === 'string' ? options.prom : options.hosts,
        });
      }

      if (options.valkey) {
        const namespace = await placed('valkey');
        if (options.pullImage) Underpost.cluster.pullImage('valkey/valkey:latest', options);
        shellExec(`kubectl delete statefulset valkey-service -n ${namespace} --ignore-not-found`);
        applyScheduled('valkey', 'manifests/valkey', namespace);
        const valkeyReady = await Underpost.test.statusMonitor('valkey-service', 'Running', 'pods', 1000, 60 * 10);
        // Expose valkey to the host/public network only once the pod is ready.
        // The node port (32079) is set directly in the manifest.
        if (valkeyReady && options.nodePort)
          shellExec(`kubectl apply -f ${underpostRoot}/manifests/valkey/valkey-nodeport.yaml -n ${namespace}`);
        if (valkeyReady && serviceHost)
          Underpost.cluster.syncServiceConnectionEnv({
            serviceHost,
            valkey: true,
            options,
          });
      }
      if (options.ipfs) await Underpost.ipfs.deploy({ ...options, namespace: await placed('ipfs') }, underpostRoot);
      if (options.mariadb) {
        const namespace = await placed('mariadb');
        // Secrets before workloads: the StatefulSet's secretKeyRef must resolve at pod admission.
        Underpost.secret.provide({ resource: 'mariadb', namespace, options });
        shellExec(`kubectl delete statefulset mariadb-statefulset -n ${namespace} --ignore-not-found`);

        if (options.pullImage) Underpost.cluster.pullImage('mariadb:latest', options);
        // The StatefulSet's volumeClaimTemplate is dynamically provisioned, so the data lands in
        // a subdirectory of the local-path root and inherits that root's label.
        Underpost.cluster.ensureContainerStorageContexts({ extraPaths: ['/data/mariadb'] });
        shellExec(`kubectl apply -f ${underpostRoot}/manifests/mariadb/storage-class.yaml -n ${namespace}`);
        applyScheduled('mariadb', 'manifests/mariadb', namespace);
      }
      if (options.mysql) {
        const namespace = await placed('mysql');
        Underpost.secret.provide({ resource: 'mysql', namespace, options });
        // The data directory is prepared, not opened up: a world-writable host path plus the
        // operator's ownership was standing in for the SELinux label the container actually
        // needed. `container_file_t` is what lets mysqld write here; 0755 root-owned is enough,
        // because the image's entrypoint chowns the tree to its own uid on first start.
        Underpost.cluster.ensureContainerStorageContexts({ extraPaths: ['/data/mysql'] });
        applyScheduled('mysql', 'manifests/mysql', namespace);
      }
      if (options.postgresql) {
        const namespace = await placed('postgresql');
        if (options.pullImage) Underpost.cluster.pullImage('postgres:latest', options);
        Underpost.secret.provide({ resource: 'postgresql', namespace, options });
        Underpost.cluster.ensureContainerStorageContexts({ extraPaths: ['/data/postgresql'] });
        applyScheduled('postgresql', 'manifests/postgresql', namespace);
      }
      if (options.kafka) await Underpost.cluster.deployKafka({ underpostRoot, options });
      if (options.mongodb4) {
        const namespace = await placed('mongodb');
        if (options.pullImage) Underpost.cluster.pullImage('mongo:4.4', options);
        shellExec(`kubectl delete statefulset mongodb -n ${namespace} --ignore-not-found`);
        applyScheduled('mongodb', 'manifests/mongodb-4.4', namespace);

        const podName = 'mongodb-0';

        const successInstance = await Underpost.test.statusMonitor(podName);

        if (successInstance) {
          // mongod only accepts a member host it can recognize as itself (the isSelf check):
          // it must match a local interface IP or be reachable back at that address. A pod-external
          // LAN IP / NodePort address is neither bound in the pod netns nor routable back from it,
          // so reconfiguring to it fails with NodeNotFound ("...maps to this node") even under
          // force. Bootstrap on localhost; only advertise a non-localhost host when the node can
          // self-verify it, and tolerate the failure otherwise so bootstrap stays idempotent.
          // Clients reaching the set through an external IP/NodePort must use directConnection=true,
          // which ignores the advertised member host (see MongooseDB.buildUri).
          const rsHost = serviceHostInput || (options.dev ? '127.0.0.1' : 'mongodb-0.mongodb-service');
          const memberHost = `${rsHost}:27017`;
          const initEval = [
            `try { rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] }); }`,
            `catch (e) { if (!String(e).includes("already initialized") && !String(e).includes("AlreadyInitialized")) throw e; }`,
            `for (var i = 0; i < 30; i++) { if (db.isMaster().ismaster) break; sleep(1000); }`,
            memberHost === 'localhost:27017'
              ? ``
              : `try { var c = rs.conf(); c.members[0].host = "${memberHost}"; rs.reconfig(c, { force: true }); print("RS_HOST_SET ${memberHost}"); } catch (e) { if (String(e).includes("NodeNotFound") || String(e).includes("maps to this node")) { print("RS_HOST_SKIPPED ${memberHost} (not self-reachable from pod; clients must use directConnection=true)"); } else { throw e; } }`,
          ]
            .filter(Boolean)
            .join(' ');

          shellExec(`kubectl exec -i ${podName} -n ${namespace} -- mongo --quiet --eval '${initEval}'`);

          // Only expose mongos to the host/public network once the instance is
          // confirmed ready and the replica set is initiated. The node port (32017)
          // is set directly in the manifest.
          if (options.nodePort)
            shellExec(`kubectl apply -f ${underpostRoot}/manifests/mongodb-4.4/mongodb-nodeport.yaml -n ${namespace}`);
          if (serviceHost)
            Underpost.cluster.syncServiceConnectionEnv({
              serviceHost,
              mongodb: true,
              options,
            });
        }
      } else if (options.mongodb) {
        const namespace = await placed('mongodb');
        const clusterType = clusterTypeFactory(options);
        await MongoBootstrap.initReplicaSet({
          namespace,
          environment: Underpost.namespace.resolve({ resource: 'mongodb', options }).environment,
          serviceDomain: Underpost.namespace.serviceHost({ resource: 'mongodb', options }),
          replicaCount: resolveReplicaCount(options.replicas, MONGODB_DEFAULT_REPLICA_COUNT),
          hostList: serviceHostInput,
          pullImage: options.pullImage,
          reset: options.resetMongodb === true,
          clusterType,
          underpostRoot,
          scheduling: scheduling('mongodb'),
        });
        if (serviceHost)
          Underpost.cluster.syncServiceConnectionEnv({
            serviceHost,
            mongodb: true,
            options,
          });
      }

      // After both StatefulSet branches, so one invocation can bring up MongoDB and its inspector
      // and the client reads the auth mode from the set this run just applied.
      if (options.mongoExpress)
        await MongoExpress.deploy({ namespace: await placed('mongodb'), underpostRoot, options });

      // Installing one stack must never break the other. Whichever is already
      // present decides whether this install takes the node's 80/443 for itself
      // or joins the underpost ingress, so it is read before anything is applied.
      const ingressPresence = Underpost.cluster.ingressStackPresence();
      const sharedIngress =
        (options.contour && ingressPresence.gateway) || (options.gatewayApi && ingressPresence.contour);

      if (options.contour) {
        shellExec(
          `kubectl apply -f https://cdn.jsdelivr.net/gh/projectcontour/contour@release-1.33/examples/render/contour.yaml`,
        );
        // The NodePort patch belongs to Contour's own namespace: its `app=envoy`
        // selector only matches the Envoy DaemonSet there. Applied anywhere else
        // the Service is born with no endpoints, and kube-proxy then answers
        // EVERY connection to its ports with an ICMP port-unreachable REJECT —
        // including 443 on every local address, which silently breaks whatever
        // else serves HTTPS on the node.
        Underpost.cluster.pruneEndpointlessService({ name: 'envoy', namespace: ns('workloads') });
        // Contour's render always claims hostPort 80/443. Left in place beside a
        // Gateway API data plane it would DNAT every packet away from it, so the
        // claim is released and both are reached through the underpost ingress instead.
        if (sharedIngress)
          Underpost.cluster.releaseHostPortClaim({
            name: 'envoy',
            namespace: Underpost.namespace.of('contour'),
            ports: [80, 443],
          });
        if (options.kubeadm) {
          // Envoy service might need NodePort for kubeadm
          shellExec(
            `kubectl apply -f ${underpostRoot}/manifests/envoy-service-nodeport.yaml -n ${Underpost.namespace.of('contour')}`,
          );
        }
        // K3s has a built-in LoadBalancer (Klipper-lb) that can expose services,
        // so a specific NodePort service might not be needed or can be configured differently.
      }

      if (options.gatewayApi) {
        // Gateway API stack: the CRDs, the implementation that serves them, and
        // the GatewayClass every generated Gateway attaches to. Envoy Gateway is
        // the implementation because the manifests this repo generates use two of
        // its ClientTrafficPolicy extension, which carries the QUIC/HTTP3
        // listener config. Both versions are pinned so a rebuild provisions the
        // same control plane.
        const env = options.dev ? 'development' : 'production';
        // Envoy Gateway provisions and owns its own data plane Service in
        // envoy-gateway-system. Any hand-managed Service elsewhere that publishes
        // the same ports without endpoints would have kube-proxy reject 80/443
        // out from under it, and any DaemonSet holding hostPort 80/443 would
        // swallow the traffic before the data plane's listener sees it.
        Underpost.cluster.pruneEndpointlessService({ name: 'envoy', namespace: ns('workloads') });
        // Contour keeps serving beside this stack when it is already installed —
        // it only gives up the node's ports, which the underpost ingress takes over.
        // With no Contour present the claim is removed outright, since a leftover
        // DaemonSet from an uninstalled stack has nothing left to serve.
        if (sharedIngress)
          Underpost.cluster.releaseHostPortClaim({
            name: 'envoy',
            namespace: Underpost.namespace.of('contour'),
            ports: [80, 443],
          });
        else
          Underpost.cluster.pruneHostPortClaim({
            name: 'envoy',
            namespace: Underpost.namespace.of('contour'),
            ports: [80, 443],
          });
        shellExec(
          `kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/${GATEWAY_API_RELEASE}/standard-install.yaml`,
        );
        shellExec(
          `helm upgrade --install eg oci://docker.io/envoyproxy/gateway-helm --version ${ENVOY_GATEWAY_VERSION} ` +
            `--namespace ${ns('envoyGateway')} --create-namespace`,
        );
        // The GatewayClass is rejected while the webhook is still coming up.
        shellExec(
          `kubectl wait --namespace ${ns('envoyGateway')} --for=condition=Available --timeout=5m deployment/envoy-gateway`,
          { silentOnError: true },
        );
        // Validate against the live CRD schema before creating anything. These
        // are vendor CRDs whose optional fields move between releases, and
        // kubectl applies documents independently: without the pre-flight, a
        // field the installed Envoy Gateway does not know leaves a GatewayClass
        // pointing at an EnvoyProxy that never applied.
        const gatewayClassYaml = Underpost.ingress.gatewayClassYamlFactory({
          env,
          options: { ...options, sharedIngress },
        });
        shellExec(`kubectl apply --dry-run=server -f - <<'EOF'
${gatewayClassYaml}
EOF
`);
        shellExec(`kubectl apply -f - <<'EOF'
${gatewayClassYaml}
EOF
`);
        // The static utility that serves status pages and intercepted contexts.
        // It belongs to the gateway tier, not to any one deploy: a single Nginx
        // holds every host's documents, and routes reach it as an ordinary
        // backend — which is what removes the 4096-byte direct-response ceiling.
        //
        // The heredoc delimiter is quoted, as it must be for every generated
        // manifest: the values are already substituted by the template literal,
        // so anything the shell expands here is content. This one carries
        // `nginx.conf`, whose `$uri` an unquoted delimiter deletes — leaving a
        // `try_files` that matches nothing and answers every host's status page
        // with the shared default.
        const underpostGatewayYaml = Underpost.deploy.underpostGatewayYamlFactory(options);
        const platform = await placed('platform');
        Underpost.kubectl.claimVolume({
          volume: UNDERPOST_GATEWAY.volumeName,
          namespace: platform,
          claim: UNDERPOST_GATEWAY.claimName,
        });
        shellExec(`kubectl apply -f - -n ${platform} <<'EOF'
${underpostGatewayYaml}
EOF
`);
        const underpostGatewayRoot = Underpost.deploy.underpostGatewayRootFactory(options);
        seedDefaultStatusPage(underpostGatewayRoot);
        logger.info('Gateway static utility applied', {
          name: UNDERPOST_GATEWAY.name,
          root: underpostGatewayRoot,
        });

        logger.info('Gateway API control plane installed', {
          gatewayApiRelease: GATEWAY_API_RELEASE,
          envoyGateway: ENVOY_GATEWAY_VERSION,
          gatewayClass: Underpost.ingress.gatewayApiConfigFactory(options).gatewayClassName,
          env,
        });
      }

      // Both stacks are now installed, so the node's 80/443 belong to neither of
      // them. Contour was installed first and Envoy Gateway is arriving, or the
      // reverse — either way this is the point where the underpost ingress has to exist,
      // and the data plane that just came up has to stop binding the host.
      if (sharedIngress) {
        if (options.contour && ingressPresence.gateway) {
          // `--contour` against a cluster that already runs Envoy Gateway: its
          // data plane is still on the host network from a single-stack install,
          // so the EnvoyProxy is re-applied to move it behind the underpost ingress.
          const gatewayClassYaml = Underpost.ingress.gatewayClassYamlFactory({
            env: options.dev ? 'development' : 'production',
            options: { ...options, sharedIngress: true },
          });
          shellExec(`kubectl apply -f - <<'EOF'
${gatewayClassYaml}
EOF
`);
          shellExec(`kubectl rollout status deployment/envoy-gateway -n ${ns('envoyGateway')} --timeout=5m`, {
            silentOnError: true,
          });
        }
        // The edge binds the node directly, so it can only come up once both data
        // planes have actually let go — not merely once their templates say so.
        if (!Underpost.cluster.awaitHostPortsFree({ ports: [80, 443] })) {
          logger.error('Skipping the underpost ingress: it would not be able to bind the node ports', {
            hint: 'resolve the holder above, then re-run this command',
          });
        } else {
          const platform = await placed('platform');
          Underpost.cluster.installUnderpostIngress({ namespace: platform, options });
          shellExec(`kubectl rollout status deployment/${UNDERPOST_INGRESS.name} -n ${platform} --timeout=3m`, {
            silentOnError: true,
          });
          logger.info('Both ingress stacks are live behind the underpost ingress', {
            ingress: UNDERPOST_INGRESS.name,
            note: 'HTTP/3 is served only by the Gateway API data plane; see the underpost-ingress module',
          });
        }
      }

      if (options.certManager) await Underpost.cluster.installCertManager({ env: deployEnvFactory(options) });
    },

    /**
     * @method detectClusterRuntime
     * @description Detects an already-initialized cluster by inspecting Kubernetes
     * nodes, and classifies its runtime. Nodes are authoritative and stable, unlike
     * add-on pods: the previous check keyed off pod names (`calico-kube-controllers`,
     * `kube-apiserver-kind-control-plane`, `svclb-traefik`), whose presence and
     * readiness are timing- and config-dependent. Disabling servicelb removes the
     * `svclb-traefik` pods entirely, and CNI/controller pods report NotReady for a
     * window right after init — both of which made re-runs misdetect the cluster
     * state. Classification relies on stable node attributes:
     *   - k3s: the node VERSION carries a `+k3s` build suffix (e.g. v1.30.5+k3s1).
     *   - kind: kind names every node `<cluster>-control-plane` / `<cluster>-worker`.
     *   - kubeadm: a real control-plane node that is neither of the above.
     * @returns {{ type: ('k3s'|'kubeadm'|'kind'|null), ready: boolean, nodes: Array<object> }}
     *   `type` is the detected runtime (null when no cluster exists); `ready` is true
     *   when at least one node reports STATUS=Ready.
     * @memberof UnderpostCluster
     */
    detectClusterRuntime() {
      const nodes = Underpost.kubectl.get('', 'nodes');
      if (!nodes.length) return { type: null, ready: false, nodes: [] };

      // STATUS can be a comma-joined list (e.g. "Ready,SchedulingDisabled").
      const ready = nodes.some((n) => `${n.STATUS || ''}`.split(',').includes('Ready'));

      let type;
      if (nodes.some((n) => `${n.VERSION || ''}`.includes('+k3s'))) type = 'k3s';
      else if (nodes.some((n) => `${n.NAME || ''}`.includes('-control-plane') || `${n.NAME || ''}`.includes('kind')))
        type = 'kind';
      else type = 'kubeadm';

      return { type, ready, nodes };
    },

    /**
     * @method discoverLocalPathRoots
     * @description Reads the node directories the local-path provisioner writes into, from its
     * live ConfigMap. Every dynamically provisioned claim in this platform (Grafana, Prometheus,
     * Alertmanager, IPFS, MariaDB) becomes a subdirectory of one of them, so the root has to be
     * discovered rather than assumed — a wrong guess leaves those claims carrying the `/opt`
     * policy default (`usr_t`), which no `container_t` pod can write.
     * @returns {string[]} Configured node paths; empty when no provisioner is reachable.
     * @memberof UnderpostCluster
     */
    discoverLocalPathRoots() {
      for (const namespace of ContainerStorageService.LOCAL_PATH_NAMESPACES) {
        const config = `${
          shellExec(localPathConfigCommandFactory({ namespace }), {
            stdout: true,
            silent: true,
            silentOnError: true,
            disableLog: true,
          }) || ''
        }`.trim();
        const roots = localPathRootsFactory(config);
        if (roots.length > 0) return roots;
      }
      return [];
    },

    /**
     * @method ensureContainerStorageContexts
     * @description Makes SELinux compatibility an invariant of the storage lifecycle rather than
     * a one-time bring-up step: creates the node directories this platform hands to containers
     * (only when missing, so live data trees keep their ownership and mode), registers the
     * persistent `container_file_t` mapping for each, and restores the trees.
     *
     * Idempotent and safe to call on every deploy. Never relabels paths outside the discovered
     * set, and never changes SELinux mode.
     * @param {object} [options]
     * @param {boolean} [options.controlPlane=false] - Also cover the kubeadm control-plane trees
     *   bind-mounted into containers (`/etc/kubernetes`, `/var/lib/etcd`, `/var/lib/calico`).
     * @param {string[]} [options.extraPaths=[]] - Additional node directories to include.
     * @returns {string[]} The roots that were prepared.
     * @memberof UnderpostCluster
     */
    ensureContainerStorageContexts(options = {}) {
      const roots = containerStorageRootsFactory({
        localPathRoots: Underpost.cluster.discoverLocalPathRoots(),
        extraPaths: options.extraPaths || [],
        controlPlane: options.controlPlane === true,
      });
      logger.info('Preparing container-mounted host storage', { roots });
      // HOST_VOLUME_ROOT is the one root the deploy flow writes into unprivileged (it lives in the
      // operator's home tree and receives each hostPath volume's contents), so it is created owned
      // by the invoking user. The rest stay root-owned: their subdirectories are chowned by each
      // workload's own init container, which is the single owner of that concern.
      const { uid, gid } = os.userInfo();
      const operatorRoots = roots.filter((root) => root === HOST_VOLUME_ROOT);
      const systemRoots = roots.filter((root) => root !== HOST_VOLUME_ROOT);
      if (systemRoots.length > 0) ensureContainerStorage(systemRoots, { execute: shellExec });
      if (operatorRoots.length > 0)
        ensureContainerStorage(operatorRoots, { execute: shellExec, owner: `${uid}:${gid}` });
      return roots;
    },

    /**
     * @method ensureLocalPathProvisioner
     * @description Ensures dynamic local-path PVC provisioning is available.
     * @returns {string} Namespace containing the ready provisioner.
     * @memberof UnderpostCluster
     */
    ensureLocalPathProvisioner() {
      const locations = ['local-path-storage', 'kube-system'];
      let namespace = locations.find((candidate) =>
        `${
          shellExec(`kubectl get deployment local-path-provisioner -n ${candidate} -o name`, {
            stdout: true,
            silent: true,
            silentOnError: true,
            disableLog: true,
          }) || ''
        }`.trim(),
      );

      if (!namespace) {
        logger.info('Installing local-path-provisioner');
        shellExec(`kubectl apply -f ${LOCAL_PATH_PROVISIONER_MANIFEST}`);
        namespace = 'local-path-storage';
      }
      shellExec(`kubectl rollout status deployment/local-path-provisioner -n ${namespace} --timeout=5m`);
      // The provisioner's root exists (or is about to) only now, and its helper pod creates each
      // claim directory by inheriting that root's label. Prepare it here so the first dynamically
      // provisioned claim already lands on `container_file_t` instead of `/opt`'s `usr_t`.
      Underpost.cluster.ensureContainerStorageContexts();
      return namespace;
    },

    /**
     * @method placeWorkload
     * @description Patches the pod template of a live workload with a pod scheduling: its node affinity
     * and tolerations, without a hostname node selector. The patch reschedules its pods onto those nodes.
     * @param {object} params
     * @param {string} [params.kind='statefulset'] - Workload kind to patch.
     * @param {string} params.name - Workload name.
     * @param {string} params.namespace - Target namespace.
     * @param {{nodes:string[], affinity:Object, tolerations?:Object[]}} params.scheduling - {@link UnderpostNamespace.podScheduling}.
     * @memberof UnderpostCluster
     */
    placeWorkload({ kind = 'statefulset', name, namespace, scheduling: { nodes, affinity, tolerations } }) {
      logger.info(`Placing ${kind}/${name} on ${nodes.join(', ')} (namespace: ${namespace}).`);
      const patch = JSON.stringify({
        spec: {
          template: {
            spec: {
              affinity,
              nodeSelector: { [HOSTNAME_LABEL]: null },
              ...(tolerations ? { tolerations } : {}),
            },
          },
        },
      });
      shellExec(`kubectl patch ${kind} ${name} -n ${namespace} --type merge -p '${patch}'`);
    },

    /**
     * @method resolveServiceHost
     * @description Resolves a shared single-host override used by exposed service clients.
     * @param {object} [options={}] - Cluster options.
     * @returns {string} A single host override, or an empty string when unset / not reusable.
     * @memberof UnderpostCluster
     */
    resolveServiceHost(options = {}) {
      const candidate = `${options.serviceHost || ''}`.trim();
      return candidate && !candidate.includes(',') ? candidate : '';
    },

    /**
     * @method upsertEnvVar
     * @description Replaces or appends one env var assignment in raw env file text.
     * @param {string} envText - Existing env file contents.
     * @param {string} key - Env var name.
     * @param {string} value - Env var value.
     * @returns {string} Updated env file contents.
     * @memberof UnderpostCluster
     */
    upsertEnvVar(envText, key, value) {
      const nextEntry = `${key}=${value}`;
      const envKeyPattern = new RegExp(`^${key}=.*$`, 'm');
      if (envKeyPattern.test(envText)) return envText.replace(envKeyPattern, nextEntry);

      const trimmedEnvText = envText.replace(/\s*$/, '');
      return `${trimmedEnvText}${trimmedEnvText ? '\n' : ''}${nextEntry}\n`;
    },

    /**
     * @method syncServiceConnectionEnv
     * @description Persists exposed service connection hosts to the active deploy env files.
     * Currently applies only to MongoDB (`DB_HOST`) and Valkey (`VALKEY_HOST`).
     * @param {object} params
     * @param {string} params.serviceHost - Shared exposed host/IP.
     * @param {boolean} [params.mongodb=false] - Update MongoDB runtime host.
     * @param {boolean} [params.valkey=false] - Update Valkey runtime host.
     * @param {object} [params.options={}] - Cluster options used to infer the active env.
     * @memberof UnderpostCluster
     */
    syncServiceConnectionEnv({ serviceHost, mongodb = false, valkey = false, options = {} }) {
      if (!serviceHost) return;

      const updates = {};
      if (mongodb) updates.DB_HOST = `mongodb://${serviceHost}:27017`;
      if (valkey) updates.VALKEY_HOST = serviceHost;
      if (Object.keys(updates).length === 0) return;

      const deployId = process.env.DEPLOY_ID || process.env.DEFAULT_DEPLOY_ID || 'dd-default';
      const envName = process.env.NODE_ENV || (options.dev ? 'development' : 'production');
      const envPaths = [`./engine-private/conf/${deployId}/.env.${envName}`, `./.env.${envName}`, `./.env`].filter(
        (envPath, index, paths) => fs.existsSync(envPath) && paths.indexOf(envPath) === index,
      );

      if (envPaths.length === 0) {
        logger.warn(`No env files found to persist service host override for deploy '${deployId}' (${envName}).`);
        return;
      }

      for (const envPath of envPaths) {
        let envText = fs.readFileSync(envPath, 'utf8');
        for (const [key, value] of Object.entries(updates))
          envText = Underpost.cluster.upsertEnvVar(envText, key, value);
        fs.writeFileSync(envPath, envText, 'utf8');
      }

      logger.info(`Persisted service host override for ${Object.keys(updates).join(', ')} to ${envPaths.join(', ')}`);
    },

    /**
     * @method pullImage
     * @description Pulls a container image using the appropriate runtime based on the cluster type.
     * - For Kind clusters: pulls via Docker and loads the image into the Kind cluster.
     * - For Kubeadm/K3s clusters: pulls via crictl (containerd).
     * @param {string} image - The fully-qualified container image reference (e.g. 'mongo:latest').
     * @param {object} options - The cluster options object from `init`.
     * @param {boolean} [options.kubeadm=false] - Whether the cluster is Kubeadm-based.
     * @param {boolean} [options.k3s=false] - Whether the cluster is K3s-based.
     * @memberof UnderpostCluster
     */
    pullImage(image, options = { kubeadm: false, k3s: false }) {
      if (!options.kubeadm && !options.k3s) {
        shellExec(`docker pull ${shellArgumentFactory(image)}`, { privileged: DOCKER_PRIVILEGE });
        for (const node of kindNodes())
          shellExec(
            `docker save ${shellArgumentFactory(image)} | docker exec -i ${shellArgumentFactory(node)} ctr --namespace=k8s.io images import -`,
            { privileged: DOCKER_PRIVILEGE },
          );
      } else {
        // Kubeadm / K3s: pull directly into the active CRI runtime.
        shellExec(crictlCommandFactory(`pull ${shellArgumentFactory(image)}`, options), {
          privileged: CRICTL_PRIVILEGE,
        });
      }
    },

    /**
     * @method installGpuOperator
     * @description Installs the NVIDIA container toolkit on the host and the NVIDIA GPU Operator
     * release on the cluster, with containerd as the runtime and CDI enabled. Idempotent.
     * @memberof UnderpostCluster
     */
    installGpuOperator() {
      const namespace = 'gpu-operator';
      installHostTool('nvidia-container-toolkit', { arch: Underpost.baremetal.getHostArch().alias });
      shellExec(`kubectl create ns ${namespace} --dry-run=client -o yaml | kubectl apply -f -`);
      shellExec(`kubectl label --overwrite ns ${namespace} pod-security.kubernetes.io/enforce=privileged`);
      shellExec(`helm repo add nvidia https://helm.ngc.nvidia.com/nvidia --force-update && helm repo update`);
      shellExec(
        [
          `helm upgrade --install --wait gpu-operator nvidia/gpu-operator -n ${namespace} --create-namespace`,
          `--version=${GPU_OPERATOR_VERSION}`,
          '--set driver.enabled=false',
          '--set driver.repository=nvcr.io/nvidia',
          '--set cdi.enabled=true',
          '--set cdi.default=true',
          '--set toolkit.env[0].name=CONTAINERD_CONFIG',
          '--set toolkit.env[0].value=/etc/containerd/config.toml',
          '--set toolkit.env[1].name=CONTAINERD_SOCKET',
          '--set toolkit.env[1].value=/run/containerd/containerd.sock',
          '--set toolkit.env[2].name=CONTAINERD_RUNTIME_CLASS',
          '--set toolkit.env[2].value=nvidia',
          '--set-string toolkit.env[3].name=CONTAINERD_SET_AS_DEFAULT',
          '--set-string toolkit.env[3].value=true',
        ].join(' '),
      );
      // True when Node Feature Discovery has labeled the nodes.
      shellExec(
        `kubectl get nodes -o json | jq '.items[].metadata.labels | keys | any(startswith("feature.node.kubernetes.io"))'`,
      );
    },

    /**
     * @method installSparkOperator
     * @description Installs the Kubeflow Spark Operator release and applies the Spark Pi
     * application that verifies it. Idempotent.
     * @param {object} params
     * @param {string} params.underpostRoot - Root of the Underpost package.
     * @param {object} params.options - Cluster options: cluster type, `pullImage` and `namespace`.
     * @memberof UnderpostCluster
     */
    installSparkOperator({ underpostRoot, options }) {
      shellExec(`helm repo add spark-operator https://kubeflow.github.io/spark-operator --force-update`);
      shellExec(
        `helm upgrade --install spark-operator spark-operator/spark-operator --namespace spark-operator --create-namespace --wait`,
      );
      if (options.pullImage) Underpost.cluster.pullImage(SPARK_IMAGE, options);
      shellExec(
        `kubectl apply -f ${underpostRoot}/manifests/deployment/spark/spark-pi-py.yaml -n ${Underpost.namespace.of('workloads', { options })}`,
      );
    },

    /**
     * @method deployKafka
     * @description Applies the basic Kafka KRaft StatefulSet and its Services in the `kafka` namespace.
     * @param {object} params
     * @param {string} params.underpostRoot - Root of the Underpost package.
     * @param {object} params.options - Cluster options: cluster type and `pullImage`.
     * @memberof UnderpostCluster
     */
    async deployKafka({ underpostRoot, options }) {
      if (options.pullImage) Underpost.cluster.pullImage(KAFKA_IMAGE, options);
      const namespace = await Underpost.namespace.ensure({ resource: 'kafka', options });
      Underpost.kubectl.applyScheduled({
        path: `${underpostRoot}/manifests/deployment/kafka/deployment.yaml`,
        namespace,
        scheduling: Underpost.namespace.podScheduling({ resource: 'kafka', options, node: options.nodeName }),
      });
    },

    /**
     * @method pruneHostPortClaim
     * @description Removes a DaemonSet that reserves node ports the caller needs.
     * A `hostPort` is not a soft claim: the CNI hostport plugin installs a DNAT
     * that rewrites every packet arriving on that port to the claiming pod,
     * ahead of any process listening on the node. A second ingress stack bound
     * to the same port therefore never sees a single packet, and the symptom is
     * a connection refused by the *other* stack — with nothing in its own logs.
     *
     * Only a DaemonSet that actually claims one of `ports` is removed.
     * @param {string} name - DaemonSet name.
     * @param {string} namespace - Namespace to inspect.
     * @param {Array<number>} ports - Host ports the caller requires.
     * @returns {boolean} True when a DaemonSet was pruned.
     * @memberof UnderpostCluster
     */
    pruneHostPortClaim({ name, namespace, ports = [80, 443] }) {
      const claimed = shellExec(
        `kubectl get daemonset ${name} -n ${namespace} ` +
          `-o jsonpath='{.spec.template.spec.containers[*].ports[*].hostPort}'`,
        { stdout: true, silent: true, silentOnError: true },
      );
      const claimedPorts = `${claimed || ''}`
        .split(/\s+/)
        .map((port) => parseInt(port, 10))
        .filter((port) => !isNaN(port));
      const conflicts = claimedPorts.filter((port) => ports.includes(port));
      if (conflicts.length === 0) return false;
      logger.warn(`Pruning DaemonSet ${namespace}/${name}: it reserves host ports needed by this ingress stack`, {
        conflicts,
        reason: 'the CNI hostport DNAT redirects those ports before any node listener receives them',
      });
      shellExec(`kubectl delete daemonset ${name} -n ${namespace} --ignore-not-found`);
      return true;
    },

    /**
     * @method releaseHostPortClaim
     * @description Strips a DaemonSet's `hostPort` claims without removing the
     * workload, so it keeps serving through its ClusterIP.
     *
     * The non-destructive half of {@link UnderpostCluster.pruneHostPortClaim}.
     * Deleting the DaemonSet is right when one stack replaces the other, and
     * wrong when both are meant to stay: here the data plane is still wanted,
     * it just must not hold the node's ports any more — the underpost ingress does.
     *
     * Applied as a JSON Patch, one `remove` op per claiming port. A
     * strategic-merge patch cannot express this: `ports` is a list merged by
     * `containerPort`, so a patch that simply omits `hostPort` merges into the
     * existing element and leaves the claim exactly where it was — reported as
     * `patched (no change)` while the port stays held. Removing an object field
     * does not shift array indices, so every op in one patch stays valid.
     * @param {string} name - DaemonSet name.
     * @param {string} namespace - Namespace to inspect.
     * @param {Array<number>} [ports] - Host ports to release.
     * @returns {boolean} True when the claim is gone afterwards.
     * @memberof UnderpostCluster
     */
    releaseHostPortClaim({ name, namespace, ports = [80, 443] }) {
      const readClaims = () => {
        const raw = shellExec(
          `kubectl get daemonset ${name} -n ${namespace} -o jsonpath='{.spec.template.spec.containers}'`,
          { stdout: true, silent: true, silentOnError: true },
        );
        try {
          const containers = JSON.parse(`${raw || ''}`);
          return Array.isArray(containers) ? containers : null;
        } catch {
          return null;
        }
      };

      const containers = readClaims();
      if (!containers) return false;
      const operations = [];
      containers.forEach((container, containerIndex) =>
        (container.ports || []).forEach((port, portIndex) => {
          if (port.hostPort === undefined || !ports.includes(port.hostPort)) return;
          operations.push({
            op: 'remove',
            path: `/spec/template/spec/containers/${containerIndex}/ports/${portIndex}/hostPort`,
          });
        }),
      );
      if (operations.length === 0) return false;

      logger.warn(`Releasing host ports on DaemonSet ${namespace}/${name}: the underpost ingress owns them now`, {
        ports,
        reason:
          'its ClusterIP keeps the data plane reachable, and the hostPort DNAT would outrank the underpost ingress listener',
      });
      shellExec(`kubectl patch daemonset ${name} -n ${namespace} --type=json -p '${JSON.stringify(operations)}'`);

      // Verified rather than assumed: this silently did nothing once already,
      // and the failure only surfaced later as an unschedulable edge.
      const remaining = (readClaims() || [])
        .flatMap((container) => container.ports || [])
        .filter((port) => ports.includes(port.hostPort));
      if (remaining.length > 0) {
        logger.error(`Failed to release host ports on DaemonSet ${namespace}/${name}`, {
          stillClaimed: remaining.map((port) => port.hostPort),
        });
        return false;
      }
      shellExec(`kubectl rollout status daemonset/${name} -n ${namespace} --timeout=3m`, { silentOnError: true });
      return true;
    },

    /**
     * @method awaitHostPortsFree
     * @description Blocks until no known ingress data plane still holds the node's ports.
     *
     * Releasing a claim edits a template; the pod holding the socket goes away
     * only once the rollout completes. Applying the edge before that leaves it
     * either unschedulable or crash-looping on `bind() … Address in use`, and
     * neither failure names the pod that is actually holding the port.
     * @param {Array<number>} [ports] - Host ports that must be free.
     * @param {string} [contourNamespace] - Namespace holding Contour.
     * @param {number} [timeoutMs] - How long to wait.
     * @returns {boolean} True once nothing claims them.
     * @memberof UnderpostCluster
     */
    awaitHostPortsFree({
      ports = [80, 443],
      contourNamespace = Underpost.namespace.of('contour'),
      timeoutMs = 3 * 60 * 1000,
    } = {}) {
      const deadline = Date.now() + timeoutMs;
      const holders = () => {
        const found = [];
        const contourPorts = `${
          shellExec(
            `kubectl get daemonset envoy -n ${contourNamespace} ` +
              `-o jsonpath='{.spec.template.spec.containers[*].ports[*].hostPort}'`,
            { stdout: true, silent: true, silentOnError: true },
          ) || ''
        }`
          .split(/\s+/)
          .map((port) => parseInt(port, 10))
          .filter((port) => ports.includes(port));
        if (contourPorts.length > 0) found.push(`${contourNamespace}/envoy hostPort ${contourPorts.join(',')}`);
        // The Gateway API data plane takes the ports through the host network
        // rather than a hostPort, so its claim is the network mode itself.
        const gatewayHostNetwork = `${
          shellExec(
            `kubectl get deployment -n ${Underpost.namespace.of('envoyGateway')} -l app.kubernetes.io/name=envoy ` +
              `-o jsonpath='{.items[*].spec.template.spec.hostNetwork}'`,
            { stdout: true, silent: true, silentOnError: true },
          ) || ''
        }`.trim();
        if (gatewayHostNetwork.includes('true')) found.push('Envoy Gateway data plane hostNetwork');
        return found;
      };

      let current = holders();
      while (current.length > 0 && Date.now() < deadline) {
        logger.info('Waiting for the node ports to be released', { ports, heldBy: current });
        shellExec('sleep 5', { silent: true });
        current = holders();
      }
      if (current.length > 0) {
        logger.error('Node ports are still held; the underpost ingress cannot bind them', {
          ports,
          heldBy: current,
        });
        return false;
      }
      return true;
    },

    /**
     * @method installCertManager
     * @description Installs or upgrades cert-manager, with its Gateway API support when the routing provider of
     * the environment is `gateway-api`, then reconciles the ClusterIssuer of its TLS policy through
     * {@link UnderpostTls.issuer}. An environment that issues no ACME certificate gets no issuer.
     *
     * `upgrade --install` rather than a one-time install: the Gateway API solver is
     * ignored by a controller that was not started with `enableGatewayAPI`, so a cluster
     * whose cert-manager predates the Gateway API migration must be re-configured, not
     * skipped because a pod is Running. The version is pinned, so on a cluster already at
     * it the upgrade is a no-op.
     * @param {object} params
     * @param {string} [params.env] - Environment the cluster serves.
     * @returns {Promise<object|null>} The issuer report; null without the cert-manager mode.
     * @memberof UnderpostCluster
     */
    async installCertManager({ env = 'production' }) {
      const gatewayValues =
        Underpost.ingress.provider({ environment: env }) === 'gateway-api'
          ? ' --set config.apiVersion=controller.config.cert-manager.io/v1alpha1' +
            ' --set config.kind=ControllerConfiguration --set config.enableGatewayAPI=true'
          : '';
      shellExec(`helm repo add jetstack https://charts.jetstack.io --force-update`);
      shellExec(
        `helm upgrade --install cert-manager jetstack/cert-manager --namespace ${Underpost.namespace.of('certManager', { environment: env })} --create-namespace` +
          ` --version ${CERT_MANAGER_RELEASES.installed} --set crds.enabled=true${gatewayValues} --wait --timeout 5m`,
      );
      const { mode } = Underpost.tls.policy({ environment: env });
      if (mode !== 'cert-manager') {
        logger.info(`cert-manager is installed; ${env} issues no ACME certificate (TLS mode ${mode})`);
        return null;
      }
      return Underpost.tls.issuer('reconcile', { apply: true, options: { env } });
    },

    /**
     * @method ingressStackPresence
     * @description Which ingress data planes are installed right now.
     *
     * Read from the cluster rather than from the flags, because the whole point
     * is to react to what a previous invocation left behind: `--contour` run
     * against a cluster that already has Envoy Gateway has to behave differently
     * from `--contour` on an empty one.
     * @param {string} [contourNamespace] - Namespace holding Contour.
     * @returns {{contour: boolean, gateway: boolean}} Presence of each stack.
     * @memberof UnderpostCluster
     */
    ingressStackPresence(contourNamespace = Underpost.namespace.of('contour')) {
      const exists = (cmd) =>
        `${shellExec(cmd, { stdout: true, silent: true, silentOnError: true }) || ''}`.trim().length > 0;
      return {
        contour: exists(`kubectl get daemonset envoy -n ${contourNamespace} -o name`),
        gateway: exists(`kubectl get deployment envoy-gateway -n ${Underpost.namespace.of('envoyGateway')} -o name`),
      };
    },

    /**
     * @method refreshUnderpostIngress
     * @description Rebuilds the underpost ingress host table after routes change.
     *
     * The table maps each hostname to the data plane that has a route object for
     * it, so it goes stale the moment a host is published — a hostname added
     * after the last build falls through to the default backend, which is the
     * *other* stack, and answers 404 for a workload that is running perfectly.
     * Every path that publishes a route therefore ends here.
     *
     * A no-op when the ingress is not installed, which is the single-stack case:
     * there is no table to keep, because the one data plane owns the ports.
     * The rendered config is unchanged by a blue/green promotion — the table is
     * host to stack, not host to colour — so an ordinary deploy re-applies the
     * same bytes and nothing restarts.
     * @param {string} [namespace] - Namespace holding the ingress.
     * @param {object} [options] - Cluster options. `ingressNode` overrides the platform scheduling;
     * application `node` / `nodeName` flags are ignored.
     * @returns {boolean} True when the table was rebuilt.
     * @memberof UnderpostCluster
     */
    refreshUnderpostIngress({ namespace = 'default', options = {} } = {}) {
      const installed = `${
        shellExec(`kubectl get deployment ${UNDERPOST_INGRESS.name} -n ${namespace} -o name`, {
          stdout: true,
          silent: true,
          silentOnError: true,
        }) || ''
      }`.trim();
      if (!installed) return false;
      return Underpost.cluster.installUnderpostIngress({ namespace, options });
    },

    /**
     * @method installUnderpostIngress
     * @description Installs or refreshes the underpost ingress in front of both data planes.
     *
     * The host table is built from the route objects that actually exist, so a
     * hostname reaches the stack that describes it no matter which flag was used
     * last. Rebuilt on every call, which is what keeps it correct after routes
     * move between stacks.
     * @param {string} [namespace] - Namespace to deploy the underpost ingress into.
     * @param {object} [options] - Cluster options. Use `ingressNode` to
     * explicitly place or recover the public listener.
     * @returns {boolean} True when the underpost ingress was applied.
     * @memberof UnderpostCluster
     */
    installUnderpostIngress({ namespace = 'default', options = {} } = {}) {
      const presence = Underpost.cluster.ingressStackPresence();
      // Each kind names its hosts in its own field, so each is read with its own
      // jsonpath rather than one expression that happens to tolerate the other's
      // shape being absent.
      const HOST_FIELD = { httpproxy: '.spec.virtualhost.fqdn', httproute: '.spec.hostnames[*]' };
      const hostsOf = (kind) =>
        `${
          shellExec(`kubectl get ${kind} -A -o jsonpath='{range .items[*]}{${HOST_FIELD[kind]}}{" "}{end}'`, {
            stdout: true,
            silent: true,
            silentOnError: true,
          }) || ''
        }`
          .split(/\s+/)
          .map((host) => host.trim())
          .filter(Boolean);

      const backends = {};
      if (presence.contour)
        backends.contour = ingressBackendFactory(Underpost.namespace.resolve({ resource: 'contour', options }));
      if (presence.gateway) {
        // Envoy Gateway names its own data plane Service, so it is discovered
        // rather than assumed; without it the underpost ingress would proxy to nothing.
        const service = `${
          shellExec(
            `kubectl get svc -n ${Underpost.namespace.of('envoyGateway', { options })} -l app.kubernetes.io/name=envoy -o jsonpath='{.items[0].metadata.name}'`,
            { stdout: true, silent: true, silentOnError: true },
          ) || ''
        }`.trim();
        if (service)
          backends.gateway = ingressBackendFactory({
            ...Underpost.namespace.resolve({ resource: 'envoyGateway', options }),
            services: [service],
          });
        else logger.warn('Envoy Gateway is installed but has provisioned no data plane Service yet');
      }
      if (Object.keys(backends).length === 0) {
        logger.warn('No ingress data plane installed; skipping the underpost ingress');
        return false;
      }

      const provider = Underpost.ingress.provider({ options });
      const destination = provider === 'gateway-api' ? 'gateway' : 'contour';
      const contourHosts = presence.contour ? hostsOf('httpproxy') : [];
      const gatewayHosts = presence.gateway ? hostsOf('httproute') : [];
      const moving = contourHosts.some((host) => gatewayHosts.includes(host));
      const { entries, conflicts } = underpostIngressHostMapFactory({
        contourHosts,
        gatewayHosts,
        preferred: destination,
        ready: moving ? Underpost.ingress.servedHosts(provider) : [],
      });
      if (conflicts.length > 0)
        logger.warn('Hosts described by both stacks: each moves to the destination stack once its route serves', {
          conflicts,
          destination,
        });

      const conf = underpostIngressConfFactory({
        entries,
        backends,
        resolver: Underpost.deploy.clusterDnsFactory(),
        defaultBackend: backends.gateway ? 'gateway' : 'contour',
      });
      const liveNode = `${
        shellExec(
          `kubectl get deployment ${UNDERPOST_INGRESS.name} -n ${namespace} -o jsonpath='{.spec.template.spec` +
            `.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0]` +
            `.matchExpressions[0].values[0]}'`,
          { stdout: true, silent: true, silentOnError: true },
        ) || ''
      }`.trim();
      // Application `node` and `nodeName` flags never move the public listener: with Recreate, a move
      // deletes the healthy edge first. `--ingress-node`, then the platform scheduling, then the live
      // node, then the cluster-type default place it.
      const scheduled = Underpost.namespace.soleNode(
        Underpost.namespace.schedule({ resource: 'platform', options, node: options.ingressNode }).nodes,
        'The Underpost ingress',
      );
      const chosenNode =
        scheduled ||
        liveNode ||
        Underpost.deploy.resolveDeployNodes({
          resource: 'platform',
          kind: options.kind,
          kubeadm: options.kubeadm,
          k3s: options.k3s,
          env: options.dev ? 'development' : 'production',
        })[0];
      // A host-network listener pinned to a name no node carries stays Pending: only a guess may be corrected.
      const { node: ingressNode, corrected } = Underpost.deploy.resolveSchedulableNode({ node: chosenNode });
      if (corrected && scheduled)
        throw new Error(`[underpost-ingress] ${scheduled} is not a node in this cluster (schedulable: ${ingressNode})`);
      if (corrected)
        logger.warn('Ingress node does not exist in this cluster; using a schedulable node instead', {
          chosen: chosenNode,
          from: liveNode === chosenNode ? 'the live deployment' : 'the cluster-type default',
          using: ingressNode,
        });
      const liveMount = `${
        shellExec(
          `kubectl get deployment ${UNDERPOST_INGRESS.name} -n ${namespace} ` +
            `-o jsonpath='{.spec.template.spec.containers[0].volumeMounts[?(@.name=="nginx-conf")].mountPath}'`,
          { stdout: true, silent: true, silentOnError: true },
        ) || ''
      }`.trim();
      const liveReady = `${
        shellExec(
          `kubectl get deployment ${UNDERPOST_INGRESS.name} -n ${namespace} -o jsonpath='{.status.readyReplicas}'`,
          { stdout: true, silent: true, silentOnError: true },
        ) || ''
      }`.trim();
      const canHotReload = liveMount === '/etc/underpost-ingress' && parseInt(liveReady || '0', 10) > 0;
      const changesNode = !!liveNode && ingressNode !== liveNode;
      const execIngress = (command, execOptions = {}) =>
        shellExec(`kubectl exec -n ${namespace} deploy/${UNDERPOST_INGRESS.name} -- ${command}`, execOptions);

      if (changesNode) {
        // Prove the destination can start the exact edge image before Recreate
        // removes the listener that is serving now. This pod has no hostNetwork,
        // so it cannot contend for 80/443. On an offline node, IfNotPresent uses
        // the cache; a missing image fails here while the current edge remains.
        const preflightPod = `${UNDERPOST_INGRESS.name}-image-preflight`;
        shellExec(`kubectl delete pod ${preflightPod} -n ${namespace} --ignore-not-found`, {
          silent: true,
          silentOnError: true,
        });
        try {
          shellExec(`kubectl apply -f - -n ${namespace} <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: ${preflightPod}
  namespace: ${namespace}
spec:
  restartPolicy: Never
  nodeSelector:
    kubernetes.io/hostname: ${ingressNode}
  containers:
    - name: nginx
      image: ${UNDERPOST_INGRESS.image}
      imagePullPolicy: IfNotPresent
      command: ['/bin/sh', '-c', 'nginx -v && sleep 300']
EOF
`);
          shellExec(`kubectl wait --for=condition=Ready pod/${preflightPod} -n ${namespace} --timeout=2m`, {
            silent: true,
          });
        } finally {
          shellExec(`kubectl delete pod ${preflightPod} -n ${namespace} --ignore-not-found`, {
            silent: true,
            silentOnError: true,
          });
        }
      }
      const liveConf = canHotReload
        ? `${
            execIngress('cat /tmp/nginx.conf', {
              stdout: true,
              silent: true,
              silentOnError: true,
            }) || ''
          }`
        : '';
      const shouldHotReload = canHotReload && liveConf.trimEnd() !== `${conf}`.trimEnd();

      if (shouldHotReload) {
        // Validate the exact candidate before either the running master or the
        // persisted ConfigMap sees it. The quoted heredoc preserves every Nginx
        // variable and keeps a malformed host table from reaching the edge.
        shellExec(`kubectl exec -i -n ${namespace} deploy/${UNDERPOST_INGRESS.name} -- sh -c 'cat > /tmp/nginx.candidate.conf' <<'EOF'
${conf}
EOF
`);
        execIngress('nginx -t -c /tmp/nginx.candidate.conf', { silent: true });
        try {
          execIngress(
            `sh -c 'cp /tmp/nginx.conf /tmp/nginx.previous.conf && ` +
              `cp /tmp/nginx.candidate.conf /tmp/nginx.conf && nginx -s reload -c /tmp/nginx.conf'`,
            { silent: true },
          );
        } catch (error) {
          execIngress(`sh -c 'cp /tmp/nginx.previous.conf /tmp/nginx.conf && nginx -s reload -c /tmp/nginx.conf'`, {
            silent: true,
            silentOnError: true,
          });
          throw error;
        }
      }

      try {
        // The manifest carries the whole nginx.conf: echoing it as the command line
        // buries the lines that follow it — the fallback probes above all — under
        // a page of routing tables on every sync.
        logger.info('Applying the underpost ingress manifests', { namespace, node: ingressNode });
        shellExec(
          `kubectl apply -f - -n ${namespace} <<'EOF'
${underpostIngressManifestsFactory({
  namespace,
  conf,
  scheduling: Underpost.namespace.podScheduling({ resource: 'platform', options, node: ingressNode }),
})}
EOF
`,
          { disableLog: true },
        );
      } catch (error) {
        if (shouldHotReload)
          execIngress(`sh -c 'cp /tmp/nginx.previous.conf /tmp/nginx.conf && nginx -s reload -c /tmp/nginx.conf'`, {
            silent: true,
            silentOnError: true,
          });
        throw error;
      }
      if (shouldHotReload)
        execIngress('rm -f /tmp/nginx.previous.conf /tmp/nginx.candidate.conf', {
          silent: true,
          silentOnError: true,
        });
      // A live pod before apply is not proof the desired template rolled out.
      // In particular, changing nodeSelector uses Recreate and invalidates the
      // ready replica that made canHotReload true. Do not let the caller delete
      // the old route kind until the replacement edge is actually Available.
      if (!canHotReload || changesNode)
        shellExec(`kubectl rollout status deployment/${UNDERPOST_INGRESS.name} -n ${namespace} --timeout=5m`, {
          silent: true,
        });
      else if (shouldHotReload)
        // `nginx -s reload` returns after signalling the master. Give it one
        // scheduling turn to start the new workers before the caller removes
        // the old stack's route object.
        shellExec('sleep 1', { silent: true });
      shellExec(
        `kubectl wait --for=condition=Available deployment/${UNDERPOST_INGRESS.name} ` + `-n ${namespace} --timeout=5m`,
        { silent: true },
      );
      execIngress('nginx -t -c /tmp/nginx.conf', { silent: true });
      logger.info('Underpost ingress applied', {
        namespace,
        backends: Object.keys(backends),
        hosts: entries.length,
        node: ingressNode,
        hotReloaded: shouldHotReload,
      });
      return true;
    },

    /**
     * @method pruneEndpointlessService
     * @description Removes a Service that resolves to nothing. kube-proxy does
     * not ignore such a Service — it installs an ICMP port-unreachable REJECT
     * for every port it publishes, so an orphan is not inert: it actively
     * refuses connections on those ports, and the refusal looks exactly like
     * "no server is listening" even while one is.
     *
     * Only an endpointless Service is removed, so a healthy one of the same name
     * is never touched.
     * @param {string} name - Service name.
     * @param {string} [namespace] - Namespace to inspect.
     * @returns {boolean} True when a Service was pruned.
     * @memberof UnderpostCluster
     */
    pruneEndpointlessService({ name, namespace = 'default' }) {
      const exists = shellExec(`kubectl get svc ${name} -n ${namespace} -o name`, {
        stdout: true,
        silent: true,
        silentOnError: true,
      });
      if (!exists || !`${exists}`.trim()) return false;
      // EndpointSlice rather than the deprecated Endpoints API.
      const addresses = shellExec(
        `kubectl get endpointslice -n ${namespace} -l kubernetes.io/service-name=${name} ` +
          `-o jsonpath='{.items[*].endpoints[*].addresses[*]}'`,
        { stdout: true, silent: true, silentOnError: true },
      );
      if (addresses && `${addresses}`.trim()) return false;
      logger.warn(`Pruning endpointless Service ${namespace}/${name}`, {
        reason: 'kube-proxy REJECTs every port a Service with no endpoints publishes',
      });
      shellExec(`kubectl delete svc ${name} -n ${namespace} --ignore-not-found`);
      return true;
    },

    /**
     * @method resolveCriSocket
     * @description CLI-facing binding of {@link CriEndpoint.resolveCriSocket}.
     * @param {object} [options] - Cluster options (`k3s`, `criSocket`).
     * @returns {string} CRI endpoint URI.
     * @memberof UnderpostCluster
     */
    resolveCriSocket,

    /**
     * @method crictlCommandFactory
     * @description CLI-facing binding of {@link CriEndpoint.crictlCommandFactory}.
     * @param {string} args - crictl subcommand and arguments (e.g. `pull mongo:latest`).
     * @param {object} [options] - Cluster options (`k3s`, `criSocket`).
     * @returns {string} Full shell command.
     * @memberof UnderpostCluster
     */
    crictlCommandFactory,

    /**
     * @method config
     * @description Configures host-level settings required for Kubernetes.
     * This method ensures proper SELinux, Docker, Containerd, and Sysctl settings
     * are applied for a healthy Kubernetes environment. It explicitly avoids
     * iptables flushing commands to prevent conflicts with Kubernetes' own network management.
     * @param {object} [options] - Configuration options for host setup.
     * @param {string} [options.underpostRoot] - The root path of the underpost project, used for locating scripts if needed.
     * @memberof UnderpostCluster
     */
    config(options = { underpostRoot: '.' }) {
      const { underpostRoot } = options;
      console.log('Applying host configuration: SELinux, Docker, Containerd, and Sysctl settings.');
      // Label before enforcing, never after: flipping the mode first would put the host into
      // Enforcing with the storage trees still carrying the policy default, and every pod that
      // mounts one would start failing for real instead of only logging a denial.
      //
      // Registered on every run, not only at first cluster creation: the node directories backing
      // PersistentVolumes are recreated by resets, by `DirectoryOrCreate`, and by the local-path
      // helper pod long after `kubeadm init` ran, and each of those inherits the policy default
      // unless the mapping is already in the store.
      ensureSELinuxTooling();
      Underpost.cluster.ensureContainerStorageContexts();
      enforceSELinux(['/var/lib/kubelet', '/var/lib/containerd']);

      controlHostService('enable --now', 'docker');
      controlHostService('enable --now', 'kubelet');

      // containerd uses the systemd cgroup driver and labels its containers.
      writeHostFile({
        target: '/etc/containerd/config.toml',
        content: shellExec('containerd config default', { stdout: true, silent: true })
          .replaceAll('SystemdCgroup = false', 'SystemdCgroup = true')
          .replaceAll('enable_selinux = false', 'enable_selinux = true'),
      });
      runSELinuxCommands([selinuxRestoreconCommandFactory('/etc/containerd')], { execute: shellExec });
      controlHostService('restart', 'docker');
      controlHostService('enable --now', 'containerd');
      controlHostService('restart', 'containerd');

      disableSwap();
      controlHostService('daemon-reload');
      ensureInotifyLimits();
    },

    /**
     * @method configMinimalK3s
     * @description Minimal host configuration for a K3s node. K3s is fully
     * self-contained — it ships its own containerd, kubelet, CNI (flannel),
     * CoreDNS and traefik. It therefore needs NONE of the Docker /
     * standalone-containerd / standalone-kubelet setup that `config()` applies
     * for kind and kubeadm. In a fresh LXD VM those packages do not exist, so
     * `config()` there is both redundant and a source of errors.
     *
     * This applies only what K3s genuinely requires, and every step is guarded
     * so it is a no-op when the relevant tooling is absent (e.g. minimal images
     * without SELinux userspace):
     *   - SELinux remains Enforcing.
     *   - swap off (Kubernetes best practice).
     *   - br_netfilter + bridge/forward sysctls (pod networking).
     *   - inotify limits.
     * @memberof UnderpostCluster
     */
    configMinimalK3s() {
      console.log('Applying minimal K3s host configuration (firewalld, SELinux, swap, sysctl).');

      // Disable firewalld. K3s manages its own iptables rules; firewalld
      // closes 6443/tcp (supervisor + API) and 8472/udp (flannel VXLAN) by
      // default on RHEL/Rocky, which makes k3s-agent hang on `systemctl start`
      // forever (the upstream unit ships TimeoutStartSec=0).
      if (shellExec('systemctl is-active --quiet firewalld', { silent: true, silentOnError: true }).code === 0)
        controlHostService('disable --now', 'firewalld');

      // Storage labeling precedes the Enforcing flip, so the mode is never activated over trees
      // that still carry the policy default.
      ensureSELinuxTooling();
      Underpost.cluster.ensureContainerStorageContexts();
      enforceSELinux(K3S_SELINUX_PATHS);

      disableSwap();

      // Pod networking: K3s and flannel need br_netfilter and the bridge and forward sysctls. A minimal
      // image without the module keeps going.
      if (!/^br_netfilter /m.test(fs.readFileSync('/proc/modules', 'utf8')))
        shellExec('modprobe br_netfilter', { silentOnError: true, privileged: 'loads the br_netfilter kernel module' });
      writeHostFile({
        target: K3S_SYSCTL_PATH,
        content:
          'net.bridge.bridge-nf-call-iptables = 1\nnet.bridge.bridge-nf-call-ip6tables = 1\nnet.ipv4.ip_forward = 1\n',
      });
      shellExec('sysctl --system', { privileged: 'applies the sysctl settings of the host' });

      ensureInotifyLimits();
    },

    /**
     * @method natSetup
     * @description Configures NAT and iptables settings for Kubernetes networking.
     * This method enables necessary sysctl settings for bridge networking and applies iptables rules
     * required for Kubernetes cluster communication. It is designed to work with kubeadm and k3s clusters, ensuring that
     * traffic through Linux bridges is processed by iptables, which is crucial for CNI plugins to function correctly.
     * The method also applies NAT iptables rules and configures firewalld for Kubernetes, which is required for multi-machine kubeadm inter-node communication.
     * Note: This method must be called before kubeadm init / kind create so that br_netfilter is loaded and kernel networking is ready when the control plane starts.
     * @param {object} [options] - Configuration options for NAT setup.
     * @param {string} [options.underpostRoot] - The root path of the underpost project, used to locate the nat-iptables.sh script.
     * @memberof UnderpostCluster
     */
    natSetup(options = { underpostRoot: '.' }) {
      const { underpostRoot } = options;
      // Loads br_netfilter, applies bridge/forward sysctls, opens firewall ports, enables masquerade.
      // Must run before kubeadm init / kind create so kernel networking is ready.
      shellExec(`bash ${shellArgumentFactory(path.join(underpostRoot, 'scripts/nat-iptables.sh'))}`, {
        privileged: 'configures the firewall and the kernel networking of the host',
      });
    },

    /**
     * @method createKind
     * @description Creates the Kind development cluster: host configuration, the MongoDB host paths,
     * the pinned node image, then `kind create cluster`. It never deletes a cluster or a volume.
     * @param {object} params
     * @param {string} params.underpostRoot - The root that holds `manifests/kind-config-dev.yaml`.
     * @param {string|number} [params.replicas] - MongoDB members, one host path each.
     * @memberof UnderpostCluster
     */
    async createKind({ underpostRoot, replicas }) {
      Underpost.cluster.config();
      Underpost.cluster.natSetup({ underpostRoot });
      logger.info('Initializing Kind cluster...');
      const devReplicaCount = resolveReplicaCount(replicas, MONGODB_DEFAULT_REPLICA_COUNT);
      for (const directory of [
        '/data/mongodb',
        ...Array.from({ length: devReplicaCount }, (_, i) => `/data/mongodb/v${i}`),
      ])
        makeHostDirectory(directory, { reason: 'creates the MongoDB host paths the Kind nodes mount' });
      const nodeImage = shellArgumentFactory(KIND_NODE_IMAGE);
      if (
        shellExec(`docker image inspect ${nodeImage}`, {
          silent: true,
          silentOnError: true,
          privileged: DOCKER_PRIVILEGE,
        }).code !== 0
      ) {
        // Without a terminal, docker prints a layer only when it completes.
        logger.info('Pulling the Kind node image. On a slow link this takes minutes.', {
          image: KIND_NODE_IMAGE,
        });
        shellExec(`docker pull ${nodeImage}`, { privileged: DOCKER_PRIVILEGE });
      }
      // Kind writes the new context to a scratch kubeconfig: the merge of chown keeps the current context.
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-kind-'));
      const createCluster = () =>
        shellExec(
          `kind create cluster --config ${shellArgumentFactory(path.join(underpostRoot, 'manifests/kind-config-dev.yaml'))} --image ${nodeImage} --kubeconfig ${shellArgumentFactory(path.join(scratch, 'config'))}`,
          { privileged: DOCKER_PRIVILEGE },
        );
      try {
        createCluster();
      } catch (error) {
        const kindCreateErrText = `${error?.message || ''}\n${error?.stderr || ''}`;
        if (kindCreateErrText.includes('all predefined address pools have been fully subnetted')) {
          logger.warn(
            'Docker address pool exhausted while creating Kind cluster. Running cleanup and retrying once...',
          );
          Underpost.cluster.recoverKindDockerNetworks();
          try {
            createCluster();
          } catch (retryError) {
            const retryErrText = `${retryError?.message || ''}\n${retryError?.stderr || ''}`;
            if (retryErrText.includes('all predefined address pools have been fully subnetted')) {
              logger.warn(
                'Kind retry still failed from pool exhaustion. Applying Docker daemon address-pool config and retrying once more...',
              );
              Underpost.cluster.ensureDockerDefaultAddressPools();
              createCluster();
            } else {
              throw retryError;
            }
          }
        } else {
          throw error;
        }
      } finally {
        fs.removeSync(scratch);
      }
      Underpost.namespace.pin({
        environment: 'development',
        context: (await Underpost.cluster.chown('kind')).context,
        source: 'the new cluster',
        runtime: 'kind',
      });
    },

    /**
     * @method chown
     * @description Gives the kubeconfig of a cluster to the user the command acts for, and to root
     * when the command runs as root for that user, because the kubectl of a root process reads root's.
     * The cluster context is merged into each file: its other contexts and its current context stay.
     * Each file belongs to its user with mode 0600.
     * @param {string} clusterType - 'kubeadm', 'k3s' or 'kind'.
     * @returns {Promise<{context: string, written: string[]}>} The context of the cluster and the
     *   kubeconfig files it wrote.
     * @memberof UnderpostCluster
     */
    async chown(clusterType) {
      const source =
        clusterType === 'kind'
          ? await runCommand('kind', ['get', 'kubeconfig'], { disableLog: true, privileged: DOCKER_PRIVILEGE })
          : await runCommand('cat', [KUBECONFIG_SOURCES[clusterType]], {
              disableLog: true,
              privileged: `reads the root-only kubeconfig of ${clusterType}`,
            });
      const owners = [invokingUser()];
      if (process.getuid() === 0 && owners[0].uid !== 0) owners.push({ ...os.userInfo(), home: os.userInfo().homedir });
      const staged = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-kubeconfig-')), 'config');
      fs.writeFileSync(staged, source.stdout, { mode: 0o600 });
      const kubectl = (args, env) => runCommand('kubectl', args, { disableLog: true, env: { ...process.env, ...env } });
      const written = [];
      let context = '';
      try {
        context = (await kubectl(['config', 'current-context', '--kubeconfig', staged])).stdout.trim();
        for (const owner of owners) {
          const target = path.join(owner.home, '.kube', 'config');
          const existed = fs.existsSync(target);
          const current = existed
            ? (
                await kubectl(['config', 'current-context', '--kubeconfig', target]).catch(() => ({ stdout: '' }))
              ).stdout.trim()
            : '';
          const merged = await kubectl(['config', 'view', '--flatten', '--raw'], {
            KUBECONFIG: [staged, ...(existed ? [target] : [])].join(':'),
          });
          fs.ensureDirSync(path.dirname(target), { mode: 0o700 });
          fs.writeFileSync(`${target}.tmp`, merged.stdout, { mode: 0o600 });
          if (current) await kubectl(['config', 'use-context', current, '--kubeconfig', `${target}.tmp`]);
          if (process.getuid() === 0) {
            fs.chownSync(path.dirname(target), owner.uid, owner.gid);
            fs.chownSync(`${target}.tmp`, owner.uid, owner.gid);
          }
          fs.renameSync(`${target}.tmp`, target);
          written.push(target);
          logger.info(`Merged the ${clusterType} context into ${target}`, {
            currentContext: current || 'the cluster context',
          });
        }
      } finally {
        fs.removeSync(path.dirname(staged));
      }
      return { context, written };
    },

    // Shared reset helpers (internal — used by safeResetKind / safeResetKubeadm).

    /**
     * @method _truncateLargeLogs
     * @description Removes each entry of /var/log over 1 GiB. Best-effort.
     * @private
     */
    _truncateLargeLogs() {
      try {
        const usage = shellExec('du -s -B1 -- /var/log/*', {
          stdout: true,
          silent: true,
          privileged: 'measures the logs of the host',
        });
        for (const [bytes, target] of usage.split('\n').map((line) => line.split('\t')))
          if (target && Number(bytes) > 1024 ** 3) removeHostPath(target, { reason: 'removes a log over 1 GiB' });
      } catch (err) {
        logger.warn(`  -> Skipped log truncation: ${err.message}`);
      }
    },

    /**
     * @method _cleanHostPathPvs
     * @description Wipes contents of every hostPath PV. Destroys live data —
     * only call when `--remove-volume-host-paths` is set.
     * @private
     */
    _cleanHostPathPvs() {
      try {
        const pvListJson = shellExec(`kubectl get pv -o json || echo '{"items":[]}'`, {
          stdout: true,
          silent: true,
        });
        const pvList = JSON.parse(pvListJson);
        if (!pvList.items || pvList.items.length === 0) {
          logger.info('  -> No PersistentVolumes with hostPath found.');
          return;
        }
        for (const pv of pvList.items) {
          if (pv.spec.hostPath && pv.spec.hostPath.path) {
            const hostPath = pv.spec.hostPath.path;
            logger.info(`  -> Removing PV '${pv.metadata.name}' hostPath: ${hostPath}`);
            removeHostPath(hostPath, { contents: true, reason: 'wipes the data of a hostPath PersistentVolume' });
          }
        }
      } catch (error) {
        logger.error(`  -> Failed cleaning hostPath PVs: ${error.message}`);
      }
    },

    /**
     * @method _pruneContainerCaches
     * @description Reclaims container-runtime disk left behind after a cluster
     * teardown: stopped containers, unused images, build cache and anonymous
     * volumes. Best-effort across every runtime present on the host (docker,
     * podman, and optionally the CRI runtime via crictl). Each block is guarded
     * by a command-existence check, so it is safe to call when a runtime is
     * absent. This is what turns a "cluster deleted" into "disk actually freed":
     * `kind delete` / `kubeadm reset` remove the cluster but leave gigabytes of
     * images and overlay layers under /var/lib/{docker,containers}.
     * @param {object} [options]
     * @param {boolean} [options.all=true] - Remove all unused images, not just dangling ones.
     * @param {string[]} [options.keepImages=[]] - Docker repositories whose images survive an `all` prune.
     * @param {boolean} [options.crictl=false] - Also prune the CRI runtime via crictl.
     * @param {string} [options.criSocket] - Optional CRI endpoint override; otherwise the live runtime is resolved.
     * @private
     */
    _pruneContainerCaches(options = {}) {
      const all = options.all !== false;
      const a = all ? '-a ' : '';
      const keep = all ? (options.keepImages ?? []) : [];
      logger.info(`  -> Pruning container-runtime caches (all=${all})...`, { keepImages: keep });
      // Docker prunes cannot exclude a repository, so a kept one turns the image pass into a listing.
      const keptImages = ['<none>', ...keep.map((repository) => `${repository}:`)]
        .map((pattern) => `-e ${shellArgumentFactory(pattern)}`)
        .join(' ');
      const dockerImages = keep.length
        ? `docker image prune -f; docker images --format '{{.Repository}}:{{.Tag}}' | grep -vF ${keptImages} | xargs -r docker rmi >/dev/null 2>&1 || true;`
        : `docker image prune ${a}-f;`;
      // Containers, images and volumes only, never networks: Podman reads the CNI configuration of a
      // Kubernetes node as its own networks, and a network prune deletes it. `docker` may be the Podman shim.
      shellExec(
        `if command -v docker >/dev/null 2>&1; then docker container prune -f; ${dockerImages} docker volume prune -f; docker builder prune ${a}-f; fi`,
        { silentOnError: true, privileged: DOCKER_PRIVILEGE },
      );
      // Podman native — on this host images/overlays live under /var/lib/containers/storage.
      shellExec(
        `if command -v podman >/dev/null 2>&1; then podman container prune -f; podman image prune ${a}-f; podman volume prune -f; fi`,
        { silentOnError: true, privileged: 'prunes the container storage of root Podman' },
      );
      if (options.crictl) {
        shellExec(`if command -v crictl >/dev/null 2>&1; then ${crictlCommandFactory('rmi --prune', options)}; fi`, {
          silentOnError: true,
          privileged: CRICTL_PRIVILEGE,
        });
      }
      Underpost.cluster._unmountOrphanContainerOverlays();
    },

    /**
     * @method _unmountOrphanContainerOverlays
     * @description Unmounts leaked container overlay 'merged' mounts under
     * /var/lib/{containers/storage,docker}/overlay. Pruning images/containers
     * frees the backing data but leaves these mountpoints attached, so they
     * keep showing up as identical `overlay ... /merged` rows in `df -h` long
     * after the containers are gone. Only overlays NOT backing a still-existing
     * container are unmounted, so running workloads are never disturbed.
     * Best-effort; safe to call when no runtime is present.
     * @private
     */
    _unmountOrphanContainerOverlays() {
      logger.info('  -> Unmounting orphaned container overlay mounts...');
      const privileged = 'unmounts the orphaned container overlays of the host';
      shellExec(`if command -v podman >/dev/null 2>&1; then podman umount --all >/dev/null 2>&1 || true; fi`, {
        silentOnError: true,
        privileged,
      });
      shellExec(
        `active="$(podman ps -aq 2>/dev/null | xargs -r -I{} podman inspect --format '{{.GraphDriver.Data.MergedDir}}' {} 2>/dev/null || true)"
findmnt -rn -o TARGET 2>/dev/null | grep -E '/var/lib/(containers/storage|docker)/overlay.*/merged' | sort -r | while IFS= read -r m; do
  if ! printf '%s\\n' "$active" | grep -qxF "$m"; then
    echo "Unmounting orphaned overlay: $m"
    umount -l "$m" 2>/dev/null || true
  fi
done`,
        { silentOnError: true, privileged },
      );
    },

    /**
     * @method _lazyUmountKubeletMounts
     * @description Lazy-unmounts every mount under /var/lib/kubelet so a
     * subsequent `rm -rf` does not hit 'Device or resource busy'. Best-effort.
     * @private
     */
    _lazyUmountKubeletMounts() {
      shellExec('findmnt --raw --noheadings -o TARGET | grep /var/lib/kubelet | sort -r | xargs -r umount -l', {
        silentOnError: true,
        privileged: 'unmounts the kubelet mounts of the host',
      });
    },

    // Per-type reset methods. Each only touches what its own runtime owns.

    /**
     * @method safeResetKind
     * @description Kind (Kubernetes in Docker) reset — Docker-scoped only.
     * Does not touch host kubelet / containerd / iptables / SELinux.
     * @param {object} [options]
     * @param {string} [options.underpostRoot='.']
     * @param {boolean} [options.removeVolumeHostPaths=false]
     * @memberof UnderpostCluster
     */
    async safeResetKind(options = { underpostRoot: '.', removeVolumeHostPaths: false }) {
      logger.info('=== KIND SAFE RESET (development) ===');

      logger.info('Phase 1/5: Cleaning Kind node-local MongoDB hostPath directories...');
      Underpost.cluster.cleanKindMongoHostPaths({ basePath: '/data/mongodb', replicaCount: 3 });

      logger.info('Phase 2/5: PersistentVolume hostPath cleanup...');
      if (options.removeVolumeHostPaths) Underpost.cluster._cleanHostPathPvs();
      else logger.info('  -> Skipping (pass --remove-volume-host-paths to enable).');

      logger.info('Phase 3/6: Deleting all Kind clusters...');
      shellExec(
        `clusters=$(kind get clusters)
if [ -n "$clusters" ]; then
  for c in $clusters; do
    echo "Deleting cluster: $c"
    kind delete cluster --name "$c"
  done
fi`,
        { privileged: DOCKER_PRIVILEGE },
      );

      logger.info('Phase 4/6: Cleaning kubeconfig and Kind Docker networks...');
      fs.removeSync(path.join(os.homedir(), '.kube'));
      Underpost.cluster.recoverKindDockerNetworks();

      // The node image stays: the next cluster boots from it instead of pulling it again.
      logger.info(
        'Phase 5/6: Pruning container-runtime caches (unused images but the Kind node, build cache, volumes)...',
      );
      Underpost.cluster._pruneContainerCaches({ all: true, keepImages: [KIND_NODE_REPOSITORY] });

      logger.info('Phase 6/6: Re-applying host configuration (Docker, containerd, sysctl).');
      Underpost.cluster.config();

      logger.info('=== KIND SAFE RESET COMPLETE ===');
    },

    /**
     * @method safeResetKubeadm
     * @description Kubeadm reset on the host: stop kubelet + runtime, kill
     * control-plane ports (6443 / 2379 / 2380 / 10257 / 10259), run
     * `kubeadm reset --force`, wipe kubeadm-managed FS + network state.
     * Does not touch K3s or Kind state.
     * @param {object} [options]
     * @param {string} [options.underpostRoot='.']
     * @param {boolean} [options.removeVolumeHostPaths=false]
     * @memberof UnderpostCluster
     */
    async safeResetKubeadm(options = { underpostRoot: '.', removeVolumeHostPaths: false }) {
      logger.info('=== KUBEADM SAFE RESET ===');

      logger.info('Phase 0/7: Truncating large /var/log files...');
      Underpost.cluster._truncateLargeLogs();

      logger.info('Phase 1/7: PersistentVolume hostPath cleanup...');
      if (options.removeVolumeHostPaths) Underpost.cluster._cleanHostPathPvs();
      else logger.info('  -> Skipping (pass --remove-volume-host-paths to enable).');

      logger.info('Phase 2/7: Enforcing SELinux and restoring runtime contexts...');
      // The hostPath cleanup above emptied the volume trees; re-asserting the mapping here means
      // a rebuild starts from correctly labeled storage instead of inheriting the policy default.
      ensureSELinuxTooling();
      Underpost.cluster.ensureContainerStorageContexts();
      enforceSELinux(['/var/lib/kubelet', '/var/lib/containerd']);

      logger.info('Phase 3/7: Stopping host kubelet and container runtimes (kubeadm-scope only)...');
      for (const unit of ['kubelet', 'docker', 'crio']) stopHostService(unit);
      Underpost.cluster._lazyUmountKubeletMounts();

      logger.info('Phase 4/7: Killing control-plane processes and running kubeadm reset...');
      const reason = 'resets the kubeadm state of the host';
      shellExec(`if command -v crictl >/dev/null 2>&1; then ${crictlCommandFactory('rm -a -f')}; fi`, {
        silentOnError: true,
        privileged: CRICTL_PRIVILEGE,
      });
      // Remove CNI config before stopping sandboxes so Calico's CNI delete hook is
      // not invoked (the API server is already down and the hook would fail).
      removeHostPath('/etc/cni/net.d', { contents: true, reason });
      shellExec(`if command -v crictl >/dev/null 2>&1; then ${crictlCommandFactory('rmp -a -f')}; fi`, {
        silentOnError: true,
        privileged: CRICTL_PRIVILEGE,
      });
      stopHostService('etcd');
      for (const port of [6443, 10259, 10257, 2379, 2380])
        shellExec(`if fuser ${port}/tcp >/dev/null 2>&1; then fuser -k ${port}/tcp; fi`, {
          privileged: `stops the control-plane process on ${port}/tcp`,
        });
      shellExec('if command -v kubeadm >/dev/null 2>&1; then kubeadm reset --force; fi', { privileged: reason });

      logger.info('Phase 5/7: Filesystem cleanup (kubeadm-managed paths only)...');
      removeHostPath('/etc/kubernetes', { contents: true, reason });
      Underpost.cluster._lazyUmountKubeletMounts();
      for (const target of ['/var/lib/kubelet', '/var/lib/cni', '/var/lib/containerd'])
        removeHostPath(target, { contents: true, reason });
      removeHostPath('/var/lib/etcd', { reason });
      fs.removeSync(path.join(os.homedir(), '.kube'));

      logger.info('Phase 6/7: Network cleanup (Calico interfaces + host iptables)...');
      for (const name of ['cni0', 'vxlan.calico', 'tunl0']) deleteHostLink(name);
      shellExec('iptables -F && iptables -t nat -F', { privileged: 'flushes the iptables rules of the host' });
      Underpost.cluster._pruneContainerCaches({ all: true, crictl: true });

      logger.info('Phase 7/7: Re-applying host configuration (Docker, containerd, sysctl).');
      Underpost.cluster.config();

      logger.info('=== KUBEADM SAFE RESET COMPLETE ===');
    },

    /**
     * @method safeResetK3s
     * @description Centralized K3s teardown. Runs the same way on a physical
     * host (`node bin cluster --dev --reset --k3s`) or inside an LXD VM via
     * `lxc exec` (driven by `_resetK3sInVm` in src/cli/lxd.js).
     * @param {object} [options]
     * @param {string} [options.underpostRoot='.']
     * @param {'drain'|'full'} [options.resetMode='full'] - `drain` stops
     *   services + runs `k3s-killall.sh` (K3s persists, returns on next boot).
     *   `full` also runs `k3s-uninstall.sh` and cleans residual state.
     * @memberof UnderpostCluster
     */
    async safeResetK3s(options = { underpostRoot: '.', resetMode: 'full' }) {
      const resetMode = options.resetMode === 'drain' ? 'drain' : 'full';
      logger.info(`=== K3s SAFE RESET (resetMode=${resetMode}) ===`);

      logger.info('Phase 1/5: Stopping K3s systemd units...');
      for (const unit of ['k3s', 'k3s-agent']) stopHostService(unit);
      const runScript = (script) => {
        if (fs.existsSync(script)) shellExec(shellArgumentFactory(script), { privileged: `runs ${script}` });
      };

      logger.info('Phase 2/5: Running k3s-killall.sh (unmount pod overlays, tear down CNI)...');
      runScript('/usr/local/bin/k3s-killall.sh');

      if (resetMode === 'drain') {
        logger.info('=== K3s DRAIN COMPLETE (K3s remains installed; will start on next boot) ===');
        return;
      }

      logger.info('Phase 3/5: Running k3s-uninstall.sh...');
      runScript('/usr/local/bin/k3s-uninstall.sh');
      runScript('/usr/local/bin/k3s-agent-uninstall.sh');

      logger.info('Phase 4/5: Removing residual K3s state...');
      fs.removeSync(path.join(os.homedir(), '.kube'));
      removeHostPath('/etc/rancher/k3s', { reason: 'removes the residual K3s state of the host' });
      for (const name of ['flannel.1', 'cni0']) deleteHostLink(name);
      // k3s-uninstall.sh removes /var/lib/rancher/k3s; still prune any host docker/podman leftovers.
      Underpost.cluster._pruneContainerCaches({ all: true });

      logger.info('Phase 5/5: Re-applying minimal K3s host config.');
      Underpost.cluster.configMinimalK3s();

      logger.info('=== K3s SAFE RESET COMPLETE (full) ===');
    },

    /**
     * @method getResourcesCapacity
     * @description Retrieves the capacity of resources (CPU and memory) for a specific node in the cluster.
     * @param {string} [node=os.hostname()] - The node to query. Defaults to the current host.
     * @returns {object} An object containing the CPU and memory capacity of the node.
     * @memberof UnderpostCluster
     */
    getResourcesCapacity(node) {
      const resources = {};
      const nodeName = node
        ? node
        : Underpost.kubectl.get('kind-control-plane', 'node').length > 0
          ? 'kind-control-plane'
          : os.hostname();
      const info = shellExec(`kubectl describe node ${nodeName} | grep -E '(Allocatable:|Capacity:)' -A 6`, {
        stdout: true,
        silent: true,
      });
      info
        .split('Allocatable:')[1]
        .split('\n')
        .filter((row) => row.match('cpu') || row.match('memory'))
        .map((row) => {
          if (row.match('cpu'))
            resources.cpu = {
              value: parseInt(row.split(':')[1].trim()) * 1000,
              unit: 'm',
            };
          if (row.match('memory'))
            resources.memory = {
              value: parseInt(row.split(':')[1].split('Ki')[0].trim()),
              unit: 'Ki',
            };
        });

      return resources;
    },

    /**
     * @method initHost
     * @description Installs the host prerequisites of Kubernetes: the base packages, the tools of the cluster
     * runtime in {@link HOST_TOOLS}, and SOPS and Age. Every step is idempotent and fails loudly.
     * @param {object} params
     * @param {string} params.underpostRoot - The root that holds `scripts/rocky-setup.sh`.
     * @param {string} [params.runtime] - 'kind', 'kubeadm' or 'k3s'; the tools of every runtime when empty.
     * @memberof UnderpostCluster
     */
    initHost({ underpostRoot, runtime = '' }) {
      const { alias: arch } = Underpost.baremetal.getHostArch();
      const tools = hostToolsFor(runtime);
      logger.info('Installing the host prerequisites of Kubernetes...', { runtime: runtime || 'every runtime', tools });
      updateHostPackages({ underpostRoot });
      for (const tool of tools) installHostTool(tool, { arch });
      Underpost.secret.installTooling();
      logger.info('Host prerequisites installed.');
    },

    /**
     * @method uninstallHost
     * @description Removes what initHost installs and the host configuration of the cluster runtimes, then
     * keeps SELinux enforcing.
     * @memberof UnderpostCluster
     */
    uninstallHost() {
      for (const tool of hostToolsFor().reverse()) uninstallHostTool(tool);
      for (const target of HOST_CONFIGURATION_PATHS)
        removeHostPath(target, { reason: 'removes the Kubernetes configuration of the host' });
      fs.removeSync(path.join(os.homedir(), '.kube'));
      enforceSELinux();
      logger.info('Host components removed.');
    },

    /**
     * @method cleanKindMongoHostPaths
     * @description Best-effort cleanup of MongoDB hostPath directories inside Kind node containers.
     * This prevents stale replica/auth state when hostPath data lives in node-local container filesystems.
     * @param {object} [options]
     * @param {string} [options.basePath='/data/mongodb'] - Node-internal base path for MongoDB data.
     * @param {number} [options.replicaCount=3] - Number of replica ordinal directories (v0..vN-1).
     * @memberof UnderpostCluster
     */
    cleanKindMongoHostPaths(options = { basePath: '/data/mongodb', replicaCount: 3 }) {
      const basePath = options.basePath || '/data/mongodb';
      const replicaCount = Math.max(Number(options.replicaCount) || 3, 1);
      const nodes = kindNodes();

      if (nodes.length === 0) {
        logger.info('No Kind nodes detected for node-local MongoDB hostPath cleanup.');
        return;
      }

      for (const node of nodes) {
        logger.info(
          `Cleaning Kind node-local MongoDB paths '${basePath}/v0..v${replicaCount - 1}' on node '${node}'...`,
        );
        const prepareReplicaDirsCmd = Array.from(
          { length: replicaCount },
          (_, index) => `mkdir -p ${basePath}/v${index}; rm -rf ${basePath}/v${index}/*;`,
        ).join(' ');
        const verifyReplicaDirsCmd = Array.from(
          { length: replicaCount },
          (_, index) => `test -d ${basePath}/v${index};`,
        ).join(' ');
        shellExec(`docker exec ${node} sh -lc 'mkdir -p ${basePath}; ${prepareReplicaDirsCmd}'`, {
          silentOnError: true,
          privileged: DOCKER_PRIVILEGE,
        });
        shellExec(`docker exec ${node} sh -lc '${verifyReplicaDirsCmd}'`, { privileged: DOCKER_PRIVILEGE });
      }
    },

    /**
     * @method recoverKindDockerNetworks
     * @description Best-effort cleanup of stale Kind Docker resources when Docker bridge
     * address pools are exhausted and new networks cannot be allocated.
     * @memberof UnderpostCluster
     */
    recoverKindDockerNetworks() {
      logger.warn('Attempting Docker network recovery for Kind (address pool exhaustion detected)...');
      const options = { silentOnError: true, privileged: DOCKER_PRIVILEGE };
      shellExec('docker ps -aq --filter label=io.x-k8s.kind.cluster | xargs -r docker rm -f', options);
      shellExec('docker network ls -q --filter label=io.x-k8s.kind.cluster | xargs -r docker network rm', options);
      shellExec('docker network rm kind', options);
      shellExec('docker network prune -f', options);
    },

    /**
     * @method ensureDockerDefaultAddressPools
     * @description Writes a sane Docker default-address-pools config to reduce
     * Kind network allocation failures on hosts with exhausted predefined pools.
     * @memberof UnderpostCluster
     */
    ensureDockerDefaultAddressPools() {
      logger.warn('Applying Docker default-address-pools workaround for Kind network creation...');
      writeHostFile({
        target: '/etc/docker/daemon.json',
        content: `${JSON.stringify(
          {
            'default-address-pools': [
              '172.17.0.0/16',
              '172.18.0.0/16',
              '172.19.0.0/16',
              '172.20.0.0/14',
              '172.24.0.0/14',
            ].map((base) => ({ base, size: 24 })),
          },
          null,
          2,
        )}\n`,
      });
      controlHostService('restart', 'docker');
      shellExec('docker network prune -f', { silentOnError: true, privileged: DOCKER_PRIVILEGE });
    },
  };
}
export default UnderpostCluster;
