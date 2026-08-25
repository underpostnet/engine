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
        "Build dd-prototype configuration" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-prototype --conf"

    run_quiet \
        "Deploy dd-prototype production" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-prototype production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --sync --build-manifest --versions green --replicas 1"

    run_quiet \
        "Issue dd-prototype certificates" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-prototype production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --cert --disable-update-proxy"

    run_quiet \
        "Promote dd-prototype deployment" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-prototype production --ready-deployment --promote --versions green --replicas 1"
}

main "$@"
