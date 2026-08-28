#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"
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

    deploy_step "Deploy dd-test production" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-test production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --node ${TARGET_NODE} --sync --build-manifest --image 'underpost/wp:v3.3.0' --timeout-response 300000ms --versions green --replicas 1 --cmd 'underpost start --build --run --pull-bundle dd-test production'"

    deploy_step "Issue dd-test certificates" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-test production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --node ${TARGET_NODE} --disable-update-proxy --cert"

    deploy_step "Promote dd-test deployment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-test production --ready-deployment --promote --timeout-response 300000ms --versions green --replicas 1"
}

main "$@"
