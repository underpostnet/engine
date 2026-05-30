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
# NVM and Node.js — required for `node bin ...` entrypoints
# ---------------------------------------------------------------------------
echo "Installing NVM and Node.js v24.15.0..."

curl -o- https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.40.1/install.sh | bash

export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 24.15.0
nvm use 24.15.0
nvm alias default 24.15.0
ln -sf "$(command -v node)" /usr/local/bin/node
ln -sf "$(command -v npm)" /usr/local/bin/npm
ln -sf "$(command -v npx)" /usr/local/bin/npx

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
node bin run secret

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
    sh -s - agent
    
    echo ""
    echo "K3s worker joined https://${CONTROL_IP}:6443 successfully."
    sudo systemctl status k3s-agent --no-pager
fi
