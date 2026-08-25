# Logging helpers for deploy/<deploy-id>/*.sh. Sourced, never executed directly.
#
# Deploy script contract:
# - prepare_host from lib/host.sh first, then one run_quiet call per remote
#   command, each with its own label
# - the body lives in main(), invoked on the last line: the first remote command
#   pulls this repository, rewriting the running script while bash reads it
#
# run_quiet hides normal output and returns the command's exit status so
# `set -e` stops the deployment. Lines matching `patterns` that parse as a
# deployment pod report are folded into a table — one row per pod — instead of
# being streamed; the monitor's raw `deploy-monitor` JSON emits are consumed
# into that table's cells rather than printed. Anything else within
# `lines_after` lines of a match scrolls above the table. On failure it keeps
# two temp files and prints their paths in red instead of their contents: the
# command's own stderr (native error message and stack trace) and the full
# unfiltered log up to the error.
#
# The table renders three ways, because a log viewer is not a terminal:
# - terminal: redrawn in place, cursor relative, one frame at a time
# - CI (GITHUB_ACTIONS/RUN_QUIET_CI): no cursor addressing exists there, so the
#   changed rows stream inside a collapsed `::group::` and the final table is
#   printed after it, expanded
# - anywhere else: changed rows appended
# Colour is ANSI SGR only and is emitted in all three (GitHub renders SGR in
# step logs); NO_COLOR or RUN_QUIET_PLAIN turns it off.

if [ -n "${NO_COLOR:-}${RUN_QUIET_PLAIN:-}" ]; then
    RUN_QUIET_RED=''
    RUN_QUIET_RESET=''
else
    RUN_QUIET_RED=$'\033[0;31m'
    RUN_QUIET_RESET=$'\033[0m'
fi

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
    local color=0
    local groups=0
    local redraw=0
    local width=0
    local rows=0
    local status=0
    
    echo "$RUN_QUIET_NODE_TAG $(date -Is) ▶ $label"
    
    [ -n "${NO_COLOR:-}${RUN_QUIET_PLAIN:-}" ] || color=1
    
    if [ -t 1 ] && [ "${TERM:-dumb}" != dumb ] && [ -z "${RUN_QUIET_PLAIN:-}" ]; then
        redraw=1
        width=${COLUMNS:-0}
        [ "$width" -gt 0 ] 2>/dev/null || width=$(tput cols 2>/dev/null || echo 0)
        rows=${LINES:-0}
        [ "$rows" -gt 0 ] 2>/dev/null || rows=$(tput lines 2>/dev/null || echo 0)
        # Without a known width a long row wraps, and the cursor-up count that
        # addresses the table no longer matches the lines it printed.
        [ "$width" -ge 20 ] || redraw=0
    fi
    
    if [ "$redraw" -eq 0 ] && [ -z "${RUN_QUIET_PLAIN:-}" ] && [ -n "${GITHUB_ACTIONS:-}${RUN_QUIET_CI:-}" ]; then
        groups=1
    fi
    
    debug_log=$(mktemp --suffix=.debug.log)
    error_log=$(mktemp --suffix=.error.log)
    fifo_dir=$(mktemp -d)
    mkfifo "$fifo_dir/merged" "$fifo_dir/stderr"
    
    # The filter reads the live stream rather than the finished log: a deployment
    # monitor prints its report for minutes before exiting, so a pass over the
    # completed file would show nothing until then. fflush defeats awk's block
    # buffering, which otherwise withholds output whenever stdout is a pipe.
    # awk writes the debug log itself rather than piping through tee, so the
    # reader stays a single process that a kill can always release.
    #
    # On a terminal the table is the only live region and always sits at the
    # bottom: rows are overwritten one by one (cursor up, then erase to end of
    # line as each row is rewritten) so the section never blanks between frames,
    # and a passthrough line is printed after erasing the table and before
    # drawing it again. All of that is cursor relative, so every row must occupy
    # exactly one terminal line: rows are cut to the terminal width, counting
    # display columns rather than bytes so colour escapes neither inflate the
    # measurement nor get sliced in half. Elsewhere nothing is cut and nothing
    # is overwritten — the frames stream, folded into a CI group when there is
    # one to fold them into.
    awk \
    -v pattern="$patterns" \
    -v lines_after="$lines_after" \
    -v debug_log="$debug_log" \
    -v redraw="$redraw" \
    -v color="$color" \
    -v groups="$groups" \
    -v label="$label" \
    -v width="$width" \
    -v rows="$rows" \
    -v started="$(date +%H:%M:%S)" \
    -v handoff="$RUN_QUIET_NODE_TAG $(date -Is) ▶ Switch traffic" '
        function strip(s) {
            gsub(esc_seq, "", s)
            return s
        }
        function pad(s, w) {
            while (length(s) < w) s = s " "
            return s
        }
        # Pod names differ in their tail, so a name too wide for its column keeps
        # the end rather than the deploy prefix every pod shares.
        function trim(s, w) {
            return length(s) <= w ? s : ".." substr(s, length(s) - w + 3)
        }
        function rule(n,   r) {
            r = ""
            while (n-- > 0) r = r "-"
            return r
        }
        function paint(s, sgr) {
            return color ? esc "[" sgr "m" s esc "[0m" : s
        }
        function fit(s,   out, visible) {
            if (!redraw) return s
            out = ""
            visible = 0
            while (length(s) > 0) {
                if (match(s, "^" esc_seq)) {
                    out = out substr(s, 1, RLENGTH)
                    s = substr(s, RLENGTH + 1)
                    continue
                }
                if (visible >= width - 1) return out esc "[0m"
                out = out substr(s, 1, 1)
                s = substr(s, 2)
                visible++
            }
            return out
        }
        function put(line) {
            printf "%s%s\n", fit(line), redraw ? esc "[K" : ""
            fflush()
        }
        # GitHub renders no cursor motion, so the live region becomes a
        # collapsed section: every frame streams into it and the settled table
        # is reprinted outside it.
        function open_group() {
            if (!groups || group_open) return
            group_open = 1
            printf "::group::%s monitor frames\n", label
            fflush()
        }
        function close_group() {
            if (!group_open) return
            group_open = 0
            # The next run of rows opens its own section, and a section starts
            # with its header.
            appended_header = 0
            printf "::endgroup::\n"
            fflush()
        }
        function final_table(   i) {
            if (!groups || pod_count == 0) return
            close_group()
            measure()
            header_lines()
            for (i = 1; i <= pod_count; i++) pod_line(pods[i])
        }
        function json_value(key,   found) {
            if (!match($0, "\"" key "\"[ ]*:[ ]*\"[^\"]*\"")) return ""
            found = substr($0, RSTART, RLENGTH)
            sub("^\"" key "\"[ ]*:[ ]*\"", "", found)
            sub("\"$", "", found)
            return found
        }
        function apply_event(   was_k8s_ready, was_runtime_ready, i) {
            events_seen = 1
            was_k8s_ready = k8s_ready
            was_runtime_ready = runtime_ready
            if (event_phase == "kubernetes") k8s_ready = (event_state == "pod_ready")
            else if (event_phase == "runtime") {
                runtime_ready = (event_state == "runtime_ready")
                if (event_status != "") last_runtime = event_status
            }
            if (redraw) {
                if (drawn > 0) {
                    clear_table()
                    draw_table()
                }
                return
            }
            # Readiness reaches the cells through the events alone, so without a
            # live table it is the only thing that can move a row.
            if (was_k8s_ready == k8s_ready && was_runtime_ready == runtime_ready) return
            for (i = 1; i <= pod_count; i++) append_row(pods[i])
        }
        # Both phases confirmed is the monitor signing off; the hand-off waits
        # for the report lines of that iteration so the table lands on its final
        # frame first.
        function ready_pending() {
            return events_seen ? (k8s_ready && runtime_ready) : all_pods_running()
        }
        # One report line per pod: "Target pod: NAME | Pod status: X | Runtime status: Y".
        function read_pod_line(line,   plain, cell, pod, k8s, runtime) {
            plain = strip(line)
            if (plain !~ /^Target pod: /) return 0
            if (split(plain, cell, / \| /) < 3) return 0
            pod = cell[1]; sub(/^Target pod:[ ]*/, "", pod)
            k8s = cell[2]; sub(/^Pod status:[ ]*/, "", k8s)
            runtime = cell[3]; sub(/^Runtime status:[ ]*/, "", runtime)
            if (pod == "") return 0
            if (!(pod in pod_row)) {
                pod_row[pod] = ++pod_count
                pods[pod_count] = pod
            }
            # The report itself is unstamped: the clock is the one the monitor
            # printed for this iteration, so the cell advances with the run.
            pod_time[pod] = last_time != "" ? last_time : started
            pod_k8s[pod] = k8s
            pod_runtime[pod] = runtime
            current_pod = pod
            return 1
        }
        # Every pod reporting its expected runtime status with no pending
        # marker is what the deployment itself calls ready.
        function all_pods_running(   i, pod, runtime) {
            if (pod_count == 0) return 0
            for (i = 1; i <= pod_count; i++) {
                pod = pods[i]
                if (pod_k8s[pod] != "Running") return 0
                runtime = runtime_cell(pod)
                if (runtime == "" || runtime ~ /pending/) return 0
            }
            return 1
        }
        # The table stops being a live region here: the deployment is handing
        # over to the traffic switch, so the last frame stays on screen and the
        # chatter the runner prints below it is dropped.
        function hand_off() {
            handed_off = 1
            remaining = 0
            drawn = 0
            last_pod_line = 0
            final_table()
            put(handoff)
        }
        # A later monitor in the same command (a second colour, a rollback) opens
        # its own table below the one that was handed off.
        function reset_table() {
            close_group()
            handed_off = 0
            events_seen = 0
            k8s_ready = 0
            runtime_ready = 0
            pod_count = 0
            cycles = 0
            appended_header = 0
            drawn = 0
            delete pods
            delete pod_row
            delete pod_k8s
            delete pod_runtime
            delete pod_time
            delete last_row
        }
        # pod_ready is a deployment-wide event: it only annotates a pod whose
        # own phase already agrees, never a stale one still coming up.
        function k8s_cell(pod,   cell) {
            cell = pod_k8s[pod]
            return (k8s_ready && cell == "Running") ? cell " (ready)" : cell
        }
        function runtime_cell(pod) {
            return pod_runtime[pod] != "" ? pod_runtime[pod] : last_runtime
        }
        # Columns only ever grow: a cell that shrinks must not reflow the table
        # under the reader between frames.
        function measure(   i, pod, over, budget) {
            if (length("#" cycles) > w_iteration) w_iteration = length("#" cycles)
            for (i = 1; i <= pod_count; i++) {
                pod = pods[i]
                if (length(pod_time[pod]) > w_since) w_since = length(pod_time[pod])
                if (length(pod) > w_pod) w_pod = length(pod)
                if (length(k8s_cell(pod)) > w_k8s) w_k8s = length(k8s_cell(pod))
                if (length(runtime_cell(pod)) > w_runtime) w_runtime = length(runtime_cell(pod))
            }
            # 16 columns of borders and padding. On a narrow terminal the pod
            # column gives up room first, then the status columns, before fit()
            # starts cutting cells off the right edge.
            w_pod_fit = w_pod
            w_runtime_fit = w_runtime
            w_k8s_fit = w_k8s
            # A streamed table cannot re-pad the rows it already printed, so the
            # status columns start wide enough for the values the monitor is
            # known to report and stop drifting under the header.
            if (!redraw) {
                if (w_k8s_fit < 17) w_k8s_fit = 17
                if (w_runtime_fit < 28) w_runtime_fit = 28
                return
            }
            # fit() cuts the last column, so the row has to land inside it.
            budget = width - 1
            over = row_width() - budget
            if (over > 0) {
                w_pod_fit = w_pod_fit - over < 12 ? 12 : w_pod_fit - over
                over = row_width() - budget
            }
            if (over > 0) {
                w_runtime_fit = w_runtime_fit - over < 16 ? 16 : w_runtime_fit - over
                over = row_width() - budget
            }
            if (over > 0) w_k8s_fit = w_k8s_fit - over < 12 ? 12 : w_k8s_fit - over
        }
        function row_width() {
            return w_iteration + w_since + w_pod_fit + w_k8s_fit + w_runtime_fit + 16
        }
        function header_lines() {
            put(paint(sprintf("| %s | %s | %s | %s | %s |", pad("ITERATION", w_iteration),
            pad("TIMESTAMP", w_since), pad("POD NAME", w_pod_fit), pad("K8S STATUS", w_k8s_fit),
            pad("RUNTIME STATUS", w_runtime_fit)), "1"))
            put(paint(sprintf("|%s|%s|%s|%s|%s|", rule(w_iteration + 2), rule(w_since + 2),
            rule(w_pod_fit + 2), rule(w_k8s_fit + 2), rule(w_runtime_fit + 2)), "2"))
        }
        function pod_line(pod,   runtime) {
            runtime = runtime_cell(pod)
            put(sprintf("| %s | %s | %s | %s | %s |",
            pad("#" cycles, w_iteration),
            paint(pad(pod_time[pod], w_since), "2"),
            paint(pad(trim(pod, w_pod_fit), w_pod_fit), "1"),
            paint(pad(trim(k8s_cell(pod), w_k8s_fit), w_k8s_fit), k8s_ready ? "32" : "33"),
            paint(pad(trim(runtime, w_runtime_fit), w_runtime_fit), (runtime ~ /pending/ || !runtime_ready) ? "36" : "32")))
        }
        function clear_table() {
            if (!redraw || drawn == 0) return
            printf "%s[%dA%s[J", esc, drawn, esc
            drawn = 0
        }
        function draw_table(   i) {
            if (!redraw || pod_count == 0) return
            # A table taller than the screen scrolls, and the cursor-up count no
            # longer addresses the rows it drew; degrade to appended rows.
            if (rows > 0 && pod_count + 2 >= rows) {
                redraw = 0
                drawn = 0
                return
            }
            measure()
            header_lines()
            for (i = 1; i <= pod_count; i++) pod_line(pods[i])
            drawn = pod_count + 2
        }
        # Without a live table a row is only worth printing when its cells
        # actually moved; the iteration count alone is not a change.
        function append_row(pod,   cells) {
            cells = pod "|" k8s_cell(pod) "|" runtime_cell(pod)
            if (cells == last_row[pod]) return
            last_row[pod] = cells
            measure()
            open_group()
            if (!appended_header) {
                header_lines()
                appended_header = 1
            }
            pod_line(pod)
        }
        BEGIN {
            w_iteration = length("ITERATION")
            w_since = length("TIMESTAMP")
            w_pod = length("POD NAME")
            w_k8s = length("K8S STATUS")
            w_runtime = length("RUNTIME STATUS")
            group_open = 0
            esc = sprintf("%c", 27)
            esc_seq = esc "\\[[0-9;]*[A-Za-z]"
            clock = "[0-9][0-9]:[0-9][0-9]:[0-9][0-9]"
            json_open = "deploy-monitor:[ ]*[{]"
            json_close = "^[ \t]*[}],?[ \t]*$"
        }
        {
            print > debug_log
            # The monitor stamps its own lines in local time; the ISO field
            # inside an emit is UTC, so it never feeds the column.
            if ($0 !~ /"timestamp"/ && match(strip($0), clock)) last_time = substr(strip($0), RSTART, RLENGTH)
        }
        {
            if (!handed_off && $0 !~ pattern && ready_pending()) hand_off()
            if (handed_off) {
                if ($0 !~ pattern) next
                reset_table()
            }
            # The monitor JSON is state already carried by the table cells: it is
            # consumed here and never reaches the terminal.
            if (in_json) {
                if ($0 ~ json_close) {
                    in_json = 0
                    apply_event()
                } else {
                    if (json_value("phase") != "") event_phase = json_value("phase")
                    if (json_value("state") != "") event_state = json_value("state")
                    if (json_value("status") != "") event_status = json_value("status")
                }
                if (remaining > 0) remaining--
                last_pod_line = 0
                next
            }
            if ($0 ~ json_open) {
                in_json = 1
                event_phase = event_state = event_status = ""
                if (remaining > 0) remaining--
                last_pod_line = 0
                next
            }
            if (read_pod_line($0)) {
                # Pod reports arrive back to back, one per pod, once per monitor
                # iteration: the first of a run opens a new cycle.
                if (!last_pod_line) cycles++
                last_pod_line = 1
                remaining = lines_after + 1
                if (redraw) {
                    clear_table()
                    draw_table()
                }
                if (!redraw) append_row(current_pod)
                next
            }
            last_pod_line = 0
            if ($0 ~ pattern) remaining = lines_after + 1
            if (remaining > 0) {
                clear_table()
                close_group()
                put($0)
                remaining--
                draw_table()
            }
        }
        END {
            if (!handed_off && ready_pending()) hand_off()
            close_group()
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
