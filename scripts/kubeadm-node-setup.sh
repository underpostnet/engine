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
# Private repo holding secrets (engine-private/conf/.../.env.production) cloned
# with a GitHub token. GITHUB_TOKEN/GITHUB_USERNAME come from the environment
# (passed over SSH by the controller) or the --github-* args.
ENGINE_PRIVATE_REPO="https://github.com/underpostnet/engine-private.git"
ENGINE_PRIVATE_BRANCH=""
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_USERNAME="${GITHUB_USERNAME:-}"
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
        --engine-private-repo=*)            ENGINE_PRIVATE_REPO="${arg#*=}" ;;
        --engine-private-branch=*)          ENGINE_PRIVATE_BRANCH="${arg#*=}" ;;
        --github-token=*)                   GITHUB_TOKEN="${arg#*=}" ;;
        --github-username=*)                GITHUB_USERNAME="${arg#*=}" ;;
        --no-contour)                       INSTALL_CONTOUR="0" ;;
    esac
done

log() { echo "$(date): [kubeadm-setup] $*"; }

# ---------------------------------------------------------------------------
# 0. Base prerequisites — a minimal @core Rocky install lacks tar/xz/git, which
#    NVM needs to extract Node.js and the engine clone needs. Install them first.
# ---------------------------------------------------------------------------
log "Installing base prerequisites (tar, xz, gzip, git, curl)..."
sudo dnf install -y tar xz gzip bzip2 git curl ca-certificates which findutils 2>/dev/null \
|| dnf install -y tar xz gzip bzip2 git curl ca-certificates which findutils

# ---------------------------------------------------------------------------
# 1. NVM and Node.js — required for the `node bin ...` entrypoints. Idempotent so
#    a retried run does not reinstall Node from scratch.
# ---------------------------------------------------------------------------
if command -v node >/dev/null 2>&1 && node --version 2>/dev/null | grep -q '^v24'; then
    log "Node.js $(node --version) already installed; skipping NVM setup"
else
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
fi

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
# 2. Engine source — required by `node bin cluster` (manifests + CLI).
#    Normalizes any (custom-named) repo into the canonical paths, mirroring
#    src/server/start.js: clone into a temp dir then copy the contents into the
#    target, so the working tree is always $ENGINE_ROOT regardless of repo name.
# ---------------------------------------------------------------------------
command -v git >/dev/null 2>&1 || sudo dnf install -y git

# clone_normalize <repo-url> <branch> <target-dir> [mask-secret]
# Clones into a temp dir and copies the contents to <target-dir> so a custom
# repo (e.g. engine-test-test) always lands at the canonical path. [mask-secret]
# is redacted from any logged output.
clone_normalize() {
    # Defaulted so optional args don't trip `set -u` (nounset).
    local url="${1:-}" branch="${2:-}" target="${3:-}" mask="${4:-}"
    if [ -d "$target" ] && [ -n "$(ls -A "$target" 2>/dev/null)" ]; then
        log "$target already present; skipping clone"
        return 0
    fi
    local tmp; tmp="$(mktemp -d)"
    local ok=0
    if [ -n "$branch" ]; then
        if [ -n "$mask" ]; then git clone --depth 1 --branch "$branch" "$url" "$tmp/repo" 2>&1 | sed "s/${mask}/***/g"; ok=${PIPESTATUS[0]}; else git clone --depth 1 --branch "$branch" "$url" "$tmp/repo"; ok=$?; fi
    else
        if [ -n "$mask" ]; then git clone --depth 1 "$url" "$tmp/repo" 2>&1 | sed "s/${mask}/***/g"; ok=${PIPESTATUS[0]}; else git clone --depth 1 "$url" "$tmp/repo"; ok=$?; fi
    fi
    if [ "$ok" -ne 0 ] || [ ! -d "$tmp/repo" ]; then
        rm -rf "$tmp"
        return 1
    fi
    mkdir -p "$target"
    cp -a "$tmp/repo/." "$target/"
    rm -rf "$tmp"
}

if [ ! -d "$ENGINE_ROOT" ] || [ -z "$(ls -A "$ENGINE_ROOT" 2>/dev/null)" ]; then
    if [ -n "$GITHUB_TOKEN" ]; then
        log "Engine source missing at $ENGINE_ROOT; cloning + normalizing (authenticated) $ENGINE_REPO -> $ENGINE_ROOT ..."
        ENGINE_REPO_URL="https://${GITHUB_USERNAME:-x-access-token}:${GITHUB_TOKEN}@${ENGINE_REPO#https://}"
    else
        log "Engine source missing at $ENGINE_ROOT; cloning + normalizing $ENGINE_REPO -> $ENGINE_ROOT ..."
        ENGINE_REPO_URL="$ENGINE_REPO"
    fi
    clone_normalize "$ENGINE_REPO_URL" "$ENGINE_BRANCH" "$ENGINE_ROOT" "$GITHUB_TOKEN" || { log "FATAL: engine clone failed"; exit 1; }
    # Drop the token from the remote URL so it is not persisted on disk.
    git -C "$ENGINE_ROOT" remote set-url origin "$ENGINE_REPO" 2>/dev/null || true
fi

cd "$ENGINE_ROOT"

# Clone + normalize the private secrets repo into $ENGINE_ROOT/engine-private
# (where `node bin run secret` reads engine-private/conf/.../.env.production),
# regardless of the private repo's name. The token is masked in logs and then
# stripped from the saved remote URL.
if [ ! -d "$ENGINE_ROOT/engine-private" ] || [ -z "$(ls -A "$ENGINE_ROOT/engine-private" 2>/dev/null)" ]; then
    if [ -n "$GITHUB_TOKEN" ]; then
        log "Cloning + normalizing engine-private (secrets) -> $ENGINE_ROOT/engine-private ..."
        PRIV_URL="https://${GITHUB_USERNAME:-x-access-token}:${GITHUB_TOKEN}@${ENGINE_PRIVATE_REPO#https://}"
        if clone_normalize "$PRIV_URL" "$ENGINE_PRIVATE_BRANCH" "$ENGINE_ROOT/engine-private" "$GITHUB_TOKEN"; then
            # Drop the token from the remote URL so it is not persisted on disk.
            git -C "$ENGINE_ROOT/engine-private" remote set-url origin "$ENGINE_PRIVATE_REPO" 2>/dev/null || true
        else
            log "WARNING: engine-private clone failed — secrets will be unavailable"
        fi
    else
        log "WARNING: GITHUB_TOKEN not provided; engine-private not cloned — secrets will be unavailable"
    fi
fi

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
