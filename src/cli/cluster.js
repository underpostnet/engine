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
      },
    ) {
      // sudo dnf update
      // 1) Install kind, kubeadm, docker, podman, helm
      // 2) Check kubectl, kubelet, containerd.io
      // 3) Install Nvidia drivers from Rocky Linux docs
      // 4) Install LXD with MAAS from Rocky Linux docs
      // 5) Install MAAS src from snap
      if (options.initHost === true) return UnderpostCluster.API.initHost();
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      if (options.infoCapacityPod === true) return logger.info('', UnderpostDeploy.API.resourcesFactory());
      if (options.infoCapacity === true)
        return logger.info('', UnderpostCluster.API.getResourcesCapacity(options.kubeadm));
      if (options.reset === true) return await UnderpostCluster.API.reset();
      if (options.listPods === true) return console.table(UnderpostDeploy.API.get(podName ?? undefined));

      if (options.nsUse && typeof options.nsUse === 'string') {
        shellExec(`kubectl config set-context --current --namespace=${options.nsUse}`);
        return;
      }
      if (options.info === true) {
        shellExec(`kubectl config get-contexts`); // config env persisente for manage multiple clusters
        shellExec(`kubectl config get-clusters`);
        shellExec(`kubectl get nodes -o wide`); // set of nodes of a cluster
        shellExec(`kubectl config view | grep namespace`);
        shellExec(`kubectl get ns -o wide`); // A namespace can have pods of different nodes
        shellExec(`kubectl get pvc --all-namespaces -o wide`); // PersistentVolumeClaim -> request storage service
        shellExec(`kubectl get pv --all-namespaces -o wide`); // PersistentVolume -> real storage
        shellExec(`kubectl get cronjob --all-namespaces -o wide`);
        shellExec(`kubectl get svc --all-namespaces -o wide`); // proxy dns gate way -> deployments, statefulsets, pods
        shellExec(`kubectl get statefulsets --all-namespaces -o wide`); // set pods with data/volume persistence
        shellExec(`kubectl get deployments --all-namespaces -o wide`); // set pods
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
      const alrreadyCluster =
        UnderpostDeploy.API.get('kube-apiserver-kind-control-plane')[0] ||
        UnderpostDeploy.API.get('calico-kube-controllers')[0];

      if (
        !alrreadyCluster &&
        ((!options.kubeadm && !UnderpostDeploy.API.get('kube-apiserver-kind-control-plane')[0]) ||
          (options.kubeadm === true && !UnderpostDeploy.API.get('calico-kube-controllers')[0]))
      ) {
        shellExec(`sudo setenforce 0`);
        shellExec(`sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config`);
        shellExec(`sudo systemctl enable --now docker`);
        shellExec(`sudo systemctl enable --now kubelet`);
        shellExec(`containerd config default > /etc/containerd/config.toml`);
        shellExec(`sed -i -e "s/SystemdCgroup = false/SystemdCgroup = true/g" /etc/containerd/config.toml`);
        // shellExec(`cp /etc/kubernetes/admin.conf ~/.kube/config`);
        // shellExec(`sudo systemctl restart kubelet`);
        shellExec(`sudo service docker restart`);
        shellExec(`sudo systemctl enable --now containerd.service`);
        shellExec(`sudo swapoff -a; sudo sed -i '/swap/d' /etc/fstab`);
        shellExec(`sudo systemctl daemon-reload`);
        shellExec(`sudo systemctl restart containerd`);
        if (options.kubeadm === true) {
          shellExec(`sysctl net.bridge.bridge-nf-call-iptables=1`);
          shellExec(
            `sudo kubeadm init --pod-network-cidr=192.168.0.0/16 --control-plane-endpoint="${os.hostname()}:6443"`,
          );
          shellExec(`mkdir -p ~/.kube`);
          shellExec(`sudo -E cp -i /etc/kubernetes/admin.conf ~/.kube/config`);
          shellExec(`sudo -E chown $(id -u):$(id -g) ~/.kube/config`);
          // https://docs.tigera.io/calico/latest/getting-started/kubernetes/quickstart
          shellExec(
            `sudo kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.3/manifests/tigera-operator.yaml`,
          );
          // shellExec(
          //   `wget https://raw.githubusercontent.com/projectcalico/calico/v3.25.0/manifests/custom-resources.yaml`,
          // );
          shellExec(`sudo kubectl apply -f ${underpostRoot}/manifests/kubeadm-calico-config.yaml`);
          const nodeName = os.hostname();
          shellExec(`kubectl taint nodes ${nodeName} node-role.kubernetes.io/control-plane:NoSchedule-`);
          shellExec(
            `kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/master/deploy/local-path-storage.yaml`,
          );
        } else {
          if (options.full === true || options.dedicatedGpu === true) {
            // https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/
            shellExec(`cd ${underpostRoot}/manifests && kind create cluster --config kind-config-cuda.yaml`);
          } else {
            shellExec(
              `cd ${underpostRoot}/manifests && kind create cluster --config kind-config${
                options?.dev === true ? '-dev' : ''
              }.yaml`,
            );
          }
          shellExec(`sudo chown $(id -u):$(id -g) $HOME/.kube/config**`);
        }
      } else logger.warn('Cluster already initialized');

      // shellExec(`sudo kubectl apply -f ${underpostRoot}/manifests/kubelet-config.yaml`);

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
        shellExec(`kubectl delete statefulset service-valkey`);
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

        // await UnderpostTest.API.statusMonitor('mongodb-1');
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
    // This function performs a comprehensive reset of Kubernetes and container environments
    // on the host machine. Its primary goal is to clean up cluster components, temporary files,
    // and container data, ensuring a clean state for re-initialization or fresh deployments,
    // while also preventing the loss of the host machine's internet connectivity.

    reset() {
      // Step 1: Delete all existing Kind (Kubernetes in Docker) clusters.
      // 'kind get clusters' lists all Kind clusters.
      // 'xargs -t -n1 kind delete cluster --name' then iterates through each cluster name
      // and executes 'kind delete cluster --name <cluster_name>' to remove them.
      shellExec(`kind get clusters | xargs -t -n1 kind delete cluster --name`);

      // Step 2: Reset the Kubernetes control-plane components installed by kubeadm.
      // 'kubeadm reset -f' performs a forceful reset, removing installed Kubernetes components,
      // configuration files, and associated network rules (like iptables entries created by kubeadm).
      // The '-f' flag bypasses confirmation prompts.
      shellExec(`sudo kubeadm reset -f`);

      // Step 3: Remove specific CNI (Container Network Interface) configuration files.
      // This command targets and removes the configuration file for Flannel,
      // a common CNI plugin, which might be left behind after a reset.
      shellExec('sudo rm -f /etc/cni/net.d/10-flannel.conflist');

      // Note: The aggressive 'sudo iptables -F ...' command was intentionally removed from previous versions.
      // This command would flush all iptables rules, including those crucial for the host's general
      // internet connectivity, leading to network loss. 'kubeadm reset' and container runtime pruning
      // adequately handle Kubernetes and container-specific iptables rules without affecting the host's
      // default network configuration.

      // Step 4: Remove the kubectl configuration file from the current user's home directory.
      // This ensures that after a reset, there's no lingering configuration pointing to the old cluster,
      // providing a clean slate for connecting to a new or re-initialized cluster.
      shellExec('sudo rm -f $HOME/.kube/config');

      // Step 5: Clear trash files from the root user's trash directory.
      // This is a general cleanup step to remove temporary or deleted files.
      shellExec('sudo rm -rf /root/.local/share/Trash/files/*');

      // Step 6: Prune all unused Docker data.
      // 'docker system prune -a -f' removes:
      // - All stopped containers
      // - All unused networks
      // - All dangling images
      // - All build cache
      // - All unused volumes
      // This aggressively frees up disk space and removes temporary Docker artifacts.
      shellExec('sudo docker system prune -a -f');

      // Step 7: Stop the Docker daemon service.
      // This step is often necessary to ensure that Docker's files and directories
      // can be safely manipulated or moved in subsequent steps without conflicts.
      shellExec('sudo service docker stop');

      // Step 8: Aggressively remove container storage data for containerd and Docker.
      // These commands target the default storage locations for containerd and Docker,
      // as well as any custom paths that might have been used (`/home/containers/storage`, `/home/docker`).
      // This ensures a complete wipe of all container images, layers, and volumes.
      shellExec(`sudo rm -rf /var/lib/containers/storage/*`);
      shellExec(`sudo rm -rf /var/lib/docker/volumes/*`);
      shellExec(`sudo rm -rf /var/lib/docker~/*`); // Cleans up a potential backup directory for Docker data
      shellExec(`sudo rm -rf /home/containers/storage/*`); // Cleans up custom containerd/Podman storage
      shellExec(`sudo rm -rf /home/docker/*`); // Cleans up custom Docker storage

      // Step 9: Re-configure Docker's default storage location (if desired).
      // These commands effectively move Docker's data directory from its default `/var/lib/docker`
      // to a new location (`/home/docker`) and create a symbolic link.
      // This is a specific customization to relocate Docker's storage.
      shellExec('sudo mv /var/lib/docker /var/lib/docker~'); // Moves existing /var/lib/docker to /var/lib/docker~ (backup)
      shellExec('sudo mkdir /home/docker'); // Creates the new desired directory for Docker data
      shellExec('sudo chmod 0711 /home/docker'); // Sets appropriate permissions for the new directory
      shellExec('sudo ln -s /home/docker /var/lib/docker'); // Creates a symlink from original path to new path

      // Step 10: Prune all unused Podman data.
      // Similar to Docker pruning, these commands remove:
      // - All stopped containers
      // - All unused networks
      // - All unused images
      // - All unused volumes ('--volumes')
      // - The '--force' flag bypasses confirmation.
      // '--external' prunes external content not managed by Podman's default storage backend.
      shellExec(`sudo podman system prune -a -f`);
      shellExec(`sudo podman system prune --all --volumes --force`);
      shellExec(`sudo podman system prune --external --force`);
      shellExec(`sudo podman system prune --all --volumes --force`); // Redundant but harmless repetition

      // Step 11: Create and set permissions for Podman's custom storage directory.
      // This ensures the custom path `/home/containers/storage` exists and has correct permissions
      // before Podman attempts to use it.
      shellExec(`sudo mkdir -p /home/containers/storage`);
      shellExec('sudo chmod 0711 /home/containers/storage');

      // Step 12: Update Podman's storage configuration file.
      // This command uses 'sed' to modify `/etc/containers/storage.conf`,
      // changing the default storage path from `/var/lib/containers/storage`
      // to the customized `/home/containers/storage`.
      shellExec(
        `sudo sed -i -e "s@/var/lib/containers/storage@/home/containers/storage@g" /etc/containers/storage.conf`,
      );

      // Step 13: Reset Podman system settings.
      // This command resets Podman's system-wide configuration to its default state.
      shellExec(`sudo podman system reset -f`);

      // Note: The 'sysctl net.bridge.bridge-nf-call-iptables=0' and related commands
      // were previously removed. These sysctl settings (bridge-nf-call-iptables,
      // bridge-nf-call-arptables, bridge-nf-call-ip6tables) are crucial for allowing
      // network traffic through Linux bridges to be processed by iptables.
      // Kubernetes and CNI plugins generally require them to be enabled (set to '1').
      // Re-initializing Kubernetes will typically set these as needed, and leaving them
      // at their system default (or '1' if already configured) is safer for host
      // connectivity during a reset operation.

      // https://github.com/kubernetes-sigs/kind/issues/2886
      // shellExec(`sysctl net.bridge.bridge-nf-call-iptables=0`);
      // shellExec(`sysctl net.bridge.bridge-nf-call-arptables=0`);
      // shellExec(`sysctl net.bridge.bridge-nf-call-ip6tables=0`);

      // Step 14: Remove the 'kind' Docker network.
      // This cleans up any network bridges or configurations specifically created by Kind.
      // shellExec(`docker network rm kind`);

      // Reset kubelet
      shellExec(`sudo systemctl stop kubelet`);
      shellExec(`sudo rm -rf /etc/kubernetes/*`);
      shellExec(`sudo rm -rf /var/lib/kubelet/*`);
      shellExec(`sudo rm -rf /etc/cni/net.d/*`);
      shellExec(`sudo systemctl daemon-reload`);
      shellExec(`sudo systemctl start kubelet`);
    },

    getResourcesCapacity(kubeadm = false) {
      const resources = {};
      const info = false
        ? `Capacity:
  cpu:                8
  ephemeral-storage:  153131976Ki
  hugepages-1Gi:      0
  hugepages-2Mi:      0
  memory:             11914720Ki
  pods:               110
Allocatable:
  cpu:                8
  ephemeral-storage:  153131976Ki
  hugepages-1Gi:      0
  hugepages-2Mi:      0
  memory:             11914720Ki
  pods: `
        : shellExec(
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
      // Base
      shellExec(`sudo dnf -y update`);
      shellExec(`sudo dnf -y install epel-release`);
      // Install docker
      shellExec(`sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo`);
      shellExec(`sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`);
      // Install podman
      shellExec(`sudo dnf -y install podman`);
      // Install kind
      shellExec(`[ $(uname -m) = aarch64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.29.0/kind-linux-arm64
chmod +x ./kind
sudo mv ./kind /bin/kind`);
      // Install kubeadm
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
      shellExec(`curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
chmod +x /usr/local/bin/helm
sudo mv /usr/local/bin/helm /bin/helm`);
    },
  };
}
export default UnderpostCluster;
