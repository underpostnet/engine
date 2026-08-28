#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain
TARGET_NODE=hp-envy-iso-ram-rocky9

main() {
    deploy_start "Starting remote sync and deploy"
    
    # No pull: this flow deploys the tree already on the node.
    deploy_step "Install dependencies" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && npm install"

    deploy_step "Load host config" \
        sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin host load"
    
    deploy_step "Sync dd-core cluster" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync --deploy-id dd-core \
    --kubeadm \
    --gateway-api \
    --ingress-node ${INGRESS_NODE} \
    --node-name ${TARGET_NODE} \
    --ssh-key-path /home/dd/tmp/897as9dxhaskd9 \
    --cmd 'underpost start dd-core production --build --run --private-test-repo'"
}

main "$@"
