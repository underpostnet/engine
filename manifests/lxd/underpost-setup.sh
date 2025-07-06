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

underpost cluster --kubeadm
underpost --reset

# Behavior based on flags
if $USE_KUBEADM; then
    echo "Running control node with kubeadm..."
    underpost cluster --kubeadm
    kubectl get pods --all-namespaces -o wide -w
fi

if $USE_KIND; then
    echo "Running control node with kind..."
    underpost cluster
    kubectl get pods --all-namespaces -o wide -w
fi

if $USE_WORKER; then
    echo "Running worker..."
    underpost cluster --worker --config
fi
