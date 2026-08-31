#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Underpost K3s Node Setup
#
# This script runs INSIDE an LXD VM. It assumes the host has already mirrored
# the project source into $ENGINE_ROOT (default /home/dd/engine) via the
# `underpost lxd [vm-id] --vm-init` flow in `src/cli/lxd.js`. There is no
# fallback to a globally installed `underpost`: every operational command
# resolves from the local project so the latest local changes are always what
# runs in the VM.
#
# Usage:
#   --engine-root=<path>   Path to the mirrored engine source (default: /home/dd/engine)
#   --control              Initialize as K3s control plane node (default)
#   --worker               Initialize as K3s worker node
#   --control-ip=<ip>      Control plane IP (required for --worker)
#   --token=<token>        K3s node token (required for --worker)
# ---------------------------------------------------------------------------

ROLE="control"
CONTROL_IP=""
K3S_TOKEN=""
ENGINE_ROOT="/home/dd/engine"

for arg in "$@"; do
    case $arg in
        --worker)         ROLE="worker" ;;
        --control)        ROLE="control" ;;
        --control-ip=*)   CONTROL_IP="${arg#*=}" ;;
        --token=*)        K3S_TOKEN="${arg#*=}" ;;
        --engine-root=*)  ENGINE_ROOT="${arg#*=}" ;;
    esac
done

# Fail fast if the bootstrap step did not run / left the directory empty.
# Split into two checks so `ls -A` only runs against a path that exists; this
# avoids needing an error-swallowing redirect.
if [ ! -d "$ENGINE_ROOT" ]; then
    echo "ERROR: engine source directory $ENGINE_ROOT does not exist."
    echo "The LXD [vm-id] --vm-init flow must mirror the project here before running this script."
    exit 1
fi
if [ -z "$(ls -A "$ENGINE_ROOT")" ]; then
    echo "ERROR: engine source directory $ENGINE_ROOT is empty."
    echo "The LXD [vm-id] --vm-init flow must mirror the project here before running this script."
    exit 1
fi

# ---------------------------------------------------------------------------
# System-wide Node.js is required by service units under SELinux.
#
# RHEL/Rocky only. An underpost node is an SELinux-Enforcing RHEL host: the storage labeling,
# the systemd units and the CRI bring-up below are all written against that policy, so a
# package manager that is merely present is not evidence the rest of this script applies.
# Commissioning a Debian/Ubuntu machine that is not an underpost node is `underpost baremetal`.
# ---------------------------------------------------------------------------
if ! command -v dnf >/dev/null 2>&1; then
    echo "ERROR: underpost nodes are RHEL/Rocky only; dnf was not found" >&2
    exit 1
fi

sudo dnf install -y policycoreutils policycoreutils-python-utils selinux-policy-targeted audit rsync

# `command -v node` is not the question this step asks: an nvm runtime under $HOME answers it and
# is exactly what a unit cannot execute. Only a Node 24 at a system path counts.
system_node_path() {
    local candidate
    for candidate in /usr/bin/node /usr/local/bin/node /bin/node; do
        if [ -x "$candidate" ] && "$candidate" --version 2>/dev/null | grep -q '^v24'; then
            printf '%s' "$candidate"
            return 0
        fi
    done
    return 1
}

if ! system_node_path >/dev/null; then
    echo "Installing system-wide Node.js 24..."
    curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
    sudo dnf install -y nodejs
fi

echo "
██╗░░░██╗███╗░░██╗██████╗░███████╗██████╗░██████╗░░█████╗░░██████╗████████╗
██║░░░██║████╗░██║██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
██║░░░██║██╔██╗██║██║░░██║█████╗░░██████╔╝██████╔╝██║░░██║╚█████╗░░░░██║░░░
██║░░░██║██║╚████║██║░░██║██╔══╝░░██╔══██╗██╔═══╝░██║░░██║░╚═══██╗░░░██║░░░
╚██████╔╝██║░╚███║██████╔╝███████╗██║░░██║██║░░░░░╚█████╔╝██████╔╝░░░██║░░░
░╚═════╝░╚═╝░░╚══╝╚═════╝░╚══════╝╚═╝░░╚═╝╚═╝░░░░░░╚════╝░╚═════╝░░░░╚═╝░░░

Bringing up underpost VM node from $ENGINE_ROOT (role=$ROLE)
"

cd "$ENGINE_ROOT"

# Install JS deps and generate secrets using the local engine entrypoint only.
npm install
# Cluster Secret administration is a control-plane capability, not part of node bring-up.

if [ "$ROLE" = "control" ]; then
    echo "Installing underpost CLI..."
    npm install -g underpost
    underpost --version
    echo "Initializing K3s control plane via local engine..."
    node bin cluster --dev --k3s
    ln -s /usr/local/bin/k3s /bin/k3s
    ln -s /usr/local/bin/kubectl /bin/kubectl
    
    echo ""
    echo "K3s control plane is ready."
    echo "Node token (share with workers to join this cluster):"
    sudo cat /var/lib/rancher/k3s/server/node-token
    echo ""
    echo "Control plane IP addresses:"
    ip -4 addr show scope global | grep inet | awk '{print $2}' | cut -d/ -f1
    
    elif [ "$ROLE" = "worker" ]; then
    if [ -z "$CONTROL_IP" ] || [ -z "$K3S_TOKEN" ]; then
        echo "ERROR: --control-ip and --token are required for worker role."
        echo "Usage: bash k3s-node-setup.sh --worker --control-ip=<ip> --token=<token>"
        exit 1
    fi
    
    # Worker nodes still need the minimal K3s host prep even though they join via
    # the upstream installer rather than `node bin cluster --k3s`.
    echo "Applying minimal K3s host configuration via local engine..."
    node bin cluster --dev --config --k3s
    
    echo "Joining K3s cluster at https://${CONTROL_IP}:6443..."
    curl -sfL https://get.k3s.io | \
    K3S_URL="https://${CONTROL_IP}:6443" \
    K3S_TOKEN="${K3S_TOKEN}" \
    sh -s - agent $(if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then printf '%s' '--selinux'; fi)
    
    echo ""
    echo "K3s worker joined https://${CONTROL_IP}:6443 successfully."
    sudo systemctl status k3s-agent --no-pager
fi
