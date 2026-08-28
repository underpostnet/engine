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

    deploy_step "Build dd-lampp configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-lampp --conf"

    deploy_step "Deploy dd-lampp production" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-lampp production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --sync --build-manifest --image 'underpost/wp:v3.3.0' --versions green --replicas 1"

    deploy_step "Issue dd-lampp certificates" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-lampp production --cert --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --disable-update-proxy"

    deploy_step "Promote dd-lampp deployment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-lampp production --ready-deployment --promote --versions green --replicas 1"
}

main "$@"
