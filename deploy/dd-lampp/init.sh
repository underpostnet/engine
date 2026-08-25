#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain

main() {
    echo "Starting init deploy"

    prepare_host "$ENGINE_ROOT"

    run_quiet \
        "Build dd-lampp configuration" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-lampp --conf"

    run_quiet \
        "Deploy dd-lampp production" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-lampp production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --sync --build-manifest --image 'underpost/wp:v3.3.0' --versions green --replicas 1"

    run_quiet \
        "Issue dd-lampp certificates" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-lampp production --cert --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --disable-update-proxy"

    run_quiet \
        "Promote dd-lampp deployment" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-lampp production --ready-deployment --promote --versions green --replicas 1"
}

main "$@"
