#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

DEPLOY_ID=dd-cyberia
INSTANCE_ID=mmo-client
TARGET_NODE="${TARGET_NODE:-$WORKER_NODE}"

main() {
    deploy_start "Starting remote deploy"

    prepare_host "$ENGINE_ROOT"

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

    deploy_step "Deploy $DEPLOY_ID $INSTANCE_ID instance" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run instance \
          --kubeadm \
          ${TARGET_NODE:+--node-name ${TARGET_NODE}} \
          --gateway-api \
          --image-pull-policy Always \
          --ingress-node ${INGRESS_NODE} \
          --ssh-key-path ${DEPLOY_SSH_KEY_PATH} \
          --deploy-id $DEPLOY_ID \
          --instance-id $INSTANCE_ID"
}

main "$@"
