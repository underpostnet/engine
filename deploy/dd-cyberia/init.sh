#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

DEPLOY_ID=dd-cyberia
DEPLOY_ENV="${DEPLOY_ENV:-production}"

main() {
    deploy_start "Starting remote init deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Build $DEPLOY_ID configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build $DEPLOY_ID --conf"

    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd $DEPLOY_ID $DEPLOY_ENV), \
        underpost start $DEPLOY_ID $DEPLOY_ENV --build --run --skip-pull-repo-base"

    deploy_step "Deploy $DEPLOY_ID $DEPLOY_ENV" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy $DEPLOY_ID $DEPLOY_ENV \
          --versions green \
          --replicas 1 \
          --kubeadm \
          --timeout-response 10000ms \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --sync \
          --build-manifest \
          --cmd '${pod_cmd}'"

    deploy_step "Clean $DEPLOY_ID working tree" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy $DEPLOY_ID $DEPLOY_ENV \
          --kubeadm \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --disable-update-proxy \
          --git-clean"

    deploy_step "Promote $DEPLOY_ID deployment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor $DEPLOY_ID $DEPLOY_ENV \
          --ready-deployment \
          --promote \
          --timeout-response 10000ms \
          --versions green \
          --replicas 1"
}

main "$@"
