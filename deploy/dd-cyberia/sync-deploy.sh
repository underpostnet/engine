#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"
source "$SCRIPT_DIR/../lib/content-release.sh"

DEPLOY_ID=dd-cyberia
DEPLOY_ENV="${DEPLOY_ENV:-production}"
TARGET_NODE="${TARGET_NODE:-$HOST_NODE}"
# The source the pod bootstraps from, and the private configuration each side reads: the host
# takes the monorepo conf, the pod takes this deploy's own conf repository.
ENGINE_SRC_REPO="${ENGINE_SRC_REPO:-underpostnet/engine-test-cyberia}"
ENGINE_SRC_PRIVATE_REPO="${ENGINE_SRC_PRIVATE_REPO:-underpostnet/engine-private}"
POD_SRC_PRIVATE_REPO="$(pod_private_repo "$DEPLOY_ID")"
# The product checkouts `bin/cyberia` reads beside the engine, brought to their tip once the
# engine itself is at HEAD.
CYBERIA_SERVER_REPO="${CYBERIA_SERVER_REPO:-underpostnet/cyberia-server}"
CYBERIA_CLIENT_REPO="${CYBERIA_CLIENT_REPO:-underpostnet/cyberia-client}"

CYBERIA_ASSETS=src/client/public/cyberia
UNDERPOST_ASSETS=src/client/public/underpost

# Bundle mode: the host builds the client once and uploads the zip parts, and the pod restores
# that artifact instead of compiling the client itself. Set BUNDLE_MODE=0 to have the pod build
# from source.
BUNDLE_MODE="${BUNDLE_MODE:-0}"
BUNDLE_SPLIT="${BUNDLE_SPLIT:-8}"
# `mv` into a directory that already exists nests the checkout inside it rather than replacing
# it, and the pod would then load whatever conf the image carried.
POD_SRC_PRIVATE_DIR="${POD_SRC_PRIVATE_REPO##*/}"

# The instances every content release carries, and the release id: the engine version plus the
# source commit, so one release names one build. CONTENT_RELEASE_ID overrides it.
CONTENT_INSTANCES="${CONTENT_INSTANCES:-amethyst-strata-expansion,FOREST,TEST}"
CONTENT_RELEASE_ID="${CONTENT_RELEASE_ID:-}"
# Retired releases kept for rollback beyond the previous one.
CONTENT_RELEASES_KEEP="${CONTENT_RELEASES_KEEP:-2}"

# Public origins the readiness stage probes once the new colour serves.
CYBERIA_API_ORIGIN="${CYBERIA_API_ORIGIN:-https://www.cyberiaonline.com}"
OBJECT_LAYER_API_ORIGIN="${OBJECT_LAYER_API_ORIGIN:-https://objectlayer.org}"
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
    sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && git rev-parse --short HEAD" | tr -d '\n'
}

# ── Stage A — Source synchronization ─────────────────────────────────────────────────────
stage_sources() {
    prepare_host "$ENGINE_ROOT"
    sync_checkout "$CYBERIA_SERVER_REPO" "$ENGINE_ROOT"
    sync_checkout "$CYBERIA_CLIENT_REPO" "$ENGINE_ROOT"

    deploy_step "Clean cyberia public assets" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin run clean $CYBERIA_ASSETS"
    deploy_step "Clean underpost public assets" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin run clean $UNDERPOST_ASSETS"
    deploy_step "Initialize cyberia assets repository" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin cmt $CYBERIA_ASSETS --init-repo"
    deploy_step "Initialize underpost assets repository" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin cmt $UNDERPOST_ASSETS --init-repo"
    deploy_step "Pull cyberia public assets" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin fs $CYBERIA_ASSETS --deploy-id $DEPLOY_ID --pull --tracked"
    deploy_step "Pull underpost public assets" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin fs $UNDERPOST_ASSETS --deploy-id $DEPLOY_ID --pull --tracked --storage-id underpost"

    if [ "$(has_changes $CYBERIA_ASSETS "$ENGINE_ROOT")" = "1" ]; then
        deploy_step "Commit cyberia public assets" \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && git -C $CYBERIA_ASSETS add . && node bin cmt $CYBERIA_ASSETS feat 'Update cyberia public assets'"
    fi
    if [ "$(has_changes $UNDERPOST_ASSETS "$ENGINE_ROOT")" = "1" ]; then
        deploy_step "Commit underpost public assets" \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && git -C $UNDERPOST_ASSETS add . && node bin cmt $UNDERPOST_ASSETS feat 'Update underpost public assets'"
    fi
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
    CONTENT_RELEASE_ID="${CONTENT_RELEASE_ID:-v${version}-$(engine_commit)}"
    CONTENT_RELEASE_ID="$(printf '%s' "$CONTENT_RELEASE_ID" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')"
    ENGINE_API_PATH="$(engine_api_path)"
    echo "$RUN_QUIET_NODE_TAG image=$DEPLOY_IMAGE content-release=$CONTENT_RELEASE_ID"
}

# ── Stage C — Configuration ───────────────────────────────────────────────────────────────
stage_configuration() {
    deploy_step "Load $DEPLOY_ID $DEPLOY_ENV environment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin app load --env $DEPLOY_ENV --args deploy-id=$DEPLOY_ID"
    deploy_step "Validate $DEPLOY_ID domain configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/cyberia run-workflow validate-domains --env $DEPLOY_ENV"
    deploy_step "Build cyberia manifests" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin/cyberia run-workflow build-manifest"

    # Follows the manifest step: the client renders from the conf.ssr.json that build-manifest
    # writes, so a bundle pushed before it would ship the previous SSR views. The uploaded keys
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

# ── Stages D, E — Migrations and application rollout ─────────────────────────────────────
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
          --replicas 1 \
          --image '${DEPLOY_IMAGE}' \
          --kubeadm \
          --deploy-id-cron-jobs none \
          --timeout-response 10000ms \
          ${TARGET_NODE:+--node-name ${TARGET_NODE}} \
          --gateway-api \
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

# ── Stage G — Content candidate ──────────────────────────────────────────────────────────
#
# Built inside the pod that now serves, so the candidate is validated by the version that will
# serve it and its definitions reach an Object Layer authority that runs this version. The
# candidate lives in its own database; players keep the active release until Stage H. A release
# that was promoted before is left as it is. `--bootstrap` promotes only when no release is
# active yet, so a first deploy never serves an empty world.
stage_content_candidate() {
    deploy_step "Build content release $CONTENT_RELEASE_ID" \
        content_release_exec build "$CONTENT_RELEASE_ID" --bootstrap --instances "$CONTENT_INSTANCES"
    deploy_step "Content release $CONTENT_RELEASE_ID validated" \
        content_release_expect_status "$CONTENT_RELEASE_ID" validated active
}

# ── Stage H — Promotion ───────────────────────────────────────────────────────────────────
stage_promotion() {
    deploy_step "Promote content release $CONTENT_RELEASE_ID" \
        content_release_exec promote "$CONTENT_RELEASE_ID"
    deploy_step "Runtime serves $CONTENT_RELEASE_ID" \
        wait_for_content_release "$CYBERIA_API_ORIGIN/$ENGINE_API_PATH" "$CONTENT_RELEASE_ID" "$READINESS_TIMEOUT"
    deploy_step "Cyberia server ready" \
        wait_for_http "$CYBERIA_SERVER_ORIGIN/api/v1/health/ready" "$READINESS_TIMEOUT"
    deploy_step "Prune retired content releases" \
        content_release_exec prune --keep "$CONTENT_RELEASES_KEEP"
}

main() {
    deploy_start "Starting remote sync and deploy"
    stage_sources
    stage_build
    stage_configuration
    stage_rollout
    stage_readiness
    stage_content_candidate
    stage_promotion
}

main "$@"
