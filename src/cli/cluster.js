import { getNpmRootPath } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import UnderpostDeploy from './deploy.js';
import UnderpostTest from './test.js';
import os from 'os';

const logger = loggerFactory(import.meta);

class UnderpostCluster {
  static API = {
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
            members: [{ _id: 0, host: '127.0.0.1:27017' }],
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
     * IMPORTANT: This method has been updated to REMOVE all iptables flushing commands
     * to prevent conflicts with Kubernetes' own network management.
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
     * This is typically run after kubeadm init on the control plane.
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
     * This function is for cleaning up a node, not for initial setup.
     * It avoids aggressive iptables flushing that would break host connectivity.
     */
    reset() {
      console.log('Starting comprehensive reset of Kubernetes and container environments...');

      // Delete all existing Kind (Kubernetes in Docker) clusters.
      shellExec(`kind get clusters | xargs -r -t -n1 kind delete cluster --name`); // -r for no-op if no clusters

      // Reset the Kubernetes control-plane components installed by kubeadm.
      shellExec(`sudo kubeadm reset -f`);

      // Remove specific CNI configuration files (e.g., Flannel)
      shellExec('sudo rm -f /etc/cni/net.d/10-flannel.conflist');

      // Remove the kubectl configuration file
      shellExec('sudo rm -f $HOME/.kube/config');

      // Clear trash files from the root user's trash directory.
      shellExec('sudo rm -rf /root/.local/share/Trash/files/*');

      // Prune all unused Docker data.
      shellExec('sudo docker system prune -a -f');

      // Stop the Docker daemon service.
      shellExec('sudo service docker stop');

      // Aggressively remove container storage data for containerd and Docker.
      shellExec(`sudo rm -rf /var/lib/containers/storage/*`);
      shellExec(`sudo rm -rf /var/lib/docker/volumes/*`);
      shellExec(`sudo rm -rf /var/lib/docker~/*`);
      shellExec(`sudo rm -rf /home/containers/storage/*`);
      shellExec(`sudo rm -rf /home/docker/*`);

      // Re-configure Docker's default storage location (if desired).
      shellExec('sudo mv /var/lib/docker /var/lib/docker~ || true'); // Use || true to prevent error if dir doesn't exist
      shellExec('sudo mkdir -p /home/docker');
      shellExec('sudo chmod 777 /home/docker');
      shellExec('sudo ln -s /home/docker /var/lib/docker');

      // Prune all unused Podman data.
      shellExec(`sudo podman system prune -a -f`);
      shellExec(`sudo podman system prune --all --volumes --force`);
      shellExec(`sudo podman system prune --external --force`);

      // Create and set permissions for Podman's custom storage directory.
      shellExec(`sudo mkdir -p /home/containers/storage`);
      shellExec('sudo chmod 0711 /home/containers/storage');

      // Update Podman's storage configuration file.
      shellExec(
        `sudo sed -i -e "s@/var/lib/containers/storage@/home/containers/storage@g" /etc/containers/storage.conf`,
      );

      // Reset Podman system settings.
      shellExec(`sudo podman system reset -f`);

      // Reset kubelet components
      shellExec(`sudo systemctl stop kubelet`);
      shellExec(`sudo rm -rf /etc/kubernetes/*`);
      shellExec(`sudo rm -rf /var/lib/kubelet/*`);
      shellExec(`sudo rm -rf /etc/cni/net.d/*`);
      shellExec(`sudo systemctl daemon-reload`);
      shellExec(`sudo systemctl start kubelet`);

      console.log('Comprehensive reset completed.');
    },

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
