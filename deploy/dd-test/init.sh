#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain
TARGET_NODE=hp-envy-iso-ram-rocky9

main() {
    deploy_start "Starting init deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Build dd-test configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-test --conf"

    deploy_step "Wait for target node readiness" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && kubectl wait --for=condition=Ready node/${TARGET_NODE} --timeout=2m"

    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd dd-test production), underpost start dd-test production --build --run --pull-bundle --skip-pull-repo-base"

    deploy_step "Deploy dd-test production" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-test production \
          --versions green \
          --replicas 1 \
          --image 'underpost/wp:v3.3.73' \
          --kubeadm \
          --timeout-response 300000ms \
          --node ${TARGET_NODE} \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --sync \
          --build-manifest \
          --cmd '${pod_cmd}'"

    deploy_step "Issue dd-test certificates" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-test production \
          --kubeadm \
          --node ${TARGET_NODE} \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --cert \
          --disable-update-proxy"

    deploy_step "Promote dd-test deployment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-test production \
          --ready-deployment \
          --promote \
          --timeout-response 300000ms \
          --versions green \
          --replicas 1"
}

main "$@"
