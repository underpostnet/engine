#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Underpost Kubeadm Node Setup (bare-metal physical node)
#
# Mirrors scripts/k3s-node-setup.sh but for kubeadm on real hardware: it runs on
# the freshly deployed OS (disk-installed Rocky) after first boot, installs NVM +
# Node.js, ensures the engine source is present, and drives the cluster bring-up
# through the local engine entrypoint `node bin cluster` (src/cli/cluster.js) —
# reusing its kubeadm + Contour + host-init logic instead of reimplementing it.
#
# Modes:
#   --control                 Initialize a new kubeadm control-plane (default).
#   --worker                  Join an existing cluster.
#
# Worker join (controller supplies this over SSH; no manual token paste):
#   --join-command="kubeadm join <ip>:6443 --token <t> --discovery-token-ca-cert-hash <h>"
#   or:  --control-ip=<ip> --token=<t> --discovery-token-ca-cert-hash=<h>
#
# Engine source / options:
#   --engine-root=<path>      Engine source path (default /home/dd/engine).
#   --engine-repo=<url>       Git repo cloned if the engine source is missing.
#   --engine-branch=<branch>  Branch to clone (default: repo default).
#   --no-contour              Control mode: skip the Contour ingress install.
# ---------------------------------------------------------------------------

ROLE="control"
JOIN_COMMAND=""
CONTROL_IP=""
TOKEN=""
CA_CERT_HASH=""
INSTALL_CONTOUR="1"
ENGINE_ROOT="/home/dd/engine"
ENGINE_REPO="https://github.com/underpostnet/engine.git"
ENGINE_BRANCH=""
CRI_SOCKET="unix:///var/run/crio/crio.sock"

for arg in "$@"; do
    case $arg in
        --control)                          ROLE="control" ;;
        --worker)                           ROLE="worker" ;;
        --join-command=*)                   JOIN_COMMAND="${arg#*=}" ;;
        --control-ip=*)                     CONTROL_IP="${arg#*=}" ;;
        --token=*)                          TOKEN="${arg#*=}" ;;
        --discovery-token-ca-cert-hash=*)   CA_CERT_HASH="${arg#*=}" ;;
        --engine-root=*)                    ENGINE_ROOT="${arg#*=}" ;;
        --engine-repo=*)                    ENGINE_REPO="${arg#*=}" ;;
        --engine-branch=*)                  ENGINE_BRANCH="${arg#*=}" ;;
        --no-contour)                       INSTALL_CONTOUR="0" ;;
    esac
done

log() { echo "$(date): [kubeadm-setup] $*"; }

# ---------------------------------------------------------------------------
# 1. NVM and Node.js — required for the `node bin ...` entrypoints
# ---------------------------------------------------------------------------
log "Installing NVM and Node.js v24.15.0..."
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

Bringing up underpost kubeadm node (role=$ROLE) from $ENGINE_ROOT
"

# ---------------------------------------------------------------------------
# 2. Engine source — required by `node bin cluster` (manifests + CLI)
# ---------------------------------------------------------------------------
if [ ! -d "$ENGINE_ROOT" ] || [ -z "$(ls -A "$ENGINE_ROOT" 2>/dev/null)" ]; then
    log "Engine source missing at $ENGINE_ROOT; cloning $ENGINE_REPO ..."
    command -v git >/dev/null 2>&1 || sudo dnf install -y git
    if [ -n "$ENGINE_BRANCH" ]; then
        git clone --depth 1 --branch "$ENGINE_BRANCH" "$ENGINE_REPO" "$ENGINE_ROOT"
    else
        git clone --depth 1 "$ENGINE_REPO" "$ENGINE_ROOT"
    fi
fi

cd "$ENGINE_ROOT"

# Install JS deps and generate secrets using the local engine entrypoint.
npm install
npm install -g underpost
node bin run secret

# ---------------------------------------------------------------------------
# 3. Host prerequisites (Docker, CRI-O, kubelet/kubeadm/kubectl, ...) via cluster.js
# ---------------------------------------------------------------------------
log "Installing Kubernetes host prerequisites (underpost cluster --init-host)..."
node bin cluster --dev --init-host

# ---------------------------------------------------------------------------
# 4. Role-specific bring-up, fully delegated to src/cli/cluster.js
# ---------------------------------------------------------------------------
if [ "$ROLE" = "control" ]; then
    if [ "$INSTALL_CONTOUR" = "1" ]; then
        log "Initializing kubeadm control-plane + Contour (underpost cluster --kubeadm --contour)..."
        node bin cluster --dev --kubeadm --contour
    else
        log "Initializing kubeadm control-plane (underpost cluster --kubeadm)..."
        node bin cluster --dev --kubeadm
    fi

    echo ""
    log "Control-plane ready. Join command for workers:"
    sudo kubeadm token create --print-join-command

elif [ "$ROLE" = "worker" ]; then
    if [ -z "$JOIN_COMMAND" ]; then
        if [ -n "$CONTROL_IP" ] && [ -n "$TOKEN" ] && [ -n "$CA_CERT_HASH" ]; then
            JOIN_COMMAND="kubeadm join ${CONTROL_IP}:6443 --token ${TOKEN} --discovery-token-ca-cert-hash ${CA_CERT_HASH}"
        else
            echo "ERROR: worker mode needs --join-command=... OR --control-ip/--token/--discovery-token-ca-cert-hash" >&2
            exit 1
        fi
    fi

    # Apply the same host configuration cluster.js uses (SELinux, swap, sysctl),
    # then the pod-network kernel prereqs kubeadm join needs (the control path
    # gets these from natSetup; workers set them here).
    log "Applying host configuration (underpost cluster --config)..."
    node bin cluster --dev --config
    sudo modprobe br_netfilter || true
    printf 'net.bridge.bridge-nf-call-iptables = 1\nnet.bridge.bridge-nf-call-ip6tables = 1\nnet.ipv4.ip_forward = 1\n' \
        | sudo tee /etc/sysctl.d/99-kubernetes.conf >/dev/null
    sudo sysctl --system >/dev/null 2>&1 || true

    log "Joining cluster: ${JOIN_COMMAND%% --token*} ..."
    sudo ${JOIN_COMMAND} --cri-socket="${CRI_SOCKET}"
    log "Worker joined the cluster."
fi

log "kubeadm ${ROLE} setup complete."
