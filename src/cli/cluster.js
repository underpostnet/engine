import { timer } from '../client/components/core/CommonJs.js';
import { cliSpinner } from '../server/conf.js';
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
        valkey: false,
        mariadb: false,
        valkey: false,
        full: false,
        info: false,
        certManager: false,
        listPods: false,
        reset: false,
        nsUse: '',
      },
    ) {
      if (options.reset === true) return await UnderpostCluster.API.reset();
      if (options.listPods === true) return console.table(UnderpostDeploy.API.getPods(podName ?? undefined));

      if (options.nsUse) {
        shellExec(`kubectl config set-context --current --namespace=${options.nsUse}`);
        return;
      }
      if (options.info) {
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
        return;
      }
      const testClusterInit = shellExec(`kubectl get pods --all-namespaces -o wide`, {
        disableLog: true,
        silent: true,
        stdout: true,
      });
      if (!(testClusterInit.match('kube-system') && testClusterInit.match('kube-proxy'))) {
        shellExec(`containerd config default > /etc/containerd/config.toml`);
        shellExec(`sed -i -e "s/SystemdCgroup = false/SystemdCgroup = true/g" /etc/containerd/config.toml`);
        // shellExec(`cp /etc/kubernetes/admin.conf ~/.kube/config`);
        shellExec(`sudo systemctl restart kubelet`);
        shellExec(`sudo service docker restart`);
        shellExec(`cd ./manifests && kind create cluster --config kind-config.yaml`);
        shellExec(`sudo chown $(id -u):$(id -g) $HOME/.kube/config**`);
      } else logger.warn('Cluster already initialized');

      if (options.full || options.valkey) {
        shellExec(`kubectl delete statefulset service-valkey`);
        shellExec(`kubectl apply -k ./manifests/valkey`);
      }
      if (options.full || options.mariadb) {
        shellExec(
          `sudo kubectl create secret generic mariadb-secret --from-file=username=/home/dd/engine/engine-private/mariadb-username --from-file=password=/home/dd/engine/engine-private/mariadb-password`,
        );
        shellExec(
          `sudo kubectl create secret generic github-secret --from-literal=GITHUB_TOKEN=${process.env.GITHUB_TOKEN}`,
        );
        shellExec(`kubectl delete statefulset mariadb-statefulset`);
        shellExec(`kubectl apply -k ./manifests/mariadb`);
      }
      if (options.full || options.mongodb) {
        shellExec(
          `sudo kubectl create secret generic mongodb-keyfile --from-file=/home/dd/engine/engine-private/mongodb-keyfile`,
        );
        shellExec(
          `sudo kubectl create secret generic mongodb-secret --from-file=username=/home/dd/engine/engine-private/mongodb-username --from-file=password=/home/dd/engine/engine-private/mongodb-password`,
        );
        shellExec(`kubectl delete statefulset mongodb`);
        shellExec(`kubectl apply -k ./manifests/mongodb`);

        await UnderpostTest.API.podStatusMonitor('mongodb-1');

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

      if (options.full || options.contour)
        shellExec(`kubectl apply -f https://projectcontour.io/quickstart/contour.yaml`);

      if (options.full || options.certManager) {
        if (!UnderpostDeploy.API.getPods('cert-manager').find((p) => p.STATUS === 'Running')) {
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
        shellExec(`sudo kubectl apply -f ./manifests/${letsEncName}.yaml`);
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
    },
  };
}
export default UnderpostCluster;
