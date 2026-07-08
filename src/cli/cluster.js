/**
 * Cluster module for managing Kubernetes cluster initialization, configuration, and component deployment.
 * @module src/cli/cluster.js
 * @namespace UnderpostCluster
 */

import { getNpmRootPath } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import { MONGODB_DEFAULT_REPLICA_COUNT } from '../db/mongo/MongooseDB.js';
import { MongoBootstrap } from '../db/mongo/MongoBootstrap.js';
import os from 'os';
import fs from 'fs-extra';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

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
     * @param {string} [options.serviceHost=''] - Set a custom host/IP for exposed MongoDB and Valkey clients.
     * @param {boolean} [options.mariadb=false] - Deploy MariaDB.
     * @param {boolean} [options.mysql=false] - Deploy MySQL.
     * @param {boolean} [options.postgresql=false] - Deploy PostgreSQL.
     * @param {boolean} [options.valkey=false] - Deploy Valkey.
     * @param {boolean} [options.ipfs=false] - Deploy ipfs-cluster statefulset.
     * @param {boolean} [options.info=false] - Display extensive Kubernetes cluster information.
     * @param {boolean} [options.certManager=false] - Deploy Cert-Manager for certificate management.
     * @param {boolean} [options.listPods=false] - List Kubernetes pods.
     * @param {boolean} [options.reset=false] - Perform a comprehensive reset of Kubernetes and container environments.
     * @param {boolean} [options.resetMongodb=false] - Perform a targeted reset of MongoDB components without restarting the entire cluster.
     * @param {boolean} [options.dev=false] - Run in development mode (adjusts paths).
     * @param {string} [options.nsUse=''] - Set the current kubectl namespace (creates namespace if it doesn't exist).
     * @param {string} [options.namespace='default'] - Kubernetes namespace for cluster operations.
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
     * @param {string} [options.nodeSelector=''] - Pin the just-deployed StatefulSet (MongoDB 4.4 / Valkey)
     *   to a specific Kubernetes node by name (e.g. 'localhost.localdomain'). Applied via a
     *   `kubernetes.io/hostname` nodeSelector patch once the workload reports Ready.
     * @memberof UnderpostCluster
     */
    async init(
      podName,
      options = {
        mongodb: false,
        mongodb4: false,
        serviceHost: '',
        mariadb: false,
        mysql: false,
        postgresql: false,
        valkey: false,
        ipfs: false,
        info: false,
        certManager: false,
        listPods: false,
        reset: false,
        resetMongodb: false,
        dev: false,
        nsUse: '',
        namespace: 'default',
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
        nodeSelector: '',
      },
    ) {
      if (options.initHost) return Underpost.cluster.initHost();

      if (options.uninstallHost) return Underpost.cluster.uninstallHost();

      if (options.config) return options.k3s ? Underpost.cluster.configMinimalK3s() : Underpost.cluster.config();

      if (options.chown) return Underpost.cluster.chown(options.k3s ? 'k3s' : options.kubeadm ? 'kubeadm' : 'kind');

      const npmRoot = getNpmRootPath();
      const underpostRoot = options.dev ? '.' : `${npmRoot}/underpost`;
      const serviceHostInput = `${options.serviceHost || ''}`.trim();
      const serviceHost = Underpost.cluster.resolveServiceHost(options);

      if (options.listPods) return console.table(Underpost.kubectl.get(podName ?? undefined));
      // Set default namespace if not specified
      if (!options.namespace) options.namespace = 'default';

      if (options.nsUse) {
        // Verify if namespace exists, create if not
        const namespaceExists = shellExec(`kubectl get namespace ${options.nsUse} --ignore-not-found -o name`, {
          stdout: true,
          silent: true,
          silentOnError: true,
        }).trim();

        if (!namespaceExists) {
          logger.info(`Namespace '${options.nsUse}' does not exist. Creating it...`);
          shellExec(`kubectl create namespace ${options.nsUse}`);
          logger.info(`Namespace '${options.nsUse}' created successfully.`);
        } else {
          logger.info(`Namespace '${options.nsUse}' already exists.`);
        }

        shellExec(`kubectl config set-context --current --namespace=${options.nsUse}`);
        logger.info(`Context switched to namespace: ${options.nsUse}`);
        return;
      }

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

      // Targeted MongoDB-only reset (does not restart the whole node)
      if (options.resetMongodb) {
        const clusterType = options.k3s ? 'k3s' : options.kubeadm ? 'kubeadm' : 'kind';
        return await MongoBootstrap.reset({
          namespace: options.namespace,
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
      }

      // --- Kubeadm/Kind/K3s Cluster Initialization ---
      // Host config is applied per cluster type (not shared) so the K3s path can
      // stay minimal and avoid the Docker/containerd/kubelet setup it does not need.
      if (!alreadyCluster) {
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
          shellExec(`curl -sfL https://get.k3s.io | sh -s - --disable=traefik --disable=servicelb`);
          logger.info('K3s installation completed.');

          Underpost.cluster.chown('k3s');

          logger.info('Waiting for K3s to be ready...');
          shellExec(`sudo systemctl is-active --wait k3s || sudo systemctl wait --for=active k3s.service`);
          logger.info('K3s service is active.');
          // K3s manages its own CNI (flannel) and iptables rules. nat-iptables.sh
          // is neither needed nor desirable for a single K3s node in a VM.
        } else if (options.kubeadm) {
          Underpost.cluster.config();
          Underpost.cluster.natSetup({ underpostRoot });
          logger.info('Initializing Kubeadm control plane...');
          // Set default values if not provided
          const podNetworkCidr = options.podNetworkCidr || '192.168.0.0/16';
          const controlPlaneEndpoint = options.controlPlaneEndpoint || `${os.hostname()}:6443`;

          // Initialize kubeadm control plane.
          // Use CRI-O socket when available, otherwise fall back to containerd.
          const crioSocket = 'unix:///var/run/crio/crio.sock';
          const containerdSocket = 'unix:///run/containerd/containerd.sock';
          const criSocket =
            shellExec(`test -S /var/run/crio/crio.sock && echo crio || echo containerd`, {
              stdout: true,
              silent: true,
            }).trim() === 'crio'
              ? crioSocket
              : containerdSocket;
          shellExec(
            `sudo kubeadm init --pod-network-cidr=${podNetworkCidr} --control-plane-endpoint="${controlPlaneEndpoint}" --cri-socket=${criSocket}`,
          );
          // Configure kubectl for the current user
          Underpost.cluster.chown('kubeadm'); // Pass 'kubeadm' to chown

          // Install Calico CNI
          logger.info('Installing Calico CNI...');
          shellExec(
            `sudo kubectl create -f https://cdn.jsdelivr.net/gh/projectcalico/calico@v3.29.3/manifests/tigera-operator.yaml`,
          );
          shellExec(
            `kubectl create -f https://cdn.jsdelivr.net/gh/projectcalico/calico@v3.29.3/manifests/custom-resources.yaml`,
          );
          shellExec(`sudo kubectl apply -f ${underpostRoot}/manifests/kubeadm-calico-config.yaml`);

          // Untaint control plane node to allow scheduling pods
          const nodeName = os.hostname();
          shellExec(`kubectl taint nodes ${nodeName} node-role.kubernetes.io/control-plane:NoSchedule-`);
          // Install local-path-provisioner for dynamic PVCs
          logger.info('Installing local-path-provisioner...');
          shellExec(
            `kubectl apply -f https://cdn.jsdelivr.net/gh/rancher/local-path-provisioner@master/deploy/local-path-storage.yaml`,
          );
        } else {
          Underpost.cluster.config();
          Underpost.cluster.natSetup({ underpostRoot });
          // Kind cluster initialization (default for development)
          logger.info('Initializing Kind cluster...');
          const devReplicaCount = Math.max(Number(options.replicas) || MONGODB_DEFAULT_REPLICA_COUNT, 3);
          shellExec(`sudo mkdir -p /data/mongodb`);
          for (let index = 0; index < devReplicaCount; index++) {
            shellExec(`sudo mkdir -p /data/mongodb/v${index}`);
          }
          const kindCreateCmd = `cd ${underpostRoot}/manifests && kind create cluster --config kind-config-dev.yaml`;
          try {
            shellExec(kindCreateCmd);
          } catch (error) {
            const kindCreateErrText = `${error?.message || ''}\n${error?.stderr || ''}`;
            if (kindCreateErrText.includes('all predefined address pools have been fully subnetted')) {
              logger.warn(
                'Docker address pool exhausted while creating Kind cluster. Running cleanup and retrying once...',
              );
              Underpost.cluster.recoverKindDockerNetworks();
              try {
                shellExec(kindCreateCmd);
              } catch (retryError) {
                const retryErrText = `${retryError?.message || ''}\n${retryError?.stderr || ''}`;
                if (retryErrText.includes('all predefined address pools have been fully subnetted')) {
                  logger.warn(
                    'Kind retry still failed from pool exhaustion. Applying Docker daemon address-pool config and retrying once more...',
                  );
                  Underpost.cluster.ensureDockerDefaultAddressPools();
                  shellExec(kindCreateCmd);
                } else {
                  throw retryError;
                }
              }
            } else {
              throw error;
            }
          }
          Underpost.cluster.chown('kind'); // Pass 'kind' to chown
        }
      }

      // --- Optional Component Deployments (Databases, Ingress, Cert-Manager) ---
      // These deployments happen after the base cluster is up.

      if (options.dedicatedGpu) {
        shellExec(`node ${underpostRoot}/bin/deploy nvidia-gpu-operator`);
        shellExec(`node ${underpostRoot}/bin/deploy kubeflow-spark-operator${options.kubeadm ? ' kubeadm' : ''}`);
      }

      if (options.grafana) {
        shellExec(`kubectl delete deployment grafana -n ${options.namespace} --ignore-not-found`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/grafana -n ${options.namespace}`);
        const yaml = `${fs
          .readFileSync(`${underpostRoot}/manifests/grafana/deployment.yaml`, 'utf8')
          .replace('{{GF_SERVER_ROOT_URL}}', options.hosts.split(',')[0])}`;
        console.log(yaml);
        shellExec(`kubectl apply -f - -n ${options.namespace} <<EOF
${yaml}
EOF
`);
      }

      if (options.prom) {
        shellExec(`kubectl delete deployment prometheus --ignore-not-found`);
        shellExec(`kubectl delete configmap prometheus-config --ignore-not-found`);
        shellExec(`kubectl delete service prometheus --ignore-not-found`);
        // Prometheus server host: http://<prometheus-cluster-ip>:9090
        const yaml = `${fs.readFileSync(`${underpostRoot}/manifests/prometheus/deployment.yaml`, 'utf8').replace(
          '- targets: []',
          `- targets: [${options.prom
            .split(',')
            .map((host) => `'${host}'`)
            .join(',')}]`,
        )}`;
        console.log(yaml);
        shellExec(`kubectl apply -f - -n ${options.namespace} <<EOF
${yaml}
EOF
`);
      }

      if (options.valkey) {
        if (options.pullImage) Underpost.cluster.pullImage('valkey/valkey:latest', options);
        shellExec(`kubectl delete statefulset valkey-service -n ${options.namespace} --ignore-not-found`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/valkey -n ${options.namespace}`);
        const valkeyReady = await Underpost.test.statusMonitor('valkey-service', 'Running', 'pods', 1000, 60 * 10);
        // Expose valkey to the host/public network only once the pod is ready.
        // The node port (32079) is set directly in the manifest.
        if (valkeyReady && options.nodePort)
          shellExec(`kubectl apply -f ${underpostRoot}/manifests/valkey/valkey-nodeport.yaml -n ${options.namespace}`);
        if (valkeyReady && options.nodeSelector)
          Underpost.cluster.pinToNode({
            name: 'valkey-service',
            namespace: options.namespace,
            node: options.nodeSelector,
          });
        if (valkeyReady && serviceHost)
          Underpost.cluster.syncServiceConnectionEnv({
            serviceHost,
            valkey: true,
            options,
          });
      }
      if (options.ipfs) {
        await Underpost.ipfs.deploy(options, underpostRoot);
      }
      if (options.mariadb) {
        shellExec(
          `sudo kubectl create secret generic mariadb-secret --from-file=username=/home/dd/engine/engine-private/mariadb-username --from-file=password=/home/dd/engine/engine-private/mariadb-password --dry-run=client -o yaml | kubectl apply -f - -n ${options.namespace}`,
        );
        shellExec(`kubectl delete statefulset mariadb-statefulset -n ${options.namespace} --ignore-not-found`);

        if (options.pullImage) Underpost.cluster.pullImage('mariadb:latest', options);
        shellExec(`kubectl apply -f ${underpostRoot}/manifests/mariadb/storage-class.yaml -n ${options.namespace}`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/mariadb -n ${options.namespace}`);
      }
      if (options.mysql) {
        shellExec(
          `sudo kubectl create secret generic mysql-secret --from-file=username=/home/dd/engine/engine-private/mysql-username --from-file=password=/home/dd/engine/engine-private/mysql-password --dry-run=client -o yaml | kubectl apply -f - -n ${options.namespace}`,
        );
        shellExec(`sudo mkdir -p /mnt/data`);
        shellExec(`sudo chmod 777 /mnt/data`);
        shellExec(`sudo chown -R $(whoami):$(whoami) /mnt/data`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/mysql -n ${options.namespace}`);
      }
      if (options.postgresql) {
        if (options.pullImage) Underpost.cluster.pullImage('postgres:latest', options);
        shellExec(
          `sudo kubectl create secret generic postgres-secret --from-file=password=/home/dd/engine/engine-private/postgresql-password --dry-run=client -o yaml | kubectl apply -f - -n ${options.namespace}`,
        );
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/postgresql -n ${options.namespace}`);
      }
      if (options.mongodb4) {
        if (options.pullImage) Underpost.cluster.pullImage('mongo:4.4', options);
        shellExec(`kubectl delete statefulset mongodb -n ${options.namespace} --ignore-not-found`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/mongodb-4.4 -n ${options.namespace}`);

        const statefulSetName = 'mongodb';
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

          shellExec(`sudo kubectl exec -i ${podName} -n ${options.namespace} -- mongo --quiet --eval '${initEval}'`);

          // Only expose mongos to the host/public network once the instance is
          // confirmed ready and the replica set is initiated. The node port (32017)
          // is set directly in the manifest.
          if (options.nodePort)
            shellExec(
              `kubectl apply -f ${underpostRoot}/manifests/mongodb-4.4/mongodb-nodeport.yaml -n ${options.namespace}`,
            );
          if (options.nodeSelector)
            Underpost.cluster.pinToNode({
              name: statefulSetName,
              namespace: options.namespace,
              node: options.nodeSelector,
            });
          if (serviceHost)
            Underpost.cluster.syncServiceConnectionEnv({
              serviceHost,
              mongodb: true,
              options,
            });
        }
      } else if (options.mongodb) {
        const clusterType = options.k3s ? 'k3s' : options.kubeadm ? 'kubeadm' : 'kind';
        await MongoBootstrap.initReplicaSet({
          namespace: options.namespace,
          replicaCount: Number(options.replicas) || MONGODB_DEFAULT_REPLICA_COUNT,
          hostList: serviceHostInput,
          pullImage: options.pullImage,
          reset: options.reset,
          clusterType,
          underpostRoot,
        });
        if (serviceHost)
          Underpost.cluster.syncServiceConnectionEnv({
            serviceHost,
            mongodb: true,
            options,
          });
      }

      if (options.contour) {
        shellExec(
          `kubectl apply -f https://cdn.jsdelivr.net/gh/projectcontour/contour@release-1.33/examples/render/contour.yaml`,
        );
        if (options.kubeadm) {
          // Envoy service might need NodePort for kubeadm
          shellExec(
            `sudo kubectl apply -f ${underpostRoot}/manifests/envoy-service-nodeport.yaml -n ${options.namespace}`,
          );
        }
        // K3s has a built-in LoadBalancer (Klipper-lb) that can expose services,
        // so a specific NodePort service might not be needed or can be configured differently.
      }

      if (options.certManager) {
        if (!Underpost.kubectl.get('cert-manager').find((p) => p.STATUS === 'Running')) {
          shellExec(`helm repo add jetstack https://charts.jetstack.io --force-update`);
          shellExec(
            `helm install cert-manager jetstack/cert-manager \
--namespace cert-manager \
--create-namespace \
--version v1.17.0 \
--set crds.enabled=true`,
          );
        }

        const letsEncName = 'letsencrypt-prod';
        shellExec(`sudo kubectl delete ClusterIssuer ${letsEncName} --ignore-not-found`);
        shellExec(`sudo kubectl apply -f ${underpostRoot}/manifests/${letsEncName}.yaml -n ${options.namespace}`);
      }
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
     * @method pinToNode
     * @description Pins a workload to a specific Kubernetes node by patching its
     * pod template with a `kubernetes.io/hostname` nodeSelector. General-purpose;
     * currently used to place the MongoDB 4.4 / Valkey StatefulSets on a chosen
     * node (`--node-selector`). The patch triggers a rolling reschedule onto the
     * target node.
     * @param {object} params
     * @param {string} [params.kind='statefulset'] - Workload kind to patch.
     * @param {string} params.name - Workload name.
     * @param {string} params.namespace - Target namespace.
     * @param {string} params.node - Target node name (matches `kubernetes.io/hostname`).
     * @memberof UnderpostCluster
     */
    pinToNode({ kind = 'statefulset', name, namespace, node }) {
      logger.info(`Pinning ${kind}/${name} to node '${node}' (namespace: ${namespace}).`);
      const patch = JSON.stringify({
        spec: { template: { spec: { nodeSelector: { 'kubernetes.io/hostname': node } } } },
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
        const tarPath = `/tmp/kind-image-${image.replace(/[\/:]/g, '-')}.tar`;
        shellExec(`docker pull ${image}`);
        shellExec(`docker save ${image} -o ${tarPath}`);
        shellExec(
          `for node in $(kind get nodes); do cat ${tarPath} | docker exec -i $node ctr --namespace=k8s.io images import -; done`,
        );
        shellExec(`rm -f ${tarPath}`);
      } else if (options.k3s) {
        // K3s uses its own embedded containerd socket, not the host-level one
        // used by kubeadm/containerd installations.
        shellExec(
          `sudo env PATH="$PATH:/usr/local/bin:/usr/bin" crictl --runtime-endpoint unix:///run/k3s/containerd/containerd.sock pull ${image}`,
        );
      } else if (options.kubeadm) {
        // Kubeadm / K3s: use crictl to pull directly into the active CRI runtime.
        // crictl is not in sudo's secure_path; pass full PATH through env.
        // Point crictl at CRI-O when the socket exists, otherwise fall back to containerd.
        const criSock =
          shellExec(`test -S /var/run/crio/crio.sock && echo crio || echo containerd`, {
            stdout: true,
            silent: true,
          }).trim() === 'crio'
            ? 'unix:///var/run/crio/crio.sock'
            : 'unix:///run/containerd/containerd.sock';
        shellExec(`sudo env PATH="$PATH:/usr/local/bin:/usr/bin" crictl --runtime-endpoint ${criSock} pull ${image}`);
      }
    },

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
      // Disable SELinux (permissive mode)
      shellExec(`sudo setenforce 0`, {
        silentOnError: true,
      });
      shellExec(`sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config`, {
        silentOnError: true,
      });

      // Enable and start Docker and Kubelet services
      shellExec(`sudo systemctl enable --now docker`); // Docker might not be needed for K3s
      shellExec(`sudo systemctl enable --now kubelet`); // Kubelet might not be needed for K3s (K3s uses its own agent)

      // Configure containerd for SystemdCgroup and explicitly disable SELinux
      // This is crucial for kubelet/k3s to interact correctly with containerd
      shellExec(`containerd config default | sudo tee /etc/containerd/config.toml > /dev/null`);
      shellExec(`sudo sed -i -e "s/SystemdCgroup = false/SystemdCgroup = true/g" /etc/containerd/config.toml`);
      // Add a new line to disable SELinux for the runc runtime
      // shellExec(
      //   `sudo sed -i '/SystemdCgroup = true/a       selinux_disabled = true' /etc/containerd/config.toml`,
      // );
      // Restart docker after containerd config changes. Rocky 9 uses systemctl,
      // not the legacy service command.
      shellExec(`sudo systemctl restart docker || sudo service docker restart || true`);
      shellExec(`sudo systemctl enable --now containerd.service`);
      shellExec(`sudo systemctl restart containerd`); // Restart containerd to apply changes

      // Disable swap (required by Kubernetes)
      shellExec(`sudo swapoff -a; sudo sed -i '/swap/d' /etc/fstab`);

      // Reload systemd daemon to pick up new unit files/changes
      shellExec(`sudo systemctl daemon-reload`);

      // Increase inotify limits
      shellExec(`sudo sysctl -w fs.inotify.max_user_watches=2099999999`);
      shellExec(`sudo sysctl -w fs.inotify.max_user_instances=2099999999`);
      shellExec(`sudo sysctl -w fs.inotify.max_queued_events=2099999999`);
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
     *   - SELinux → permissive (only if SELinux tooling is present).
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
      shellExec(`if systemctl is-active --quiet firewalld; then sudo systemctl disable --now firewalld; fi`);

      // SELinux → permissive, but only when the tooling exists. Rocky has it;
      // minimal LXD images may not. K3s also installs k3s-selinux for enforcing
      // mode, so this is a best-effort dev convenience, not a hard requirement.
      shellExec(`if command -v setenforce >/dev/null 2>&1; then sudo setenforce 0; fi`, {
        silentOnError: true,
      });
      shellExec(
        `if [ -f /etc/selinux/config ]; then sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config; fi`,
        { silentOnError: true },
      );

      // Disable swap. `swapoff -a` is a no-op without swap; the sed only edits
      // fstab when a swap line is present.
      shellExec(`sudo swapoff -a`);
      shellExec(`sudo sed -i '/swap/d' /etc/fstab`);

      // Pod networking: ensure br_netfilter is loaded and the bridge/forward
      // sysctls are set. K3s + flannel depend on these.
      shellExec(
        `if command -v lsmod >/dev/null 2>&1 && command -v modprobe >/dev/null 2>&1; then if ! lsmod | grep -q '^br_netfilter'; then sudo modprobe br_netfilter || true; fi; fi`,
      );
      shellExec(
        `echo 'net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-k3s.conf > /dev/null`,
      );
      shellExec(`sudo sysctl --system`);

      // inotify limits — many pods/watchers. Conservative, sane values.
      shellExec(`sudo sysctl -w fs.inotify.max_user_instances=1024`);
      shellExec(`sudo sysctl -w fs.inotify.max_user_watches=1048576`);
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
      shellExec(`${underpostRoot}/scripts/nat-iptables.sh`);
    },

    /**
     * @method chown
     * @description Sets up kubectl configuration for the current user based on the cluster type.
     * @param {string} clusterType - The type of Kubernetes cluster ('kubeadm', 'k3s', or 'kind').
     * @memberof UnderpostCluster
     */
    chown(clusterType) {
      console.log(`Setting up kubectl configuration for ${clusterType} cluster...`);
      shellExec(`mkdir -p ~/.kube`);

      let kubeconfigPath;
      if (clusterType === 'k3s') {
        kubeconfigPath = '/etc/rancher/k3s/k3s.yaml';
      } else if (clusterType === 'kubeadm') {
        kubeconfigPath = '/etc/kubernetes/admin.conf';
      } else {
        // Default to kind if not specified or unknown
        kubeconfigPath = ''; // Kind's kubeconfig is usually managed by kind itself, or merged
      }

      if (kubeconfigPath) {
        shellExec(`sudo -E cp -i -f ${kubeconfigPath} ~/.kube/config`);
        shellExec(`sudo -E chown $(id -u):$(id -g) ~/.kube/config`);
      } else if (clusterType === 'kind') {
        // For Kind, the kubeconfig is usually merged automatically or can be explicitly exported
        // This command ensures it's merged into the default kubeconfig
        shellExec(`kind get kubeconfig > ~/.kube/config`);
        shellExec(`sudo -E chown $(id -u):$(id -g) ~/.kube/config`);
      } else {
        logger.warn('No specific kubeconfig path defined for this cluster type, or it is managed automatically.');
      }
      console.log('kubectl config set up successfully.');
    },

    // Shared reset helpers (internal — used by safeResetKind / safeResetKubeadm).

    /**
     * @method _truncateLargeLogs
     * @description Removes files >1 GiB under /var/log. Best-effort.
     * @private
     */
    _truncateLargeLogs() {
      try {
        const cleanPath = `/var/log/`;
        const largeLogsFiles = shellExec(
          `sudo du -sh ${cleanPath}* | awk '{if ($1 ~ /G$/ && ($1+0) > 1) print}' | sort -rh`,
          { stdout: true },
        );
        for (const pathLog of largeLogsFiles
          .split('\n')
          .map((p) => p.split(cleanPath)[1])
          .filter((p) => p)) {
          shellExec(`sudo rm -rf ${cleanPath}${pathLog}`);
        }
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
            shellExec(`sudo rm -rf ${hostPath}/*`);
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
     * @param {boolean} [options.crictl=false] - Also prune the CRI runtime via crictl.
     * @param {string} [options.criSocket] - Optional crictl --runtime-endpoint override.
     * @private
     */
    _pruneContainerCaches(options = {}) {
      const all = options.all !== false;
      const a = all ? '-a ' : '';
      logger.info(`  -> Pruning container-runtime caches (all=${all})...`);
      // Docker (also matches the podman-docker shim when docker is symlinked to podman).
      shellExec(
        `if command -v docker >/dev/null 2>&1; then sudo docker system prune ${a}--volumes -f; sudo docker builder prune ${a}-f; fi`,
        { silentOnError: true },
      );
      // Podman native — on this host images/overlays live under /var/lib/containers/storage.
      shellExec(`if command -v podman >/dev/null 2>&1; then sudo podman system prune ${a}--volumes -f; fi`, {
        silentOnError: true,
      });
      if (options.crictl) {
        const ep = options.criSocket ? `--runtime-endpoint ${options.criSocket} ` : '';
        shellExec(
          `if command -v crictl >/dev/null 2>&1; then sudo env PATH="$PATH:/usr/local/bin:/usr/bin" crictl ${ep}rmi --prune; fi`,
          { silentOnError: true },
        );
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
      shellExec(`if command -v podman >/dev/null 2>&1; then sudo podman umount --all >/dev/null 2>&1 || true; fi`, {
        silentOnError: true,
      });
      shellExec(
        `active="$(sudo podman ps -aq 2>/dev/null | xargs -r -I{} sudo podman inspect --format '{{.GraphDriver.Data.MergedDir}}' {} 2>/dev/null || true)"
findmnt -rn -o TARGET 2>/dev/null | grep -E '/var/lib/(containers/storage|docker)/overlay.*/merged' | sort -r | while IFS= read -r m; do
  if ! printf '%s\\n' "$active" | grep -qxF "$m"; then
    echo "Unmounting orphaned overlay: $m"
    sudo umount -l "$m" 2>/dev/null || true
  fi
done`,
        { silentOnError: true },
      );
    },

    /**
     * @method _lazyUmountKubeletMounts
     * @description Lazy-unmounts every mount under /var/lib/kubelet so a
     * subsequent `rm -rf` does not hit 'Device or resource busy'. Best-effort.
     * @private
     */
    _lazyUmountKubeletMounts() {
      shellExec(
        `sudo sh -c 'findmnt --raw --noheadings -o TARGET | grep /var/lib/kubelet | sort -r | xargs -r umount -l'`,
        { silentOnError: true },
      );
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
      shellExec(`clusters=$(kind get clusters)
if [ -n "$clusters" ]; then
  for c in $clusters; do
    echo "Deleting cluster: $c"
    kind delete cluster --name "$c"
  done
fi`);

      logger.info('Phase 4/6: Cleaning kubeconfig and Kind Docker networks...');
      shellExec(`rm -rf "$HOME/.kube"`);
      Underpost.cluster.recoverKindDockerNetworks();

      logger.info('Phase 5/6: Pruning container-runtime caches (kindest/node images, build cache, volumes)...');
      Underpost.cluster._pruneContainerCaches({ all: true });

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

      logger.info('Phase 2/7: SELinux permissive + restore contexts (when present)...');
      shellExec(`if command -v setenforce >/dev/null 2>&1; then sudo setenforce 0; fi`);
      shellExec(
        `if [ -f /etc/selinux/config ]; then sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config; fi`,
      );
      shellExec(
        `if command -v restorecon >/dev/null 2>&1 && [ -d /var/lib/kubelet ]; then sudo restorecon -Rv /var/lib/kubelet; fi`,
      );
      shellExec(
        `if command -v restorecon >/dev/null 2>&1 && [ -d /var/lib/containerd ]; then sudo restorecon -Rv /var/lib/containerd; fi`,
      );

      logger.info('Phase 3/7: Stopping host kubelet and container runtimes (kubeadm-scope only)...');
      shellExec(`if systemctl is-active --quiet kubelet; then sudo systemctl stop kubelet; fi`);
      shellExec(`if systemctl is-active --quiet docker; then sudo systemctl stop docker; fi`);
      shellExec(`if systemctl is-active --quiet crio; then sudo systemctl stop crio; fi`);
      Underpost.cluster._lazyUmountKubeletMounts();

      logger.info('Phase 4/7: Killing control-plane processes and running kubeadm reset...');
      shellExec(`if command -v crictl >/dev/null 2>&1; then sudo crictl rm -a -f; fi`, { silentOnError: true });
      // Remove CNI config before stopping sandboxes so Calico's CNI delete hook is
      // not invoked (the API server is already down and the hook would fail).
      shellExec(`sudo rm -rf /etc/cni/net.d/*`);
      shellExec(`if command -v crictl >/dev/null 2>&1; then sudo crictl rmp -a -f; fi`, { silentOnError: true });
      shellExec(`if systemctl is-active --quiet etcd; then sudo systemctl stop etcd; fi`);
      for (const port of [6443, 10259, 10257, 2379, 2380]) {
        shellExec(`if sudo fuser ${port}/tcp >/dev/null 2>&1; then sudo fuser -k ${port}/tcp; fi`);
      }
      shellExec(`if command -v kubeadm >/dev/null 2>&1; then sudo kubeadm reset --force; fi`);

      logger.info('Phase 5/7: Filesystem cleanup (kubeadm-managed paths only)...');
      shellExec(`sudo rm -rf /etc/kubernetes/*`);
      Underpost.cluster._lazyUmountKubeletMounts();
      shellExec(`sudo rm -rf /var/lib/kubelet/*`);
      shellExec(`sudo rm -rf /var/lib/etcd`);
      shellExec(`sudo rm -rf /var/lib/cni/*`);
      shellExec(`sudo rm -rf /var/lib/containerd/*`);
      shellExec(`rm -rf "$HOME/.kube"`);

      logger.info('Phase 6/7: Network cleanup (Calico interfaces + host iptables)...');
      shellExec(`if ip link show cni0 >/dev/null 2>&1; then sudo ip link del cni0; fi`);
      shellExec(`if ip link show vxlan.calico >/dev/null 2>&1; then sudo ip link del vxlan.calico; fi`);
      shellExec(`if ip link show tunl0 >/dev/null 2>&1; then sudo ip link del tunl0; fi`);
      shellExec(`sudo iptables -F`);
      shellExec(`sudo iptables -t nat -F`);
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
      shellExec(`if systemctl list-unit-files | grep -q '^k3s\\.service'; then sudo systemctl stop k3s; fi`);
      shellExec(
        `if systemctl list-unit-files | grep -q '^k3s-agent\\.service'; then sudo systemctl stop k3s-agent; fi`,
      );

      logger.info('Phase 2/5: Running k3s-killall.sh (unmount pod overlays, tear down CNI)...');
      shellExec(`if [ -x /usr/local/bin/k3s-killall.sh ]; then sudo /usr/local/bin/k3s-killall.sh; fi`);

      if (resetMode === 'drain') {
        logger.info('=== K3s DRAIN COMPLETE (K3s remains installed; will start on next boot) ===');
        return;
      }

      logger.info('Phase 3/5: Running k3s-uninstall.sh...');
      shellExec(`if [ -x /usr/local/bin/k3s-uninstall.sh ]; then sudo /usr/local/bin/k3s-uninstall.sh; fi`);
      shellExec(`if [ -x /usr/local/bin/k3s-agent-uninstall.sh ]; then sudo /usr/local/bin/k3s-agent-uninstall.sh; fi`);

      logger.info('Phase 4/5: Removing residual K3s state...');
      shellExec(`rm -rf "$HOME/.kube"`);
      shellExec(`if [ -d /etc/rancher/k3s ]; then sudo rm -rf /etc/rancher/k3s; fi`);
      shellExec(`if ip link show flannel.1 >/dev/null 2>&1; then sudo ip link del flannel.1; fi`);
      shellExec(`if ip link show cni0 >/dev/null 2>&1; then sudo ip link del cni0; fi`);
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
     * @description Installs essential host-level prerequisites for Kubernetes (Docker, Podman, Kind, Kubeadm, Helm).
     * @memberof UnderpostCluster
     */
    initHost() {
      const archData = Underpost.baremetal.getHostArch();
      logger.info('Installing essential host-level prerequisites for Kubernetes...', archData);

      // Install base rocky setup and updates
      shellExec(`node bin run host-update`);

      // Install Docker and its dependencies
      shellExec(`sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo`);
      shellExec(`sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`);

      // Install Podman
      shellExec(`sudo dnf -y install podman`);

      // Install CRI-O (required for kubeadm with CRI-O socket)
      shellExec(`node bin run install-crio`);

      // Install Kind (Kubernetes in Docker)
      shellExec(`[ $(uname -m) = ${archData.name} ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.29.0/kind-linux-${archData.alias}
chmod +x ./kind
sudo mv ./kind /bin/kind`);
      // Install Kubernetes tools: Kubeadm, Kubelet, and Kubectl
      shellExec(`cat <<EOF | sudo tee /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://pkgs.k8s.io/core:/stable:/v1.33/rpm/
enabled=1
gpgcheck=1
gpgkey=https://pkgs.k8s.io/core:/stable:/v1.33/rpm/repodata/repomd.xml.key
exclude=kubelet kubeadm kubectl cri-tools kubernetes-cni
EOF`);
      shellExec(`sudo yum install -y kubelet kubeadm kubectl --disableexcludes=kubernetes`);

      // Install Helm — check if already installed and linked to /bin/helm first
      const helmBin = shellExec(`test -x /bin/helm && echo exists || echo missing`, {
        stdout: true,
        silent: true,
      }).trim();
      const helmLocalBin = shellExec(`test -x /usr/local/bin/helm && echo exists || echo missing`, {
        stdout: true,
        silent: true,
      }).trim();

      if (helmBin === 'exists') {
        logger.info('Helm is already installed and linked to /bin/helm; skipping.');
      } else if (helmLocalBin === 'exists') {
        // Helm binary exists at /usr/local/bin but not linked to /bin/helm
        logger.info('Helm found at /usr/local/bin; linking to /bin/helm...');
        shellExec(`sudo ln -sf /usr/local/bin/helm /bin/helm`);
      } else {
        // Helm not installed — download and install
        shellExec(`curl -fsSL -o get_helm.sh https://cdn.jsdelivr.net/gh/helm/helm@main/scripts/get-helm-3`);
        shellExec(`chmod 700 get_helm.sh`);
        // Run get_helm.sh but ignore its exit code — it may fail on PATH check
        // even when installation succeeds (binary placed at /usr/local/bin).
        shellExec(`bash ./get_helm.sh || true`);
        // Ensure the binary is executable and linked to /bin/helm
        shellExec(`test -x /usr/local/bin/helm && sudo chmod +x /usr/local/bin/helm || true`);
        shellExec(`test -x /usr/local/bin/helm && sudo ln -sf /usr/local/bin/helm /bin/helm || true`);
        shellExec(`sudo rm -rf get_helm.sh`);
      }

      // Install snap
      shellExec(`sudo yum install -y snapd`);
      shellExec(`sudo systemctl enable --now snapd.socket`);

      console.log('Host prerequisites installed successfully.');
    },

    /**
     * @method uninstallHost
     * @description Uninstalls all host components installed by initHost.
     * This includes Docker, Podman, Kind, Kubeadm, Kubelet, Kubectl, and Helm.
     * @memberof UnderpostCluster
     */
    uninstallHost() {
      console.log('Uninstalling host components: Docker, Podman, Kind, Kubeadm, Kubelet, Kubectl, Helm.');

      // Remove Kind
      console.log('Removing Kind...');
      shellExec(`sudo rm -f /bin/kind`);

      // Remove Helm
      console.log('Removing Helm...');
      shellExec(`sudo rm -f /usr/local/bin/helm`);
      shellExec(`sudo rm -f /usr/local/bin/helm.sh`); // clean up the install script if it exists

      // Remove Docker and its dependencies
      console.log('Removing Docker, containerd, and related packages...');
      shellExec(`sudo dnf -y remove docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`);

      // Remove Podman
      console.log('Removing Podman...');
      shellExec(`sudo dnf -y remove podman`);

      // Remove CRI-O
      console.log('Removing CRI-O...');
      shellExec('sudo systemctl stop crio', { silentOnError: true });
      shellExec('sudo systemctl disable crio', { silentOnError: true });
      shellExec(`sudo dnf -y remove cri-o`);
      shellExec(`sudo rm -f /etc/yum.repos.d/cri-o.repo`);
      shellExec(`sudo rm -f /etc/crictl.yaml`);

      // Remove Kubeadm, Kubelet, and Kubectl
      console.log('Removing Kubernetes tools...');
      shellExec(`sudo yum remove -y kubelet kubeadm kubectl`);

      // Remove Kubernetes repo file
      console.log('Removing Kubernetes repository configuration...');
      shellExec(`sudo rm -f /etc/yum.repos.d/kubernetes.repo`);

      // Clean up Kubeadm config and data directories
      console.log('Cleaning up Kubernetes configuration directories...');
      shellExec(`sudo rm -rf /etc/kubernetes/pki`);
      shellExec(`sudo rm -rf ~/.kube`);

      // Stop and disable services
      console.log('Stopping and disabling services...');
      shellExec(`sudo systemctl stop docker.service`);
      shellExec(`sudo systemctl disable docker.service`);
      shellExec(`sudo systemctl stop containerd.service`);
      shellExec(`sudo systemctl disable containerd.service`);
      shellExec(`sudo systemctl stop kubelet.service`);
      shellExec(`sudo systemctl disable kubelet.service`);

      // Clean up config files
      console.log('Removing host configuration files...');
      shellExec(`sudo rm -f /etc/containerd/config.toml`);
      shellExec(`sudo rm -f /etc/sysctl.d/k8s.conf`);
      shellExec(`sudo rm -f /etc/sysctl.d/99-k8s-ipforward.conf`);
      shellExec(`sudo rm -f /etc/sysctl.d/99-k8s.conf`);

      // Restore SELinux to enforcing
      console.log('Restoring SELinux to enforcing mode...');
      // shellExec(`sudo setenforce 1`);
      // shellExec(`sudo sed -i 's/^SELINUX=permissive$/SELINUX=enforcing/' /etc/selinux/config`);

      console.log('Uninstall process completed.');
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
      const nodesRaw = shellExec('kind get nodes', {
        stdout: true,
        silent: true,
        silentOnError: true,
      });
      const nodes = nodesRaw
        .split('\n')
        .map((node) => node.trim())
        .filter((node) => !!node);

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
        shellExec(`sudo docker exec ${node} sh -lc 'mkdir -p ${basePath}; ${prepareReplicaDirsCmd}'`, {
          silentOnError: true,
        });
        shellExec(`sudo docker exec ${node} sh -lc '${verifyReplicaDirsCmd}'`);
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
      shellExec(`sudo docker ps -aq --filter label=io.x-k8s.kind.cluster | xargs -r sudo docker rm -f`, {
        silentOnError: true,
      });
      shellExec(`sudo docker network ls -q --filter label=io.x-k8s.kind.cluster | xargs -r sudo docker network rm`, {
        silentOnError: true,
      });
      shellExec(`sudo docker network rm kind`, { silentOnError: true });
      shellExec(`sudo docker network prune -f`, { silentOnError: true });
    },

    /**
     * @method ensureDockerDefaultAddressPools
     * @description Writes a sane Docker default-address-pools config to reduce
     * Kind network allocation failures on hosts with exhausted predefined pools.
     * @memberof UnderpostCluster
     */
    ensureDockerDefaultAddressPools() {
      logger.warn('Applying Docker default-address-pools workaround for Kind network creation...');
      shellExec(`cat <<'EOF' | sudo tee /etc/docker/daemon.json
{
  "default-address-pools": [
    {"base": "172.17.0.0/16", "size": 24},
    {"base": "172.18.0.0/16", "size": 24},
    {"base": "172.19.0.0/16", "size": 24},
    {"base": "172.20.0.0/14", "size": 24},
    {"base": "172.24.0.0/14", "size": 24}
  ]
}
EOF`);
      shellExec('sudo systemctl restart docker');
      shellExec('sudo docker network prune -f', { silentOnError: true });
    },
  };
}
export default UnderpostCluster;
