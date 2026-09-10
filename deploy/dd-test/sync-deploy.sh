#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

DEPLOY_ID=dd-test
DEPLOY_ENV="${DEPLOY_ENV:-production}"
TARGET_NODE="${TARGET_NODE:-$WORKER_NODE}"
DEPLOY_IMAGE="${DEPLOY_IMAGE:-$DEPLOY_WP_IMAGE}"
# The source the pod bootstraps from; the host takes the same pair through prepare_host.
ENGINE_SRC_REPO="${ENGINE_SRC_REPO:-underpostnet/engine-test-test}"

main() {
    deploy_start "Starting remote sync and deploy"

    prepare_host "$ENGINE_ROOT"

    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd $DEPLOY_ID $DEPLOY_ENV "$ENGINE_SRC_REPO"), \
        underpost start $DEPLOY_ID $DEPLOY_ENV --build --run --skip-pull-repo-base"

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
          --cmd '${pod_cmd}'"
}

main "$@"
