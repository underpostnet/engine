import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';

const logger = loggerFactory(import.meta);

class UnderpostCluster {
  static API = {
    init(options = { valkey: false, mariadb: false, valkey: false, full: false }) {
      const testClusterInit = shellExec(`kubectl get pods --all-namespaces -o wide`, {
        disableLogging: true,
        silent: true,
        stdout: true,
      });
      if (!(testClusterInit.match('kube-system') && testClusterInit.match('kube-proxy'))) {
        shellExec(`containerd config default > /etc/containerd/config.toml`);
        shellExec(`sed -i -e "s/SystemdCgroup = false/SystemdCgroup = true/g" /etc/containerd/config.toml`);
        shellExec(`cp /etc/kubernetes/admin.conf ~/.kube/config`);
        shellExec(`sudo systemctl restart kubelet`);
        shellExec(`sudo service docker restart`);
        shellExec(`sudo chown $(id -u):$(id -g) $HOME/.kube/config**`);
        shellExec(`cd ./manifests && kind create cluster --config kind-config.yaml`);
      } else logger.warn('Cluster already initialized');

      if (options.full || options.valkey) shellExec(`kubectl apply -k ./manifests/valkey`);

      if (options.full || options.mariadb) {
        shellExec(
          `sudo kubectl create secret generic mariadb-secret --from-file=username=/home/dd/engine/engine-private/mariadb-username --from-file=password=/home/dd/engine/engine-private/mariadb-password`,
        );
        shellExec(
          `sudo kubectl create secret generic github-secret --from-literal=GITHUB_TOKEN=${process.env.GITHUB_TOKEN}`,
        );
        shellExec(`kubectl apply -k ./manifests/mariadb`);
      }
      if (options.full || options.mongodb) {
        shellExec(
          `sudo kubectl create secret generic mongodb-keyfile --from-file=/home/dd/engine/engine-private/mongodb-keyfile`,
        );
        shellExec(
          `sudo kubectl create secret generic mongodb-secret --from-file=username=/home/dd/engine/engine-private/mongodb-username --from-file=password=/home/dd/engine/engine-private/mongodb-password`,
        );
        shellExec(`kubectl apply -k ./manifests/mongodb`);
      }

      if (options.full || options.contour)
        shellExec(`kubectl apply -f https://projectcontour.io/quickstart/contour.yaml`);
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
