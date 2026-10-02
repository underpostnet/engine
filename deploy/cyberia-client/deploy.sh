#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"
source "$SCRIPT_DIR/../lib/release-sources.sh"

DEPLOY_ID=dd-cyberia
INSTANCE_ID=mmo-client
# The repository the instance image is built from.
RELEASE_REPOSITORY=underpostnet/cyberia-client
TARGET_NODE="${TARGET_NODE:-$WORKER_NODE}"
# The source channel of every repository the deploy fetches: `public`, or `private` for the
# private mirrors. A private release is the same release; its exact revision is then mirrored.
CYBERIA_SOURCE_CHANNEL="${CYBERIA_SOURCE_CHANNEL:-private}"
ENGINE_SRC_REPO="$(engine_source_repo "$DEPLOY_ID" "$CYBERIA_SOURCE_CHANNEL")"
ENGINE_SRC_PRIVATE_REPO="${ENGINE_SRC_PRIVATE_REPO:-underpostnet/engine-private}"

main() {
    deploy_start "Starting remote deploy"

    prepare_host "$ENGINE_ROOT"

    # The server and client checkouts carry the instance manifests; this instance's image is
    # released from the revision the deployment lock pins.
    sync_release_sources "$CYBERIA_SOURCE_CHANNEL"
    local revision
    revision="$(checkout_revision "${RELEASE_REPOSITORY##*/}")"

    deploy_step "Build $DEPLOY_ID configuration" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin/build $DEPLOY_ID --conf"

    deploy_step "Wait for target node readiness" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && kubectl wait --for=condition=Ready node/${TARGET_NODE} --timeout=2m"

    deploy_step "Wait for ingress rollout" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && kubectl rollout status deployment/underpost-ingress -n default --timeout=5m"

    deploy_step "Wait for gateway rollout" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && kubectl rollout status deployment/underpost-gateway -n default --timeout=5m"

    # The public channel runs the image CI built for the revision; the private channel builds it
    # here. Either way the instance runs it by digest.
    local build_path=""
    [ "$CYBERIA_SOURCE_CHANNEL" = public ] || build_path="$ENGINE_ROOT/${RELEASE_REPOSITORY##*/}"
    deploy_step "Deploy $DEPLOY_ID $INSTANCE_ID instance at $revision" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin run instance \
          --kubeadm \
          ${TARGET_NODE:+--node-name ${TARGET_NODE}} \
          --gateway-api \
          --source-revision $revision \
          ${build_path:+--build-path $build_path} \
          --image-pull-policy IfNotPresent \
          --ingress-node ${INGRESS_NODE} \
          --ssh-key-path ${DEPLOY_SSH_KEY_PATH} \
          --deploy-id $DEPLOY_ID \
    --instance-id $INSTANCE_ID"

    if [ "$CYBERIA_SOURCE_CHANNEL" = private ]; then
        deploy_step "Mirror ${RELEASE_REPOSITORY##*/}" mirror_revision "$RELEASE_REPOSITORY" "$revision"
    fi
}

main "$@"
