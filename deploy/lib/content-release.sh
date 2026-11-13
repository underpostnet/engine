# Data releases of $DEPLOY_ID — content releases and player records change in Release Jobs — and the
# readiness probes the deploy stages share. Sourced after lib/host.sh; the caller sets DEPLOY_ID and
# DEPLOY_ENV. Cluster calls run in the context and namespaces conf.cluster.json gives DEPLOY_ENV.

# The Object Layer authority a release publishes its definitions to.
OBJECT_LAYER_API_ORIGIN="${OBJECT_LAYER_API_ORIGIN:-https://objectlayer.org}"

# The public engine API origin: CYBERIA_API_ORIGIN, else the production Cyberia API host of the deploy conf.
engine_api_origin() {
    if [ -n "${CYBERIA_API_ORIGIN:-}" ]; then
        printf '%s' "$CYBERIA_API_ORIGIN"
        return
    fi
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node --input-type=module -e \"import('./src/projects/cyberia/runtime/game-origins.js').then(({ gameOrigins }) => process.stdout.write(gameOrigins('$DEPLOY_ID', 'production').engine))\""
}

# The versioned API path the engine serves, from its one source (`DOMAIN_API_VERSION`).
engine_api_path() {
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node --input-type=module -e \"import('./src/server/domain/api-contract.js').then((contract) => process.stdout.write(contract.API_BASE_PATH))\""
}

# The colour the stable traffic Service routes to: the same selector the engine reads.
live_colour() {
    cluster_placement
    cluster_kubectl get service "${DEPLOY_ID}-${DEPLOY_ENV}-traffic-service" \
        -n "$UNDERPOST_NAMESPACE_WORKLOADS" -o jsonpath='{.spec.selector.app}' 2>/dev/null \
        | sed "s/^${DEPLOY_ID}-${DEPLOY_ENV}-//"
}

# The live colour while it serves: its Service has a ready endpoint. Nothing when no colour serves.
serving_colour() {
    cluster_placement
    local colour
    colour="$(live_colour)"
    [ -n "$colour" ] || return 0
    cluster_kubectl get endpointslice -n "$UNDERPOST_NAMESPACE_WORKLOADS" \
        -l "kubernetes.io/service-name=${DEPLOY_ID}-${DEPLOY_ENV}-${colour}-service" \
        -o jsonpath='{.items[*].endpoints[*].conditions.ready}' 2>/dev/null | grep -qw true && echo "$colour"
}

# The image the live colour runs: an operator's release command runs the version that serves.
live_image() {
    cluster_placement
    local colour
    colour="$(live_colour)"
    if [ -z "$colour" ]; then
        echo "No live colour routed for ${DEPLOY_ID}-${DEPLOY_ENV}" >&2
        return 1
    fi
    cluster_kubectl get deployment "${DEPLOY_ID}-${DEPLOY_ENV}-${colour}" -n "$UNDERPOST_NAMESPACE_WORKLOADS" \
        -o jsonpath='{.spec.template.spec.containers[0].image}'
}

# Projects the credentials of a data release into their own Secret, in the namespace of the release
# Jobs: only the keys the `data-release` configuration scope names.
apply_release_secret() {
    sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin app apply --env $DEPLOY_ENV --args deploy-id=$DEPLOY_ID,scope=data-release"
}

# One command line in a Release Job, on the engine this host deploys, in the namespace of the release
# Jobs. The image's own `.env` is removed, so the data-release Secret is the only source of credentials.
#
# Usage: release_job <job-id> <image> <command line>
release_job() {
    local job_id="$1"
    local image="$2"
    local command="$3"
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin source-release job $job_id \
        --deploy-id $DEPLOY_ID --env $DEPLOY_ENV --scope data-release \
        --image '$image' --set-env NODE_ENV=$DEPLOY_ENV,OBJECT_LAYER_API_ORIGIN=$OBJECT_LAYER_API_ORIGIN \
        --cmd 'rm -f .env && $command'"
}

# One content release command in a Release Job.
#
# Usage: content_release_job <job-id> <image> <content release args...>
content_release_job() {
    local job_id="$1"
    local image="$2"
    shift 2
    release_job "$job_id" "$image" "node bin/cyberia content release $*"
}

# The root side of build_locked_content_artifact; `$1` is the cyberia-content checkout.
#
# Root clones the pinned revision and copies its own Node runtime (nvm keeps it under /root) into
# a read-only input. A transient systemd unit builds a copy of that input: a dynamic user that
# exists only for the build, no capability, an empty environment, the system read-only, /home and
# /root hidden, a private /tmp as the only writable path, and no address of this host or its
# networks but its resolvers. `npm ci` runs no install script and refuses a runtime the
# repository's `engines` reject. The unit streams dist/ back as a tar; root accepts only files and
# directories inside it, within the size and entry limits, then swaps it in for the checkout's dist/.
read -r -d '' LOCKED_CONTENT_BUILD <<'EOF' || true
set -euo pipefail
checkout="$1"
max_bytes=$((512 * 1024 * 1024))
max_entries=50000
# Git checks a checkout another user owns at its work tree, and at its .git when a clone reads it.
trust=(-c "safe.directory=$checkout" -c "safe.directory=$checkout/.git")
revision="$(git "${trust[@]}" -C "$checkout" rev-parse HEAD)"
work="$(mktemp -d "${TMPDIR:-/tmp}/cyberia-content-build.XXXXXX")"
trap 'rm -rf "$work" "$checkout/dist.next" "$checkout/dist.previous"' EXIT
input="$work/input"
mkdir -p "$input/runtime/bin" "$input/runtime/lib/node_modules"
cp "$(readlink -f "$(command -v node)")" "$input/runtime/bin/node"
cp -r "$(dirname "$(dirname "$(readlink -f "$(command -v npm)")")")" "$input/runtime/lib/node_modules/npm"
ln -s ../lib/node_modules/npm/bin/npm-cli.js "$input/runtime/bin/npm"
# The upload-pack that serves the clone reads no -c of its parent, so it takes the trust itself.
git "${trust[@]}" -c advice.defaultBranchName=false clone -q --no-hardlinks --no-checkout \
    --upload-pack="git -c safe.directory=$(printf '%q' "$checkout/.git") upload-pack" "$checkout" "$input/src"
git -C "$input/src" checkout -q --detach "$revision"
chmod -R a+rX "$input"
resolvers="$(awk '$1 == "nameserver" { sub(/%.*/, "", $2); print $2 }' /etc/resolv.conf | paste -sd ' ')"
systemd-run --quiet --wait --pipe --collect \
    -p DynamicUser=yes -p ProtectHome=yes -p PrivateDevices=yes -p CapabilityBoundingSet= \
    -p ProtectKernelTunables=yes -p ProtectKernelModules=yes -p ProtectKernelLogs=yes -p ProtectControlGroups=yes \
    -p RestrictNamespaces=yes -p LockPersonality=yes -p 'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
    -p 'IPAddressDeny=127.0.0.0/8 ::1/128 169.254.0.0/16 fe80::/10 224.0.0.0/4 ff00::/8 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 fc00::/7' \
    ${resolvers:+-p "IPAddressAllow=$resolvers"} \
    -p MemoryMax=2G -p RuntimeMaxSec=900 -p "BindReadOnlyPaths=$input:/run/content-input" \
    -E HOME=/tmp -E PATH=/run/content-input/runtime/bin:/usr/bin:/bin -E CI=true \
    /bin/bash -c 'set -e
cp -R /run/content-input/src /tmp/src
cd /tmp/src
npm ci --include=dev --ignore-scripts --engine-strict --no-audit --no-fund >&2
node bin/cyberia-content.js build >&2
tar -C dist -cf - .' </dev/null >"$work/dist.tar"
fail() {
    echo "The content build is refused: $1" >&2
    exit 1
}
[ "$(stat -c %s "$work/dist.tar")" -le "$max_bytes" ] || fail "dist/ exceeds $max_bytes bytes"
listing="$(tar -tvf "$work/dist.tar")"
[ "$(printf '%s\n' "$listing" | wc -l)" -le "$max_entries" ] || fail "dist/ holds more than $max_entries entries"
[ -z "$(printf '%s\n' "$listing" | awk 'substr($0, 1, 1) !~ /[-d]/')" ] ||
    fail 'dist/ holds an entry that is not a file or a directory'
[ -z "$(tar -tf "$work/dist.tar" | awk '/^\/|(^|\/)\.\.(\/|$)/')" ] || fail 'dist/ names a path outside itself'
mkdir "$checkout/dist.next"
tar -xf "$work/dist.tar" -C "$checkout/dist.next" --no-same-owner --no-same-permissions
chown -R --reference="$checkout" "$checkout/dist.next"
if [ -e "$checkout/dist" ]; then mv "$checkout/dist" "$checkout/dist.previous"; fi
mv "$checkout/dist.next" "$checkout/dist"
EOF

# Builds the content artifact the deployment lock pins into the cyberia-content checkout of the
# host, then checks it against the lock. The public website of the client bundle lists the worlds
# of that artifact, and a production build reads no other. Git never carries dist/, and the code of
# the content repository runs only in the sandbox of LOCKED_CONTENT_BUILD: as in the Release Job,
# no Secret and no privilege of the host reaches it.
#
# A step runs in a list where `set -e` does not apply: the verify runs only after a build that succeeded.
#
# Usage: build_locked_content_artifact [engine-root]
build_locked_content_artifact() {
    local engine_root="${1:-$ENGINE_ROOT}"
    sudo -n -- /bin/bash -lc "$LOCKED_CONTENT_BUILD" build-locked-content "$engine_root/cyberia-content" &&
        sudo -n -- /bin/bash -lc "cd $engine_root && node bin/cyberia release verify"
}

# The release id the runtime serves, from the engine API; empty while none is active.
#
# Usage: served_content_release <api-base-url>
served_content_release() {
    curl -fsS --max-time 10 "$1/cyberia-content-release/active" | node -e \
        'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => process.stdout.write(JSON.parse(s).data?.release?.releaseId ?? ""))'
}

# Fails when the engine cannot read its active content release. The game server loads its world
# from that release at boot.
#
# Usage: require_serving_content_release <api-base-url>
require_serving_content_release() {
    local body
    body="$(curl -fsS --max-time 10 "$1/cyberia-content-release/active")" || {
        echo "Engine API unreachable at $1" >&2
        return 1
    }
    if ! printf '%s' "$body" | grep -q '"serving":true'; then
        echo "The engine does not serve its active content release: ${body}" >&2
        echo "Run deploy/$DEPLOY_ID/sync-deploy.sh to promote a release this engine reads." >&2
        return 1
    fi
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

# Polls until every documented route of a client bundle serves the TypeDoc entry that bundle holds.
#
# Usage: wait_for_client_bundle <reference> [timeout]
wait_for_client_bundle() {
    local reference="$1"
    local timeout="${2:-300}"
    local waited=0
    until sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin run verify-bundle --deploy-id $DEPLOY_ID --bundle $reference"; do
        waited=$((waited + 5))
        if [ "$waited" -ge "$timeout" ]; then
            echo "Timed out after ${timeout}s waiting for client bundle $reference" >&2
            return 1
        fi
        sleep 5
    done
}

# The client bundles the colours of $DEPLOY_ID restore, comma-separated: what a prune must keep.
deployed_client_bundles() {
    cluster_placement
    cluster_kubectl get deployments -n "$UNDERPOST_NAMESPACE_WORKLOADS" -l "deploy-id=${DEPLOY_ID}-${DEPLOY_ENV}" \
        -o jsonpath='{range .items[*]}{.spec.template.spec.containers[0].command[2]}{"\n"}{end}' \
        | { grep -o -- '--bundle [^ ,]*' || true; } | cut -d' ' -f2 | sort -u | paste -sd, -
}
