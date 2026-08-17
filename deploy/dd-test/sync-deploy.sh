#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain
TARGET_NODE=hp-envy-iso-ram-rocky9

main() {
    echo "Starting remote sync and deploy"
    
    run_quiet \
    "Pull repository" \
    "Target pod:" \
    14 \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT"
    
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
    "Sync dd-test cluster" \
    "Target pod:" \
    14 \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin run sync --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --node-name ${TARGET_NODE} --deploy-id-cron-jobs none --timeout-response 300000ms --cmd 'underpost secret underpost --create-from-env,underpost start --build --run dd-test production' dd-test,1,,underpost/wp:v3.2.90"
}

main "$@"
