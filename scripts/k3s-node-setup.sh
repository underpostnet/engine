#!/bin/bash
set -e

# ---------------------------------------------------------------------------
# Underpost K3s Node Setup
# Usage:
#   --control                   Initialize as K3s control plane node (default)
#   --worker                    Initialize as K3s worker node
#   --control-ip=<ip>           Control plane IP (required for --worker)
#   --token=<token>             K3s node token (required for --worker)
#
# DESIGN NOTES:
# - This script installs the underpost CLI globally via npm.
# - It then uses the global CLI binary for configuration and K3s setup.
# - Engine source replication (e.g. via --bootstrap-engine from the host)
#   is a SEPARATE step. This script does NOT depend on /home/dd/engine
#   being pre-pushed. Use --bootstrap-engine after --init-vm completes.
# ---------------------------------------------------------------------------

ROLE="control"
CONTROL_IP=""
K3S_TOKEN=""

for arg in "$@"; do
  case $arg in
    --worker)         ROLE="worker" ;;
    --control)        ROLE="control" ;;
    --control-ip=*)   CONTROL_IP="${arg#*=}" ;;
    --token=*)        K3S_TOKEN="${arg#*=}" ;;
  esac
done
# ---------------------------------------------------------------------------
# NVM and Node.js
# ---------------------------------------------------------------------------
echo "Installing NVM and Node.js v24.10.0..."

curl -o- https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.40.1/install.sh | bash

export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 24.15.0
nvm use 24.15.0

echo "
██╗░░░██╗███╗░░██╗██████╗░███████╗██████╗░██████╗░░█████╗░░██████╗████████╗
██║░░░██║████╗░██║██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
██║░░░██║██╔██╗██║██║░░██║█████╗░░██████╔╝██████╔╝██║░░██║╚█████╗░░░░██║░░░
██║░░░██║██║╚████║██║░░██║██╔══╝░░██╔══██╗██╔═══╝░██║░░██║░╚═══██╗░░░██║░░░
╚██████╔╝██║░╚███║██████╔╝███████╗██║░░██║██║░░░░░╚█████╔╝██████╔╝░░░██║░░░
░╚═════╝░╚═╝░░╚══╝╚═════╝░╚══════╝╚═╝░░╚═╝╚═╝░░░░░░╚════╝░╚═════╝░░░░╚═╝░░░

Installing underpost VM node...
"

npm install -g underpost

echo "Applying host configuration..."

# Use the globally installed underpost CLI
# NOTE: --dev is used to match the host dev context
underpost cluster --dev --config

# Check if /home/dd/engine exists locally for engine-specific operations.
# This directory is populated by the host running --bootstrap-engine.
# If absent, the global underpost CLI handles all operations.
if [ -d /home/dd/engine ]; then
  echo "Local engine source found at /home/dd/engine. Using local underpost."
  cd /home/dd/engine
  npm install
  node bin run secret
else
  echo "No local engine source at /home/dd/engine. Using global underpost CLI."
  echo "Engine source can be replicated later with --bootstrap-engine from the host."
  # The globally installed underpost handles secret generation via its own config
  underpost secret underpost --init
fi

if [ "$ROLE" = "control" ]; then
  echo "Initializing K3s control plane..."
  # Use global underpost CLI for K3s setup
  underpost cluster --dev --k3s

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

  echo "Joining K3s cluster at https://${CONTROL_IP}:6443..."
  curl -sfL https://get.k3s.io | \
    K3S_URL="https://${CONTROL_IP}:6443" \
    K3S_TOKEN="${K3S_TOKEN}" \
    sh -s - agent

  echo ""
  echo "K3s worker node joined the cluster at https://${CONTROL_IP}:6443 successfully."
  sudo systemctl status k3s-agent --no-pager
fi