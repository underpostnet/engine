# Logging helpers for deploy/<deploy-id>/*.sh. Sourced, never executed directly.
#
# Environment read by these helpers, and nothing else:
#   RUN_QUIET_DEBUG  Stream every line verbatim: no table, no folding, no dropped traces. For an
#                    operator watching a step over SSH who needs the run itself, not a report of
#                    it. Wins over the two below, which each hide part of the stream by design.
#   RUN_QUIET_CI     Marks stdout as a GitHub Actions log, which folds monitor frames into
#                    collapsed sections. The CD workflows export it on the far side of the SSH
#                    hop because GITHUB_ACTIONS is runner-local and does not travel; a remote
#                    deploy has no other way to know. `underpost state publish` reads the same
#                    pair to choose workflow commands over JSON.
#   RUN_QUIET_PLAIN  No colour, no cursor motion, no folding: frames stream as they arrive.
#   NO_COLOR         Colour off, the usual convention. Everything else is unaffected.
#
# Whatever the rendering, the parsing behind it is the same: a step that reports a fatal runtime
# status fails, including one that exits 0, and including in debug mode.


if [ -n "${NO_COLOR:-}${RUN_QUIET_PLAIN:-}" ]; then
    RUN_QUIET_RED=''
    RUN_QUIET_RESET=''
else
    RUN_QUIET_RED=$'\033[0;31m'
    RUN_QUIET_RESET=$'\033[0m'
fi

RUN_QUIET_NODE_TAG=$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]')
RUN_QUIET_NODE_TAG=${RUN_QUIET_NODE_TAG:+ [$RUN_QUIET_NODE_TAG]}

# The report pattern and the passthrough window describe the deployment log
# format, not any one step, so they are declared once here instead of being
# repeated at every call site.
DEPLOY_REPORT_PATTERN='Target pod:'
DEPLOY_REPORT_LINES_AFTER=14

# Titles a deploy run, in the same shape as the step lines below it.
deploy_start() {
    echo "$RUN_QUIET_NODE_TAG $(date -Is) ▶▶ $1"
}

# One deploy step: a label and the command that carries it.
deploy_step() {
    local label="$1"
    shift

    run_quiet "$label" "$DEPLOY_REPORT_PATTERN" "$DEPLOY_REPORT_LINES_AFTER" "$@"
}

run_quiet() {
    local label="$1"
    local patterns="$2"
    local lines_after="$3"
    shift 3

    local debug_log
    local error_log
    local fail_flag
    local fatal
    local fifo_dir
    local filter_pid
    local stderr_pid
    local color=0
    local debug=0
    local groups=0
    local redraw=0
    local width=0
    local rows=0
    local status=0

    echo "$RUN_QUIET_NODE_TAG $(date -Is) ▶ $label"

    # How a step renders is decided by what its destination can do, not by preference, and the
    # three renderings are mutually exclusive:
    #   debug   an operator watching over SSH — nothing filtered, folded or overwritten
    #   redraw  a terminal — one live region, rewritten in place
    #   groups  a GitHub Actions log — no cursor motion, so frames fold into a collapsed section
    # With none of them the frames simply stream. RUN_QUIET_DEBUG is resolved first because it
    # is the operator asking to see the stream itself, which neither of the others can show: a
    # live region overwrites what came before, and a collapsed section hides it.
    [ -z "${RUN_QUIET_DEBUG:-}" ] || debug=1

    [ -n "${NO_COLOR:-}${RUN_QUIET_PLAIN:-}" ] || color=1

    if [ "$debug" -eq 0 ] && [ -t 1 ] && [ "${TERM:-dumb}" != dumb ] && [ -z "${RUN_QUIET_PLAIN:-}" ]; then
        redraw=1
        width=${COLUMNS:-0}
        [ "$width" -gt 0 ] 2>/dev/null || width=$(tput cols 2>/dev/null || echo 0)
        rows=${LINES:-0}
        [ "$rows" -gt 0 ] 2>/dev/null || rows=$(tput lines 2>/dev/null || echo 0)
        # Without a known width a long row wraps, and the cursor-up count that
        # addresses the table no longer matches the lines it printed.
        [ "$width" -ge 20 ] || redraw=0
    fi

    # GITHUB_ACTIONS exists on a runner but is not carried across the SSH hop a remote deploy runs
    # over, so RUN_QUIET_CI — which the workflows export on the far side — is what actually marks
    # a step whose stdout a GitHub log will render.
    if [ "$debug" -eq 0 ] && [ "$redraw" -eq 0 ] && [ -z "${RUN_QUIET_PLAIN:-}" ] &&
        [ -n "${GITHUB_ACTIONS:-}${RUN_QUIET_CI:-}" ]; then
        groups=1
    fi

    debug_log=$(mktemp --suffix=.debug.log)
    error_log=$(mktemp --suffix=.error.log)
    fail_flag=$(mktemp --suffix=.fatal)
    : >"$fail_flag"
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
    -v debug="$debug" \
    -v groups="$groups" \
    -v label="$label" \
    -v width="$width" \
    -v rows="$rows" \
    -v started="$(date +%H:%M:%S)" \
    -v fail_flag="$fail_flag" \
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
            # with its title and header.
            appended_header = 0
            appended_cycle = 0
            printf "::endgroup::\n"
            fflush()
        }
        function final_table(   i) {
            if (!groups || pod_count == 0) return
            close_group()
            measure()
            title_line()
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
                if (is_fatal(event_status)) note_fatal("runtime event", "status=" event_status)
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
            if (is_fatal(runtime)) note_fatal("pod " pod, "runtime status=" runtime)
            if (!(pod in pod_row)) {
                pod_row[pod] = ++pod_count
                pods[pod_count] = pod
            }
            # The report itself is unstamped: the clock is the one the monitor
            # printed for this iteration, so the title advances with the run.
            cycle_time = last_time != "" ? last_time : started
            pod_k8s[pod] = k8s
            pod_runtime[pod] = runtime
            current_pod = pod
            return 1
        }
        # Every pod reporting its expected runtime status with no pending
        # marker is what the deployment itself calls ready. `error` is
        # the fatal value in the RUNTIME_STATUS contract: a terminal state, not a
        # ready one, and reading it as ready handed off to the traffic switch on
        # a deployment that had already failed.
        function all_pods_running(   i, pod, runtime) {
            if (pod_count == 0) return 0
            for (i = 1; i <= pod_count; i++) {
                pod = pods[i]
                if (pod_k8s[pod] != "Running") return 0
                runtime = runtime_cell(pod)
                if (runtime == "" || runtime ~ /pending/ || is_fatal(runtime)) return 0
            }
            return 1
        }
        # The bare contract value, not a substring: a phase name that merely
        # contains it (or a log line quoting it) is not a fatal latch.
        function is_fatal(status) {
            return status == "error"
        }
        # Stack frames and source URLs carry absolute host paths and module layout,
        # which must not reach a CI transcript. Both log files still hold them.
        function is_trace(line) {
            return line ~ /^[ \t]*at [^ ]/ || line ~ /file:\/\/\// || line ~ /^[ \t]*at async / || line ~ /^[A-Za-z_]*Error: /
        }
        # Records the fatal latch for run_quiet. A step can report this and still
        # exit 0 — the in-pod lifecycle deliberately does not crash the container
        # — so the exit status alone cannot be trusted to stop the deployment.
        function note_fatal(source, detail) {
            if (fatal_seen) return
            fatal_seen = 1
            printf "%s: %s\n", source, detail > fail_flag
            close(fail_flag)
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
            cycle_time = ""
            appended_header = 0
            appended_cycle = 0
            drawn = 0
            delete pods
            delete pod_row
            delete pod_k8s
            delete pod_runtime
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
            for (i = 1; i <= pod_count; i++) {
                pod = pods[i]
                if (length(pod) > w_pod) w_pod = length(pod)
                if (length(k8s_cell(pod)) > w_k8s) w_k8s = length(k8s_cell(pod))
                if (length(runtime_cell(pod)) > w_runtime) w_runtime = length(runtime_cell(pod))
            }
            # 10 columns of borders and padding. On a narrow terminal the pod
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
            return w_pod_fit + w_k8s_fit + w_runtime_fit + 10
        }
        # The iteration and the clock are one per frame, not one per pod: they
        # title the table instead of repeating down two columns of it.
        function title_line() {
            put(paint(sprintf("%s (refresh #%d, %s)", label, cycles,
            cycle_time != "" ? cycle_time : started), "1"))
        }
        function header_lines() {
            put(paint(sprintf("| %s | %s | %s |", pad("POD NAME", w_pod_fit),
            pad("K8S STATUS", w_k8s_fit), pad("RUNTIME STATUS", w_runtime_fit)), "1"))
            put(paint(sprintf("|%s|%s|%s|", rule(w_pod_fit + 2), rule(w_k8s_fit + 2),
            rule(w_runtime_fit + 2)), "2"))
        }
        function pod_line(pod,   runtime) {
            runtime = runtime_cell(pod)
            put(sprintf("| %s | %s | %s |",
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
            if (rows > 0 && pod_count + 3 >= rows) {
                redraw = 0
                drawn = 0
                return
            }
            measure()
            title_line()
            header_lines()
            for (i = 1; i <= pod_count; i++) pod_line(pods[i])
            drawn = pod_count + 3
        }
        # Without a live table a row is only worth printing when its cells
        # actually moved; the iteration count alone is not a change. The title is
        # reprinted whenever a later iteration is the one moving rows, so a
        # streamed row is still dated without carrying its own clock column.
        # The parsing every rendering shares: it advances the monitor'"'"'s event state machine,
        # records what each pod reported, and latches a fatal runtime status. What a line *is*
        # cannot depend on how the run is being displayed, so this answers only that, and the
        # caller decides what to show.
        function track(line) {
            if (in_json) {
                if (line ~ json_close) {
                    in_json = 0
                    apply_event()
                } else {
                    if (json_value("phase") != "") event_phase = json_value("phase")
                    if (json_value("state") != "") event_state = json_value("state")
                    if (json_value("status") != "") event_status = json_value("status")
                }
                return "event"
            }
            if (line ~ json_open) {
                in_json = 1
                event_phase = event_state = event_status = ""
                return "event"
            }
            return read_pod_line(line) ? "pod" : "other"
        }
        function append_row(pod,   cells) {
            if (debug) return
            cells = pod "|" k8s_cell(pod) "|" runtime_cell(pod)
            if (cells == last_row[pod]) return
            last_row[pod] = cells
            measure()
            open_group()
            if (appended_cycle != cycles) {
                title_line()
                appended_cycle = cycles
            }
            if (!appended_header) {
                header_lines()
                appended_header = 1
            }
            pod_line(pod)
        }
        BEGIN {
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
            # DEBUG streams the step verbatim: no table, no group, no passthrough window, and no
            # dropped stack traces — a CI transcript withholds those because it is published,
            # which is not true of the session an operator opened to audit this run. Tracking
            # still runs, so a fatal runtime status latches here exactly as in every other mode
            # and a step that reports one still fails.
            if (debug) {
                track($0)
                put($0)
                next
            }
            if (!handed_off && $0 !~ pattern && ready_pending()) hand_off()
            if (handed_off) {
                if ($0 !~ pattern) next
                reset_table()
            }
            line_kind = track($0)
            # The monitor JSON is state already carried by the table cells: it is
            # consumed here and never reaches the terminal.
            if (line_kind == "event") {
                if (remaining > 0) remaining--
                last_pod_line = 0
                next
            }
            if (line_kind == "pod") {
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
                if (is_trace($0)) {
                    remaining--
                    next
                }
                clear_table()
                close_group()
                put($0)
                remaining--
                draw_table()
            }
        }
        END {
            if (!debug && !handed_off && ready_pending()) hand_off()
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

    # A deployment can fail without the command failing. The in-pod lifecycle latches
    # `container-status=error` and deliberately does not crash the container, so a step that
    # reported a fatal runtime state can still exit 0 — and a green step here is a green
    # GitHub Actions job on a deployment that never came up. The latch the filter recorded is
    # therefore promoted to a failure exit of its own.
    fatal=$(cat "$fail_flag" 2>/dev/null) || true
    rm -f "$fail_flag"
    if [ "$status" -eq 0 ] && [ -n "$fatal" ]; then
        status=1
        printf -- '--- fatal runtime latch ---\n%s\n' "$fatal" >>"$error_log"
        printf '%s✖ %s reported a fatal runtime state but exited 0%s\n' \
        "$RUN_QUIET_RED" "$label" "$RUN_QUIET_RESET" >&2
    fi

    if [ "$status" -ne 0 ]; then
        run_quiet_error_trace "$debug_log" "$error_log"
        printf '%s✖ %s failed (exit %s)%s\n' "$RUN_QUIET_RED" "$label" "$status" "$RUN_QUIET_RESET" >&2
        printf '%s  error trace: %s\n  debug log:   %s%s\n' \
        "$RUN_QUIET_RED" "$error_log" "$debug_log" "$RUN_QUIET_RESET" >&2
        return "$status"
    fi

    rm -f "$debug_log" "$error_log"

    return "$status"
}

# Appends the failing part of the merged log to the error trace, so the trace ends
# with the error rather than with whatever last wrote to stderr. Cuts from the first
# error marker; with no marker the tail stands in, which is where a logger-only
# failure reports itself.
run_quiet_error_trace() {
    local debug_log="$1"
    local error_log="$2"
    local tail_lines="${3:-40}"
    local first

    # grep exits 1 when it matches nothing, and every deploy script runs under `set -e` with
    # `pipefail`: unguarded, a failing step whose log carries no marker aborted this function
    # before run_quiet could print the exit code and the two log paths, and the tail fallback
    # below was unreachable. The no-match case is the fallback's trigger, not an error.
    first=$(grep -a -n -m1 -E 'Error:|Error \[|^[[:space:]]+at |✖' "$debug_log" 2>/dev/null | cut -d: -f1) || true

    printf -- '--- error trace (from merged log) ---\n' >>"$error_log"
    if [ -n "$first" ]; then
        tail -n "+$first" "$debug_log" >>"$error_log"
    else
        tail -n "$tail_lines" "$debug_log" >>"$error_log"
    fi
}

run_quiet_drain() {
    local pid="$1"

    timeout 10 tail --pid="$pid" -f /dev/null 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
}
