import { shellExec } from '../server/process.js';

class UnderpostCluster {
  static API = {
    init() {
      shellExec(`containerd config default > /etc/containerd/config.toml`);
      shellExec(`sed -i -e "s/SystemdCgroup = false/SystemdCgroup = true/g" /etc/containerd/config.toml`);
      shellExec(`cp /etc/kubernetes/admin.conf ~/.kube/config`);
      shellExec(`sudo systemctl restart kubelet`);
      shellExec(`sudo service docker restart`);
      shellExec(`sudo chown $(id -u):$(id -g) $HOME/.kube/config**`);
      shellExec(`cd ./manifests && kind create cluster --config kind-config.yaml`);
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
