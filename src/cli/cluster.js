import { getNpmRootPath } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import UnderpostBaremetal from './baremetal.js';
import UnderpostDeploy from './deploy.js';
import UnderpostTest from './test.js';
import os from 'os';

const logger = loggerFactory(import.meta);

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
     * @param {boolean} [options.mariadb=false] - Deploy MariaDB.
     * @param {boolean} [options.mysql=false] - Deploy MySQL.
     * @param {boolean} [options.postgresql=false] - Deploy PostgreSQL.
     * @param {boolean} [options.valkey=false] - Deploy Valkey.
     * @param {boolean} [options.full=false] - Deploy a full set of common components.
     * @param {boolean} [options.info=false] - Display extensive Kubernetes cluster information.
     * @param {boolean} [options.certManager=false] - Deploy Cert-Manager for certificate management.
     * @param {boolean} [options.listPods=false] - List Kubernetes pods.
     * @param {boolean} [options.reset=false] - Perform a comprehensive reset of Kubernetes and container environments.
     * @param {boolean} [options.dev=false] - Run in development mode (adjusts paths).
     * @param {string} [options.nsUse=''] - Set the current kubectl namespace.
     * @param {boolean} [options.infoCapacity=false] - Display resource capacity information for the cluster.
     * @param {boolean} [options.infoCapacityPod=false] - Display resource capacity information for pods.
     * @param {boolean} [options.istio=false] - Deploy Istio service mesh.
     * @param {boolean} [options.pullImage=false] - Pull necessary Docker images before deployment.
     * @param {boolean} [options.dedicatedGpu=false] - Configure for dedicated GPU usage (e.g., NVIDIA GPU Operator).
     * @param {boolean} [options.kubeadm=false] - Initialize the cluster using Kubeadm.
     * @param {boolean} [options.k3s=false] - Initialize the cluster using K3s.
     * @param {boolean} [options.initHost=false] - Perform initial host setup (install Docker, Podman, Kind, Kubeadm, Helm).
     * @param {boolean} [options.config=false] - Apply general host configuration (SELinux, containerd, sysctl, firewalld).
     * @param {boolean} [options.worker=false] - Configure as a worker node (for Kubeadm or K3s join).
     * @param {boolean} [options.chown=false] - Set up kubectl configuration for the current user.
     */
    async init(
      podName,
      options = {
        mongodb: false,
        mongodb4: false,
        mariadb: false,
        mysql: false,
        postgresql: false,
        valkey: false,
        full: false,
        info: false,
        certManager: false,
        listPods: false,
        reset: false,
        dev: false,
        nsUse: '',
        infoCapacity: false,
        infoCapacityPod: false,
        istio: false,
        pullImage: false,
        dedicatedGpu: false,
        kubeadm: false,
        k3s: false,
        initHost: false,
        config: false,
        worker: false,
        chown: false,
      },
    ) {
      // Handles initial host setup (installing docker, podman, kind, kubeadm, helm)
      if (options.initHost === true) return UnderpostCluster.API.initHost();

      // Applies general host configuration (SELinux, containerd, sysctl)
      if (options.config === true) return UnderpostCluster.API.config();

      // Sets up kubectl configuration for the current user
      if (options.chown === true) return UnderpostCluster.API.chown();

      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;

      // Information gathering options
      if (options.infoCapacityPod === true) return logger.info('', UnderpostDeploy.API.resourcesFactory());
      if (options.infoCapacity === true)
        return logger.info('', UnderpostCluster.API.getResourcesCapacity(options.kubeadm || options.k3s)); // Adjust for k3s
      if (options.listPods === true) return console.table(UnderpostDeploy.API.get(podName ?? undefined));
      if (options.nsUse && typeof options.nsUse === 'string') {
        shellExec(`kubectl config set-context --current --namespace=${options.nsUse}`);
        return;
      }
      if (options.info === true) {
        shellExec(`kubectl config get-contexts`);
        shellExec(`kubectl config get-clusters`);
        shellExec(`kubectl get nodes -o wide`);
        shellExec(`kubectl config view | grep namespace`);
        shellExec(`kubectl get ns -o wide`);
        shellExec(`kubectl get pvc --all-namespaces -o wide`);
        shellExec(`kubectl get pv --all-namespaces -o wide`);
        shellExec(`kubectl get cronjob --all-namespaces -o wide`);
        shellExec(`kubectl get svc --all-namespaces -o wide`);
        shellExec(`kubectl get statefulsets --all-namespaces -o wide`);
        shellExec(`kubectl get deployments --all-namespaces -o wide`);
        shellExec(`kubectl get configmap --all-namespaces -o wide`);
        shellExec(`kubectl get pods --all-namespaces -o wide`);
        shellExec(
          `kubectl get pod --all-namespaces -o="custom-columns=NAME:.metadata.name,INIT-CONTAINERS:.spec.initContainers[*].name,CONTAINERS:.spec.containers[*].name"`,
        );
        shellExec(
          `kubectl get pods --all-namespaces -o=jsonpath='{range .items[*]}{"\\n"}{.metadata.name}{":\\t"}{range .spec.containers[*]}{.image}{", "}{end}{end}'`,
        );
        shellExec(`sudo crictl images`);
        console.log();
        logger.info('contour -------------------------------------------------');
        for (const _k of ['Cluster', 'HTTPProxy', 'ClusterIssuer', 'Certificate']) {
          shellExec(`kubectl get ${_k} --all-namespaces -o wide`);
        }
        logger.info('----------------------------------------------------------------');
        shellExec(`kubectl get secrets --all-namespaces -o wide`);
        shellExec(`docker secret ls`);
        shellExec(`kubectl get crd --all-namespaces -o wide`);
        shellExec(`sudo kubectl api-resources`);
        return;
      }

      // Reset Kubernetes cluster components (Kind/Kubeadm/K3s) and container runtimes
      if (options.reset === true) return await UnderpostCluster.API.reset({ underpostRoot });

      // Check if a cluster (Kind, Kubeadm, or K3s) is already initialized
      const alreadyKubeadmCluster = UnderpostDeploy.API.get('calico-kube-controllers')[0];
      const alreadyKindCluster = UnderpostDeploy.API.get('kube-apiserver-kind-control-plane')[0];
      // K3s pods often contain 'svclb-traefik' in the kube-system namespace
      const alreadyK3sCluster = UnderpostDeploy.API.get('svclb-traefik')[0];

      // --- Kubeadm/Kind/K3s Cluster Initialization ---
      // This block handles the initial setup of the Kubernetes cluster (control plane or worker).
      // It prevents re-initialization if a cluster is already detected.
      if (!options.worker && !alreadyKubeadmCluster && !alreadyKindCluster && !alreadyK3sCluster) {
        UnderpostCluster.API.config();
        if (options.k3s === true) {
          logger.info('Initializing K3s control plane...');
          // Install K3s
          console.log('Installing K3s...');
          shellExec(`curl -sfL https://get.k3s.io | sh -`);
          console.log('K3s installation completed.');

          // Move k3s binary to /bin/k3s and make it executable
          shellExec(`sudo mv /usr/local/bin/k3s /bin/k3s`);
          shellExec(`sudo chmod +x /bin/k3s`);
          console.log('K3s binary moved to /bin/k3s and made executable.');

          // Configure kubectl for the current user for K3s *before* checking readiness
          // This ensures kubectl can find the K3s kubeconfig immediately after K3s installation.
          UnderpostCluster.API.chown('k3s');

          // Wait for K3s to be ready
          logger.info('Waiting for K3s to be ready...');
          let k3sReady = false;
          let retries = 0;
          const maxRetries = 20; // Increased retries for K3s startup
          const delayMs = 5000; // 5 seconds

          while (!k3sReady && retries < maxRetries) {
            try {
              // Explicitly use KUBECONFIG for kubectl commands to ensure it points to K3s config
              const nodes = shellExec(`KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get nodes -o json`, {
                stdout: true,
                silent: true,
              });
              const parsedNodes = JSON.parse(nodes);
              if (
                parsedNodes.items.some((node) =>
                  node.status.conditions.some((cond) => cond.type === 'Ready' && cond.status === 'True'),
                )
              ) {
                k3sReady = true;
                logger.info('K3s cluster is ready.');
              } else {
                logger.info(`K3s not yet ready. Retrying in ${delayMs / 1000} seconds...`);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
              }
            } catch (error) {
              logger.info(`Error checking K3s status: ${error.message}. Retrying in ${delayMs / 1000} seconds...`);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
            retries++;
          }

          if (!k3sReady) {
            logger.error('K3s cluster did not become ready in time. Please check the K3s logs.');
            return;
          }

          // K3s includes local-path-provisioner by default, so no need to install explicitly.
          logger.info('K3s comes with local-path-provisioner by default. Skipping explicit installation.');
        } else if (options.kubeadm === true) {
          logger.info('Initializing Kubeadm control plane...');
          // Initialize kubeadm control plane
          shellExec(
            `sudo kubeadm init --pod-network-cidr=192.168.0.0/16 --control-plane-endpoint="${os.hostname()}:6443"`,
          );
          // Configure kubectl for the current user
          UnderpostCluster.API.chown('kubeadm'); // Pass 'kubeadm' to chown

          // Install Calico CNI
          logger.info('Installing Calico CNI...');
          shellExec(
            `sudo kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.3/manifests/tigera-operator.yaml`,
          );
          shellExec(`sudo kubectl apply -f ${underpostRoot}/manifests/kubeadm-calico-config.yaml`);
          // Untaint control plane node to allow scheduling pods
          const nodeName = os.hostname();
          shellExec(`kubectl taint nodes ${nodeName} node-role.kubernetes.io/control-plane:NoSchedule-`);
          // Install local-path-provisioner for dynamic PVCs (optional but recommended)
          logger.info('Installing local-path-provisioner...');
          shellExec(
            `kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/master/deploy/local-path-storage.yaml`,
          );
        } else {
          // Kind cluster initialization (if not using kubeadm or k3s)
          logger.info('Initializing Kind cluster...');
          if (options.full === true || options.dedicatedGpu === true) {
            shellExec(`cd ${underpostRoot}/manifests && kind create cluster --config kind-config-cuda.yaml`);
          } else {
            shellExec(
              `cd ${underpostRoot}/manifests && kind create cluster --config kind-config${
                options?.dev === true ? '-dev' : ''
              }.yaml`,
            );
          }
          UnderpostCluster.API.chown('kind'); // Pass 'kind' to chown
        }
      } else if (options.worker === true) {
        // Worker node specific configuration (kubeadm join command needs to be executed separately)
        logger.info('Worker node configuration applied. Awaiting join command...');
        // No direct cluster initialization here for workers. The `kubeadm join` or `k3s agent` command
        // needs to be run on the worker after the control plane is up and a token is created.
        // This part of the script is for general worker setup, not the join itself.
      } else {
        logger.warn('Cluster already initialized or worker flag not set for worker node.');
      }

      // --- Optional Component Deployments (Databases, Ingress, Cert-Manager) ---
      // These deployments happen after the base cluster is up.

      if (options.full === true || options.dedicatedGpu === true) {
        shellExec(`node ${underpostRoot}/bin/deploy nvidia-gpu-operator`);
        shellExec(
          `node ${underpostRoot}/bin/deploy kubeflow-spark-operator${options.kubeadm === true ? ' kubeadm' : ''}`,
        );
      }

      if (options.full === true || options.valkey === true) {
        if (options.pullImage === true) {
          shellExec(`docker pull valkey/valkey:latest`);
          shellExec(`sudo podman pull valkey/valkey:latest`);
          if (!options.kubeadm && !options.k3s)
            // Only load if not kubeadm/k3s (Kind needs it)
            shellExec(`sudo kind load docker-image valkey/valkey:latest`);
          else if (options.kubeadm || options.k3s)
            // For kubeadm/k3s, ensure it's available for containerd
            shellExec(`sudo crictl pull valkey/valkey:latest`);
        }
        shellExec(`kubectl delete statefulset valkey-service --ignore-not-found`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/valkey`);
      }
      if (options.full === true || options.mariadb === true) {
        shellExec(
          `sudo kubectl create secret generic mariadb-secret --from-file=username=/home/dd/engine/engine-private/mariadb-username --from-file=password=/home/dd/engine/engine-private/mariadb-password --dry-run=client -o yaml | kubectl apply -f -`,
        );
        shellExec(`kubectl delete statefulset mariadb-statefulset --ignore-not-found`);

        if (options.pullImage === true) {
          shellExec(`docker pull mariadb:latest`);
          shellExec(`sudo podman pull mariadb:latest`);
          if (!options.kubeadm && !options.k3s)
            // Only load if not kubeadm/k3s (Kind needs it)
            shellExec(`sudo kind load docker-image mariadb:latest`);
          else if (options.kubeadm || options.k3s)
            // For kubeadm/k3s, ensure it's available for containerd
            shellExec(`sudo crictl pull mariadb:latest`);
        }
        if (options.kubeadm === true)
          // This storage class is specific to kubeadm setup
          shellExec(`kubectl apply -f ${underpostRoot}/manifests/mariadb/storage-class.yaml`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/mariadb`);
      }
      if (options.full === true || options.mysql === true) {
        shellExec(
          `sudo kubectl create secret generic mysql-secret --from-file=username=/home/dd/engine/engine-private/mysql-username --from-file=password=/home/dd/engine/engine-private/mysql-password --dry-run=client -o yaml | kubectl apply -f -`,
        );
        shellExec(`sudo mkdir -p /mnt/data`);
        shellExec(`sudo chmod 777 /mnt/data`);
        shellExec(`sudo chown -R root:root /mnt/data`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/mysql`);
      }
      if (options.full === true || options.postgresql === true) {
        if (options.pullImage === true) {
          shellExec(`docker pull postgres:latest`);
          if (!options.kubeadm && !options.k3s)
            // Only load if not kubeadm/k3s (Kind needs it)
            shellExec(`sudo kind load docker-image postgres:latest`);
          else if (options.kubeadm || options.k3s)
            // For kubeadm/k3s, ensure it's available for containerd
            shellExec(`sudo crictl pull postgres:latest`);
        }
        shellExec(
          `sudo kubectl create secret generic postgres-secret --from-file=password=/home/dd/engine/engine-private/postgresql-password --dry-run=client -o yaml | kubectl apply -f -`,
        );
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/postgresql`);
      }
      if (options.mongodb4 === true) {
        if (options.pullImage === true) {
          shellExec(`docker pull mongo:4.4`);
          if (!options.kubeadm && !options.k3s)
            // Only load if not kubeadm/k3s (Kind needs it)
            shellExec(`sudo kind load docker-image mongo:4.4`);
          else if (options.kubeadm || options.k3s)
            // For kubeadm/k3s, ensure it's available for containerd
            shellExec(`sudo crictl pull mongo:4.4`);
        }
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/mongodb-4.4`);

        const deploymentName = 'mongodb-deployment';

        const successInstance = await UnderpostTest.API.statusMonitor(deploymentName);

        if (successInstance) {
          const mongoConfig = {
            _id: 'rs0',
            members: [{ _id: 0, host: 'mongodb-service:27017' }],
          };

          const [pod] = UnderpostDeploy.API.get(deploymentName);

          shellExec(
            `sudo kubectl exec -i ${pod.NAME} -- mongo --quiet \
        --eval 'rs.initiate(${JSON.stringify(mongoConfig)})'`,
          );
        }
      } else if (options.full === true || options.mongodb === true) {
        if (options.pullImage === true) {
          shellExec(`docker pull mongo:latest`);
          if (!options.kubeadm && !options.k3s)
            // Only load if not kubeadm/k3s (Kind needs it)
            shellExec(`sudo kind load docker-image mongo:latest`);
          else if (options.kubeadm || options.k3s)
            // For kubeadm/k3s, ensure it's available for containerd
            shellExec(`sudo crictl pull mongo:latest`);
        }
        shellExec(
          `sudo kubectl create secret generic mongodb-keyfile --from-file=/home/dd/engine/engine-private/mongodb-keyfile --dry-run=client -o yaml | kubectl apply -f -`,
        );
        shellExec(
          `sudo kubectl create secret generic mongodb-secret --from-file=username=/home/dd/engine/engine-private/mongodb-username --from-file=password=/home/dd/engine/engine-private/mongodb-password --dry-run=client -o yaml | kubectl apply -f -`,
        );
        shellExec(`kubectl delete statefulset mongodb --ignore-not-found`);
        if (options.kubeadm === true)
          // This storage class is specific to kubeadm setup
          shellExec(`kubectl apply -f ${underpostRoot}/manifests/mongodb/storage-class.yaml`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/mongodb`);

        const successInstance = await UnderpostTest.API.statusMonitor('mongodb-1');

        if (successInstance) {
          const mongoConfig = {
            _id: 'rs0',
            members: [
              { _id: 0, host: 'mongodb-0.mongodb-service:27017', priority: 1 },
              { _id: 1, host: 'mongodb-1.mongodb-service:27017', priority: 1 },
            ],
          };

          shellExec(
            `sudo kubectl exec -i mongodb-0 -- mongosh --quiet --json=relaxed \
        --eval 'use admin' \
        --eval 'rs.initiate(${JSON.stringify(mongoConfig)})' \
        --eval 'rs.status()'`,
          );
        }
      }

      if (options.full === true || options.contour === true) {
        shellExec(`kubectl apply -f https://projectcontour.io/quickstart/contour.yaml`);
        if (options.kubeadm === true) {
          // Envoy service might need NodePort for kubeadm
          shellExec(`sudo kubectl apply -f ${underpostRoot}/manifests/envoy-service-nodeport.yaml`);
        }
        // K3s has a built-in LoadBalancer (Klipper-lb) that can expose services,
        // so a specific NodePort service might not be needed or can be configured differently.
      }

      if (options.full === true || options.certManager === true) {
        if (!UnderpostDeploy.API.get('cert-manager').find((p) => p.STATUS === 'Running')) {
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
        shellExec(`sudo kubectl apply -f ${underpostRoot}/manifests/${letsEncName}.yaml`);
      }
    },

    /**
     * @method config
     * @description Configures host-level settings required for Kubernetes.
     * This method ensures proper SELinux, Docker, Containerd, and Sysctl settings
     * are applied for a healthy Kubernetes environment. It explicitly avoids
     * iptables flushing commands to prevent conflicts with Kubernetes' own network management.
     * @param {string} underpostRoot - The root directory of the underpost project.
     */
    config(options = { underpostRoot: '.' }) {
      const underpostRoot = options;
      console.log('Applying host configuration: SELinux, Docker, Containerd, and Sysctl settings.');
      // Disable SELinux (permissive mode)
      shellExec(`sudo setenforce 0`);
      shellExec(`sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config`);

      // Enable and start Docker and Kubelet services
      shellExec(`sudo systemctl enable --now docker || true`); // Docker might not be needed for K3s
      shellExec(`sudo systemctl enable --now kubelet || true`); // Kubelet might not be needed for K3s (K3s uses its own agent)

      // Configure containerd for SystemdCgroup and explicitly disable SELinux
      // This is crucial for kubelet/k3s to interact correctly with containerd
      shellExec(`containerd config default | sudo tee /etc/containerd/config.toml > /dev/null`);
      shellExec(`sudo sed -i -e "s/SystemdCgroup = false/SystemdCgroup = true/g" /etc/containerd/config.toml`);
      // Add a new line to disable SELinux for the runc runtime
      // shellExec(
      //   `sudo sed -i '/SystemdCgroup = true/a       selinux_disabled = true' /etc/containerd/config.toml || true`,
      // );
      shellExec(`sudo service docker restart || true`); // Restart docker after containerd config changes
      shellExec(`sudo systemctl enable --now containerd.service`);
      shellExec(`sudo systemctl restart containerd`); // Restart containerd to apply changes

      // Disable swap (required by Kubernetes)
      shellExec(`sudo swapoff -a; sudo sed -i '/swap/d' /etc/fstab`);

      // Reload systemd daemon to pick up new unit files/changes
      shellExec(`sudo systemctl daemon-reload`);

      // Enable bridge-nf-call-iptables for Kubernetes networking
      // This ensures traffic through Linux bridges is processed by iptables (crucial for CNI)
      for (const iptableConfPath of [
        `/etc/sysctl.d/k8s.conf`,
        `/etc/sysctl.d/99-k8s-ipforward.conf`,
        `/etc/sysctl.d/99-k8s.conf`,
      ])
        shellExec(`echo 'net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-arptables = 1
net.ipv4.ip_forward = 1' | sudo tee ${iptableConfPath}`);
      // shellExec(`sudo sysctl --system`); // Apply sysctl changes immediately
      // Apply NAT iptables rules.
      shellExec(`${underpostRoot}/manifests/maas/nat-iptables.sh`, { silent: true });

      // Disable firewalld (common cause of network issues in Kubernetes)
      shellExec(`sudo systemctl stop firewalld || true`); // Stop if running
      shellExec(`sudo systemctl disable firewalld || true`); // Disable from starting on boot
    },

    /**
     * @method chown
     * @description Sets up kubectl configuration for the current user based on the cluster type.
     * @param {string} clusterType - The type of Kubernetes cluster ('kubeadm', 'k3s', or 'kind').
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
        shellExec(`sudo -E cp -i ${kubeconfigPath} ~/.kube/config`);
        shellExec(`sudo -E chown $(id -u):$(id -g) ~/.kube/config`);
      } else if (clusterType === 'kind') {
        // For Kind, the kubeconfig is usually merged automatically or can be explicitly exported
        // This command ensures it's merged into the default kubeconfig
        shellExec(`kind get kubeconfig > ~/.kube/config || true`);
        shellExec(`sudo -E chown $(id -u):$(id -g) ~/.kube/config`);
      } else {
        logger.warn('No specific kubeconfig path defined for this cluster type, or it is managed automatically.');
      }
      console.log('kubectl config set up successfully.');
    },

    /**
     * @method reset
     * @description Performs a comprehensive reset of Kubernetes and container environments.
     * This function is for cleaning up a node, reverting changes made by 'kubeadm init', 'kubeadm join', or 'k3s install'.
     * It includes deleting Kind clusters, resetting kubeadm, removing CNI configs,
     * cleaning Docker, Podman, Containerd, and Kubelet data, persistent volumes,
     * and resetting kubelet components.
     * It avoids aggressive iptables flushing that would break host connectivity,
     * relying on kube-proxy's control loop to eventually clean up rules if the cluster is not re-initialized.
     * The goal is to relocate large data directories (Docker, Podman, Containerd, Kubelet)
     * from the root filesystem (often `/var/lib`) to `/home`, which typically has more available space,
     * to prevent disk eviction errors on Kubernetes nodes.
     * @param {string} underpostRoot - The root directory of the underpost project.
     */
    async reset(options = { underpostRoot: '.' }) {
      const { underpostRoot } = options;

      logger.info('Starting comprehensive reset of Kubernetes and container environments...');
      logger.info('This process will clean up cluster components and relocate large data directories to /home.');

      // Ensure SELinux is in permissive mode at the very beginning of the reset
      // logger.info('Ensuring SELinux is in permissive mode...');
      // shellExec(`sudo setenforce 0 || true`);
      // shellExec(`sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config || true`);
      // Restore default SELinux contexts on /var/lib/containerd and /var/lib/kubelet
      // logger.info('  -> Restoring default SELinux contexts for container and kubelet data directories...');
      // shellExec(`sudo restorecon -Rv /var/lib/containerd || true`);
      // shellExec(`sudo restorecon -Rv /var/lib/kubelet || true`);

      // Phase 0: Truncate large logs under /var/log to free up immediate space
      logger.info('Phase 0/7: Truncating large log files under /var/log...');
      try {
        const cleanPath = `/var/log/`;
        const largeLogsFiles = shellExec(
          `sudo du -sh ${cleanPath}* | awk '{if ($1 ~ /G$/ && ($1+0) > 1) print}' | sort -rh`,
          {
            stdout: true,
          },
        );
        for (const pathLog of largeLogsFiles
          .split(`\n`)
          .map((p) => p.split(cleanPath)[1])
          .filter((p) => p)) {
          shellExec(`sudo rm -rf ${cleanPath}${pathLog}`);
        }
      } catch (err) {
        logger.warn(`  -> Error truncating log files: ${err.message}. Continuing with reset.`);
      }

      try {
        // Phase 1: Clean up Persistent Volumes with hostPath
        // This targets data created by Kubernetes Persistent Volumes that use hostPath.
        logger.info('Phase 1/7: Cleaning Kubernetes hostPath volumes...');
        try {
          const pvListJson = shellExec(`kubectl get pv -o json || echo '{"items":[]}'`, { stdout: true, silent: true });
          const pvList = JSON.parse(pvListJson);

          if (pvList.items && pvList.items.length > 0) {
            for (const pv of pvList.items) {
              // Check if the PV uses hostPath and delete its contents
              if (pv.spec.hostPath && pv.spec.hostPath.path) {
                const hostPath = pv.spec.hostPath.path;
                logger.info(`Removing data from host path for PV '${pv.metadata.name}': ${hostPath}`);
                shellExec(`sudo rm -rf ${hostPath}/* || true`);
              }
            }
          } else {
            logger.info('No Persistent Volumes found with hostPath to clean up.');
          }
        } catch (error) {
          logger.error('Failed to clean up Persistent Volumes:', error);
        }

        // Phase 2: Stop kubelet and uninstall K3s components
        // Essential services are stopped before cleaning their data directories.
        logger.info('Phase 2/7: Stopping kubelet / uninstalling K3s and removing CNI configs...');
        logger.info('  -> Stopping kubelet service...');
        shellExec('sudo systemctl stop kubelet || true');
        logger.info('  -> Stopping K3s server and agent services...');
        shellExec('sudo systemctl stop k3s-server k3s-agent || true');
        logger.info('  -> Attempting K3s uninstall script if it exists...');
        shellExec('if [ -x /usr/local/bin/k3s-uninstall.sh ]; then sudo /usr/local/bin/k3s-uninstall.sh; fi || true');
        logger.info('  -> Removing CNI network configurations...');
        shellExec('sudo rm -rf /etc/cni/net.d/* || true');

        // Phase 3: Delete Kind clusters
        // Kind clusters are self-contained and need to be explicitly deleted.
        logger.info('Phase 3/7: Deleting Kind clusters...');
        shellExec(`kind get clusters | xargs -r -t -n1 kind delete cluster || true`);

        // Phase 4: Perform kubeadm reset
        // kubeadm reset cleans up the Kubernetes state managed by kubeadm.
        logger.info('Phase 4/7: Performing kubeadm reset...');
        logger.info('  -> Executing `kubeadm reset --force`...');
        shellExec('sudo kubeadm reset --force || true');

        // Phase 5: Remove kubeconfig and local provisioner data
        // Cleaning up user-specific Kubernetes configuration and local storage provisioner data.
        logger.info('Phase 5/7: Cleaning kubeconfig and local storage provisioner data...');
        logger.info("  -> Removing user's .kube directory...");
        shellExec('rm -rf $HOME/.kube || true');
        logger.info('  -> Removing local-path-provisioner data...');
        shellExec('sudo rm -rf /opt/local-path-provisioner/* || true');

        // Phase 6: Cleanup Docker, Podman, and Containerd data and relocate storage to /home
        // This is the core phase for addressing disk usage by moving large data directories.
        logger.info('Phase 6/7: Cleaning Docker, Podman, and Containerd data, and relocating storage to /home...');

        // 6.1: Docker Cleanup and Relocation
        logger.info('  -> 6.1: Processing Docker data...');
        logger.info('    -> Pruning Docker system (images, containers, volumes, networks)...');
        shellExec('sudo docker system prune -a -f || true');
        logger.info('    -> Stopping Docker service...');
        shellExec('sudo systemctl stop docker || true');

        const dockerRoot = '/var/lib/docker';
        const homeDocker = '/home/docker';
        logger.info(`    -> Relocating Docker data from ${dockerRoot} to ${homeDocker}...`);
        shellExec(`sudo mkdir -p ${homeDocker} || true`);
        shellExec(`sudo chmod 0755 ${homeDocker} || true`); // Set appropriate permissions
        shellExec(`sudo chown -R root:root ${homeDocker} || true`); // Ensure root ownership
        // Use rsync for efficient and robust copying, then remove original and create symlink
        shellExec(`sudo rsync -a --delete ${dockerRoot}/ ${homeDocker}/ || true`);
        logger.info(`    -> Removing original Docker data at ${dockerRoot}...`);
        shellExec(`sudo rm -rf ${dockerRoot} || true`);
        logger.info(`    -> Creating symlink from ${dockerRoot} to ${homeDocker}...`);
        shellExec(`sudo ln -s ${homeDocker} ${dockerRoot} || true`);
        logger.info('    -> Starting Docker service...');
        shellExec('sudo systemctl start docker || true');

        // 6.2: Podman Cleanup and Relocation
        logger.info('  -> 6.2: Processing Podman data...');
        logger.info('    -> Pruning Podman system (images, containers, volumes)...');
        shellExec('sudo podman system prune -a --volumes -f || true');
        shellExec('sudo podman system prune --external --force || true'); // User's addition

        const podmanStorage = '/var/lib/containers/storage';
        const homePStorage = '/home/containers/storage';
        logger.info(`    -> Relocating Podman storage from ${podmanStorage} to ${homePStorage}...`);
        shellExec(`sudo mkdir -p ${homePStorage} || true`);
        shellExec('sudo chmod 0711 /home/containers/storage || true'); // User's suggested permission
        shellExec(`sudo chown -R root:root ${homePStorage} || true`); // Ensure root ownership
        shellExec(`sudo rsync -a --delete ${podmanStorage}/ ${homePStorage}/ || true`);
        logger.info(`    -> Removing original Podman storage at ${podmanStorage}...`);
        shellExec(`sudo rm -rf ${podmanStorage} || true`);
        logger.info(`    -> Creating symlink from ${podmanStorage} to ${homePStorage}...`);
        shellExec(`sudo ln -s ${homePStorage} ${podmanStorage} || true`);
        logger.info(`    -> Updating Podman's storage configuration to point to ${homePStorage}...`);
        // Update storage.conf to reflect the new graphroot path
        shellExec(`sudo sed -i 's|^graphroot =.*|graphroot = "${homePStorage}"|' /etc/containers/storage.conf || true`);
        shellExec(`sudo podman system reset -f || true`); // User's addition, good for ensuring config reload

        // 6.3: Containerd Cleanup and Relocation (Crucial for Kubernetes)
        logger.info('  -> 6.3: Processing Containerd data...');
        logger.info('    -> Stopping Containerd service...');
        shellExec('sudo systemctl stop containerd || true');

        const containerdRoot = '/var/lib/containerd';
        const homeContainerd = '/home/containerd';
        logger.info(`    -> Relocating Containerd data from ${containerdRoot} to ${homeContainerd}...`);
        shellExec(`sudo mkdir -p ${homeContainerd} || true`);
        shellExec(`sudo chmod 0755 ${homeContainerd} || true`); // Set appropriate permissions
        shellExec(`sudo chown -R root:root ${homeContainerd} || true`); // Ensure root ownership
        shellExec(`sudo rsync -a --delete ${containerdRoot}/ ${homeContainerd}/ || true`);
        logger.info(`    -> Removing original Containerd data at ${containerdRoot}...`);
        shellExec(`sudo rm -rf ${containerdRoot} || true`);
        logger.info(`    -> Creating symlink from ${containerdRoot} to ${homeContainerd}...`);
        shellExec(`sudo ln -s ${homeContainerd} ${containerdRoot} || true`);
        logger.info(`    -> Updating Containerd configuration to use new data root...`);
        // Modify containerd's config.toml to point to the new root and state directories
        // This is a more robust way than just symlinking, as containerd explicitly uses these paths.
        shellExec(
          `sudo sed -i 's|^root = "/var/lib/containerd"|root = "${homeContainerd}"|' /etc/containerd/config.toml || true`,
        );
        shellExec(
          `sudo sed -i 's|^state = "/run/containerd"|state = "/run/containerd"|' /etc/containerd/config.toml || true`,
        ); // State usually remains in /run, no change needed unless specifically requested.

        logger.info('    -> Starting Containerd service...');
        shellExec('sudo systemctl start containerd || true');

        // 6.4: Kubelet Data Relocation
        logger.info('  -> 6.4: Processing Kubelet data...');
        logger.info('    -> Stopping Kubelet service (again, to ensure clean state for relocation)...');
        shellExec('sudo systemctl stop kubelet || true'); // Stop again in case it was restarted by Docker/Containerd

        const kubeletRoot = '/var/lib/kubelet';
        const homeKubelet = '/home/kubelet';
        logger.info(`    -> Relocating Kubelet data from ${kubeletRoot} to ${homeKubelet}...`);
        shellExec(`sudo mkdir -p ${homeKubelet} || true`);
        shellExec(`sudo chmod 0755 ${homeKubelet} || true`); // Set appropriate permissions
        shellExec(`sudo chown -R root:root ${homeKubelet} || true`); // Ensure root ownership
        shellExec(`sudo rsync -a --delete ${kubeletRoot}/ ${homeKubelet}/ || true`);
        logger.info(`    -> Removing original Kubelet data at ${kubeletRoot}...`);
        shellExec(`sudo rm -rf ${kubeletRoot} || true`);
        logger.info(`    -> Creating symlink from ${kubeletRoot} to ${homeKubelet}...`);
        shellExec(`sudo ln -s ${homeKubelet} ${kubeletRoot} || true`);
        logger.info('    -> Kubelet data relocation complete. Kubelet will use the symlinked path.');

        // Phase 7: Clean snap packages and final Kubernetes file cleanup
        logger.info('Phase 7/7: Cleaning Snap packages and finalizing Kubernetes file cleanup...');
        logger.info('  -> Running snap-clean.sh to remove old snap revisions...');
        // Ensure the script is executable and then run it
        shellExec(`chmod +x ${underpostRoot}/manifests/maas/snap-clean.sh || true`);
        shellExec(`${underpostRoot}/manifests/maas/snap-clean.sh || true`);

        logger.info('  -> Removing remaining Kubernetes configuration files...');
        shellExec('sudo rm -rf /etc/kubernetes/* || true');
        // Kubelet data is already handled by relocation, but ensure any lingering files are gone
        shellExec('sudo rm -rf /var/lib/kubelet/* || true'); // This should now be a symlink, so it targets the /home location if not removed.
        logger.info('  -> Cleaning user trash directory...');
        shellExec('sudo rm -rf /root/.local/share/Trash/files/* || true');

        logger.info('  -> Reloading systemd daemon and starting kubelet...');
        shellExec('sudo systemctl daemon-reload || true'); // Reload daemon to pick up any service file changes
        shellExec('sudo systemctl start kubelet || true'); // Start kubelet after all cleanups and relocations

        logger.info('Comprehensive reset and data relocation completed successfully.');
      } catch (error) {
        logger.error(`Error during reset: ${error.message}. Please review the logs for details.`);
        // Re-throw the error to ensure the calling context is aware of the failure
        throw error;
      }
    },

    /**
     * @method getResourcesCapacity
     * @description Retrieves and returns the allocatable CPU and memory resources
     * of the Kubernetes node.
     * @param {boolean} [isKubeadmOrK3s=false] - If true, assumes a kubeadm or k3s-managed node;
     * otherwise, assumes a Kind worker node.
     * @returns {object} An object containing CPU and memory resources with values and units.
     */
    getResourcesCapacity(isKubeadmOrK3s = false) {
      const resources = {};
      const nodeName = isKubeadmOrK3s ? os.hostname() : 'kind-worker';
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
     * @description Installs essential host-level prerequisites for Kubernetes,
     * including Docker, Podman, Kind, Kubeadm, and Helm.
     *
     * Quick-Start Guide for K3s Installation:
     * This guide will help you quickly launch a cluster with default options. Make sure your nodes meet the requirements before proceeding.
     * Consult the Installation page for greater detail on installing and configuring K3s.
     * For information on how K3s components work together, refer to the Architecture page.
     * If you are new to Kubernetes, the official Kubernetes docs have great tutorials covering basics that all cluster administrators should be familiar with.
     *
     * Install Script:
     * K3s provides an installation script that is a convenient way to install it as a service on systemd or openrc based systems. This script is available at https://get.k3s.io. To install K3s using this method, just run:
     * curl -sfL https://get.k3s.io | sh -
     *
     * After running this installation:
     * - The K3s service will be configured to automatically restart after node reboots or if the process crashes or is killed
     * - Additional utilities will be installed, including kubectl, crictl, ctr, k3s-killall.sh, and k3s-uninstall.sh
     * - A kubeconfig file will be written to /etc/rancher/k3s/k3s.yaml and the kubectl installed by K3s will automatically use it
     *
     * A single-node server installation is a fully-functional Kubernetes cluster, including all the datastore, control-plane, kubelet, and container runtime components necessary to host workload pods. It is not necessary to add additional server or agents nodes, but you may want to do so to add additional capacity or redundancy to your cluster.
     *
     * To install additional agent nodes and add them to the cluster, run the installation script with the K3S_URL and K3S_TOKEN environment variables. Here is an example showing how to join an agent:
     * curl -sfL https://get.k3s.io | K3S_URL=https://myserver:6443 K3S_TOKEN=mynodetoken sh -
     *
     * Setting the K3S_URL parameter causes the installer to configure K3s as an agent, instead of a server. The K3s agent will register with the K3s server listening at the supplied URL. The value to use for K3S_TOKEN is stored at /var/lib/rancher/k3s/server/node-token on your server node.
     *
     * Note: Each machine must have a unique hostname. If your machines do not have unique hostnames, pass the K3S_NODE_NAME environment variable and provide a value with a valid and unique hostname for each node.
     * If you are interested in having more server nodes, see the High Availability Embedded etcd and High Availability External DB pages for more information.
     */
    initHost() {
      const archData = UnderpostBaremetal.API.getHostArch();
      logger.info(
        'Installing essential host-level prerequisites for Kubernetes (Docker, Podman, Kind, Kubeadm, Helm) and providing K3s Quick-Start Guide information...',
        archData,
      );
      // Install docker
      shellExec(`sudo dnf -y install dnf-plugins-core`);
      shellExec(`sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo`);
      shellExec(`sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`);

      // Install podman
      shellExec(`sudo dnf -y install podman`);

      // Install kind
      shellExec(`[ $(uname -m) = ${archData.name} ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.29.0/kind-linux-${archData.alias}
chmod +x ./kind
sudo mv ./kind /bin/kind`);
      // Install kubeadm, kubelet, kubectl (these are also useful for K3s for kubectl command)
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

      // Install helm
      shellExec(`curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3`);
      shellExec(`chmod 700 get_helm.sh`);
      shellExec(`./get_helm.sh`);
      shellExec(`chmod +x /usr/local/bin/helm`);
      shellExec(`sudo mv /usr/local/bin/helm /bin/helm`);
      shellExec(`sudo rm -rf get_helm.sh`);
      console.log('Host prerequisites installed successfully.');
    },
  };
}
export default UnderpostCluster;
