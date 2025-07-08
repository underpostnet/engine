#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "Starting Underpost Kubernetes Node Setup for Production (Kubeadm Use Case)..."

# --- Disk Partition Resizing (Keep as is, seems functional) ---
echo "Expanding /dev/sda2 partition and resizing filesystem..."

# Check if parted is installed
if ! command -v parted &>/dev/null; then
    echo "parted not found, installing..."
    sudo dnf install -y parted
fi

# Get start sector of /dev/sda2
START_SECTOR=$(sudo parted /dev/sda -ms unit s print | awk -F: '/^2:/{print $2}' | sed 's/s//')

# Resize the partition
# Using 'sudo' for parted commands
sudo parted /dev/sda ---pretend-input-tty <<EOF
unit s
resizepart 2 100%
Yes
quit
EOF

# Resize the filesystem
sudo resize2fs /dev/sda2

echo "Disk and filesystem resized successfully."

# --- Essential System Package Installation ---
echo "Installing essential system packages..."
sudo dnf install -y tar bzip2 git epel-release

# Perform a system update to ensure all packages are up-to-date
sudo dnf -y update

# --- NVM and Node.js Installation ---
echo "Installing NVM and Node.js v23.8.0..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Load nvm for the current session
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
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

Installing underpost k8s node...
"

# Install underpost globally
npm install -g underpost

# Ensure underpost executable is in PATH and has execute permissions
# Adjusting this for global npm install which usually handles permissions
# If you still face issues, ensure /root/.nvm/versions/node/v23.8.0/bin is in your PATH
# For global installs, it's usually handled automatically.
# chmod +x /root/.nvm/versions/node/v23.8.0/bin/underpost # This might not be necessary for global npm installs

# --- Kernel Module for Bridge Filtering ---
# This is crucial for Kubernetes networking (CNI)
echo "Loading br_netfilter kernel module..."
sudo modprobe br_netfilter

# --- Initial Host Setup for Kubernetes Prerequisites ---
# This calls the initHost method in cluster.js to install Docker, Podman, Kind, Kubeadm, Helm.
echo "Running initial host setup for Kubernetes prerequisites..."
# Ensure the current directory is where 'underpost' expects its root, or use absolute paths.
# Assuming 'underpost root' correctly points to the base directory of your project.
cd "$(underpost root)/underpost"
underpost cluster --init-host

# --- Argument Parsing for Kubeadm/Kind/Worker ---
USE_KUBEADM=false
USE_KIND=false # Not the primary focus for this request, but keeping the logic
USE_WORKER=false

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
echo "USE_KIND     = $USE_KIND"
echo "USE_WORKER   = $USE_WORKER"

# --- Kubernetes Cluster Initialization Logic ---

# Apply host configuration (SELinux, Containerd, Sysctl, and now firewalld disabling)
echo "Applying Kubernetes host configuration (SELinux, Containerd, Sysctl, Firewalld)..."
underpost cluster --config

if $USE_KUBEADM; then
    if $USE_WORKER; then
        echo "Running worker node setup for kubeadm..."
        # For worker nodes, the 'underpost cluster --worker' command will handle joining
        # the cluster. The join command itself needs to be provided from the control plane.
        # This script assumes the join command will be executed separately or passed in.
        # For a full automated setup, you'd typically pass the join token/command here.
        # Example: underpost cluster --worker --join-command "kubeadm join ..."
        # For now, this just runs the worker-specific config.
        underpost cluster --worker
        underpost cluster --chown
        echo "Worker node setup initiated. You will need to manually join this worker to your control plane."
        echo "On your control plane, run 'kubeadm token create --print-join-command' and execute the output here."
    else
        echo "Running control plane setup with kubeadm..."
        # This will initialize the kubeadm control plane and install Calico
        underpost cluster --kubeadm
        echo "Kubeadm control plane initialized. Check cluster status with 'kubectl get nodes'."
    fi
elif $USE_KIND; then
    echo "Running control node with kind..."
    underpost cluster
    echo "Kind cluster initialized. Check cluster status with 'kubectl get nodes'."
else
    echo "No specific cluster role (--kubeadm, --kind, --worker) specified. Please provide one."
    exit 1
fi

echo "Underpost Kubernetes Node Setup completed."
echo "Remember to verify cluster health with 'kubectl get nodes' and 'kubectl get pods --all-namespaces'."
