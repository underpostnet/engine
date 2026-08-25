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
        "Build dd-core configuration" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-core --conf"

    run_quiet \
        "Deploy dd-core production" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-core production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --sync --build-manifest --versions green --replicas 1"

    run_quiet \
        "Issue dd-core certificates" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-core production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --cert --disable-update-proxy"

    run_quiet \
        "Promote dd-core deployment" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-core production --ready-deployment --promote --versions green --replicas 1"
}

main "$@"
