#!/bin/bash

set -e

# Expand /dev/sda2 partition and resize filesystem automatically

# Check if parted is installed
if ! command -v parted &>/dev/null; then
    echo "parted not found, installing..."
    dnf install -y parted
fi

# Get start sector of /dev/sda2
START_SECTOR=$(parted /dev/sda -ms unit s print | awk -F: '/^2:/{print $2}' | sed 's/s//')

# Resize the partition
parted /dev/sda ---pretend-input-tty <<EOF
unit s
resizepart 2 100%
Yes
quit
EOF

# Resize the filesystem
resize2fs /dev/sda2

echo "Disk and filesystem resized successfully."
sudo dnf install -y tar
sudo dnf install -y bzip2
sudo dnf install -y git
sudo dnf -y update
sudo dnf -y install epel-release
sudo dnf install -y ufw
sudo systemctl enable --now ufw
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
nvm install 23.8.0
nvm use 23.8.0
echo "
██╗░░░██╗███╗░░██╗██████╗░███████╗██████╗░██████╗░░█████╗░░██████╗████████╗
██║░░░██║████╗░██║██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
██║░░░██║██╔██╗██║██║░░██║█████╗░░██████╔╝██████╔╝██║░░██║╚█████╗░░░░██║░░░
██║░░░██║██║╚████║██║░░██║██╔══╝░░██╔══██╗██╔═══╝░██║░░██║░╚═══██╗░░░██║░░░
╚██████╔╝██║░╚███║██████╔╝███████╗██║░░██║██║░░░░░╚█████╔╝██████╔╝░░░██║░░░
░╚═════╝░╚═╝░░╚══╝╚═════╝░╚══════╝╚═╝░░╚═╝╚═╝░░░░░░╚════╝░╚═════╝░░░░╚═╝░░░

Installing underpost k8s node ...

"
npm install -g underpost
chmod +x /root/.nvm/versions/node/v23.8.0/bin/underpost
sudo modprobe br_netfilter
mkdir -p /home/dd
cd $(underpost root)/underpost
underpost cluster --init-host

# Default flags
USE_KUBEADM=false
USE_KIND=false
USE_WORKER=false

# Loop through arguments
for arg in "$@"; do
    case "$arg" in
    --kubeadm)
        USE_KUBEADM=true
        ;;
    --kind)
        USE_KIND=true
        ;;
    --worker)
        USE_WORKER=true
        ;;
    esac
done

echo "USE_KUBEADM = $USE_KUBEADM"
echo "USE_KIND   = $USE_KIND"
echo "USE_WORKER = $USE_WORKER"

underpost cluster --kubeadm
underpost cluster --reset

PORTS=(
    22    # SSH
    80    # HTTP
    443   # HTTPS
    53    # DNS (TCP/UDP)
    66    # TFTP
    67    # DHCP
    69    # TFTP
    111   # rpcbind
    179   # Calico BGP
    2049  # NFS
    20048 # NFS mountd
    4011  # PXE boot
    5240  # snapd API
    5248  # Juju controller
    6443  # Kubernetes API
    9153  # CoreDNS metrics
    10250 # Kubelet API
    10251 # kube-scheduler
    10252 # kube-controller-manager
    10255 # Kubelet read-only (deprecated)
    10257 # controller-manager (v1.23+)
    10259 # scheduler (v1.23+)
)

PORT_RANGES=(
    2379:2380 # etcd
    # 30000:32767 # NodePort range
    # 3000:3100 # App node ports
    32765:32766 # Ephemeral ports
    6783:6784   # Weave Net
)

# Open individual ports
for PORT in "${PORTS[@]}"; do
    ufw allow ${PORT}/tcp
    ufw allow ${PORT}/udp
done

# Open port ranges
for RANGE in "${PORT_RANGES[@]}"; do
    ufw allow ${RANGE}/tcp
    ufw allow ${RANGE}/udp
done

# Behavior based on flags
if $USE_KUBEADM; then
    echo "Running control node with kubeadm..."
    underpost cluster --kubeadm
    # kubectl get pods --all-namespaces -o wide -w
fi

if $USE_KIND; then
    echo "Running control node with kind..."
    underpost cluster
    # kubectl get pods --all-namespaces -o wide -w
fi

if $USE_WORKER; then
    echo "Running worker..."
    underpost cluster --worker --config
fi
