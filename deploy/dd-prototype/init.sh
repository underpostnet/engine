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

    deploy_step "Build dd-prototype configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-prototype --conf"

    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd dd-prototype production), underpost start dd-prototype production --build --run --skip-pull-repo-base"

    deploy_step "Deploy dd-prototype production" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-prototype production \
          --versions green \
          --replicas 1 \
          --kubeadm \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --sync \
          --build-manifest \
          --cmd '${pod_cmd}'"

    deploy_step "Issue dd-prototype certificates" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-prototype production \
          --kubeadm \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --cert \
          --disable-update-proxy"

    deploy_step "Promote dd-prototype deployment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-prototype production \
          --ready-deployment \
          --promote \
          --versions green \
          --replicas 1"
}

main "$@"
