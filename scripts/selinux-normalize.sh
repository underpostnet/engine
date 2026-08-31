#!/usr/bin/env bash
#
# Staged SELinux recovery and normalization for a live Underpost / Kubernetes host.
#
#   inspect -> validate -> normalize -> verify -> enforce
#
# Never reboots, never restarts Kubernetes, kubelet, the container runtime, the CNI or any
# workload, never touches PVs/PVCs or the contents of a data directory, and never disables
# SELinux. The only mutations it can make are:
#
#   * creating a node storage directory that a PersistentVolume references and that is missing;
#   * adding a `semanage fcontext` mapping for a discovered storage root;
#   * running `restorecon` over those roots;
#   * flipping SELinux to Enforcing, and only in the `enforce` stage, and only after `verify`
#     passes on this same run.
#
# Every mutating stage requires --apply. Without it the script reports what it would do.
#
# Rocky Linux 9 / RHEL 9.
set -euo pipefail

SHARED_TYPE='container_file_t'
# Overridable so the rollback round-trip can be exercised without writing under /var/lib.
STATE_DIR="${UNDERPOST_SELINUX_STATE_DIR:-/var/lib/underpost/selinux-normalize}"
KUBECTL_TIMEOUT='20s'
STAGE='inspect'
APPLY=0
ASSUME_YES=0
AVC_SINCE=''
AVC_SINCE_EXPLICIT=0
ALLOW_UNLABELED_MOUNTS=0
declare -a EXTRA_PATHS=()

RED=''; YELLOW=''; GREEN=''; BOLD=''; RESET=''
if [ -t 1 ]; then RED=$'\033[31m'; YELLOW=$'\033[33m'; GREEN=$'\033[32m'; BOLD=$'\033[1m'; RESET=$'\033[0m'; fi

say()  { printf '%s\n' "$*"; }
head1() { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$RESET"; }
ok()   { printf '  %s[ ok ]%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s[warn]%s %s\n' "$YELLOW" "$RESET" "$*"; }
bad()  { printf '  %s[fail]%s %s\n' "$RED" "$RESET" "$*"; }
info() { printf '  %s\n' "$*"; }

usage() {
    cat <<'USAGE'
Usage: selinux-normalize.sh [STAGE] [options]

Stages (each one re-runs the ones before it that are read-only):
  inspect     Report SELinux state, Kubernetes state, discovered storage and current labels.
  validate    inspect + assert every precondition for a safe normalization. Read-only.
  normalize   Register the persistent container_file_t mappings and restore the discovered
              storage roots. Requires --apply to mutate.
  verify      Re-check labels, workload health and fresh AVC denials since the last normalize.
  enforce     Transition Permissive -> Enforcing, only if verify passes. Requires --apply.
  rollback    Undo the fcontext mappings this script added, and restore the affected trees.
              Requires --apply.
  mark        Move the denial window to now, without touching labels or SELinux mode. Use after
              suspending or fixing a workload, so verify measures the state you just created
              rather than the denials that led you to change it. Requires --apply.

Options:
  --apply             Perform mutations. Without it, mutating stages only report.
  --yes               Do not prompt before the Enforcing transition.
  --allow-unlabeled-mounts
                      Let verify pass with workload hostPath mounts still unresolved. Those
                      mounts deny under Enforcing; only pass this once you have decided each
                      one is acceptable to break.
  --path PATH         Additional node storage root to include (repeatable).
  --since WHEN        ausearch window for the AVC scan (default: recent).
  -h, --help          This text.

Exit codes: 0 success, 1 stage failed / unsafe to proceed, 2 usage or missing tooling.
USAGE
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        inspect|validate|normalize|verify|enforce|rollback|mark) STAGE="$1"; shift ;;
        --apply) APPLY=1; shift ;;
        --yes) ASSUME_YES=1; shift ;;
        --allow-unlabeled-mounts) ALLOW_UNLABELED_MOUNTS=1; shift ;;
        --path) [ "$#" -ge 2 ] || { echo "--path requires a value" >&2; exit 2; }; EXTRA_PATHS+=("$2"); shift 2 ;;
        --since) [ "$#" -ge 2 ] || { echo "--since requires a value" >&2; exit 2; }; AVC_SINCE="$2"; AVC_SINCE_EXPLICIT=1; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
    esac
done

SUDO=''
SUDO_RO=''
if [ "$(id -u)" -ne 0 ]; then
    SUDO='sudo'
    # Read-only probes never prompt: an inspect/validate/verify run must not block on a password,
    # and a probe that cannot elevate degrades to "unknown" rather than hanging the operator.
    SUDO_RO='sudo -n'
fi

privileged_read() {
    if [ -z "$SUDO_RO" ]; then "$@"; else $SUDO_RO "$@"; fi
}

run() {
    if [ "$APPLY" -eq 1 ]; then
        info "+ $*"
        eval "$@"
    else
        info "would run: $*"
    fi
}

# ---------------------------------------------------------------------------- inspect: SELinux

SELINUX_ENABLED=0
SELINUX_MODE='unknown'
SELINUX_CONFIG_MODE='unknown'
SELINUX_POLICY='unknown'
HAVE_SEMANAGE=0
HAVE_RESTORECON=0
HAVE_AUSEARCH=0

inspect_selinux() {
    head1 'SELinux state'
    if ! command -v getenforce >/dev/null 2>&1; then
        bad 'getenforce is missing: SELinux userspace is not installed.'
        info 'Remediation: dnf install -y policycoreutils policycoreutils-python-utils selinux-policy-targeted audit'
        return
    fi
    SELINUX_MODE="$(getenforce)"
    command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled && SELINUX_ENABLED=1
    [ -r /etc/selinux/config ] && SELINUX_CONFIG_MODE="$(awk -F= '/^SELINUX=/{print $2}' /etc/selinux/config)"
    [ -r /etc/selinux/config ] && SELINUX_POLICY="$(awk -F= '/^SELINUXTYPE=/{print $2}' /etc/selinux/config)"
    command -v semanage    >/dev/null 2>&1 && HAVE_SEMANAGE=1
    command -v restorecon  >/dev/null 2>&1 && HAVE_RESTORECON=1
    command -v ausearch    >/dev/null 2>&1 && HAVE_AUSEARCH=1

    info "runtime mode      : $SELINUX_MODE"
    info "config mode       : $SELINUX_CONFIG_MODE"
    info "policy            : $SELINUX_POLICY"
    info "semanage present  : $([ "$HAVE_SEMANAGE" -eq 1 ] && echo yes || echo 'no  <-- policycoreutils-python-utils')"
    info "restorecon present: $([ "$HAVE_RESTORECON" -eq 1 ] && echo yes || echo 'no  <-- policycoreutils')"
    info "ausearch present  : $([ "$HAVE_AUSEARCH" -eq 1 ] && echo yes || echo 'no  <-- audit')"
    [ -e /.autorelabel ] && warn '/.autorelabel is present: the next boot will relabel the whole filesystem.'
    return 0
}

# ------------------------------------------------------------------------- inspect: Kubernetes

KUBE_AVAILABLE=0
NODES_TOTAL=0
NODES_READY=0
declare -a STORAGE_PATHS=()
declare -a MANAGED_ROOTS=()
declare -a PV_SUBTREES=()
declare -a ROOT_REASON=()
declare -a REFUSED=()
declare -a UNCOVERED=()
declare -a POD_HOSTPATHS=()
declare -a RESIDUAL=()
declare -a AUDIT_SINCE_ARGS=(-ts recent)

kubectl_q() { kubectl --request-timeout="$KUBECTL_TIMEOUT" "$@" 2>/dev/null; }

inspect_kubernetes() {
    head1 'Kubernetes state'
    if ! command -v kubectl >/dev/null 2>&1; then
        warn 'kubectl is not on PATH; storage discovery falls back to the declared platform roots.'
        return 0
    fi
    if ! kubectl_q version -o json >/dev/null; then
        warn 'No reachable API server; storage discovery falls back to the declared platform roots.'
        return 0
    fi
    KUBE_AVAILABLE=1
    local nodes
    nodes="$(kubectl_q get nodes --no-headers || true)"
    NODES_TOTAL="$(printf '%s' "$nodes" | grep -c . || true)"
    NODES_READY="$(printf '%s' "$nodes" | awk '$2 ~ /(^|,)Ready(,|$)/' | grep -c . || true)"
    info "nodes ready       : ${NODES_READY}/${NODES_TOTAL}"
    info "this host         : $(hostname)"
    return 0
}

# Paths that must never receive the shared container label, whatever discovery turns up.
#
# A pod hostPath is not evidence that a directory is workload data: the CNI plugin directory, the
# container runtime socket, /proc and the kubelet tree are all mounted into pods and every one of
# them has a policy type that exists for a reason. Relabeling /opt/cni/bin would strip `bin_t`
# from the calico executables the kubelet runs.
PROTECTED_PATHS_REGEX='^(/|/usr|/etc|/bin|/sbin|/lib|/lib64|/boot|/proc|/sys|/dev|/run|/var|/var/lib|/var/run|/var/log|/var/lib/kubelet|/var/lib/containerd|/var/lib/docker|/var/lib/etcd|/var/lib/calico|/var/lib/cni|/opt|/opt/cni|/opt/cni/bin|/home|/root|/srv|/mnt|/tmp)$'

# Types whose whole purpose is something other than container data. `usr_t` is deliberately absent:
# it is the policy default under /opt and is exactly what the local-path provisioner root wrongly
# carries, so refusing it would refuse the fix.
PROTECTED_TYPES='bin_t lib_t shell_exec_t etc_t kubernetes_file_t container_runtime_exec_t container_var_lib_t cni_var_lib_t systemd_unit_file_t passwd_file_t shadow_t admin_home_t'

# The node directory backing every hostPath PersistentVolume the deploy flow materializes. Read
# from the source of truth the CLI itself uses, so the script and the code can never disagree.
resolve_host_volume_root() {
    local repo_env script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    repo_env="$script_dir/../src/server/runtime/environment.js"
    if [ -r "$repo_env" ]; then
        local value
        value="$(sed -nE "s/^const HOST_VOLUME_ROOT = '([^']+)';.*/\1/p" "$repo_env" | head -1)"
        [ -n "$value" ] && { printf '%s' "$value"; return 0; }
    fi
    printf '%s' "${UNDERPOST_HOST_VOLUME_ROOT:-/home/dd/engine/volume}"
}

is_protected_path() {
    printf '%s' "$1" | grep -qE "$PROTECTED_PATHS_REGEX"
}

is_protected_type() {
    local type; type="$(path_type "$1")"
    [ -n "$type" ] || return 1
    printf '%s' " $PROTECTED_TYPES " | grep -q " $type "
}

# Classifies a pod hostPath mount so the report separates the mounts that need an operator
# decision from the ones whose current type is already correct.
#
#   system  the path is inside a protected tree, or already carries a type the container policy
#           defines for that role (`container_var_lib_t`, `cert_t`, `proc_t`, `kubernetes_file_t`
#           …). These are mounted by privileged system DaemonSets and are not workload data.
#   ok      already container-accessible.
#   review  neither — the only class worth acting on.
classify_pod_mount() {
    local path="$1" type="$2"
    [ -e "$path" ] || { printf 'absent'; return 0; }
    [ "$type" = "$SHARED_TYPE" ] && { printf 'ok'; return 0; }
    is_protected_path "$path" && { printf 'system'; return 0; }
    case "$type" in
        container_*|proc_t|sysfs_t|cert_t|kubernetes_file_t|modules_object_t|iptables_var_run_t|var_run_t|var_lib_t|root_t|etc_t|bin_t|lib_t|shell_exec_t)
            printf 'system'; return 0 ;;
    esac
    printf 'review'
}

# Storage discovery, in three tiers with different authority:
#
#   managed roots   mapped with `semanage fcontext` and relabeled recursively. Only directories
#                   this platform owns end up here: its declared data roots, the local-path
#                   provisioner's configured node roots, and anything the operator named.
#   PV subtrees     node-local paths a PersistentVolume actually references. Used to prove the
#                   managed roots cover the live storage; one that is not covered is reported
#                   and skipped, never silently relabeled or promoted to a root of its own.
#   pod hostPaths   reported only. A pod mounting a host directory says nothing about whether
#                   that directory is workload data.
discover_pv_paths() {
    head1 'PersistentVolume / PersistentVolumeClaim storage discovery'
    local host_volume_root; host_volume_root="$(resolve_host_volume_root)"

    if [ "$KUBE_AVAILABLE" -eq 1 ]; then
        local rows
        rows="$(kubectl_q get pv -o custom-columns=\
NAME:.metadata.name,CLASS:.spec.storageClassName,PHASE:.status.phase,\
CLAIM:.spec.claimRef.name,HOSTPATH:.spec.hostPath.path,LOCALPATH:.spec.local.path || true)"
        if [ -n "$rows" ]; then
            printf '%s\n' "$rows" | sed 's/^/  /'
            local name class phase claim hostpath localpath path
            while read -r name class phase claim hostpath localpath; do
                [ -n "$name" ] && [ "$name" != 'NAME' ] || continue
                path=''
                [ "$hostpath" != '<none>' ] && path="$hostpath"
                [ -z "$path" ] && [ "$localpath" != '<none>' ] && path="$localpath"
                [ -n "$path" ] && PV_SUBTREES+=("$path") || true
            done <<< "$rows"
        else
            info 'no PersistentVolumes found'
        fi

        # Dynamically provisioned claims have no path of their own: the data is a subdirectory of
        # the provisioner's node root, so the root is what must carry the label. Read it from the
        # live ConfigMap rather than assuming the upstream default.
        local ns cfg roots root
        for ns in local-path-storage kube-system; do
            cfg="$(kubectl_q get configmap local-path-config -n "$ns" -o jsonpath='{.data.config\.json}' || true)"
            [ -n "$cfg" ] || continue
            roots="$(printf '%s' "$cfg" | tr -d ' \n' | grep -oE '"paths":\[[^]]*\]|"sharedFileSystemPath":"[^"]*"' | grep -oE '/[^",]+' || true)"
            if [ -n "$roots" ]; then
                say ''
                info "local-path provisioner (ns/$ns) node roots:"
                while read -r root; do
                    [ -n "$root" ] || continue
                    info "  $root"
                    MANAGED_ROOTS+=("$root")
                    ROOT_REASON+=("$root|local-path provisioner node root (ns/$ns)")
                done <<< "$roots"
            fi
            break
        done

        # Reported, never labeled. A host directory being mounted into a pod says nothing about
        # whether it holds workload data, so the decision is left to the operator — but each mount
        # is classified so the handful that actually need a decision are not buried under the
        # couple of dozen host-integration mounts every CNI and kubelet DaemonSet carries.
        #
        # `go-template` rather than `jsonpath`: inside a nested range, jsonpath's `$` resolves to
        # the document root, not the enclosing item, so the pod's own namespace and name came back
        # empty and every row read as a bare "/".
        local pod_rows p pods current class width
        #
        # Three sources, not one. A pod only exists while it runs, so reading pods alone reports a
        # clean host for a CronJob that is merely scheduled — its mount reappears at the next fire.
        # The workload templates are the durable declaration and are what must be audited.
        # Terminal pods are excluded for the mirror-image reason: a finished Job cannot produce
        # another denial, and its own template already speaks for the next run.
        pod_rows="$(
            {
                kubectl_q get pods -A --field-selector=status.phase!=Succeeded,status.phase!=Failed \
                    -o go-template='{{range .items}}{{$ns := .metadata.namespace}}{{$n := .metadata.name}}{{range .spec.volumes}}{{if .hostPath}}{{.hostPath.path}}{{"\t"}}{{$ns}}/{{$n}}{{"\n"}}{{end}}{{end}}{{end}}' || true
                kubectl_q get deployments,statefulsets,daemonsets,jobs,replicasets -A \
                    -o go-template='{{range .items}}{{$ns := .metadata.namespace}}{{$k := .kind}}{{$n := .metadata.name}}{{range .spec.template.spec.volumes}}{{if .hostPath}}{{.hostPath.path}}{{"\t"}}{{$ns}}/{{$k}}/{{$n}}{{"\n"}}{{end}}{{end}}{{end}}' || true
                kubectl_q get cronjobs -A \
                    -o go-template='{{range .items}}{{$ns := .metadata.namespace}}{{$n := .metadata.name}}{{if not .spec.suspend}}{{range .spec.jobTemplate.spec.template.spec.volumes}}{{if .hostPath}}{{.hostPath.path}}{{"\t"}}{{$ns}}/CronJob/{{$n}}{{"\n"}}{{end}}{{end}}{{end}}{{end}}' || true
            } | grep -E '^/' | sort -u || true
        )"
        if [ -n "$pod_rows" ]; then
            say ''
            info 'hostPath mounts declared by live pods and workload templates (never relabeled here):'
            width="$(printf '%s\n' "$pod_rows" | cut -f1 | awk '{ if (length($0) > m) m = length($0) } END { print (m > 58 ? 58 : (m < 24 ? 24 : m)) }')"
            printf "  %-${width}s %-22s %-8s %s\n" PATH 'CURRENT TYPE' CLASS 'MOUNTED BY'
            while read -r p; do
                [ -n "$p" ] || continue
                pods="$(printf '%s\n' "$pod_rows" | awk -F'\t' -v k="$p" '$1 == k {print $2}' | paste -sd, - | cut -c1-56)"
                current="$(path_type "$p")"
                class="$(classify_pod_mount "$p" "$current")"
                printf "  %-${width}s %-22s %-8s %s\n" "$p" "${current:-absent}" "$class" "$pods"
                [ "$class" = 'review' ] && POD_HOSTPATHS+=("$p") || true
            done <<< "$(printf '%s\n' "$pod_rows" | cut -f1 | sort -u)"
            info 'system  = host-integration mount (CNI, kubelet, runtime, /proc); its type is correct as-is.'
            info 'ok      = already container-accessible.'
            info 'absent  = not present on this node (a mount belonging to a pod scheduled elsewhere).'
            info 'review  = none of the above, and outside every managed root — the rows needing a decision.'
        fi
    fi

    # Declared platform roots. Kept even when the API is reachable: a root can exist on this node
    # with no object currently referencing it (a Retained volume between deploys).
    MANAGED_ROOTS+=('/data')
    ROOT_REASON+=('/data|declared platform data root')
    MANAGED_ROOTS+=("$host_volume_root")
    ROOT_REASON+=("$host_volume_root|declared hostPath volume root (HOST_VOLUME_ROOT)")
    if [ "$KUBE_AVAILABLE" -ne 1 ]; then
        MANAGED_ROOTS+=('/opt/local-path-provisioner')
        ROOT_REASON+=('/opt/local-path-provisioner|local-path provisioner default root (no API to query)')
    fi
    local extra
    for extra in ${EXTRA_PATHS[@]+"${EXTRA_PATHS[@]}"}; do
        MANAGED_ROOTS+=("$extra")
        ROOT_REASON+=("$extra|named by the operator with --path")
    done

    # Collapse to non-overlapping roots: an fcontext expression is `<root>(/.*)?`, so a nested
    # entry is a redundant rule and a second relabel pass over the same tree. Only managed roots
    # take part — a discovered subtree can never absorb or widen one.
    local sorted candidate covered root
    sorted="$(printf '%s\n' "${MANAGED_ROOTS[@]}" | sed 's:/*$::' | grep -E '^/.+' | sort -u)"
    MANAGED_ROOTS=()
    while read -r candidate; do
        [ -n "$candidate" ] || continue
        covered=0
        while read -r root; do
            { [ -n "$root" ] && [ "$root" != "$candidate" ] && case "$candidate" in "$root"/*) covered=1 ;; esac; } || true
        done <<< "$sorted"
        [ "$covered" -eq 0 ] && MANAGED_ROOTS+=("$candidate") || true
    done <<< "$sorted"

    # Refuse anything whose type or path says it is not workload data, before it can be reported
    # as an intended change. A refusal is fatal in `validate`, so it can never reach `--apply`.
    STORAGE_PATHS=()
    for candidate in "${MANAGED_ROOTS[@]}"; do
        if is_protected_path "$candidate"; then
            REFUSED+=("$candidate|system directory; relabeling it would change the policy type of host-owned files")
            continue
        fi
        if is_protected_type "$candidate"; then
            REFUSED+=("$candidate|carries the protected type '$(path_type "$candidate")'; that type is not container data")
            continue
        fi
        STORAGE_PATHS+=("$candidate")
    done

    head1 'Storage roots selected for labeling'
    if [ "${#STORAGE_PATHS[@]}" -eq 0 ]; then
        warn 'none'
    else
        local reason entry
        for candidate in "${STORAGE_PATHS[@]}"; do
            reason=''
            for entry in ${ROOT_REASON[@]+"${ROOT_REASON[@]}"}; do
                [ "${entry%%|*}" = "$candidate" ] && reason="${entry#*|}"
            done
            printf '  %-42s %s\n' "$candidate" "${reason:-discovered}"
        done
    fi

    if [ "${#REFUSED[@]}" -gt 0 ]; then
        head1 'Refused (never relabeled)'
        for candidate in "${REFUSED[@]}"; do
            printf '  %-42s %s\n' "${candidate%%|*}" "${candidate#*|}"
        done
    fi

    # Every live PersistentVolume path must fall inside a managed root, otherwise its data is not
    # actually being fixed by this run and the operator has to say so explicitly.
    UNCOVERED=()
    local subtree
    for subtree in ${PV_SUBTREES[@]+"${PV_SUBTREES[@]}"}; do
        covered=0
        for root in ${STORAGE_PATHS[@]+"${STORAGE_PATHS[@]}"}; do
            { [ "$subtree" = "$root" ] || case "$subtree" in "$root"/*) covered=1 ;; esac; } || true
            [ "$subtree" = "$root" ] && covered=1 || true
        done
        [ "$covered" -eq 0 ] && UNCOVERED+=("$subtree") || true
    done
    if [ "${#UNCOVERED[@]}" -gt 0 ]; then
        head1 'PersistentVolume paths NOT covered by any managed root'
        printf '%s\n' "${UNCOVERED[@]}" | sort -u | sed 's/^/  /'
        warn 'These are not labeled by this run. Add one with --path if it is genuinely workload data.'
    fi

    # POD_HOSTPATHS now holds only the mounts classified `review`: not a system path, not already
    # container-accessible. Those still inside a managed root are fine — the relabel covers them.
    # Whatever is left is the complete set of places a denial can still come from after this run.
    local mount current
    RESIDUAL=()
    for mount in ${POD_HOSTPATHS[@]+"${POD_HOSTPATHS[@]}"}; do
        [ -e "$mount" ] || continue
        covered=0
        for root in ${STORAGE_PATHS[@]+"${STORAGE_PATHS[@]}"}; do
            { [ "$mount" = "$root" ] && covered=1; } || case "$mount" in "$root"/*) covered=1 ;; esac
        done
        [ "$covered" -eq 0 ] && RESIDUAL+=("$mount|$(path_type "$mount")") || true
    done
    if [ "${#RESIDUAL[@]}" -gt 0 ]; then
        head1 'Workload hostPath mounts this run does not fix'
        for mount in "${RESIDUAL[@]}"; do
            printf '  %-52s %s\n' "${mount%%|*}" "${mount#*|}"
        done
        info 'Deliberate exclusions, and the only remaining source of a container denial. If a'
        info '  workload genuinely needs to read or write one, move that data under a storage root,'
        info '  or name the specific subdirectory with --path — never the whole tree.'
    fi
    return 0
}

# Prints the SELinux type of a path, or nothing when it cannot be read.
#
# Never fails. `set -o pipefail` makes `ls -Zd <missing> | awk ...` a failing pipeline, and a
# `current="$(path_type "$p")"` assignment takes that status — which under `set -e` aborted the
# whole run on the first path that does not exist on this node (a mount belonging to a pod on
# another node, or a PV pinned elsewhere).
path_type() {
    [ -e "$1" ] || return 0
    { ls -Zd "$1" 2>/dev/null || true; } | awk '{print $1}' | awk -F: '{print $3}' || true
}

report_labels() {
    head1 'Current labels vs intended'
    printf '  %-46s %-22s %-22s %s\n' PATH CURRENT INTENDED ACTION
    local path current mismatched=0 missing=0
    for path in "${STORAGE_PATHS[@]}"; do
        if [ ! -e "$path" ]; then
            printf '  %-46s %-22s %-22s %s\n' "$path" '(absent)' "$SHARED_TYPE" 'create + label'
            missing=$((missing + 1))
            continue
        fi
        current="$(path_type "$path")"
        if [ "$current" = "$SHARED_TYPE" ]; then
            printf '  %-46s %-22s %-22s %s\n' "$path" "$current" "$SHARED_TYPE" 'none'
        else
            printf '  %-46s %-22s %-22s %s\n' "$path" "${current:-unknown}" "$SHARED_TYPE" 'relabel'
            mismatched=$((mismatched + 1))
        fi
    done
    # Nested entries carrying a stale label under an already-correct root: `restorecon -R` fixes
    # them, and this is what proves the recursion is actually needed.
    local stale
    for path in "${STORAGE_PATHS[@]}"; do
        [ -d "$path" ] || continue
        stale="$(privileged_read find "$path" -mindepth 1 -maxdepth 3 -exec ls -Zd {} + 2>/dev/null \
            | awk -F: -v t="$SHARED_TYPE" '$3 != t' | head -5 || true)"
        [ -n "$stale" ] && { warn "entries under $path carrying a non-$SHARED_TYPE type:"; printf '%s\n' "$stale" | sed 's/^/      /'; }
    done
    MISMATCHED_COUNT="$mismatched"
    MISSING_COUNT="$missing"
    return 0
}

# Timestamp of the last applied normalization, in ausearch's own format.
normalize_marker_file() { printf '%s/last-normalize.txt' "$STATE_DIR"; }

# Resolves the audit window into ausearch arguments.
#
# Defaults to the moment the last `normalize --apply` finished rather than to `recent`: the
# denials this run just fixed are still inside a ten-minute `recent` window, so verifying against
# it would count the very records the relabel eliminated and never report a clean host. An
# explicit `--since` always wins.
resolve_avc_window() {
    AUDIT_SINCE_ARGS=()
    local marker; marker="$(normalize_marker_file)"
    if [ "$AVC_SINCE_EXPLICIT" -eq 0 ] && [ -r "$marker" ]; then
        local stamp; stamp="$(head -1 "$marker")"
        if [ -n "$stamp" ]; then
            # shellcheck disable=SC2206 -- deliberate split: ausearch takes date and time as two args.
            AUDIT_SINCE_ARGS=(-ts $stamp)
            AVC_SINCE="$stamp (last applied normalization)"
            return 0
        fi
    fi
    [ -n "$AVC_SINCE" ] || AVC_SINCE='recent'
    AUDIT_SINCE_ARGS=(-ts "$AVC_SINCE")
    return 0
}

report_avc() {
    resolve_avc_window
    head1 "AVC denials since: $AVC_SINCE"
    if [ "$HAVE_AUSEARCH" -ne 1 ]; then
        warn 'ausearch is unavailable; install the audit package to see denials.'
        AVC_COUNT=-1
        return 0
    fi
    local raw
    if ! privileged_read ausearch -m AVC,USER_AVC,SELINUX_ERR "${AUDIT_SINCE_ARGS[@]}" --raw >/dev/null 2>&1; then
        if [ "$(id -u)" -ne 0 ] && ! sudo -n true 2>/dev/null; then
            warn 'the audit log needs root and passwordless sudo is unavailable; re-run this stage as root.'
            AVC_COUNT=-1
            return 0
        fi
    fi
    raw="$(privileged_read ausearch -m AVC,USER_AVC,SELINUX_ERR "${AUDIT_SINCE_ARGS[@]}" --raw 2>/dev/null || true)"
    AVC_COUNT="$(printf '%s' "$raw" | grep -c 'avc:  denied' || true)"
    if [ "$AVC_COUNT" -eq 0 ]; then
        ok 'no denials in the window'
        return 0
    fi
    warn "$AVC_COUNT denial record(s); grouped by source domain, target type and target class:"
    local denials
    denials="$(printf '%s' "$raw" | grep 'avc:  denied' || true)"
    printf '%s' "$denials" \
        | sed -E 's/.*comm="?([^" ]+)"?.*scontext=([^ ]+).*tcontext=([^ ]+).*tclass=([^ ]+).*/\1 \2 \3 \4/' \
        | awk '{ sub(/:c[0-9,c]+$/, "", $2); print }' \
        | sort | uniq -c | sort -rn | head -20 | sed 's/^/      /'

    # Not every denial is a labeling problem, and telling an operator to relabel something that
    # carries no file label at all sends them after the wrong fix. A denial whose target class is
    # a filesystem object is answered by `normalize`; one whose target is another domain — MCS
    # category separation on a keyring, a socket, a process — is not, and stays after any relabel.
    AVC_FILE_COUNT="$(printf '%s' "$denials" | grep -cE 'tclass=(file|dir|lnk_file|chr_file|blk_file|fifo_file|sock_file)' || true)"
    AVC_OTHER_COUNT=$((AVC_COUNT - AVC_FILE_COUNT))
    say ''
    info "filesystem-object denials : $AVC_FILE_COUNT  (resolved by labeling — see the mount report above)"
    info "other-class denials       : $AVC_OTHER_COUNT  (NOT resolved by labeling)"
    if [ "$AVC_OTHER_COUNT" -gt 0 ]; then
        printf '%s' "$denials" \
            | grep -vE 'tclass=(file|dir|lnk_file|chr_file|blk_file|fifo_file|sock_file)' \
            | sed -E 's/.*comm="?([^" ]+)"?.*tclass=([^ ]+).*/\1 tclass=\2/' \
            | sort | uniq -c | sort -rn | head -10 | sed 's/^/      /'
        info 'Relabeling will not clear these. Confirm each is tolerated by the workload before'
        info '  enforcing — a keyring or socket probe an application already ignores is harmless,'
        info '  a denial it depends on is not.'
    fi
    return 0
}

# ---------------------------------------------------------------------------------- validate

validate() {
    head1 'Preconditions'
    local failures=0

    if [ "$SELINUX_ENABLED" -ne 1 ]; then
        bad 'SELinux is disabled. A relabel is meaningless until it is enabled and the filesystem'
        info '  has been relabeled at boot. Set SELINUX=permissive in /etc/selinux/config, touch'
        info '  /.autorelabel, and reboot during a maintenance window before running this script.'
        failures=$((failures + 1))
    else
        ok "SELinux enabled, mode $SELINUX_MODE, policy $SELINUX_POLICY"
    fi

    if [ "$SELINUX_POLICY" != 'targeted' ]; then
        bad "policy is '$SELINUX_POLICY'; this script only reasons about the targeted policy."
        failures=$((failures + 1))
    fi

    if [ "$HAVE_SEMANAGE" -ne 1 ]; then
        bad 'semanage is missing. Persistent mappings cannot be registered, and chcon alone would'
        info '  be undone by the next relabel. Remediation:'
        info "    $SUDO dnf install -y policycoreutils-python-utils"
        failures=$((failures + 1))
    else
        ok 'semanage available'
    fi

    if [ "$HAVE_RESTORECON" -ne 1 ]; then
        bad "restorecon is missing. Remediation: $SUDO dnf install -y policycoreutils"
        failures=$((failures + 1))
    else
        ok 'restorecon available'
    fi

    if [ "$KUBE_AVAILABLE" -eq 1 ]; then
        if [ "$NODES_TOTAL" -gt 0 ] && [ "$NODES_READY" -eq "$NODES_TOTAL" ]; then
            ok "all $NODES_TOTAL node(s) Ready"
        else
            warn "$NODES_READY/$NODES_TOTAL nodes Ready — normalization is still safe (it touches no"
            info '  workload), but do not proceed to the Enforcing stage on a degraded cluster.'
        fi
        local notrunning
        notrunning="$(kubectl_q get pods -A --no-headers | awk '$4 !~ /^(Running|Completed|Succeeded)$/' | grep -c . || true)"
        [ "$notrunning" -eq 0 ] && ok 'every pod is Running/Completed' \
            || warn "$notrunning pod(s) are neither Running nor Completed"
    else
        warn 'Kubernetes is unreachable; discovery used the declared platform roots only.'
    fi

    if [ "${#STORAGE_PATHS[@]}" -eq 0 ]; then
        bad 'discovery selected no storage root; there is nothing this run could normalize.'
        failures=$((failures + 1))
    fi

    # Belt and braces: the same guard discovery already applied, re-checked here so a future
    # change to discovery cannot route around it on the way to `--apply`.
    local path
    for path in ${STORAGE_PATHS[@]+"${STORAGE_PATHS[@]}"}; do
        if is_protected_path "$path"; then
            bad "refusing to operate on system directory '$path'"
            failures=$((failures + 1))
        elif is_protected_type "$path"; then
            bad "refusing to relabel '$path': it carries the protected type '$(path_type "$path")'"
            failures=$((failures + 1))
        fi
    done

    if [ "${#REFUSED[@]}" -gt 0 ]; then
        ok "${#REFUSED[@]} discovered path(s) excluded by the protection rules (listed above)"
    fi
    if [ "${#UNCOVERED[@]}" -gt 0 ]; then
        warn "${#UNCOVERED[@]} PersistentVolume path(s) fall outside every managed root and will not be"
        info '  labeled by this run. That is correct for a volume pinned to another node; for one on'
        info '  this node it means the fix is incomplete — add it with --path.'
    fi

    if [ "$failures" -eq 0 ]; then
        ok 'all preconditions met'
        return 0
    fi
    bad "$failures precondition(s) failed; no mutation will be attempted."
    return 1
}

# --------------------------------------------------------------------------------- normalize

state_file() { printf '%s/fcontext-added.txt' "$STATE_DIR"; }

record_state() {
    [ "$APPLY" -eq 1 ] || return 0
    $SUDO install -d -m 0750 "$STATE_DIR"
    printf '%s\n' "$1" | $SUDO tee -a "$(state_file)" >/dev/null
}

fcontext_registered() {
    privileged_read semanage fcontext -l 2>/dev/null | grep -qE "^$(printf '%s' "$1" | sed 's/[][\\.^$*+?(){}|]/\\&/g')\(/\.\*\)\? " || return 1
}

normalize() {
    head1 'Normalizing labels'
    [ "$APPLY" -eq 1 ] || warn 'dry run: pass --apply to perform these changes'
    local path expr
    for path in "${STORAGE_PATHS[@]}"; do
        expr="${path}(/.*)?"
        if [ ! -e "$path" ]; then
            # Only ever created, never re-moded: an existing tree keeps the ownership and mode the
            # workload's own init container set.
            run "$SUDO install -d -m 0755 '$path'"
        fi
        if fcontext_registered "$path"; then
            ok "mapping already registered: $expr -> $SHARED_TYPE"
        else
            # `-a` falls back to `-m`: some semanage versions treat an entry that already exists
            # as an error rather than a warning, and under `set -e` that would abort the run
            # partway through, leaving some roots relabeled and others not.
            run "$SUDO semanage fcontext -a -t $SHARED_TYPE '$expr' 2>/dev/null || $SUDO semanage fcontext -m -t $SHARED_TYPE '$expr'"
            # Recorded only when the mapping was absent beforehand, so a rollback never deletes an
            # entry that a previous `underpost cluster` run legitimately owns.
            record_state "$path"
        fi
    done
    for path in "${STORAGE_PATHS[@]}"; do
        [ -e "$path" ] || continue
        # -R descends into the volume trees; -F resets the SELinux user as well, because entries
        # created by the CLI carry unconfined_u where the runtime's carry system_u. Contents,
        # ownership, mode, ACLs and other xattrs are untouched.
        #
        # `|| true` on the pipeline: restorecon exits non-zero when it cannot relabel a single
        # entry (a file deleted mid-walk by a running database is routine), and one such entry
        # must not abandon the remaining roots. A leftover mislabel is caught by `verify`.
        run "{ $SUDO restorecon -RFv '$path' || true; } | tail -40"
    done
    if [ "$APPLY" -eq 1 ]; then
        # Written last: `verify` measures denials from here, so it must mark the point at which
        # every label was already correct.
        $SUDO install -d -m 0750 "$STATE_DIR"
        date '+%m/%d/%Y %H:%M:%S' | $SUDO tee "$(normalize_marker_file)" >/dev/null
        ok 'normalization applied'
        info "verify will count denials from $(cat "$(normalize_marker_file)" 2>/dev/null || echo now)"
    else
        warn 'nothing was changed'
    fi
    return 0
}

# ------------------------------------------------------------------------------------ verify

verify() {
    head1 'Verification'
    local failures=0

    report_labels
    if [ "${MISMATCHED_COUNT:-0}" -eq 0 ] && [ "${MISSING_COUNT:-0}" -eq 0 ]; then
        ok 'every discovered storage root carries the shared container type'
    else
        bad "${MISMATCHED_COUNT:-0} root(s) mislabeled, ${MISSING_COUNT:-0} absent"
        failures=$((failures + 1))
    fi

    if [ "$KUBE_AVAILABLE" -eq 1 ]; then
        head1 'Workload health'
        local bound unbound
        bound="$(kubectl_q get pvc -A --no-headers | awk '$3 == "Bound"' | grep -c . || true)"
        unbound="$(kubectl_q get pvc -A --no-headers | awk '$3 != "Bound"' | grep -c . || true)"
        info "PVCs bound: $bound, not bound: $unbound"
        [ "$unbound" -eq 0 ] || { bad 'some PVCs are not Bound'; failures=$((failures + 1)); }

        local unhealthy
        unhealthy="$(kubectl_q get pods -A --no-headers | awk '$4 !~ /^(Running|Completed|Succeeded)$/' || true)"
        if [ -n "$unhealthy" ]; then
            bad 'pods not in a healthy phase:'
            printf '%s\n' "$unhealthy" | sed 's/^/      /'
            failures=$((failures + 1))
        else
            ok 'every pod is Running/Completed'
        fi

        local restarts
        restarts="$(kubectl_q get pods -A --no-headers | awk '$5 > 0 {print "      " $0}' | head -10 || true)"
        [ -n "$restarts" ] && { warn 'pods with restarts (check whether they predate this run):'; printf '%s\n' "$restarts"; }
    else
        warn 'Kubernetes unreachable; workload health could not be verified.'
        failures=$((failures + 1))
    fi

    # A scheduled workload declaring a mount no container can use is a denial that has not
    # happened yet, not an absent one — and it is invisible in the audit log until that workload
    # next runs. Failing here is what keeps `verify` from blessing a host whose nightly CronJob
    # breaks the moment Enforcing is active.
    if [ "${#RESIDUAL[@]}" -gt 0 ]; then
        if [ "$ALLOW_UNLABELED_MOUNTS" -eq 1 ]; then
            warn "${#RESIDUAL[@]} unresolved workload hostPath mount(s), accepted via --allow-unlabeled-mounts"
        else
            bad "${#RESIDUAL[@]} workload hostPath mount(s) are still unresolved (listed above). Each one"
            info '  denies under Enforcing the next time its workload runs, whether or not a pod exists now.'
            info '  Resolve them, or re-run with --allow-unlabeled-mounts to accept the breakage knowingly.'
            failures=$((failures + 1))
        fi
    fi

    local uncovered
    for uncovered in ${UNCOVERED[@]+"${UNCOVERED[@]}"}; do
        [ -e "$uncovered" ] || continue
        if [ "$(path_type "$uncovered")" != "$SHARED_TYPE" ]; then
            bad "$uncovered exists on this host, is not covered by any managed root, and carries"
            info "  '$(path_type "$uncovered")'. Re-run with --path '$uncovered' if it is workload data."
            failures=$((failures + 1))
        fi
    done

    report_avc
    if [ "${AVC_COUNT:-0}" -gt 0 ]; then
        bad "denials are still being recorded; do not transition to Enforcing yet."
        failures=$((failures + 1))
    elif [ "${AVC_COUNT:-0}" -lt 0 ]; then
        warn 'AVC state unknown (no ausearch); the Enforcing stage will refuse to run.'
        failures=$((failures + 1))
    fi

    head1 'Verdict'
    if [ "$failures" -eq 0 ]; then
        ok 'safe to proceed toward Enforcing'
        return 0
    fi
    bad "$failures check(s) failed; NOT safe to proceed toward Enforcing"
    return 1
}

# ----------------------------------------------------------------------------------- enforce

enforce() {
    head1 'Controlled Enforcing transition'
    if [ "$SELINUX_MODE" = 'Enforcing' ]; then
        ok 'already Enforcing; only the persisted config is checked'
    fi
    if [ "$APPLY" -ne 1 ]; then
        warn 'dry run: pass --apply to perform the transition'
    elif [ "$ASSUME_YES" -ne 1 ] && [ "$SELINUX_MODE" != 'Enforcing' ]; then
        printf '  Transition this host to Enforcing now? [y/N] '
        local answer; read -r answer
        case "$answer" in [yY]|[yY][eE][sS]) ;; *) warn 'aborted by operator'; return 1 ;; esac
    fi
    # setenforce first: it is instantly reversible with `setenforce 0` and needs no reboot. The
    # config file is only persisted after the runtime switch has been taken and re-verified, so a
    # host that misbehaves under Enforcing never reboots into it.
    run "$SUDO setenforce 1"
    if [ "$APPLY" -eq 1 ]; then
        say ''
        info 'Runtime mode is now Enforcing. Re-verifying before persisting the config...'
        AVC_SINCE="$(date '+%m/%d/%Y %H:%M:%S')"
        AVC_SINCE_EXPLICIT=1
        if ! verify; then
            bad 'post-transition verification failed. Reverting the runtime mode; config untouched.'
            $SUDO setenforce 0
            return 1
        fi
        run "$SUDO sed -i -E 's/^SELINUX=.*/SELINUX=enforcing/' /etc/selinux/config"
        ok 'Enforcing is now both active and persisted.'
        info "Revert at any time with: $SUDO setenforce 0"
        info "Revert persistently with: $SUDO sed -i -E 's/^SELINUX=.*/SELINUX=permissive/' /etc/selinux/config"
    fi
    return 0
}

# ---------------------------------------------------------------------------------- rollback

rollback() {
    head1 'Rollback'
    local file; file="$(state_file)"
    if [ ! -r "$file" ]; then
        warn "no recorded changes at $file; nothing to roll back"
        return 0
    fi
    [ "$APPLY" -eq 1 ] || warn 'dry run: pass --apply to perform the rollback'
    local path
    while read -r path; do
        [ -n "$path" ] || continue
        run "$SUDO semanage fcontext -d '${path}(/.*)?' || true"
        [ -e "$path" ] && run "$SUDO restorecon -RF '$path'" || true
    done < "$file"
    # Directories this script created and files it wrote are left in place: removing a node
    # storage root would destroy live PersistentVolume data.
    run "$SUDO rm -f '$file'"
    ok 'mappings this script added have been removed; storage contents were not touched.'
    return 0
}

# -------------------------------------------------------------------------------------- main

inspect_selinux
inspect_kubernetes
discover_pv_paths

case "$STAGE" in
    inspect)
        report_labels
        report_avc
        say ''
        info "Next: $0 validate"
        ;;
    validate)
        report_labels
        report_avc
        validate
        ;;
    normalize)
        validate || exit 1
        report_labels
        normalize
        say ''
        info "Next: $0 verify --since recent"
        ;;
    verify)
        verify
        ;;
    enforce)
        validate || exit 1
        verify || { bad 'refusing to transition to Enforcing while verification fails'; exit 1; }
        enforce
        ;;
    mark)
        head1 'Denial window'
        if [ "$APPLY" -eq 1 ]; then
            $SUDO install -d -m 0750 "$STATE_DIR"
            date '+%m/%d/%Y %H:%M:%S' | $SUDO tee "$(normalize_marker_file)" >/dev/null
            ok "verify will now count denials from $(cat "$(normalize_marker_file)")"
            info 'Labels and SELinux mode were not touched.'
        else
            warn 'dry run: pass --apply to move the window to now'
        fi
        ;;
    rollback)
        rollback
        ;;
    *)
        usage >&2; exit 2 ;;
esac
