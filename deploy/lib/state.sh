# Runtime telemetry streaming. Sourced, never executed directly.
#
# The one source of streamed state for every context. Nothing here is conditional on GitHub
# Actions: annotations are just the rendering the state domain picks when it detects a workflow.

STATE_ENV="${STATE_ENV:-production}"
STATE_NAMESPACE="${STATE_NAMESPACE:-default}"
STATE_STREAM="${STATE_STREAM:-1}"
# Seconds between frames. The live table is the default; 0 observes once and exits, which is
# what a non-interactive caller wants.
STATE_WATCH="${STATE_WATCH:-2}"

# Streams one observation of a deployment's live execution state, health and metrics.
#
# Not wrapped in deploy_step: run_quiet prints only pattern-matched lines and discards its debug
# log on success, so the payload never reached the terminal. The target defaults to the caller's
# directory name.
#
# Usage: stream_state <engine-root> [deploy-id] [instance-id]
stream_state() {
    local engine_root="${1:-/home/dd/engine}"
    local deploy_id="${2:-$(basename "$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)")}"
    local instance_id="${3:-}"
    local args="deploy-id=${deploy_id}"
    local target="$deploy_id"

    [ "$STATE_STREAM" = "0" ] && return 0

    if [ -n "$instance_id" ]; then
        args="${args},instance-id=${instance_id}"
        target="${deploy_id}/${instance_id}"
    fi

    deploy_start "Runtime state ${target}"

    if [ "$STATE_WATCH" != "0" ]; then
        # In-place redraw, the same shape run_quiet uses for the deploy table: the cursor is
        # parked above the block and each frame overwrites it. Runs until interrupted.
        local refresh=0 frame lines=0
        printf '\033[?25l'
        trap 'printf "\033[?25h\n"; return 0' INT
        while true; do
            refresh=$((refresh + 1))
            frame=$(sudo -n -- /bin/bash -lc \
                "cd ${engine_root} && node bin state status \
                  --env ${STATE_ENV} \
                  --namespace ${STATE_NAMESPACE} \
                  --args ${args},refresh=${refresh}" 2>/dev/null)
            [ "$lines" -gt 0 ] && printf '\033[%dA' "$lines"
            printf '%s\n' "$frame" | while IFS= read -r line; do printf '%s\033[K\n' "$line"; done
            lines=$(printf '%s\n' "$frame" | wc -l)
            sleep "$STATE_WATCH"
        done
    fi

    # RUN_QUIET_CI survives the SSH hop; unset in an ordinary shell, where this prints JSON.
    sudo -n -- /bin/bash -lc \
        "cd ${engine_root} && RUN_QUIET_CI=${RUN_QUIET_CI:-} node bin state publish \
          --env ${STATE_ENV} \
          --namespace ${STATE_NAMESPACE} \
          --args ${args}"
}
