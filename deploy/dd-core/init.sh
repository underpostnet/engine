#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain

main() {
    deploy_start "Starting init deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Build dd-core configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-core --conf"

    deploy_step "Deploy dd-core production" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-core production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --sync --build-manifest --versions green --replicas 1"

    deploy_step "Issue dd-core certificates" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-core production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --cert --disable-update-proxy"

    deploy_step "Promote dd-core deployment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-core production --ready-deployment --promote --versions green --replicas 1"
}

main "$@"
