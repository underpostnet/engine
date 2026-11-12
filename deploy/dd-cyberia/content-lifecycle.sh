#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

DEPLOY_ID=dd-cyberia
DEPLOY_ENV="${DEPLOY_ENV:-production}"
# The host .env names the deploy of the host: each Cyberia command names this deploy.
ENV_PATH="./engine-private/conf/$DEPLOY_ID/.env.$DEPLOY_ENV"

# The scope of a new cycle, as comma-separated codes: what the cycle is about. The capture always
# takes every world the active release serves.
CYCLE_SAGAS="${CYCLE_SAGAS:-}"
CYCLE_INSTANCES="${CYCLE_INSTANCES:-}"
CYCLE_MAPS="${CYCLE_MAPS:-}"
CYCLE_ITEMS="${CYCLE_ITEMS:-}"
# The workstation peer the cycle opens to when the control node stages are complete; empty opens
# no share. SHARE_HOURS is the life of the share; empty keeps the CLI default.
WORKSTATION_PEER_ID="${WORKSTATION_PEER_ID:-}"
SHARE_HOURS="${SHARE_HOURS:-}"

# The stages of the control node before the handoff, in cycle order.
CONTROL_STAGES=(preflight infrastructure-backup baseline-capture baseline-verify)

CYCLE_ID=""
NEXT_STAGE=""

# One bin/cyberia command on the Cyberia deploy. Each argument stays one word.
#
# Usage: cyberia <args...>
cyberia() {
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin/cyberia $(printf '%q ' "$@")--env-path $ENV_PATH"
}

# Prints <expression> of the JSON document a bin/cyberia command prints, as `data`. The log lines
# around the document are dropped. On a failure, the output goes to stderr with the exit code.
#
# Usage: cyberia_json <expression> <args...>
cyberia_json() {
    local expression="$1" output status=0
    shift
    output="$(cyberia "$@")" || status=$?
    if [ "$status" -ne 0 ]; then
        printf '%s\n' "$output" >&2
        return "$status"
    fi
    printf '%s' "$output" | node -e '
        const text = require("fs").readFileSync(0, "utf8");
        const start = text.search(/^\{$/m);
        if (start < 0) throw new Error(`No JSON document in the output:\n${text}`);
        const data = JSON.parse(text.slice(start, text.indexOf("\n}", start) + 2));
        process.stdout.write(String(new Function("data", `return ${process.argv[1]}`)(data)));
    ' "$expression"
}

# The share prints a credential to the terminal: refuse before any stage runs when there is none.
require_terminal() {
    { : >/dev/tty; } 2>/dev/null && return 0
    echo "$RUN_QUIET_NODE_TAG WORKSTATION_PEER_ID needs a terminal: the share value goes only there" >&2
    exit 3
}

# ── Clean ─────────────────────────────────────────────────────────────────────────────────
#
# Cancels every cycle of the deploy that is neither completed nor cancelled. The journal keeps each
# one with the reason. Read all pages first: a cancel moves a cycle to the first page.
cancel_open_cycles() {
    local page=0 pages=1 row ids open=() id
    while [ "$page" -lt "$pages" ]; do
        page=$((page + 1))
        row="$(cyberia_json '[data.totalPages, ...data.data.filter(({ status }) => !["completed", "cancelled"].includes(status)).map(({ cycleId }) => cycleId)].join(" ")' \
            content lifecycle list --limit 50 --page "$page")"
        read -r pages ids <<<"$row"
        open+=($ids)
    done
    for id in "${open[@]}"; do
        deploy_step "Cancel cycle $id" \
            cyberia content lifecycle cancel "$id" --reason "replaced by a new cycle of deploy/$DEPLOY_ID/content-lifecycle.sh"
    done
    echo "$RUN_QUIET_NODE_TAG cancelled=${#open[@]}"
}

# ── Cycle ─────────────────────────────────────────────────────────────────────────────────
start_cycle() {
    CYCLE_ID="$(cyberia_json data.cycleId content lifecycle start \
        ${CYCLE_SAGAS:+--saga "$CYCLE_SAGAS"} \
        ${CYCLE_INSTANCES:+--instance "$CYCLE_INSTANCES"} \
        ${CYCLE_MAPS:+--map "$CYCLE_MAPS"} \
        ${CYCLE_ITEMS:+--item "$CYCLE_ITEMS"})"
    NEXT_STAGE=preflight
    echo "$RUN_QUIET_NODE_TAG cycle=$CYCLE_ID"
}

# The first stage of the cycle that is not complete. Refuses a cycle that takes no more stages.
read_next_stage() {
    local row status
    row="$(cyberia_json '`${data.status} ${data.next?.id ?? ""}`' content lifecycle plan "$CYCLE_ID")"
    read -r status NEXT_STAGE <<<"$row"
    case "$status" in
    cancelled | completed | superseded)
        echo "$RUN_QUIET_NODE_TAG Cycle $CYCLE_ID is $status: run $0 start" >&2
        exit 3
        ;;
    esac
    echo "$RUN_QUIET_NODE_TAG cycle=$CYCLE_ID status=$status next=${NEXT_STAGE:-none}"
}

# ── Stages ────────────────────────────────────────────────────────────────────────────────
#
# Each stage records itself in the journal of the cycle.
stage_preflight() {
    deploy_step "Preflight" cyberia content lifecycle doctor "$CYCLE_ID"
}

stage_infrastructure_backup() {
    deploy_step "Back up $DEPLOY_ID" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin db $DEPLOY_ID --kubeadm --export --prune"
    deploy_step "Restore drill of the $DEPLOY_ID backup" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin db $DEPLOY_ID --kubeadm --verify --restore-test"
    deploy_step "Record the infrastructure backup" \
        cyberia content lifecycle verify infrastructure-backup --cycle "$CYCLE_ID"
}

stage_baseline_capture() {
    deploy_step "Capture the production baseline" cyberia content baseline capture --cycle "$CYCLE_ID"
}

stage_baseline_verify() {
    deploy_step "Verify the baseline" cyberia content baseline verify --cycle "$CYCLE_ID"
}

# Runs each control node stage from the first one that is not complete. A stage that runs again
# makes every later stage stale, so all of them run after it.
run_control_stages() {
    local stage started=0
    for stage in "${CONTROL_STAGES[@]}"; do
        [ "$stage" != "$NEXT_STAGE" ] || started=1
        if [ "$started" = 1 ]; then
            "stage_${stage//-/_}"
        else
            echo "$RUN_QUIET_NODE_TAG $stage: complete"
        fi
    done
}

# ── Share ─────────────────────────────────────────────────────────────────────────────────
#
# Opens the cycle to the workstation until Ctrl+C. The share value goes to the terminal only, never
# to a captured output.
share_cycle() {
    deploy_start "Share $CYCLE_ID with $WORKSTATION_PEER_ID until Ctrl+C"
    cyberia content lifecycle share "$CYCLE_ID" --peer-id "$WORKSTATION_PEER_ID" \
        ${SHARE_HOURS:+--hours "$SHARE_HOURS"} >/dev/tty
}

# On a failure, names the command that resumes the cycle.
resume_hint() {
    local status=$?
    trap - EXIT
    [ "$status" -eq 0 ] ||
        echo "$RUN_QUIET_NODE_TAG Cycle $CYCLE_ID stopped (exit $status): resume it with $0 resume $CYCLE_ID" >&2
    exit "$status"
}

usage() {
    echo "usage: $0 <start | resume <cycle-id>>" >&2
    exit 2
}

# start: cancel the open cycles, prune the baselines retention no longer keeps, and start a cycle.
# resume <cycle-id>: continue that cycle. Both run the control node stages that are not complete,
# print the handoff and, with WORKSTATION_PEER_ID, open the share.
main() {
    case "${1:-}" in
    start) [ $# -eq 1 ] || usage ;;
    resume) [ $# -eq 2 ] || usage ;;
    *) usage ;;
    esac
    [ -z "$WORKSTATION_PEER_ID" ] || require_terminal
    deploy_start "Content lifecycle of $DEPLOY_ID: $*"
    if [ "$1" = start ]; then
        cancel_open_cycles
        deploy_step "Prune content baselines" cyberia content baseline prune
        start_cycle
    else
        CYCLE_ID="$2"
        read_next_stage
    fi
    trap resume_hint EXIT
    run_control_stages
    cyberia content lifecycle handoff "$CYCLE_ID"
    if [ -n "$WORKSTATION_PEER_ID" ]; then
        share_cycle
    else
        echo "$RUN_QUIET_NODE_TAG Open the cycle to a workstation: WORKSTATION_PEER_ID=<peer-id> $0 resume $CYCLE_ID"
    fi
}

main "$@"
