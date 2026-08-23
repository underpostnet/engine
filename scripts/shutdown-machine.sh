#!/usr/bin/env bash
set -Eeuo pipefail

# Gracefully quiesce this kubeadm node and power it off for physical relocation.
#
# Normal use:
#   sudo ./scripts/shutdown-machine.sh
#
# The internal restore mode is invoked by systemd after the next boot. It may
# also be run manually if automatic workload restoration needs to be retried:
#   sudo /usr/local/sbin/engine-shutdown-machine --restore-statefulsets

readonly PROGRAM="${0##*/}"
readonly SCRIPT_PATH="$(readlink -f -- "${BASH_SOURCE[0]}")"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly ENGINE_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly STATE_DIR="/var/lib/engine/shutdown-machine"
readonly STATE_FILE="${STATE_DIR}/statefulsets.tsv"
readonly CONTROLLER_STATE_FILE="${STATE_DIR}/controllers.tsv"
readonly NODE_FILE="${STATE_DIR}/node-name"
readonly KUBECONFIG_FILE="${STATE_DIR}/kubeconfig-path"
readonly ENGINE_ROOT_FILE="${STATE_DIR}/engine-root"
readonly NODE_BIN_FILE="${STATE_DIR}/node-bin"
readonly EVENT_STATE_FILE="${STATE_DIR}/events.json"
readonly MONGODB_QUIESCED_MARKER="${STATE_DIR}/mongodb-quiesced"
readonly MONGODB_SECRETS_MARKER="${STATE_DIR}/mongodb-secrets-restored"
readonly MONGODB_REPLICA_MARKER="${STATE_DIR}/mongodb-replica-restored"
readonly UNCORDON_MARKER="${STATE_DIR}/uncordon-on-restore"
readonly RESTORE_BIN="/usr/local/sbin/engine-shutdown-machine"
readonly RESTORE_UNIT="engine-kubernetes-restore.service"
readonly RESTORE_UNIT_FILE="/etc/systemd/system/${RESTORE_UNIT}"
readonly ETCD_BACKUP_DIR="/var/lib/etcd/pre-shutdown-snapshots"

NODE_NAME=""
KUBE_NODE_NAME=""
LAN_IP=""
ROLE=""
NODE_BIN=""
CORDONED_BY_SCRIPT=0
WORKLOAD_STATE_SAVED=0
SERVICES_STOPPED=0
ROLLBACK_RUNNING=0
declare -a ACTIVE_RUNTIMES=()

log_info() {
    printf '%s [INFO]  [%s] %s\n' "$(date --iso-8601=seconds)" "${PROGRAM}" "$*"
}

log_warn() {
    printf '%s [WARN]  [%s] %s\n' "$(date --iso-8601=seconds)" "${PROGRAM}" "$*" >&2
}

log_error() {
    printf '%s [ERROR] [%s] %s\n' "$(date --iso-8601=seconds)" "${PROGRAM}" "$*" >&2
}

die() {
    log_error "$*"
    return 1
}

require_root() {
    if (( EUID != 0 )); then
        die "This script must be run as root (for example: sudo ${SCRIPT_PATH})."
    fi
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

# NVM installs Node.js below a user's home directory and exposes it through
# interactive-shell PATH setup. systemd does not load that setup, so persist and
# invoke the canonical executable instead of relying on a bare `node` command.
# The PATH fallback keeps recovery compatible with state written by an older
# version of this script when an administrator runs it with an explicit PATH.
resolve_node_binary() {
    local candidate=""

    if [[ -s "${NODE_BIN_FILE}" ]]; then
        IFS= read -r candidate < "${NODE_BIN_FILE}"
    else
        candidate="$(command -v node 2>/dev/null || true)"
    fi

    [[ -n "${candidate}" ]] || die "Node.js executable was not found; NVM users must preserve its bin directory in PATH for this recovery."
    [[ "${candidate}" == /* ]] || die "Node.js executable path is not absolute: ${candidate}"
    [[ "${candidate}" != *$'\n'* ]] || die "Node.js executable path must not contain a newline."
    [[ -x "${candidate}" ]] || die "Saved Node.js executable is missing or not executable: ${candidate}"

    NODE_BIN="$(readlink -f -- "${candidate}")"
    [[ -x "${NODE_BIN}" ]] || die "Canonical Node.js executable is missing or not executable: ${NODE_BIN}"
}

# Select credentials that work both now and from the post-boot systemd unit.
# API reachability is checked separately because the control-plane API may still
# be starting when the restore unit first runs.
resolve_kubeconfig() {
    local candidate=""

    if [[ -s "${KUBECONFIG_FILE}" ]]; then
        IFS= read -r candidate < "${KUBECONFIG_FILE}"
        if [[ -n "${candidate}" ]]; then
            export KUBECONFIG="${candidate}"
            return 0
        fi
    fi

    if kubectl version --request-timeout=10s >/dev/null 2>&1; then
        return 0
    fi

    for candidate in /etc/kubernetes/admin.conf /root/.kube/config; do
        if [[ -r "${candidate}" ]]; then
            export KUBECONFIG="${candidate}"
            return 0
        fi
    done

    die "No readable Kubernetes kubeconfig was found."
}

check_prerequisites() {
    require_root
    require_command kubectl
    require_command systemctl
    require_command sync
    require_command shutdown
    require_command install
    require_command readlink
    resolve_node_binary
    resolve_kubeconfig
    kubectl version --request-timeout=10s >/dev/null 2>&1 \
        || die "kubectl cannot reach the Kubernetes API with the available kubeconfig."
}

resolve_node_environment() {
    local metadata_file raw_ip

    NODE_NAME="$(hostname)"
    metadata_file="${ENGINE_ROOT}/engine-private/deploy/nodes/${NODE_NAME}.json"
    [[ -r "${metadata_file}" ]] || die "Node metadata file is missing or unreadable: ${metadata_file}"

    # This is the repository's authoritative LAN-address resolver.
    if ! raw_ip="$(cd "${ENGINE_ROOT}" && "${NODE_BIN}" bin ip --dhcp)"; then
        die "Failed to resolve the LAN address with 'node bin ip --dhcp'."
    fi
    LAN_IP="$(printf '%s\n' "${raw_ip}" | tr -d '\r' | awk 'NF { value=$0 } END { print value }')"
    if [[ ! "${LAN_IP}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
        die "'node bin ip --dhcp' did not return an IPv4 address (received: ${LAN_IP:-<empty>})."
    fi

    ROLE="$("${NODE_BIN}" -e '
        const fs = require("fs");
        const file = process.argv[1];
        const value = JSON.parse(fs.readFileSync(file, "utf8")).role;
        if (value !== "control" && value !== "worker") process.exit(2);
        process.stdout.write(value);
    ' "${metadata_file}")" || die "Node metadata role must be either 'control' or 'worker': ${metadata_file}"

    KUBE_NODE_NAME="${NODE_NAME}"
    if ! kubectl get node "${KUBE_NODE_NAME}" --request-timeout=10s >/dev/null 2>&1; then
        if ! KUBE_NODE_NAME="$(kubectl get nodes \
                -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{range .status.addresses[?(@.type=="InternalIP")]}{.address}{end}{"\n"}{end}' \
                | awk -v ip="${LAN_IP}" '$2 == ip { print $1; exit }')"; then
            die "Failed to list Kubernetes nodes while matching LAN IP ${LAN_IP}."
        fi
        [[ -n "${KUBE_NODE_NAME}" ]] || die "No Kubernetes node matches hostname '${NODE_NAME}' or LAN IP '${LAN_IP}'."
        log_warn "Hostname '${NODE_NAME}' differs from Kubernetes node name '${KUBE_NODE_NAME}'; using the latter."
    fi

    log_info "Resolved node=${KUBE_NODE_NAME}, hostname=${NODE_NAME}, LAN_IP=${LAN_IP}, role=${ROLE}."
}

is_system_namespace() {
    case "$1" in
        kube-system|kube-public|kube-node-lease) return 0 ;;
        *) return 1 ;;
    esac
}

# Save desired replica counts before changing any StatefulSet. Scaling to zero
# persists in the API, so this state plus the one-shot unit is what makes the
# workloads return automatically after the relocated host boots.
prepare_post_boot_restore() {
    local namespace name replicas tmp_file kubeconfig_value statefulsets

    install -d -m 0700 "${STATE_DIR}"
    if [[ -e "${STATE_FILE}" ]]; then
        die "Unfinished shutdown state exists at ${STATE_FILE}; run '${RESTORE_BIN} --restore-statefulsets' first."
    fi
    if [[ -e "${EVENT_STATE_FILE}" ]]; then
        die "Unfinished event suspension exists at ${EVENT_STATE_FILE}; run 'node bin event --resume-events ${EVENT_STATE_FILE}' first."
    fi

    tmp_file="$(mktemp "${STATE_DIR}/.statefulsets.XXXXXX")"
    if ! statefulsets="$(kubectl get statefulsets --all-namespaces \
            -o go-template='{{range .items}}{{.metadata.namespace}}{{"\t"}}{{.metadata.name}}{{"\t"}}{{if .spec.replicas}}{{.spec.replicas}}{{else}}0{{end}}{{"\n"}}{{end}}')"; then
        rm -f -- "${tmp_file}"
        die "Failed to list StatefulSets; no Kubernetes resources were changed."
    fi
    while IFS=$'\t' read -r namespace name replicas; do
        [[ -n "${namespace}" && -n "${name}" ]] || continue
        is_system_namespace "${namespace}" && continue
        [[ "${replicas}" =~ ^[0-9]+$ ]] || replicas=0
        printf '%s\t%s\t%s\n' "${namespace}" "${name}" "${replicas}" >> "${tmp_file}"
    done <<< "${statefulsets}"
    chmod 0600 "${tmp_file}"
    mv -f -- "${tmp_file}" "${STATE_FILE}"
    : > "${CONTROLLER_STATE_FILE}"
    chmod 0600 "${CONTROLLER_STATE_FILE}"

    printf '%s\n' "${KUBE_NODE_NAME}" > "${NODE_FILE}"
    chmod 0600 "${NODE_FILE}"
    printf '%s\n' "${ENGINE_ROOT}" > "${ENGINE_ROOT_FILE}"
    chmod 0600 "${ENGINE_ROOT_FILE}"
    printf '%s\n' "${NODE_BIN}" > "${NODE_BIN_FILE}"
    chmod 0600 "${NODE_BIN_FILE}"

    kubeconfig_value="${KUBECONFIG:-/root/.kube/config}"
    [[ "${kubeconfig_value}" != *$'\n'* ]] || die "KUBECONFIG must not contain a newline."
    printf '%s\n' "${kubeconfig_value}" > "${KUBECONFIG_FILE}"
    chmod 0600 "${KUBECONFIG_FILE}"
    WORKLOAD_STATE_SAVED=1

    # Install a stable copy because systemd must be able to restore even if the
    # repository is not mounted or has moved by the time the unit runs.
    install -m 0755 "${SCRIPT_PATH}" "${RESTORE_BIN}"
    tee "${RESTORE_UNIT_FILE}" >/dev/null <<EOF
[Unit]
Description=Restore Kubernetes workloads after a graceful physical-node shutdown
Wants=network-online.target kubelet.service
After=network-online.target kubelet.service
ConditionPathExists=${STATE_FILE}
StartLimitIntervalSec=0

[Service]
Type=oneshot
ExecStart=${RESTORE_BIN} --restore-statefulsets
Restart=on-failure
RestartSec=15s
TimeoutStartSec=2h

[Install]
WantedBy=multi-user.target
EOF
    chmod 0644 "${RESTORE_UNIT_FILE}"
    systemctl daemon-reload
    systemctl enable "${RESTORE_UNIT}" >/dev/null
    log_info "Saved workload replica state and enabled post-boot restoration."
}

# Remove generated event probes and alert rules before workloads intentionally
# disappear. event.js atomically records the exact deployed set first, so any
# failure, rollback, or reboot can resynchronize that set without guessing.
suspend_events() {
    log_info "Suspending operational events to prevent planned-shutdown alerts."
    (
        cd "${ENGINE_ROOT}"
        "${NODE_BIN}" bin event --suspend-events "${EVENT_STATE_FILE}" --namespace default
    )
    [[ -s "${EVENT_STATE_FILE}" ]] || die "Event suspension did not create recovery state: ${EVENT_STATE_FILE}"
}

resume_events() {
    local event_engine_root
    [[ -e "${EVENT_STATE_FILE}" ]] || return 0
    [[ -s "${ENGINE_ROOT_FILE}" ]] || die "Engine-root recovery state is missing: ${ENGINE_ROOT_FILE}"
    IFS= read -r event_engine_root < "${ENGINE_ROOT_FILE}"
    [[ -d "${event_engine_root}" ]] || die "Saved engine root is unavailable: ${event_engine_root}"

    log_info "Resynchronizing operational events after workload recovery."
    (
        cd "${event_engine_root}"
        "${NODE_BIN}" bin event --resume-events "${EVENT_STATE_FILE}"
    )
    [[ ! -e "${EVENT_STATE_FILE}" ]] || die "Event recovery state remains after resynchronization: ${EVENT_STATE_FILE}"
}

cordon_node() {
    local was_unschedulable
    if ! was_unschedulable="$(kubectl get node "${KUBE_NODE_NAME}" -o jsonpath='{.spec.unschedulable}')"; then
        die "Failed to read schedulability for node ${KUBE_NODE_NAME}."
    fi
    if [[ "${was_unschedulable}" == "true" ]]; then
        log_warn "Node ${KUBE_NODE_NAME} was already cordoned; it will remain cordoned after boot."
        return 0
    fi

    kubectl cordon "${KUBE_NODE_NAME}"
    : > "${UNCORDON_MARKER}"
    chmod 0600 "${UNCORDON_MARKER}"
    CORDONED_BY_SCRIPT=1
}

snapshot_etcd() {
    local etcd_pod timestamp snapshot_path snapshot_size

    [[ "${ROLE}" == "control" ]] || return 0
    install -d -m 0700 "${ETCD_BACKUP_DIR}"

    if ! etcd_pod="$(kubectl -n kube-system get pods -l component=etcd \
            --field-selector "spec.nodeName=${KUBE_NODE_NAME}" \
            -o jsonpath='{.items[0].metadata.name}')"; then
        die "Failed to query the local control-plane etcd static pod."
    fi
    [[ -n "${etcd_pod}" ]] || die "Could not find the local control-plane etcd static pod."

    timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
    snapshot_path="${ETCD_BACKUP_DIR}/etcd-${KUBE_NODE_NAME}-${timestamp}.db"
    log_info "Checking etcd health before snapshot."
    kubectl -n kube-system exec "${etcd_pod}" -c etcd -- \
        etcdctl --endpoints=https://127.0.0.1:2379 \
        --cacert=/etc/kubernetes/pki/etcd/ca.crt \
        --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
        --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
        endpoint health

    log_info "Saving etcd snapshot to ${snapshot_path}."
    kubectl -n kube-system exec "${etcd_pod}" -c etcd -- \
        etcdctl --endpoints=https://127.0.0.1:2379 \
        --cacert=/etc/kubernetes/pki/etcd/ca.crt \
        --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
        --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
        snapshot save "${snapshot_path}"

    [[ -s "${snapshot_path}" ]] || die "etcd reported success, but snapshot is absent or empty: ${snapshot_path}"
    # etcdutl performs the snapshot integrity/hash check. Older etcd images may
    # only expose the deprecated etcdctl equivalent, so retain that fallback.
    if ! kubectl -n kube-system exec "${etcd_pod}" -c etcd -- \
        etcdutl snapshot status "${snapshot_path}" --write-out=table; then
        log_warn "etcdutl is unavailable; validating the snapshot with etcdctl."
        kubectl -n kube-system exec "${etcd_pod}" -c etcd -- \
            etcdctl snapshot status "${snapshot_path}" --write-out=table
    fi
    chmod 0600 "${snapshot_path}"
    snapshot_size="$(stat -c '%s' "${snapshot_path}")"
    log_info "Verified etcd snapshot (${snapshot_size} bytes)."
}

wait_for_statefulset_zero() {
    local namespace="$1" name="$2" deadline counts
    deadline=$((SECONDS + 600))

    while (( SECONDS < deadline )); do
        if ! counts="$(kubectl -n "${namespace}" get statefulset "${name}" \
                -o go-template='{{if .status.replicas}}{{.status.replicas}}{{else}}0{{end}} {{if .status.readyReplicas}}{{.status.readyReplicas}}{{else}}0{{end}}')"; then
            die "Failed to read StatefulSet status for ${namespace}/${name}."
        fi
        if [[ "${counts}" == "0 0" ]]; then
            return 0
        fi
        sleep 2
    done

    die "Timed out waiting for StatefulSet ${namespace}/${name} to terminate (current/ready: ${counts})."
}

# Print PDB/pod triples for pods on this node that currently have no voluntary
# disruptions available. A stable singleton Deployment with such a PDB (for
# example metrics-server with minAvailable: 1) otherwise makes drain retry until
# its timeout: no replacement is created until the old Pod can be evicted.
find_blocking_pdb_pods() {
    local pdb_json pods_json
    pdb_json="$(mktemp "${STATE_DIR}/.pdbs.XXXXXX.json")"
    pods_json="$(mktemp "${STATE_DIR}/.pods.XXXXXX.json")"

    if ! kubectl get poddisruptionbudgets --all-namespaces -o json > "${pdb_json}"; then
        rm -f -- "${pdb_json}" "${pods_json}"
        die "Failed to inspect PodDisruptionBudgets before drain."
    fi
    if ! kubectl get pods --all-namespaces \
            --field-selector "spec.nodeName=${KUBE_NODE_NAME}" -o json > "${pods_json}"; then
        rm -f -- "${pdb_json}" "${pods_json}"
        die "Failed to inspect pods on node ${KUBE_NODE_NAME} before drain."
    fi

    "${NODE_BIN}" - "${pdb_json}" "${pods_json}" <<'NODE'
const fs = require('fs');
const pdbs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).items || [];
const pods = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).items || [];

function matches(selector = {}, labels = {}) {
  for (const [key, value] of Object.entries(selector.matchLabels || {})) {
    if (labels[key] !== value) return false;
  }
  for (const expression of selector.matchExpressions || []) {
    const present = Object.prototype.hasOwnProperty.call(labels, expression.key);
    const values = expression.values || [];
    if (expression.operator === 'In' && (!present || !values.includes(labels[expression.key]))) return false;
    if (expression.operator === 'NotIn' && present && values.includes(labels[expression.key])) return false;
    if (expression.operator === 'Exists' && !present) return false;
    if (expression.operator === 'DoesNotExist' && present) return false;
  }
  return true;
}

for (const pdb of pdbs) {
  if (pdb.status?.observedGeneration !== pdb.metadata?.generation) continue;
  if ((pdb.status?.disruptionsAllowed ?? 0) !== 0) continue;
  for (const pod of pods) {
    if (pod.metadata?.namespace !== pdb.metadata?.namespace) continue;
    if (pod.metadata?.deletionTimestamp) continue;
    if (!matches(pdb.spec?.selector || {}, pod.metadata?.labels || {})) continue;
    process.stdout.write(`${pdb.metadata.namespace}\t${pdb.metadata.name}\t${pod.metadata.name}\n`);
  }
}
NODE
    local node_status=$?
    rm -f -- "${pdb_json}" "${pods_json}"
    return "${node_status}"
}

# Resolve a Pod's immediate owner to the scalable top-level workload. The
# common Deployment -> ReplicaSet -> Pod ownership chain is followed explicitly.
resolve_pod_controller() {
    local namespace="$1" pod="$2" kind name parent_kind parent_name owner_text

    if ! owner_text="$(kubectl -n "${namespace}" get pod "${pod}" \
            -o go-template='{{range .metadata.ownerReferences}}{{if .controller}}{{.kind}} {{.name}}{{end}}{{end}}')"; then
        return 1
    fi
    read -r kind name <<< "${owner_text}"
    [[ -n "${kind:-}" && -n "${name:-}" ]] || return 1

    if [[ "${kind}" == "ReplicaSet" ]]; then
        if ! owner_text="$(kubectl -n "${namespace}" get replicaset "${name}" \
                -o go-template='{{range .metadata.ownerReferences}}{{if .controller}}{{.kind}} {{.name}}{{end}}{{end}}')"; then
            return 1
        fi
        read -r parent_kind parent_name <<< "${owner_text}"
        if [[ "${parent_kind:-}" == "Deployment" && -n "${parent_name:-}" ]]; then
            kind="${parent_kind}"
            name="${parent_name}"
        fi
    fi

    printf '%s\t%s\n' "${kind}" "${name}"
}

wait_for_controller_zero() {
    local kind="$1" namespace="$2" name="$3" deadline counts
    deadline=$((SECONDS + 600))
    while (( SECONDS < deadline )); do
        if ! counts="$(kubectl -n "${namespace}" get "${kind}" "${name}" \
                -o go-template='{{if .status.replicas}}{{.status.replicas}}{{else}}0{{end}} {{if .status.readyReplicas}}{{.status.readyReplicas}}{{else}}0{{end}}')"; then
            die "Failed to read ${kind} status for ${namespace}/${name}."
        fi
        [[ "${counts}" == "0 0" ]] && return 0
        sleep 2
    done
    die "Timed out waiting for ${kind} ${namespace}/${name} to terminate (replicas/ready: ${counts})."
}

wait_for_controller_ready() {
    local kind="$1" namespace="$2" name="$3" desired="$4" deadline counts
    deadline=$((SECONDS + 900))
    while (( SECONDS < deadline )); do
        if ! counts="$(kubectl -n "${namespace}" get "${kind}" "${name}" \
                -o go-template='{{if .status.replicas}}{{.status.replicas}}{{else}}0{{end}} {{if .status.readyReplicas}}{{.status.readyReplicas}}{{else}}0{{end}}')"; then
            die "Failed to read restored ${kind} status for ${namespace}/${name}."
        fi
        [[ "${counts}" == "${desired} ${desired}" ]] && return 0
        sleep 5
    done
    die "Timed out waiting for restored ${kind} ${namespace}/${name} (replicas/ready: ${counts}, desired: ${desired})."
}

# PDBs remain enabled and unmodified. Intentionally scaling a blocking workload
# uses its controller's graceful Pod termination path and is safer than forcing
# drain with --disable-eviction. Its desired replicas are restored after boot.
quiesce_pdb_blockers() {
    local namespace pdb pod owner kind name replicas record
    local blockers=""

    if ! blockers="$(find_blocking_pdb_pods)"; then
        die "Failed to resolve workloads protected by PodDisruptionBudgets."
    fi
    [[ -n "${blockers}" ]] || {
        log_info "No immediately blocking PodDisruptionBudgets found on ${KUBE_NODE_NAME}."
        return 0
    }

    while IFS=$'\t' read -r namespace pdb pod; do
        [[ -n "${namespace}" && -n "${pod}" ]] || continue
        if ! owner="$(resolve_pod_controller "${namespace}" "${pod}")"; then
            die "PDB ${namespace}/${pdb} blocks pod ${pod}, whose scalable controller could not be resolved."
        fi
        IFS=$'\t' read -r kind name <<< "${owner}"

        case "${kind}" in
            DaemonSet)
                # kubectl drain already excludes DaemonSets.
                continue
                ;;
            Deployment|ReplicaSet|ReplicationController)
                ;;
            StatefulSet)
                # StatefulSets were already intentionally scaled to zero.
                continue
                ;;
            *)
                die "PDB ${namespace}/${pdb} blocks unsupported controller ${kind}/${name} for pod ${pod}."
                ;;
        esac

        record="${kind}"$'\t'"${namespace}"$'\t'"${name}"$'\t'
        if grep -Fq -- "${record}" "${CONTROLLER_STATE_FILE}"; then
            continue
        fi
        if ! replicas="$(kubectl -n "${namespace}" get "${kind}" "${name}" -o jsonpath='{.spec.replicas}')"; then
            die "Failed to read replicas for PDB-blocking ${kind} ${namespace}/${name}."
        fi
        [[ "${replicas}" =~ ^[0-9]+$ ]] || die "Invalid replica count for ${kind} ${namespace}/${name}."

        # Persist before mutation so rollback and post-boot recovery are safe.
        printf '%s\t%s\t%s\t%s\n' "${kind}" "${namespace}" "${name}" "${replicas}" \
            >> "${CONTROLLER_STATE_FILE}"
        log_warn "PDB ${namespace}/${pdb} cannot currently allow eviction; gracefully scaling ${kind} ${namespace}/${name} from ${replicas} to 0."
        kubectl -n "${namespace}" scale "${kind}" "${name}" --replicas=0
    done <<< "${blockers}"

    while IFS=$'\t' read -r kind namespace name replicas; do
        [[ -n "${kind}" && -n "${namespace}" && -n "${name}" ]] || continue
        (( replicas > 0 )) && wait_for_controller_zero "${kind}" "${namespace}" "${name}"
    done < "${CONTROLLER_STATE_FILE}"
    return 0
}

scale_down_statefulsets() {
    local namespace name replicas count=0

    while IFS=$'\t' read -r namespace name replicas; do
        [[ -n "${namespace}" && -n "${name}" ]] || continue
        if (( replicas > 0 )); then
            log_info "Gracefully scaling StatefulSet ${namespace}/${name} from ${replicas} to 0."
            kubectl -n "${namespace}" scale statefulset "${name}" --replicas=0
            if [[ "${name}" == "mongodb" ]]; then
                printf '%s\n' "${namespace}" > "${MONGODB_QUIESCED_MARKER}"
                chmod 0600 "${MONGODB_QUIESCED_MARKER}"
            fi
            ((count += 1))
        fi
    done < "${STATE_FILE}"

    while IFS=$'\t' read -r namespace name replicas; do
        [[ -n "${namespace}" && -n "${name}" ]] || continue
        (( replicas > 0 )) && wait_for_statefulset_zero "${namespace}" "${name}"
    done < "${STATE_FILE}"

    log_info "All ${count} active non-system StatefulSet(s) terminated cleanly."
}

drain_node() {
    log_info "Draining ${KUBE_NODE_NAME}; PodDisruptionBudgets remain enforced."
    kubectl drain "${KUBE_NODE_NAME}" \
        --ignore-daemonsets \
        --delete-emptydir-data \
        --force \
        --grace-period=60 \
        --timeout=15m
}

sync_storage() {
    log_info "Flushing kernel filesystem caches to persistent storage."
    sync
    sync
    sync
}

detect_active_runtimes() {
    local service
    ACTIVE_RUNTIMES=()
    # Stop socket activation before Docker, and stop Docker before the shared
    # containerd daemon it may depend on. Rollback starts this list in reverse.
    for service in docker.socket docker.service crio.service containerd.service; do
        if systemctl is-active --quiet "${service}"; then
            ACTIVE_RUNTIMES+=("${service}")
        fi
    done
    if (( ${#ACTIVE_RUNTIMES[@]} == 0 )); then
        die "No active supported container runtime found (checked CRI-O, containerd, and Docker)."
    fi
    log_info "Active container runtime unit(s): ${ACTIVE_RUNTIMES[*]}"
}

stop_kubernetes_services() {
    local service
    detect_active_runtimes

    # Stop kubelet first so it cannot recreate containers while the CRI runtime
    # is shutting down. systemd will finish terminating each unit synchronously.
    log_info "Stopping kubelet."
    systemctl stop kubelet.service
    SERVICES_STOPPED=1

    for service in "${ACTIVE_RUNTIMES[@]}"; do
        log_info "Stopping container runtime ${service}."
        systemctl stop "${service}"
    done

    if systemctl is-active --quiet kubelet.service; then
        die "kubelet is still active after stop."
    fi
    for service in "${ACTIVE_RUNTIMES[@]}"; do
        if systemctl is-active --quiet "${service}"; then
            die "${service} is still active after stop."
        fi
    done
    # systemctl uses exit status 3 for an inactive unit. Reaching this point is
    # successful verification, so never leak that expected status to set -e.
    return 0
}

wait_for_api() {
    local attempt
    for ((attempt = 1; attempt <= 60; attempt++)); do
        if kubectl version --request-timeout=5s >/dev/null 2>&1; then
            return 0
        fi
        (( attempt % 6 == 0 )) && log_warn "Waiting for Kubernetes API (${attempt}/60)."
        sleep 5
    done
    die "Kubernetes API did not become reachable within five minutes."
}

wait_for_node_ready() {
    local node="$1" attempt status
    for ((attempt = 1; attempt <= 120; attempt++)); do
        status="$(kubectl get node "${node}" -o jsonpath='{range .status.conditions[?(@.type=="Ready")]}{.status}{end}' 2>/dev/null || true)"
        [[ "${status}" == "True" ]] && return 0
        (( attempt % 12 == 0 )) && log_warn "Waiting for node ${node} to become Ready (${attempt}/120)."
        sleep 5
    done
    die "Node ${node} did not become Ready within ten minutes."
}

# Event rules are restored only after the controllers that drain displaced have
# converged. This closes the gap where the node is Ready but ingress, exporters,
# or application Deployments are still starting and would immediately alert.
wait_for_cluster_rollouts() {
    local resource namespace name resources
    for resource in deployment daemonset statefulset; do
        if ! resources="$(kubectl get "${resource}" --all-namespaces \
                -o go-template='{{range .items}}{{.metadata.namespace}}{{"\t"}}{{.metadata.name}}{{"\n"}}{{end}}')"; then
            die "Failed to list ${resource} resources before event resynchronization."
        fi
        while IFS=$'\t' read -r namespace name; do
            [[ -n "${namespace}" && -n "${name}" ]] || continue
            log_info "Waiting for ${resource} rollout ${namespace}/${name} before restoring events."
            kubectl -n "${namespace}" rollout status "${resource}/${name}" --timeout=15m
        done <<< "${resources}"
    done
}

# MongoDB needs its Kubernetes Secrets reconciled and its replica-set membership
# checked after pods and storage are back. Phase markers make retries idempotent:
# a later event-resync failure must not repeat the forced secret onboarding.
restore_mongodb_runtime() {
    local event_engine_root mongodb_namespace
    [[ -s "${MONGODB_QUIESCED_MARKER}" ]] || return 0
    IFS= read -r mongodb_namespace < "${MONGODB_QUIESCED_MARKER}"
    [[ -n "${mongodb_namespace}" ]] || die "MongoDB recovery namespace is empty."
    [[ -s "${ENGINE_ROOT_FILE}" ]] || die "Engine-root recovery state is missing: ${ENGINE_ROOT_FILE}"
    IFS= read -r event_engine_root < "${ENGINE_ROOT_FILE}"
    [[ -d "${event_engine_root}" ]] || die "Saved engine root is unavailable: ${event_engine_root}"

    if [[ ! -e "${MONGODB_SECRETS_MARKER}" ]]; then
        log_info "MongoDB was active before shutdown; reconciling its SOPS-managed secrets."
        (
            cd "${event_engine_root}"
            # The secret workflow is a top-level CLI command; `run secret` is
            # not a registered runner and would fail before doing any setup.
            "${NODE_BIN}" bin secret --setup --force --namespace "${mongodb_namespace}"
        )
        : > "${MONGODB_SECRETS_MARKER}"
        chmod 0600 "${MONGODB_SECRETS_MARKER}"
    fi

    if [[ ! -e "${MONGODB_REPLICA_MARKER}" ]]; then
        log_info "Reinitializing the recovered MongoDB replica-set membership."
        (
            cd "${event_engine_root}"
            "${NODE_BIN}" bin run restore-mongo --kubeadm --namespace "${mongodb_namespace}"
        )
        : > "${MONGODB_REPLICA_MARKER}"
        chmod 0600 "${MONGODB_REPLICA_MARKER}"
    fi
}

restore_statefulsets() {
    local kind namespace name replicas node

    require_root
    require_command kubectl
    require_command readlink
    resolve_node_binary
    [[ -s "${NODE_FILE}" ]] || die "Restore node state is missing: ${NODE_FILE}"
    [[ -e "${STATE_FILE}" ]] || die "StatefulSet restore state is missing: ${STATE_FILE}"
    IFS= read -r node < "${NODE_FILE}"
    [[ -n "${node}" ]] || die "Restore node name is empty."

    resolve_kubeconfig
    wait_for_api
    wait_for_node_ready "${node}"

    if [[ -e "${UNCORDON_MARKER}" ]]; then
        log_info "Restoring schedulability for node ${node}."
        kubectl uncordon "${node}"
    else
        log_warn "Node ${node} was cordoned before shutdown and will remain cordoned."
    fi

    if [[ -e "${CONTROLLER_STATE_FILE}" ]]; then
        while IFS=$'\t' read -r kind namespace name replicas; do
            [[ -n "${kind}" && -n "${namespace}" && -n "${name}" ]] || continue
            [[ "${replicas}" =~ ^[0-9]+$ ]] || die "Invalid controller replica count in ${CONTROLLER_STATE_FILE}."
            log_info "Restoring ${kind} ${namespace}/${name} to ${replicas} replica(s)."
            kubectl -n "${namespace}" scale "${kind}" "${name}" --replicas="${replicas}"
        done < "${CONTROLLER_STATE_FILE}"

        while IFS=$'\t' read -r kind namespace name replicas; do
            [[ -n "${kind}" && -n "${namespace}" && -n "${name}" ]] || continue
            (( replicas == 0 )) && continue
            wait_for_controller_ready "${kind}" "${namespace}" "${name}" "${replicas}"
        done < "${CONTROLLER_STATE_FILE}"
    fi

    while IFS=$'\t' read -r namespace name replicas; do
        [[ -n "${namespace}" && -n "${name}" ]] || continue
        [[ "${replicas}" =~ ^[0-9]+$ ]] || die "Invalid replica count in ${STATE_FILE}."
        log_info "Restoring StatefulSet ${namespace}/${name} to ${replicas} replica(s)."
        kubectl -n "${namespace}" scale statefulset "${name}" --replicas="${replicas}"
    done < "${STATE_FILE}"

    while IFS=$'\t' read -r namespace name replicas; do
        [[ -n "${namespace}" && -n "${name}" ]] || continue
        (( replicas == 0 )) && continue
        kubectl -n "${namespace}" rollout status "statefulset/${name}" --timeout=15m
    done < "${STATE_FILE}"

    # Alerting is the final component restored: deliberate pod absence must not
    # be observed as a fault while controllers and databases are still starting.
    wait_for_cluster_rollouts
    restore_mongodb_runtime
    resume_events

    rm -f -- "${STATE_FILE}" "${CONTROLLER_STATE_FILE}" "${NODE_FILE}" "${KUBECONFIG_FILE}" \
        "${ENGINE_ROOT_FILE}" "${NODE_BIN_FILE}" "${MONGODB_QUIESCED_MARKER}" "${MONGODB_SECRETS_MARKER}" \
        "${MONGODB_REPLICA_MARKER}" "${UNCORDON_MARKER}"
    log_info "Post-boot Kubernetes restoration completed successfully."
}

rollback_shutdown() {
    local service index rollback_status=0
    (( ROLLBACK_RUNNING == 0 )) || return 0
    ROLLBACK_RUNNING=1
    set +e
    log_warn "Attempting to return the node and workloads to their pre-shutdown state."

    if (( SERVICES_STOPPED == 1 )); then
        # Dependencies come up in the inverse order used during shutdown.
        for ((index = ${#ACTIVE_RUNTIMES[@]} - 1; index >= 0; index--)); do
            service="${ACTIVE_RUNTIMES[index]}"
            systemctl start "${service}" || rollback_status=1
        done
        systemctl start kubelet.service || rollback_status=1
        wait_for_api || rollback_status=1
    fi

    if (( WORKLOAD_STATE_SAVED == 1 )); then
        (set -e; restore_statefulsets) || rollback_status=1
    elif (( CORDONED_BY_SCRIPT == 1 )); then
        kubectl uncordon "${KUBE_NODE_NAME}" || rollback_status=1
    fi
    set -e
    return "${rollback_status}"
}

on_error() {
    local exit_code=$? line="$1"
    trap - ERR INT TERM
    log_error "Shutdown preparation failed at line ${line} (exit ${exit_code}); the machine will NOT be powered off."
    rollback_shutdown || log_error "Automatic rollback was incomplete; use '${RESTORE_BIN} --restore-statefulsets' after correcting API/service availability."
    exit "${exit_code}"
}

on_signal() {
    local signal="$1"
    trap - ERR INT TERM
    log_error "Received ${signal}; the machine will NOT be powered off."
    rollback_shutdown || true
    exit 130
}

graceful_shutdown() {
    check_prerequisites
    resolve_node_environment
    prepare_post_boot_restore
    snapshot_etcd
    suspend_events
    cordon_node
    scale_down_statefulsets
    quiesce_pdb_blockers
    drain_node
    sync_storage
    stop_kubernetes_services
    sync_storage

    log_info "============================================================"
    log_info "GRACEFUL SHUTDOWN COMPLETE: ${KUBE_NODE_NAME} is safe to power off."
    log_info "StatefulSets will be restored automatically after the next boot."
    log_info "============================================================"

    # Use the standard systemd-backed halt path so remaining filesystems and
    # services receive their normal shutdown ordering.
    if ! shutdown -h now; then
        die "The operating-system shutdown command failed."
    fi
}

main() {
    case "${1:-}" in
        "")
            graceful_shutdown
            ;;
        --restore-statefulsets)
            [[ $# -eq 1 ]] || die "--restore-statefulsets takes no additional arguments."
            restore_statefulsets
            ;;
        -h|--help)
            printf 'Usage: sudo %s [--restore-statefulsets]\n' "${PROGRAM}"
            ;;
        *)
            die "Unknown argument: $1"
            ;;
    esac
}

trap 'on_error ${LINENO}' ERR
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
main "$@"
