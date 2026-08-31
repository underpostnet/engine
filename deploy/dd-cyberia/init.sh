#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain

main() {
    deploy_start "Starting init deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Build dd-cyberia configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-cyberia --conf"

    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd dd-cyberia production), underpost start dd-cyberia production --build --run --skip-pull-repo-base"

    deploy_step "Deploy dd-cyberia production" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-cyberia production \
          --versions green \
          --replicas 1 \
          --kubeadm \
          --timeout-response 300000ms \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --sync \
          --build-manifest \
          --cmd '${pod_cmd}'"

    deploy_step "Clean dd-cyberia working tree" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-cyberia production \
          --kubeadm \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --disable-update-proxy \
          --git-clean"

    deploy_step "Promote dd-cyberia deployment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-cyberia production \
          --ready-deployment \
          --promote \
          --timeout-response 300000ms \
          --versions green \
          --replicas 1"
}

main "$@"
