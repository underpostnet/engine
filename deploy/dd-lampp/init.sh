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
        "cd $ENGINE_ROOT && node bin deploy dd-lampp production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --sync --build-manifest --image 'underpost/wp:v3.2.90' --versions green --replicas 1"

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
