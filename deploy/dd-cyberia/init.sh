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
        "Build dd-cyberia configuration" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-cyberia --conf"

    run_quiet \
        "Deploy dd-cyberia production" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-cyberia production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --sync --build-manifest --timeout-response 300000ms --versions green --replicas 1"

    run_quiet \
        "Clean dd-cyberia working tree" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-cyberia production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --disable-update-proxy --git-clean"

    run_quiet \
        "Promote dd-cyberia deployment" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-cyberia production --ready-deployment --promote --timeout-response 300000ms --versions green --replicas 1"
}

main "$@"
