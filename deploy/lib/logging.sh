# Shared logging helpers for deploy/<deploy-id>/*.sh. Sourced, never executed directly.
#
# Deploy script contract:
# - one run_quiet call per remote command, with its own label
# - the body lives in main(), invoked on the last line: the first remote command
#   pulls this repository, rewriting the running script while bash reads it
#
# run_quiet hides normal output, prints only `patterns` matches plus the next
# `lines_after` lines, and returns the command's exit status so `set -e` stops
# the deployment. On failure it keeps two temp files and prints their paths in
# red instead of their contents: the command's own stderr (native error message
# and stack trace) and the full unfiltered log up to the error.

RUN_QUIET_RED=$'\033[0;31m'
RUN_QUIET_RESET=$'\033[0m'

RUN_QUIET_NODE_NAME=$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]')
RUN_QUIET_NODE_TAG=${RUN_QUIET_NODE_NAME:+ [$RUN_QUIET_NODE_NAME]}

run_quiet() {
    local label="$1"
    local patterns="$2"
    local lines_after="$3"
    shift 3
    
    local debug_log
    local error_log
    local fifo_dir
    local filter_pid
    local stderr_pid
    local status=0
    
    echo "$(date -Is) $RUN_QUIET_NODE_TAG ▶ $label"
    
    debug_log=$(mktemp --suffix=.debug.log)
    error_log=$(mktemp --suffix=.error.log)
    fifo_dir=$(mktemp -d)
    mkfifo "$fifo_dir/merged" "$fifo_dir/stderr"
    
    # The filter reads the live stream rather than the finished log: a deployment
    # monitor prints its matches for minutes before exiting, so a pass over the
    # completed file would show nothing until then. fflush defeats awk's block
    # buffering, which otherwise withholds matches whenever stdout is a pipe.
    # awk writes the debug log itself rather than piping through tee, so the
    # reader stays a single process that a kill can always release.
    awk \
    -v pattern="$patterns" \
    -v lines_after="$lines_after" \
    -v debug_log="$debug_log" '
        {
            print > debug_log
        }
        $0 ~ pattern {
            remaining = lines_after + 1
        }
        remaining > 0 {
            print
            fflush()
            remaining--
        }
    ' <"$fifo_dir/merged" &
    filter_pid=$!
    
    # stderr is duplicated: on its own for the native error and stack trace, and
    # into the merged stream so both the debug log and the filter see it in
    # chronological order with stdout.
    tee -a "$error_log" <"$fifo_dir/stderr" >"$fifo_dir/merged" &
    stderr_pid=$!
    
    "$@" >"$fifo_dir/merged" 2>"$fifo_dir/stderr" || status=$?
    
    # Drain both readers before the paths are printed, or the trace can still be
    # in flight. Bounded: a command that leaks a child holding a stream open must
    # not hang the deployment, and by then everything read has been written.
    run_quiet_drain "$stderr_pid"
    run_quiet_drain "$filter_pid"
    rm -rf "$fifo_dir"
    
    if [ "$status" -ne 0 ]; then
        printf '%s✖ %s failed (exit %s)\n  error trace: %s\n  debug log:   %s%s\n' \
        "$RUN_QUIET_RED" "$label" "$status" "$error_log" "$debug_log" "$RUN_QUIET_RESET" >&2
        return "$status"
    fi
    
    rm -f "$debug_log" "$error_log"
    
    return "$status"
}

run_quiet_drain() {
    local pid="$1"
    
    timeout 10 tail --pid="$pid" -f /dev/null 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
}
