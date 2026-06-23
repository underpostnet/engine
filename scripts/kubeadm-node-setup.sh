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
CONTROL_ENDPOINT_HOST=""
TOKEN=""
CA_CERT_HASH=""
JOIN_ONLY="0"
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
        --control-endpoint-host=*)          CONTROL_ENDPOINT_HOST="${arg#*=}" ;;
        --token=*)                          TOKEN="${arg#*=}" ;;
        --discovery-token-ca-cert-hash=*)   CA_CERT_HASH="${arg#*=}" ;;
        --join-only)                        JOIN_ONLY="1" ;;
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

# worker_join: lightweight, idempotent kubeadm join. Centralizes the join logic
# used by both the full worker flow and the --join-only short-circuit. Returns
# non-zero on failure so `set -e` aborts the script (no false-positive success).
worker_join() {
    if [ -z "$JOIN_COMMAND" ]; then
        if [ -n "$CONTROL_IP" ] && [ -n "$TOKEN" ] && [ -n "$CA_CERT_HASH" ]; then
            JOIN_COMMAND="kubeadm join ${CONTROL_IP}:6443 --token ${TOKEN} --discovery-token-ca-cert-hash ${CA_CERT_HASH}"
        else
            echo "ERROR: worker mode needs --join-command=... OR --control-ip/--token/--discovery-token-ca-cert-hash" >&2
            return 1
        fi
    fi

    command -v kubeadm >/dev/null 2>&1 || {
        echo "ERROR: kubeadm not found on node. Run a full (non --join-only) setup first." >&2
        return 1
    }

    # Make the control-plane endpoint hostname resolve to the control IP. kubeadm
    # reads the cluster-info / kubeadm-config ConfigMaps whose server URL is the
    # control-plane endpoint (often 'localhost.localdomain:6443'); without this the
    # worker dials [::1]:6443 and fails with "connection refused".
    if [ -n "$CONTROL_ENDPOINT_HOST" ] && [ -n "$CONTROL_IP" ] && [ "$CONTROL_ENDPOINT_HOST" != "$CONTROL_IP" ]; then
        log "Mapping control-plane endpoint '$CONTROL_ENDPOINT_HOST' -> $CONTROL_IP in /etc/hosts"
        ESC_HOST="$(printf '%s' "$CONTROL_ENDPOINT_HOST" | sed 's/[.]/\\./g')"
        # Strip the endpoint host from any existing (loopback) line so it no longer
        # resolves to 127.0.0.1, then point it at the real control-plane IP.
        sudo sed -i -E "s/[[:space:]]+${ESC_HOST}([[:space:]]|\$)/\1/g" /etc/hosts || true
        if ! grep -qE "^${CONTROL_IP}[[:space:]].*${ESC_HOST}([[:space:]]|\$)" /etc/hosts; then
            echo "${CONTROL_IP} ${CONTROL_ENDPOINT_HOST}" | sudo tee -a /etc/hosts >/dev/null
        fi
    fi

    # Kernel/sysctl prereqs the kubeadm preflight needs (no engine/node required).
    sudo swapoff -a || true
    sudo sed -i '/swap/d' /etc/fstab || true
    sudo modprobe br_netfilter || true
    printf 'net.bridge.bridge-nf-call-iptables = 1\nnet.bridge.bridge-nf-call-ip6tables = 1\nnet.ipv4.ip_forward = 1\n' \
    | sudo tee /etc/sysctl.d/99-kubernetes.conf >/dev/null
    sudo sysctl --system >/dev/null 2>&1 || true

    # Replace --discovery-token-ca-cert-hash with --discovery-token-unsafe-skip-ca-verification
    # so token discovery does not depend on the pinned CA hash.
    UNSAFE_JOIN="$(echo "${JOIN_COMMAND}" | sed 's/--discovery-token-ca-cert-hash [^ ]*/--discovery-token-unsafe-skip-ca-verification/')"

    _do_join() {
        # Reset any stale state from a previous failed join so kubeadm does not
        # reuse cached config that points at an unreachable endpoint.
        sudo kubeadm reset -f --cri-socket="${CRI_SOCKET}" >/dev/null 2>&1 || true
        sudo rm -rf /etc/kubernetes/* /var/lib/kubelet/pki 2>/dev/null || true
        log "Joining cluster: ${UNSAFE_JOIN%% --token*} ..."
        sudo ${UNSAFE_JOIN} --cri-socket="${CRI_SOCKET}"
    }

    if _do_join; then
        log "Worker joined the cluster."
        return 0
    fi
    log "WARNING: kubeadm join attempt failed; resetting and retrying once..."
    if _do_join; then
        log "Worker joined the cluster."
        return 0
    fi
    log "FATAL: kubeadm join failed after retry"
    return 1
}

# --join-only: skip all prerequisite/engine/host setup and go straight to the
# join (used by `baremetal --resume-join` on an already-provisioned node).
if [ "$JOIN_ONLY" = "1" ]; then
    [ "$ROLE" = "worker" ] || { echo "ERROR: --join-only is only valid with --worker" >&2; exit 1; }
    log "--join-only: skipping prerequisites/engine setup; joining cluster directly"
    worker_join
    log "kubeadm worker (join-only) complete."
    exit 0
fi

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

# clone_or_pull <repo-url> <branch> <target-dir> <remote-name> [mask-secret]
# If <target-dir> exists with a git repo, does a git pull (fetch+reset) to
# update it. Otherwise clones <repo-url> into a temp dir and copies contents
# to <target-dir> so a custom repo (e.g. engine-test-test) always lands at
# the canonical path. [mask-secret] is redacted from any logged output.
clone_or_pull() {
    local url="${1:-}" branch="${2:-}" target="${3:-}" remote="${4:-origin}" mask="${5:-}"
    if [ -d "$target" ] && git -C "$target" rev-parse --git-dir >/dev/null 2>&1; then
        log "$target already present; pulling latest ..."
        if git -C "$target" remote get-url "$remote" >/dev/null 2>&1; then
            # Temporarily set the authenticated URL so the fetch succeeds.
            # The caller strips the token from the remote URL after this returns.
            local saved_url; saved_url="$(git -C "$target" remote get-url "$remote" 2>/dev/null || true)"
            git -C "$target" remote set-url "$remote" "$url" 2>/dev/null || true
            if [ -n "$mask" ]; then
                git -C "$target" fetch --depth 1 "$remote" 2>&1 | sed "s/${mask}/***/g" || true
            else
                git -C "$target" fetch --depth 1 "$remote" 2>&1 || true
            fi
            # Restore the saved (clean) URL immediately so the token is never persisted.
            if [ -n "$saved_url" ]; then
                git -C "$target" remote set-url "$remote" "$saved_url" 2>/dev/null || true
            fi
            if [ -n "$branch" ]; then
                git -C "$target" reset --hard "$remote/$branch" 2>/dev/null || true
            else
                # No branch specified: pull whichever branch is HEAD on remote
                git -C "$target" reset --hard "$remote/$(git -C "$target" rev-parse --abbrev-ref HEAD 2>/dev/null)" 2>/dev/null || true
            fi
            # Clean untracked files so stale artifacts don't accumulate
            git -C "$target" clean -fd 2>/dev/null || true
            log "$target updated via pull"
            return 0
        fi
    fi
    # Full clone + normalize path
    log "Cloning + normalizing $url -> $target ..."
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

if [ -n "$GITHUB_TOKEN" ]; then
    ENGINE_REPO_URL="https://${GITHUB_USERNAME:-x-access-token}:${GITHUB_TOKEN}@${ENGINE_REPO#https://}"
    # Mask the token in log output by routing through clone_or_pull with mask arg
    clone_or_pull "$ENGINE_REPO_URL" "$ENGINE_BRANCH" "$ENGINE_ROOT" "origin" "$GITHUB_TOKEN" || { log "FATAL: engine clone failed"; exit 1; }
    # Drop the token from the remote URL so it is not persisted on disk.
    git -C "$ENGINE_ROOT" remote set-url origin "$ENGINE_REPO" 2>/dev/null || true
else
    clone_or_pull "$ENGINE_REPO" "$ENGINE_BRANCH" "$ENGINE_ROOT" "origin" "" || { log "FATAL: engine clone failed"; exit 1; }
fi

cd "$ENGINE_ROOT"

# Clone + normalize the private secrets repo into $ENGINE_ROOT/engine-private
# (where `node bin run secret` reads engine-private/conf/.../.env.production),
# regardless of the private repo's name. The token is masked in logs and then
# stripped from the saved remote URL.
if [ -n "$GITHUB_TOKEN" ]; then
    PRIV_URL="https://${GITHUB_USERNAME:-x-access-token}:${GITHUB_TOKEN}@${ENGINE_PRIVATE_REPO#https://}"
    if clone_or_pull "$PRIV_URL" "$ENGINE_PRIVATE_BRANCH" "$ENGINE_ROOT/engine-private" "origin" "$GITHUB_TOKEN"; then
        # Drop the token from the remote URL so it is not persisted on disk.
        git -C "$ENGINE_ROOT/engine-private" remote set-url origin "$ENGINE_PRIVATE_REPO" 2>/dev/null || true
    else
        log "WARNING: engine-private clone failed — secrets will be unavailable"
    fi
else
    log "WARNING: GITHUB_TOKEN not provided; engine-private not cloned — secrets will be unavailable"
fi

# Install JS deps and generate secrets using the local engine entrypoint.
npm install
npm install -g underpost
node bin run secret

# ---------------------------------------------------------------------------
# 3. Host prerequisites (Docker, CRI-O, kubelet/kubeadm/kubectl, ...) via cluster.js
# ---------------------------------------------------------------------------
log "Installing Kubernetes host prerequisites (underpost cluster --init-host)..."
# CRI-O is already installed by this point (idempotent dnf). The install-crio
# runner also tries to install cri-tools (crictl) which is not in Rocky 9 repos.
# That failure is non-fatal; CRI-O itself works fine without crictl.
node bin cluster --dev --init-host || log "WARNING: init-host had minor errors (CRI-O is already installed)"

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
    # Apply the same host configuration cluster.js uses (SELinux, swap, sysctl)
    # before joining; worker_join then handles endpoint mapping + the join itself
    # and fails the script (set -e) if the join does not succeed.
    log "Applying host configuration (underpost cluster --config)..."
    node bin cluster --dev --config
    worker_join
fi

log "kubeadm ${ROLE} setup complete."
