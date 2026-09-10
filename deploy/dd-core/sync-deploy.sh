#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

DEPLOY_ID=dd-core
DEPLOY_ENV="${DEPLOY_ENV:-production}"
TARGET_NODE="${TARGET_NODE:-$WORKER_NODE}"

main() {
    deploy_start "Starting remote sync and deploy"

    prepare_host "$ENGINE_ROOT"

    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd $DEPLOY_ID $DEPLOY_ENV), \
        underpost start $DEPLOY_ID $DEPLOY_ENV --build --run --skip-pull-repo-base"

    deploy_step "Sync $DEPLOY_ID cluster" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync \
          --deploy-id $DEPLOY_ID \
          --kubeadm \
          ${TARGET_NODE:+--node-name ${TARGET_NODE}} \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --ssh-key-path ${DEPLOY_SSH_KEY_PATH} \
          --cmd '${pod_cmd}'"
}

main "$@"
