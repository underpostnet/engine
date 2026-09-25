# Content-release operations against the live pod of $DEPLOY_ID, and the readiness probes the
# deploy stages share. Sourced; the caller sets DEPLOY_ID and DEPLOY_ENV. Cluster calls run
# through `sudo -n`, as every other deploy step does. Requires lib/host.sh for pod_private_repo.

CONTENT_NAMESPACE="${CONTENT_NAMESPACE:-default}"

# The colour the stable traffic Service routes to: the same selector the engine reads, so the
# release commands always land on the pod that serves players.
live_colour() {
    sudo -n -- kubectl get service "${DEPLOY_ID}-${DEPLOY_ENV}-traffic-service" \
        -n "$CONTENT_NAMESPACE" -o jsonpath='{.spec.selector.app}' 2>/dev/null \
        | sed "s/^${DEPLOY_ID}-${DEPLOY_ENV}-//"
}

# Runs one `cyberia content-release` subcommand inside the live pod, on its injected environment.
# A serving pod holds no private conf, so the command clones it and removes it on exit.
content_release_exec() {
    local colour repo
    colour="$(live_colour)"
    if [ -z "$colour" ]; then
        echo "No live colour routed for ${DEPLOY_ID}-${DEPLOY_ENV}" >&2
        return 1
    fi
    repo="$(pod_private_repo "$DEPLOY_ID")"
    sudo -n -- kubectl exec "deployment/${DEPLOY_ID}-${DEPLOY_ENV}-${colour}" -n "$CONTENT_NAMESPACE" -- \
        /bin/bash -lc "cd /home/dd/engine && trap 'rm -rf ./engine-private ./${repo##*/}' EXIT \
&& underpost clone ${repo} && rm -rf ./engine-private && mv ./${repo##*/} ./engine-private \
&& node bin/cyberia content-release $*"
}

# Fails unless the release ledger holds <id> with one of the given statuses.
# Usage: content_release_expect_status <id> <status> [status...]
content_release_expect_status() {
    local release_id="$1"
    shift
    local status
    status="$(content_release_exec status | awk -v id="$release_id" '$2 == id { print $1 }' | head -n 1)"
    for expected in "$@"; do
        if [ "$status" = "$expected" ]; then
            echo "Content release $release_id is $status"
            return 0
        fi
    done
    echo "Content release $release_id is '${status:-absent}', expected one of: $*" >&2
    return 1
}

# Polls a URL until it answers 2xx, or the timeout passes.
wait_for_http() {
    local url="$1"
    local timeout="${2:-300}"
    local waited=0
    until curl -fsS -o /dev/null --max-time 10 "$url"; do
        waited=$((waited + 5))
        if [ "$waited" -ge "$timeout" ]; then
            echo "Timed out after ${timeout}s waiting for $url" >&2
            return 1
        fi
        sleep 5
    done
    echo "$url answered"
}

# Polls the release API until the runtime reports it serves <id>.
# Usage: wait_for_content_release <api-base-url> <id> [timeout], e.g. https://host/api/v1
wait_for_content_release() {
    local api="$1"
    local release_id="$2"
    local timeout="${3:-300}"
    local waited=0
    local body
    while :; do
        body="$(curl -fsS --max-time 10 "$api/cyberia-content-release/active" 2>/dev/null || true)"
        if printf '%s' "$body" | grep -q "\"releaseId\":\"$release_id\"" && printf '%s' "$body" | grep -q '"serving":true'; then
            echo "Runtime serves content release $release_id"
            return 0
        fi
        waited=$((waited + 5))
        if [ "$waited" -ge "$timeout" ]; then
            echo "Timed out after ${timeout}s; last answer: ${body:-none}" >&2
            return 1
        fi
        sleep 5
    done
}
