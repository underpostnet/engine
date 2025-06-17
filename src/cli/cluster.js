import { getNpmRootPath } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import UnderpostDeploy from './deploy.js';
import UnderpostTest from './test.js';

const logger = loggerFactory(import.meta);

class UnderpostCluster {
  static API = {
    async init(
      podName,
      options = {
        mongodb: false,
        mongodb4: false,
        mariadb: false,
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
      },
    ) {
      // 1) Install kind, kubeadm, docker, podman
      // 2) Check kubectl, kubelet, containerd.io
      // 3) Install Nvidia drivers from Rocky Linux docs
      // 4) Install LXD with MAAS from Rocky Linux docs
      // 5) Install MAAS src from snap
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      if (options.infoCapacityPod === true) return logger.info('', UnderpostDeploy.API.resourcesFactory());
      if (options.infoCapacity === true) return logger.info('', UnderpostCluster.API.getResourcesCapacity());
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

      if (
        (!options.istio && !UnderpostDeploy.API.get('kube-apiserver-kind-control-plane')[0]) ||
        (options.istio === true && !UnderpostDeploy.API.get('calico-kube-controllers')[0])
      ) {
        shellExec(`sudo setenforce 0`);
        shellExec(`sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config`);
        // sudo systemctl disable kubelet
        // shellExec(`sudo systemctl enable --now kubelet`);
        shellExec(`containerd config default > /etc/containerd/config.toml`);
        shellExec(`sed -i -e "s/SystemdCgroup = false/SystemdCgroup = true/g" /etc/containerd/config.toml`);
        // shellExec(`cp /etc/kubernetes/admin.conf ~/.kube/config`);
        // shellExec(`sudo systemctl restart kubelet`);
        shellExec(`sudo service docker restart`);
        shellExec(`sudo systemctl enable --now containerd.service`);
        shellExec(`sudo swapoff -a; sudo sed -i '/swap/d' /etc/fstab`);
        if (options.istio === true) {
          shellExec(`sysctl net.bridge.bridge-nf-call-iptables=1`);
          shellExec(`sudo kubeadm init --pod-network-cidr=192.168.0.0/16`);
          shellExec(`sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config`);
          shellExec(`sudo chown $(id -u):$(id -g) $HOME/.kube/config**`);
          // https://docs.tigera.io/calico/latest/getting-started/kubernetes/quickstart
          shellExec(
            `sudo kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.3/manifests/tigera-operator.yaml`,
          );
          // shellExec(
          //   `wget https://raw.githubusercontent.com/projectcalico/calico/v3.25.0/manifests/custom-resources.yaml`,
          // );
          shellExec(`sudo kubectl apply -f ./manifests/calico-custom-resources.yaml`);
          shellExec(`sudo systemctl restart containerd`);
        } else {
          shellExec(`sudo systemctl restart containerd`);
          shellExec(
            `cd ${underpostRoot}/manifests && kind create cluster --config kind-config${
              options?.dev === true ? '-dev' : ''
            }.yaml`,
          );
          shellExec(`sudo chown $(id -u):$(id -g) $HOME/.kube/config**`);
        }
      } else logger.warn('Cluster already initialized');

      if (options.full === true || options.valkey === true) {
        if (options.pullImage === true) {
          // kubectl patch statefulset service-valkey --type='json' -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/image", "value":"valkey/valkey:latest"}]'
          // kubectl patch statefulset service-valkey -p '{"spec":{"template":{"spec":{"containers":[{"name":"service-valkey","imagePullPolicy":"Never"}]}}}}'
          shellExec(`docker pull valkey/valkey`);
          // shellExec(`sudo kind load docker-image valkey/valkey`);
          // shellExec(`sudo podman pull docker.io/valkey/valkey:latest`);
          // shellExec(`podman save -o valkey.tar valkey/valkey`);
          // shellExec(`sudo kind load image-archive valkey.tar`);
          // shellExec(`sudo rm -rf ./valkey.tar`);
          shellExec(`sudo kind load docker-image valkey/valkey:latest`);
        }
        shellExec(`kubectl delete statefulset service-valkey`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/valkey`);
      }
      if (options.full === true || options.mariadb === true) {
        shellExec(
          `sudo kubectl create secret generic mariadb-secret --from-file=username=/home/dd/engine/engine-private/mariadb-username --from-file=password=/home/dd/engine/engine-private/mariadb-password`,
        );
        shellExec(
          `sudo kubectl create secret generic github-secret --from-literal=GITHUB_TOKEN=${process.env.GITHUB_TOKEN}`,
        );
        shellExec(`kubectl delete statefulset mariadb-statefulset`);
        shellExec(`kubectl apply -k ${underpostRoot}/manifests/mariadb`);
      }
      if (options.full === true || options.postgresql === true) {
        shellExec(
          `sudo kubectl create secret generic postgres-secret --from-file=password=/home/dd/engine/engine-private/postgresql-password`,
        );
        shellExec(`kubectl apply -k ./manifests/postgresql`);
      }
      if (options.mongodb4 === true) {
        if (options.pullImage === true) {
          shellExec(`docker pull mongo:4.4`);
          shellExec(`sudo kind load docker-image mongo:4.4`);
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
        shellExec(
          `sudo kubectl create secret generic mongodb-keyfile --from-file=/home/dd/engine/engine-private/mongodb-keyfile`,
        );
        shellExec(
          `sudo kubectl create secret generic mongodb-secret --from-file=username=/home/dd/engine/engine-private/mongodb-username --from-file=password=/home/dd/engine/engine-private/mongodb-password`,
        );
        shellExec(`kubectl delete statefulset mongodb`);
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

      if (options.full === true || options.contour === true)
        shellExec(`kubectl apply -f https://projectcontour.io/quickstart/contour.yaml`);

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
    reset() {
      shellExec(`kind get clusters | xargs -t -n1 kind delete cluster --name`);
      shellExec(`sudo kubeadm reset -f`);
      shellExec('sudo rm -f /etc/cni/net.d/10-flannel.conflist');
      shellExec('sudo iptables -F && sudo iptables -t nat -F && sudo iptables -t mangle -F && sudo iptables -X');
      shellExec('sudo rm -f $HOME/.kube/config');
      shellExec('sudo rm -rf /root/.local/share/Trash/files/*');
      shellExec('sudo docker system prune -a -f');
      shellExec('sudo service docker stop');
      shellExec(`sudo rm -rf /var/lib/containers/storage/*`);
      shellExec(`sudo rm -rf /var/lib/docker/volumes/*`);
      shellExec(`sudo rm -rf /var/lib/docker~/*`);
      shellExec(`sudo rm -rf /home/containers/storage/*`);
      shellExec(`sudo rm -rf /home/docker/*`);
      shellExec('sudo mv /var/lib/docker /var/lib/docker~');
      shellExec('sudo mkdir /home/docker');
      shellExec('sudo chmod 0711 /home/docker');
      shellExec('sudo ln -s /home/docker /var/lib/docker');
      shellExec(`sudo podman system prune -a -f`);
      shellExec(`sudo podman system prune --all --volumes --force`);
      shellExec(`sudo podman system prune --external --force`);
      shellExec(`sudo podman system prune --all --volumes --force`);
      shellExec(`sudo mkdir -p /home/containers/storage`);
      shellExec('sudo chmod 0711 /home/containers/storage');
      shellExec(
        `sudo sed -i -e "s@/var/lib/containers/storage@/home/containers/storage@g" /etc/containers/storage.conf`,
      );
      shellExec(`sudo podman system reset -f`);
      // https://github.com/kubernetes-sigs/kind/issues/2886
      shellExec(`sysctl net.bridge.bridge-nf-call-iptables=0`);
      shellExec(`sysctl net.bridge.bridge-nf-call-arptables=0`);
      shellExec(`sysctl net.bridge.bridge-nf-call-ip6tables=0`);
      shellExec(`docker network rm kind`);
    },
    getResourcesCapacity() {
      const resources = {};
      const info = true
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
        : shellExec(`kubectl describe node kind-worker | grep -E '(Allocatable:|Capacity:)' -A 6`, {
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
  };
}
export default UnderpostCluster;
