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
# The source channel of every repository the deploy fetches: `public`, or `private` for the private
# mirrors. A private release is the same production release; its exact revisions are then mirrored
# to the public repositories.
CYBERIA_SOURCE_CHANNEL="${CYBERIA_SOURCE_CHANNEL:-private}"
# The source the pod bootstraps from, and the private configuration each side reads: the host
# takes the monorepo conf, the pod takes this deploy's own conf repository.
ENGINE_SRC_REPO="$(engine_source_repo "$DEPLOY_ID" "$CYBERIA_SOURCE_CHANNEL")"
ENGINE_SRC_PRIVATE_REPO="${ENGINE_SRC_PRIVATE_REPO:-underpostnet/engine-private}"
POD_SRC_PRIVATE_REPO="$(pod_private_repo "$DEPLOY_ID")"

# Bundle mode: the host builds the client once and uploads the zip parts, and the pod restores
# that artifact instead of compiling the client itself. Set BUNDLE_MODE=0 to have the pod build
# from source.
BUNDLE_MODE="${BUNDLE_MODE:-0}"
BUNDLE_SPLIT="${BUNDLE_SPLIT:-8}"
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

# The routing a traffic switch applies: the sync and a switch back render the same routes.
ROUTING_FLAGS="--replicas 1 --timeout-response 10000ms --gateway-api"

# What served before this deploy, and how far it got: `switched` from the rollout on, `promoting`
# once the release it replaces is known, `committed` once the new release serves. A failure
# before `committed` restores what served before.
PREVIOUS_COLOUR=""
PREVIOUS_RELEASE=""
RELEASE_STATE=""

# Public origins the readiness stage probes once the new colour serves.
CYBERIA_API_ORIGIN="${CYBERIA_API_ORIGIN:-https://www.cyberiaonline.com}"
CYBERIA_SERVER_ORIGIN="${CYBERIA_SERVER_ORIGIN:-https://server.cyberiaonline.com}"
READINESS_TIMEOUT="${READINESS_TIMEOUT:-300}"

engine_version() {
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node -p \"require('./package.json').version\"" | tr -d '\n'
}

# The versioned API path the engine serves, from its one source (`DOMAIN_API_VERSION`).
engine_api_path() {
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node --input-type=module -e \"import('./src/server/domain/api-contract.js').then((contract) => process.stdout.write(contract.API_BASE_PATH))\""
}

engine_commit() {
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && git rev-parse HEAD" | tr -d '\n'
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
    # tag names whatever was pushed last and is refused unless the operator says so.
    local version
    version="$(engine_version)"
    DEPLOY_IMAGE="${DEPLOY_IMAGE:-underpost/engine-cyberia:v${version}}"
    case "$DEPLOY_IMAGE" in
        *:latest)
            if [ "${ALLOW_LATEST_IMAGE:-0}" != "1" ]; then
                echo "DEPLOY_IMAGE=$DEPLOY_IMAGE is a floating tag; pin a version tag or digest, or set ALLOW_LATEST_IMAGE=1" >&2
                exit 1
            fi
            ;;
    esac
    local engine_revision content_revision
    engine_revision="$(engine_commit)"
    content_revision="$(checkout_revision cyberia-content)"
    CONTENT_RELEASE_ID="${CONTENT_RELEASE_ID:-v${version}-${engine_revision:0:7}-${content_revision:0:8}}"
    CONTENT_RELEASE_ID="$(printf '%s' "$CONTENT_RELEASE_ID" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')"
    ENGINE_API_PATH="$(engine_api_path)"
    echo "$RUN_QUIET_NODE_TAG image=$DEPLOY_IMAGE content-release=$CONTENT_RELEASE_ID channel=$CYBERIA_SOURCE_CHANNEL"
}

# ── Stage C — Configuration ───────────────────────────────────────────────────────────────
stage_configuration() {
    deploy_step "Load $DEPLOY_ID $DEPLOY_ENV environment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin app load --env $DEPLOY_ENV --args deploy-id=$DEPLOY_ID"
    deploy_step "Validate $DEPLOY_ID domain configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/cyberia run-workflow validate-domains --env $DEPLOY_ENV"
    deploy_step "Build the game checkouts" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin/cyberia release build cyberia-server cyberia-client"

    # Follows the game build: the client renders from the conf.ssr.json that build reads, so a
    # bundle pushed before it would ship the previous SSR views. The uploaded keys
    # are recorded in engine-private/conf/$DEPLOY_ID/storage.bundle.json.
    if [ "$BUNDLE_MODE" = "1" ]; then
        deploy_step "Push $DEPLOY_ID client bundle" \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && node bin run push-bundle --deploy-id $DEPLOY_ID --split $BUNDLE_SPLIT"
    fi

    # The pod replaces ./engine-private with a clone of its conf repository, so this publishes
    # the deploy's conf there — the bundle manifest included — before the pod starts.
    deploy_step "Build $DEPLOY_ID configuration" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin/build $DEPLOY_ID --conf"
}

# Whether the content release stages are off. Prints the reason to the log.
content_release_skipped() {
    [ "$SKIP_CONTENT_RELEASE" = "1" ] || return 1
    echo "$RUN_QUIET_NODE_TAG SKIP_CONTENT_RELEASE=1: $1 skipped"
}

# ── Stage D — Content candidate ──────────────────────────────────────────────────────────
#
# The host fetches the locked content revision into a read-only release workspace, and projects
# the data-release credentials. A Release Job on the deployed image builds the content with the
# repository's own commands, ingests it into the candidate database and validates it there, against
# the Object Layer authority. Players keep the active release. A rerun resumes the same release,
# and a validated one is left as it is.
stage_content_candidate() {
    ! content_release_skipped "content candidate" || return 0
    deploy_step "Prepare content release $CONTENT_RELEASE_ID" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/cyberia content-release prepare $CONTENT_RELEASE_ID --channel $CYBERIA_SOURCE_CHANNEL"
    deploy_step "Project data-release credentials" apply_release_secret
    deploy_step "Build content release $CONTENT_RELEASE_ID" \
        content_release_job "$CONTENT_RELEASE_ID" "$DEPLOY_IMAGE" \
        build "$CONTENT_RELEASE_ID" --from source ${CONTENT_INSTANCES:+--instances "$CONTENT_INSTANCES"}
}

# ── Stage E — Migrations and application rollout ─────────────────────────────────────────
#
# The pod bootstrap runs only idempotent migrations before the application starts. The new
# colour takes traffic once Ready and serves the release that is already active: application
# and content change separately, and nothing here drops a database.
stage_rollout() {
    local pod_cmd
    local start_flags="--build --run --skip-pull-repo-base --skip-pull-private-repo"
    if [ "$BUNDLE_MODE" = "1" ]; then
        start_flags="$start_flags --pull-bundle"
    fi
    # `db --migrate-stable-slugs` is idempotent: a document that has a slug keeps it.
    pod_cmd="$(pod_bootstrap_cmd $DEPLOY_ID $DEPLOY_ENV "$ENGINE_SRC_REPO"), \
        underpost clone ${POD_SRC_PRIVATE_REPO}, \
        sudo rm -rf ./engine-private, \
        sudo mv ./${POD_SRC_PRIVATE_DIR} ./engine-private, \
        underpost app load --env $DEPLOY_ENV --args deploy-id=$DEPLOY_ID, \
        underpost db $DEPLOY_ID --migrate-stable-slugs, \
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
          --cmd '${pod_cmd}'"
}

# ── Stage F — Readiness ───────────────────────────────────────────────────────────────────
stage_readiness() {
    deploy_step "Engine API ready" \
        wait_for_http "$CYBERIA_API_ORIGIN/$ENGINE_API_PATH/cyberia-instance?limit=1" "$READINESS_TIMEOUT"
    deploy_step "Object Layer authority ready" \
        wait_for_http "$OBJECT_LAYER_API_ORIGIN/$ENGINE_API_PATH/object-layer?limit=1" "$READINESS_TIMEOUT"
}

# ── Stage G — Promotion ───────────────────────────────────────────────────────────────────
stage_promotion() {
    if content_release_skipped "content promotion"; then
        RELEASE_STATE=committed
        return 0
    fi
    PREVIOUS_RELEASE="$(served_content_release "$CYBERIA_API_ORIGIN/$ENGINE_API_PATH")"
    RELEASE_STATE=promoting
    deploy_step "Promote content release $CONTENT_RELEASE_ID" \
        content_release_job "content-release-promote" "$DEPLOY_IMAGE" promote "$CONTENT_RELEASE_ID"
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

# ── Stage H — Mirror ──────────────────────────────────────────────────────────────────────
#
# After a release from the private channel, its exact revisions reach the public repositories: the
# revision each data-release and source-sync checkout stands at. A failed mirror fails the deploy
# without touching the release that already serves.
stage_mirror() {
    [ "$CYBERIA_SOURCE_CHANNEL" = private ] || return 0
    local entry name repository profile
    for entry in "${RELEASE_REPOSITORIES[@]}"; do
        read -r name repository profile <<<"$entry"
        case "$profile" in
            data-release | source-sync)
                deploy_step "Mirror $name" mirror_revision "$repository" "$(checkout_revision "$name")"
                ;;
        esac
    done
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
    deploy_start "Starting remote sync and deploy"
    stage_sources
    stage_build
    stage_configuration
    stage_content_candidate
    PREVIOUS_COLOUR="$(live_colour || true)"
    RELEASE_STATE=switched
    trap revert_release EXIT
    stage_rollout
    stage_readiness
    stage_promotion
    stage_mirror
}

main "$@"
