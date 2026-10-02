# Data releases of $DEPLOY_ID — content releases run in Release Jobs — and the readiness probes the
# deploy stages share. Sourced; the caller sets DEPLOY_ID and DEPLOY_ENV. Cluster calls run
# through `sudo -n`, as every other deploy step does.

CONTENT_NAMESPACE="${CONTENT_NAMESPACE:-default}"
# The Object Layer authority a release publishes its definitions to.
OBJECT_LAYER_API_ORIGIN="${OBJECT_LAYER_API_ORIGIN:-https://objectlayer.org}"

# The colour the stable traffic Service routes to: the same selector the engine reads.
live_colour() {
    sudo -n -- kubectl get service "${DEPLOY_ID}-${DEPLOY_ENV}-traffic-service" \
        -n "$CONTENT_NAMESPACE" -o jsonpath='{.spec.selector.app}' 2>/dev/null \
        | sed "s/^${DEPLOY_ID}-${DEPLOY_ENV}-//"
}

# The image the live colour runs: an operator's release command runs the version that serves.
live_image() {
    local colour
    colour="$(live_colour)"
    if [ -z "$colour" ]; then
        echo "No live colour routed for ${DEPLOY_ID}-${DEPLOY_ENV}" >&2
        return 1
    fi
    sudo -n -- kubectl get deployment "${DEPLOY_ID}-${DEPLOY_ENV}-${colour}" -n "$CONTENT_NAMESPACE" \
        -o jsonpath='{.spec.template.spec.containers[0].image}'
}

# Projects the credentials of a data release into their own Secret: only the keys the
# `data-release` configuration scope names.
apply_release_secret() {
    sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin app apply --env $DEPLOY_ENV --args deploy-id=$DEPLOY_ID,scope=data-release"
}

# One content-release command in a Release Job, on the engine this host deploys. The image's own
# `.env` is removed, so the data-release Secret is the only source of credentials.
#
# Usage: content_release_job <job-id> <image> <content-release args...>
content_release_job() {
    local job_id="$1"
    local image="$2"
    shift 2
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin source-release job $job_id \
        --deploy-id $DEPLOY_ID --env $DEPLOY_ENV --scope data-release --namespace $CONTENT_NAMESPACE \
        --image '$image' --set-env NODE_ENV=$DEPLOY_ENV,OBJECT_LAYER_API_ORIGIN=$OBJECT_LAYER_API_ORIGIN \
        ${TARGET_NODE:+--node-name $TARGET_NODE} \
        --cmd 'rm -f .env && node bin/cyberia content-release $*'"
}

# The release id the runtime serves, from the engine API; empty while none is active.
#
# Usage: served_content_release <api-base-url>
served_content_release() {
    curl -fsS --max-time 10 "$1/cyberia-content-release/active" | node -e \
        'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => process.stdout.write(JSON.parse(s).data?.release?.releaseId ?? ""))'
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
