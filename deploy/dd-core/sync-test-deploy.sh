#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain
TARGET_NODE=hp-envy-iso-ram-rocky9

main() {
    echo "Starting remote sync and deploy"
    
    # No pull: this flow deploys the tree already on the node.
    run_quiet "Install dependencies" "Target pod:" 14 \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && npm install"

    run_quiet "Load host config" "Target pod:" 14 \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin host load"
    
    run_quiet \
    "Sync dd-core cluster" \
    "Target pod:" \
    14 \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin run sync dd-core \
    --kubeadm \
    --gateway-api \
    --ingress-node ${INGRESS_NODE} \
    --node-name ${TARGET_NODE} \
    --ssh-key-path /home/dd/tmp/897as9dxhaskd9 \
    --cmd 'underpost start dd-core production --build --run --private-test-repo'"
}

main "$@"
