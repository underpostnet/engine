#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"

ENGINE_ROOT=/home/dd/engine
TARGET_NODE=hp-envy-iso-ram-rocky9
INGRESS_NODE=localhost.localdomain

main() {
    echo "Starting remote deploy"

    run_quiet \
        "Pull repository" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run pull"

    run_quiet \
        "Sync secrets" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run secret"

    run_quiet \
        "Build dd-cyberia configuration" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-cyberia --conf"

    run_quiet \
        "Wait for target node readiness" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && kubectl wait --for=condition=Ready node/${TARGET_NODE} --timeout=2m"

    run_quiet \
        "Wait for ingress rollout" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && kubectl rollout status deployment/underpost-ingress -n default --timeout=5m"

    run_quiet \
        "Wait for gateway rollout" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && kubectl rollout status deployment/underpost-gateway -n default --timeout=5m"

    run_quiet \
        "Deploy cyberia mmo client instance" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run instance \
          --kubeadm \
          --gateway-api \
          --image-pull-policy Always \
          --node-name ${TARGET_NODE} \
          --ingress-node ${INGRESS_NODE} \
          --ssh-key-path /home/dd/tmp/897as9dxhaskd9 \
          'dd-cyberia,mmo-client'"
}

main "$@"
