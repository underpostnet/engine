#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain

main() {
    echo "Starting init deploy"

    run_quiet \
        "Pull repository" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run pull"

    run_quiet \
        "Install dependencies" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && npm install"

    run_quiet \
        "Sync secrets" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run secret"

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
