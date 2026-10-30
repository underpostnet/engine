#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"
source "$SCRIPT_DIR/../lib/release-sources.sh"
source "$SCRIPT_DIR/../lib/content-release.sh"

DEPLOY_ID=dd-cyberia
DEPLOY_ENV="${DEPLOY_ENV:-production}"
TARGET_NODE="${TARGET_NODE:-$HOST_NODE}"
REPLICAS="${REPLICAS:-1}"
# The source channel of every repository the deploy fetches: `public`, or `private` for the private
# mirrors. A private release is the same production release.
CYBERIA_SOURCE_CHANNEL="${CYBERIA_SOURCE_CHANNEL:-private}"
# The source the pod bootstraps from, and the private configuration each side reads: the host
# takes the monorepo conf, the pod takes this deploy's own conf repository.
ENGINE_SRC_REPO="$(engine_source_repo "$DEPLOY_ID" "$CYBERIA_SOURCE_CHANNEL")"
ENGINE_SRC_PRIVATE_REPO="${ENGINE_SRC_PRIVATE_REPO:-underpostnet/engine-private}"
POD_SRC_PRIVATE_REPO="$(pod_private_repo "$DEPLOY_ID")"

# Bundle mode: the host builds the client once, TypeDoc included, and publishes one immutable
# bundle; every pod restores that exact bundle and never compiles the client. A production deploy
# runs only in bundle mode. BUNDLE_MODE=0 has a development pod build from source.
BUNDLE_MODE="${BUNDLE_MODE:-1}"
BUNDLE_SPLIT="${BUNDLE_SPLIT:-8}"
# The engine commit this deploy builds: the bundle and every pod run this exact source.
ENGINE_REVISION=""
# The bundle the host publishes: the reference every pod of this deploy restores.
CLIENT_BUNDLE=""
# `mv` into a directory that already exists nests the checkout inside it rather than replacing
# it, and the pod would then load whatever conf the image carried.
POD_SRC_PRIVATE_DIR="${POD_SRC_PRIVATE_REPO##*/}"

# The instances a content release carries: every world the deploy topology serves, unless
# CONTENT_INSTANCES names others. The release id: the engine version and commit and the locked
# content revision, whatever channel they came from, so a rerun resumes the same release and new
# content makes a new one. CONTENT_RELEASE_ID overrides it.
CONTENT_INSTANCES="${CONTENT_INSTANCES:-}"
CONTENT_RELEASE_ID="${CONTENT_RELEASE_ID:-}"
# Releases kept beyond the protected ones: building, validated, active and the rollback target.
CONTENT_RELEASES_KEEP="${CONTENT_RELEASES_KEEP:-2}"
# Set SKIP_CONTENT_RELEASE=1 to deploy the runtimes only: no content candidate, no promotion.
# The new pod serves the release that is already active.
SKIP_CONTENT_RELEASE="${SKIP_CONTENT_RELEASE:-0}"
# Live changes of the active release that its build does not hold stop the deploy before the
# rollout. Export them to cyberia-content first, or set DISCARD_LIVE_CHANGES=1 to stop serving them.
DISCARD_LIVE_CHANGES="${DISCARD_LIVE_CHANGES:-0}"

# The routing a traffic switch applies: the sync and a switch back render the same routes.
ROUTING_FLAGS="--replicas $REPLICAS --timeout-response 10000ms --gateway-api"

# What served before this deploy, and how far it got: `switched` from the rollout on, `promoting`
# once the release it replaces is known, `committed` once the new release serves. A failure
# before `committed` restores what served before.
PREVIOUS_COLOUR=""
PREVIOUS_RELEASE=""
RELEASE_STATE=""

# Public origins the readiness stage probes once the new colour serves.
CYBERIA_SERVER_ORIGIN="${CYBERIA_SERVER_ORIGIN:-https://server.cyberiaonline.com}"
READINESS_TIMEOUT="${READINESS_TIMEOUT:-300}"

engine_version() {
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node -p \"require('./package.json').version\"" | tr -d '\n'
}

engine_commit() {
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && git rev-parse HEAD" | tr -d '\n'
}

# Refuses a production deploy whose pods would build the client from source.
require_bundle_mode() {
    if [ "$DEPLOY_ENV" = production ] && [ "$BUNDLE_MODE" != 1 ]; then
        echo "BUNDLE_MODE=$BUNDLE_MODE: a production pod never builds the client; deploy with BUNDLE_MODE=1" >&2
        exit 1
    fi
}

# ── Stage A — Source synchronization ─────────────────────────────────────────────────────
#
# Every product repository from the same channel: the deployment at its branch tip, and every other
# one at the exact revision the deployment lock pins.
stage_sources() {
    prepare_host "$ENGINE_ROOT"
    sync_release_sources "$CYBERIA_SOURCE_CHANNEL"
}

# ── Stage B — Immutable build artifacts ───────────────────────────────────────────────────
stage_build() {
    deploy_step "Install $DEPLOY_ID catalog dependencies" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin package $DEPLOY_ID --install"
    deploy_step "Clean build artifacts" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin run clean"

    # The image is the deploy's identity. A version tag names one published build; a floating
    # tag names whatever was pushed last and is refused unless the operator says so. Either way a
    # tag can be pushed again, so every pod and Job of this deploy runs the digest it resolves to now.
    local version image_tag
    version="$(engine_version)"
    image_tag="${DEPLOY_IMAGE:-underpost/engine-cyberia:v${version}}"
    case "$image_tag" in
        *:latest)
            if [ "${ALLOW_LATEST_IMAGE:-0}" != "1" ]; then
                echo "DEPLOY_IMAGE=$image_tag is a floating tag; pin a version tag or digest, or set ALLOW_LATEST_IMAGE=1" >&2
                exit 1
            fi
            ;;
    esac
    DEPLOY_IMAGE="$(sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin image --digest '$image_tag'" | tail -n 1)"
    local content_revision
    ENGINE_REVISION="$(engine_commit)"
    content_revision="$(checkout_revision cyberia-content)"
    CONTENT_RELEASE_ID="${CONTENT_RELEASE_ID:-v${version}-${ENGINE_REVISION:0:7}-${content_revision:0:8}}"
    CONTENT_RELEASE_ID="$(printf '%s' "$CONTENT_RELEASE_ID" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')"
    ENGINE_API_PATH="$(engine_api_path)"
    echo "$RUN_QUIET_NODE_TAG image=$image_tag digest=${DEPLOY_IMAGE#*@} release=$CONTENT_RELEASE_ID engine=$ENGINE_REVISION channel=$CYBERIA_SOURCE_CHANNEL"
}

# ── Stage C — Configuration ───────────────────────────────────────────────────────────────
stage_configuration() {
    deploy_step "Load $DEPLOY_ID $DEPLOY_ENV environment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin app load --env $DEPLOY_ENV --args deploy-id=$DEPLOY_ID"
    deploy_step "Validate $DEPLOY_ID domain configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/cyberia run-workflow validate-domains --env $DEPLOY_ENV"
    # The code graphs are release preparation: the pinned checkouts already carry them.
    deploy_step "Build the game checkouts" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin/cyberia release build cyberia-server cyberia-client --no-graphify"

    # Follows the game build: the client renders from the conf.ssr.json that build reads, so a
    # bundle built before it would ship the previous SSR views. A build, TypeDoc, check or upload
    # that fails stops the deploy here, before any pod starts.
    if [ "$BUNDLE_MODE" = "1" ]; then
        deploy_step "Build and publish $DEPLOY_ID client bundle" \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && node bin run push-bundle --deploy-id $DEPLOY_ID --split $BUNDLE_SPLIT --release $CONTENT_RELEASE_ID --image '$DEPLOY_IMAGE'"
        CLIENT_BUNDLE="$(client_bundle_reference)"
        echo "$RUN_QUIET_NODE_TAG client-bundle=$CLIENT_BUNDLE"
    fi

    # The pod replaces ./engine-private with a clone of its conf repository, so this publishes
    # the deploy's conf there — client-bundle.json included — before the pod starts.
    deploy_step "Build $DEPLOY_ID configuration" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin/build $DEPLOY_ID --conf"
}

# The bundle push-bundle published, as the deployment conf names it.
client_bundle_reference() {
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node -p \"require('./engine-private/conf/$DEPLOY_ID/client-bundle.json').reference\"" | tr -d '\n'
}

# Whether the content release stages are off. Prints the reason to the log.
content_release_skipped() {
    [ "$SKIP_CONTENT_RELEASE" = "1" ] || return 1
    echo "$RUN_QUIET_NODE_TAG SKIP_CONTENT_RELEASE=1: $1 skipped"
}

# ── Stage D — Data ───────────────────────────────────────────────────────────────────────
#
# The data-release credentials go to their Secret, then two Release Jobs run on the deployed image
# before the new code serves. The first makes the indexes of the runtime records the ones its models
# declare: it deletes the records without a required field of a unique key, then syncs the indexes.
# Two complete records that share a unique key stop the deploy, and the error names the key. The second
# builds the content candidate: the host fetches the locked content revision into a read-only
# release workspace, and the Job builds it with the repository's own commands, ingests it into the
# candidate database and validates it there, against the Object Layer authority. Players keep the
# active release. A rerun resumes the same release, and a validated one is left as it is.
stage_runtime_indexes() {
    deploy_step "Project data-release credentials" apply_release_secret
    deploy_step "Sync runtime indexes" \
        release_job "runtime-indexes" "$DEPLOY_IMAGE" "node bin/cyberia runtime-indexes --apply"
}

stage_content_candidate() {
    ! content_release_skipped "content candidate" || return 0
    deploy_step "Prepare content release $CONTENT_RELEASE_ID" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/cyberia content-release prepare $CONTENT_RELEASE_ID --channel $CYBERIA_SOURCE_CHANNEL"
    deploy_step "Build content release $CONTENT_RELEASE_ID" \
        content_release_job "$CONTENT_RELEASE_ID" "$DEPLOY_IMAGE" \
        build "$CONTENT_RELEASE_ID" --from source ${CONTENT_INSTANCES:+--instances "$CONTENT_INSTANCES"}
    if [ "$DISCARD_LIVE_CHANGES" = "1" ]; then
        echo "$RUN_QUIET_NODE_TAG DISCARD_LIVE_CHANGES=1: the promotion stops serving the live changes of the active release"
    else
        deploy_step "No live change the promotion stops serving" \
            content_release_job "content-release-live-changes" "$DEPLOY_IMAGE" live-changes || {
            echo "$RUN_QUIET_NODE_TAG Capture a baseline with \`node bin/cyberia content-baseline capture\`, export it on a development host with \`node bin/cyberia content-release export-live\`, commit it to cyberia-content, then deploy again with DISCARD_LIVE_CHANGES=1" >&2
            exit 1
        }
    fi
}

# ── Stage E — Application rollout ──────────────────────────────────────────────────────

stage_rollout() {
    local pod_cmd sync_flags=""
    local start_flags="--build --run --skip-pull-repo-base --skip-pull-private-repo"
    if [ "$BUNDLE_MODE" = "1" ]; then
        start_flags="$start_flags --bundle $CLIENT_BUNDLE"
        # The bundle carries the SSR views: the host renders none again.
        sync_flags="--skip-full-build"
    fi
    pod_cmd="$(pod_bootstrap_cmd $DEPLOY_ID $DEPLOY_ENV "$ENGINE_SRC_REPO" "$ENGINE_REVISION"), \
        underpost clone ${POD_SRC_PRIVATE_REPO}, \
        sudo rm -rf ./engine-private, \
        sudo mv ./${POD_SRC_PRIVATE_DIR} ./engine-private, \
        underpost app load --env $DEPLOY_ENV --args deploy-id=$DEPLOY_ID, \
        underpost start $DEPLOY_ID $DEPLOY_ENV $start_flags"

    deploy_step "Sync $DEPLOY_ID cluster" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync \
          --deploy-id $DEPLOY_ID \
          $ROUTING_FLAGS \
          --image '${DEPLOY_IMAGE}' \
          --kubeadm \
          --deploy-id-cron-jobs none \
          ${TARGET_NODE:+--node-name ${TARGET_NODE}} \
          --ingress-node ${INGRESS_NODE} \
          --ssh-key-path ${DEPLOY_SSH_KEY_PATH} \
          --image-pull-policy Always \
          ${sync_flags} \
          --cmd '${pod_cmd}'"
}

# ── Stage F — Readiness ───────────────────────────────────────────────────────────────────
stage_readiness() {
    deploy_step "Engine API ready" \
        wait_for_http "$CYBERIA_API_ORIGIN/$ENGINE_API_PATH/cyberia-instance?limit=1" "$READINESS_TIMEOUT"
    deploy_step "Object Layer authority ready" \
        wait_for_http "$OBJECT_LAYER_API_ORIGIN/$ENGINE_API_PATH/object-layer?limit=1" "$READINESS_TIMEOUT"
    if [ "$BUNDLE_MODE" = "1" ]; then
        deploy_step "Client bundle served" wait_for_client_bundle "$CLIENT_BUNDLE" "$READINESS_TIMEOUT"
    fi
}

# ── Stage G — Promotion ───────────────────────────────────────────────────────────────────
stage_promotion() {
    if content_release_skipped "content promotion"; then
        RELEASE_STATE=committed
        return 0
    fi
    local discard=""
    [ "$DISCARD_LIVE_CHANGES" != "1" ] || discard="--discard-live-changes"
    PREVIOUS_RELEASE="$(served_content_release "$CYBERIA_API_ORIGIN/$ENGINE_API_PATH")"
    RELEASE_STATE=promoting
    deploy_step "Promote content release $CONTENT_RELEASE_ID" \
        content_release_job "content-release-promote" "$DEPLOY_IMAGE" promote "$CONTENT_RELEASE_ID" $discard
    deploy_step "Runtime serves $CONTENT_RELEASE_ID" \
        wait_for_content_release "$CYBERIA_API_ORIGIN/$ENGINE_API_PATH" "$CONTENT_RELEASE_ID" "$READINESS_TIMEOUT"
    deploy_step "Cyberia server ready" \
        wait_for_http "$CYBERIA_SERVER_ORIGIN/api/v1/health/ready" "$READINESS_TIMEOUT"
    RELEASE_STATE=committed
    deploy_step "Prune content releases" \
        content_release_job "content-release-prune" "$DEPLOY_IMAGE" prune --keep "$CONTENT_RELEASES_KEEP"
    deploy_step "Prune the release store" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin source-release prune $CONTENT_RELEASE_ID"
}

# Keeps the bundles both colours restore, this deploy's among them, and the newest published ones.
stage_bundle_retention() {
    [ "$BUNDLE_MODE" = "1" ] || return 0
    local keep
    keep="$(deployed_client_bundles)"
    deploy_step "Prune client bundles" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run prune-bundles --deploy-id $DEPLOY_ID --bundle ${CLIENT_BUNDLE}${keep:+,$keep}"
}

# ── Revert ────────────────────────────────────────────────────────────────────────────────
#
# A deploy that fails after its traffic switch and before its release commits restores what served
# before it: the content release, when this deploy's release became the active one, then the colour.
revert_release() {
    local status=$?
    trap - EXIT
    if [ "$status" -ne 0 ] && [ -n "$RELEASE_STATE" ] && [ "$RELEASE_STATE" != committed ]; then
        if [ "$RELEASE_STATE" = promoting ] && [ "$PREVIOUS_RELEASE" != "$CONTENT_RELEASE_ID" ]; then
            deploy_step "Roll back content release $CONTENT_RELEASE_ID" \
                content_release_job "content-release-rollback" "$DEPLOY_IMAGE" rollback --from "$CONTENT_RELEASE_ID" \
                || echo "Content rollback failed: run deploy/$DEPLOY_ID/content-release.sh rollback" >&2
        fi
        if [ -n "$PREVIOUS_COLOUR" ] && [ "$(live_colour || true)" != "$PREVIOUS_COLOUR" ]; then
            deploy_step "Route $DEPLOY_ID back to $PREVIOUS_COLOUR" \
                sudo -n -- /bin/bash -lc \
                "cd $ENGINE_ROOT && node bin run promote $DEPLOY_ID,$DEPLOY_ENV --traffic $PREVIOUS_COLOUR $ROUTING_FLAGS" \
                || echo "Traffic revert failed: route $DEPLOY_ID to $PREVIOUS_COLOUR by hand" >&2
        fi
    fi
    exit "$status"
}

main() {
    require_bundle_mode
    deploy_start "Starting remote sync and deploy"
    stage_sources
    stage_build
    stage_configuration
    stage_runtime_indexes
    stage_content_candidate
    PREVIOUS_COLOUR="$(live_colour || true)"
    RELEASE_STATE=switched
    trap revert_release EXIT
    stage_rollout
    stage_readiness
    stage_promotion
    stage_bundle_retention
}

main "$@"
