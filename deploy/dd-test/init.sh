#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain
TARGET_NODE=hp-envy-iso-ram-rocky9

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
        "cd $ENGINE_ROOT && node bin secret --from-cron-env"

    run_quiet \
        "Build dd-test configuration" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-test --conf"

    run_quiet \
        "Wait for target node readiness" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && kubectl wait --for=condition=Ready node/${TARGET_NODE} --timeout=2m"

    run_quiet \
        "Deploy dd-test production" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-test production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --node ${TARGET_NODE} --sync --build-manifest --image 'underpost/wp:v3.3.0' --timeout-response 300000ms --versions green --replicas 1 --cmd 'underpost secret underpost --create-from-env,underpost start --build --run --pull-bundle dd-test production'"

    run_quiet \
        "Issue dd-test certificates" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy dd-test production --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --node ${TARGET_NODE} --disable-update-proxy --cert"

    run_quiet \
        "Promote dd-test deployment" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor dd-test production --ready-deployment --promote --timeout-response 300000ms --versions green --replicas 1"
}

main "$@"
