import { getNpmRootPath } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import UnderpostDeploy from './deploy.js';
import UnderpostTest from './test.js';
import os from 'os';

const logger = loggerFactory(import.meta);

class UnderpostCluster {
  static API = {
    /**
     * @method init
     * @description Initializes and configures the Kubernetes cluster based on provided options.
     * This method handles host prerequisites, cluster initialization (Kind or Kubeadm),
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
     * @param {boolean} [options.initHost=false] - Perform initial host setup (install Docker, Podman, Kind, Kubeadm, Helm).
     * @param {boolean} [options.config=false] - Apply general host configuration (SELinux, containerd, sysctl, firewalld).
     * @param {boolean} [options.worker=false] - Configure as a worker node (for Kubeadm join).
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
        return logger.info('', UnderpostCluster.API.getResourcesCapacity(options.kubeadm));
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

      // Reset Kubernetes cluster components (Kind/Kubeadm) and container runtimes
      if (options.reset === true) return await UnderpostCluster.API.reset();

      // Check if a cluster (Kind or Kubeadm with Calico) is already initialized
      const alreadyCluster =
        UnderpostDeploy.API.get('kube-apiserver-kind-control-plane')[0] ||
        UnderpostDeploy.API.get('calico-kube-controllers')[0];

      // --- Kubeadm/Kind Cluster Initialization ---
      // This block handles the initial setup of the Kubernetes cluster (control plane or worker).
      // It prevents re-initialization if a cluster is already detected.
      if (!options.worker && !alreadyCluster) {
        // If it's a kubeadm setup and no Calico controller is found (indicating no kubeadm cluster)
        if (options.kubeadm === true) {
          logger.info('Initializing Kubeadm control plane...');
          // Initialize kubeadm control plane
          shellExec(
            `sudo kubeadm init --pod-network-cidr=192.168.0.0/16 --control-plane-endpoint="${os.hostname()}:6443"`,
          );
          // Configure kubectl for the current user
          UnderpostCluster.API.chown();

          // Apply kubelet-config.yaml explicitly
          // Using 'kubectl replace --force' to ensure the ConfigMap is updated,
          // even if it was modified by kubeadm or other processes, resolving conflicts.
          // shellExec(`kubectl replace --force -f ${underpostRoot}/manifests/kubelet-config.yaml`);

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
          // Kind cluster initialization (if not using kubeadm)
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
          UnderpostCluster.API.chown();
        }
      } else if (options.worker === true) {
        // Worker node specific configuration (kubeadm join command needs to be executed separately)
        logger.info('Worker node configuration applied. Awaiting kubeadm join command...');
        // No direct cluster initialization here for workers. The `kubeadm join` command
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
          if (!options.kubeadm)
            shellExec(
              `sudo ${
                options.kubeadm === true ? `ctr -n k8s.io images import` : `kind load docker-image`
              } valkey/valkey:latest`,
            );
        }
        shellExec(`kubectl delete statefulset valkey-service`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/valkey`);
      }
      if (options.full === true || options.mariadb === true) {
        shellExec(
          `sudo kubectl create secret generic mariadb-secret --from-file=username=/home/dd/engine/engine-private/mariadb-username --from-file=password=/home/dd/engine/engine-private/mariadb-password`,
        );
        shellExec(`kubectl delete statefulset mariadb-statefulset`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/mariadb`);
      }
      if (options.full === true || options.mysql === true) {
        shellExec(
          `sudo kubectl create secret generic mysql-secret --from-file=username=/home/dd/engine/engine-private/mysql-username --from-file=password=/home/dd/engine/engine-private/mysql-password`,
        );
        shellExec(`sudo mkdir -p /mnt/data`);
        shellExec(`sudo chmod 777 /mnt/data`);
        shellExec(`sudo chown -R root:root /mnt/data`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/mysql`);
      }
      if (options.full === true || options.postgresql === true) {
        if (options.pullImage === true) {
          shellExec(`docker pull postgres:latest`);
          if (!options.kubeadm)
            shellExec(
              `sudo ${
                options.kubeadm === true ? `ctr -n k8s.io images import` : `kind load docker-image`
              } docker-image postgres:latest`,
            );
        }
        shellExec(
          `sudo kubectl create secret generic postgres-secret --from-file=password=/home/dd/engine/engine-private/postgresql-password`,
        );
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/postgresql`);
      }
      if (options.mongodb4 === true) {
        if (options.pullImage === true) {
          shellExec(`docker pull mongo:4.4`);
          if (!options.kubeadm)
            shellExec(
              `sudo ${
                options.kubeadm === true ? `ctr -n k8s.io images import` : `kind load docker-image`
              } docker-image mongo:4.4`,
            );
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
        }
        shellExec(
          `sudo kubectl create secret generic mongodb-keyfile --from-file=/home/dd/engine/engine-private/mongodb-keyfile`,
        );
        shellExec(
          `sudo kubectl create secret generic mongodb-secret --from-file=username=/home/dd/engine/engine-private/mongodb-username --from-file=password=/home/dd/engine/engine-private/mongodb-password`,
        );
        shellExec(`kubectl delete statefulset mongodb`);
        if (options.kubeadm === true)
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
          shellExec(`sudo kubectl apply -f ${underpostRoot}/manifests/envoy-service-nodeport.yaml`);
        }
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
        shellExec(`sudo kubectl delete ClusterIssuer ${letsEncName}`);
        shellExec(`sudo kubectl apply -f ${underpostRoot}/manifests/${letsEncName}.yaml`);
      }
    },

    /**
     * @method config
     * @description Configures host-level settings required for Kubernetes.
     * This method ensures proper SELinux, Docker, Containerd, and Sysctl settings
     * are applied for a healthy Kubernetes environment. It explicitly avoids
     * iptables flushing commands to prevent conflicts with Kubernetes' own network management.
     */
    config() {
      console.log('Applying host configuration: SELinux, Docker, Containerd, and Sysctl settings.');
      // Disable SELinux (permissive mode)
      shellExec(`sudo setenforce 0`);
      shellExec(`sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config`);

      // Enable and start Docker and Kubelet services
      shellExec(`sudo systemctl enable --now docker`);
      shellExec(`sudo systemctl enable --now kubelet`);

      // Configure containerd for SystemdCgroup
      // This is crucial for kubelet to interact correctly with containerd
      shellExec(`containerd config default | sudo tee /etc/containerd/config.toml > /dev/null`);
      shellExec(`sudo sed -i -e "s/SystemdCgroup = false/SystemdCgroup = true/g" /etc/containerd/config.toml`);
      shellExec(`sudo service docker restart`); // Restart docker after containerd config changes
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
      shellExec(`sudo sysctl --system`); // Apply sysctl changes immediately

      // Disable firewalld (common cause of network issues in Kubernetes)
      shellExec(`sudo systemctl stop firewalld || true`); // Stop if running
      shellExec(`sudo systemctl disable firewalld || true`); // Disable from starting on boot
    },

    /**
     * @method chown
     * @description Sets up kubectl configuration for the current user.
     * This is typically run after kubeadm init on the control plane
     * to allow non-root users to interact with the cluster.
     */
    chown() {
      console.log('Setting up kubectl configuration...');
      shellExec(`mkdir -p ~/.kube`);
      shellExec(`sudo -E cp -i /etc/kubernetes/admin.conf ~/.kube/config`);
      shellExec(`sudo -E chown $(id -u):$(id -g) ~/.kube/config`);
      console.log('kubectl config set up successfully.');
    },

    /**
     * @method reset
     * @description Performs a comprehensive reset of Kubernetes and container environments.
     * This function is for cleaning up a node, reverting changes made by 'kubeadm init' or 'kubeadm join'.
     * It includes deleting Kind clusters, resetting kubeadm, removing CNI configs,
     * cleaning Docker and Podman data, persistent volumes, and resetting kubelet components.
     * It avoids aggressive iptables flushing that would break host connectivity, relying on kube-proxy's
     * control loop to eventually clean up rules if the cluster is not re-initialized.
     */
    async reset() {
      logger.info('Starting comprehensive reset of Kubernetes and container environments...');

      try {
        // Phase 1: Pre-reset Kubernetes Cleanup (while API server is still up)
        logger.info('Phase 1/6: Cleaning up Kubernetes resources (PVCs, PVs) while API server is accessible...');

        // Delete all Persistent Volume Claims (PVCs) to release the PVs.
        // This must happen before deleting PVs or the host paths.
        // shellExec(`kubectl delete pvc --all-namespaces --all --ignore-not-found || true`);

        // Get all Persistent Volumes and identify their host paths for data deletion.
        // This needs to be done *before* deleting the PVs themselves.
        // The '|| echo '{"items":[]}'` handles cases where 'kubectl get pv' might return empty or error.
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

        // Then, delete all Persistent Volumes (PVs).
        // shellExec(`kubectl delete pv --all --ignore-not-found || true`);

        // Phase 2: Stop Kubelet and remove CNI configuration
        logger.info('Phase 2/6: Stopping Kubelet and removing CNI configurations...');
        // Stop kubelet service to prevent further activity and release resources.
        shellExec(`sudo systemctl stop kubelet || true`);

        // CNI plugins use /etc/cni/net.d to store their configuration.
        // Removing this prevents conflicts and potential issues during kubeadm reset.
        shellExec('sudo rm -rf /etc/cni/net.d/* || true');

        // Phase 3: Kind Cluster Cleanup
        logger.info('Phase 3/6: Cleaning up Kind clusters...');
        // Delete all existing Kind (Kubernetes in Docker) clusters.
        shellExec(`kind get clusters | xargs -r -t -n1 kind delete cluster || true`);

        // Phase 4: Kubeadm Reset
        logger.info('Phase 4/6: Performing kubeadm reset...');
        // Reset the Kubernetes control-plane components installed by kubeadm.
        // The --force flag skips confirmation prompts. This command will tear down the cluster.
        shellExec(`sudo kubeadm reset --force`);

        // Phase 5: Post-reset File System Cleanup (Local Storage, Kubeconfig)
        logger.info('Phase 5/6: Cleaning up local storage provisioner data and kubeconfig...');
        // Remove the kubectl configuration file for the current user.
        // This is important to prevent stale credentials after the cluster is reset.
        shellExec('rm -rf $HOME/.kube || true');

        // Remove local path provisioner data, which stores data for dynamically provisioned PVCs.
        shellExec(`sudo rm -rf /opt/local-path-provisioner/* || true`);

        // Phase 6: Container Runtime Cleanup (Docker and Podman)
        logger.info('Phase 6/6: Cleaning up Docker and Podman data...');
        // Prune all unused Docker data (containers, images, volumes, networks).
        shellExec('sudo docker system prune -a -f');

        // Stop the Docker daemon service to ensure all files can be removed.
        shellExec('sudo service docker stop || true');

        // Aggressively remove container storage data for containerd and Docker.
        // This targets the underlying storage directories.
        shellExec(`sudo rm -rf /var/lib/containers/storage/* || true`);
        shellExec(`sudo rm -rf /var/lib/docker/volumes/* || true`);
        shellExec(`sudo rm -rf /var/lib/docker~/* || true`); // Cleanup any old Docker directories
        shellExec(`sudo rm -rf /home/containers/storage/* || true`);
        shellExec(`sudo rm -rf /home/docker/* || true`);

        // Ensure Docker's default storage location is clean and re-linked if custom.
        shellExec(`sudo rm -rf /var/lib/docker/* || true`);
        shellExec('sudo mkdir -p /home/docker || true');
        shellExec('sudo chmod 777 /home/docker || true');
        shellExec('sudo ln -sf /home/docker /var/lib/docker || true'); // Use -sf for symbolic link, force and silent

        // Prune all unused Podman data.
        shellExec(`sudo podman system prune -a -f`);
        shellExec(`sudo podman system prune --all --volumes --force`);
        shellExec(`sudo podman system prune --external --force`);

        // Create and set permissions for Podman's custom storage directory.
        shellExec(`sudo mkdir -p /home/containers/storage || true`);
        shellExec('sudo chmod 0711 /home/containers/storage || true');

        // Update Podman's storage configuration file.
        shellExec(
          `sudo sed -i -e "s@/var/lib/containers/storage@/home/containers/storage@g" /etc/containers/storage.conf || true`,
        );

        // Reset Podman system settings.
        shellExec(`sudo podman system reset -f`);

        // Final Kubelet and System Cleanup (after all other operations)
        logger.info('Finalizing Kubelet and system file cleanup...');
        // Remove Kubernetes configuration and kubelet data directories.
        shellExec(`sudo rm -rf /etc/kubernetes/* || true`);
        shellExec(`sudo rm -rf /var/lib/kubelet/* || true`);

        // Clear trash files from the root user's trash directory.
        shellExec('sudo rm -rf /root/.local/share/Trash/files/* || true');

        // Reload systemd daemon to pick up any service file changes.
        shellExec(`sudo systemctl daemon-reload`);
        // Attempt to start kubelet; it might fail if the cluster is fully reset, which is expected.
        shellExec(`sudo systemctl start kubelet || true`);

        logger.info('Comprehensive reset completed successfully.');
      } catch (error) {
        logger.error(`Error during reset: ${error.message}`);
        console.error(error);
      }
    },

    /**
     * @method getResourcesCapacity
     * @description Retrieves and returns the allocatable CPU and memory resources
     * of the Kubernetes node.
     * @param {boolean} [kubeadm=false] - If true, assumes a kubeadm-managed node;
     * otherwise, assumes a Kind worker node.
     * @returns {object} An object containing CPU and memory resources with values and units.
     */
    getResourcesCapacity(kubeadm = false) {
      const resources = {};
      const info = shellExec(
        `kubectl describe node ${
          kubeadm === true ? os.hostname() : 'kind-worker'
        } | grep -E '(Allocatable:|Capacity:)' -A 6`,
        {
          stdout: true,
          silent: true,
        },
      );
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
     */
    initHost() {
      console.log('Installing Docker, Podman, Kind, Kubeadm, and Helm...');
      // Install docker
      shellExec(`sudo dnf -y install dnf-plugins-core`);
      shellExec(`sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo`);
      shellExec(`sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`);

      // Install podman
      shellExec(`sudo dnf -y install podman`);

      // Install kind
      shellExec(`[ $(uname -m) = aarch64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.29.0/kind-linux-arm64
chmod +x ./kind
sudo mv ./kind /bin/kind`);
      // Install kubeadm, kubelet, kubectl
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
      console.log('Host prerequisites installed successfully.');
    },
  };
}
export default UnderpostCluster;
