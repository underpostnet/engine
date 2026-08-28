#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain
TARGET_NODE=hp-envy-iso-ram-rocky9

main() {
    deploy_start "Starting remote sync and deploy"
    
    prepare_host "$ENGINE_ROOT"
    
    deploy_step "Sync dd-lampp cluster" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync \
        --deploy-id dd-lampp \
        --image underpost/wp:v3.3.0 \
        --kubeadm \
        --gateway-api \
        --ingress-node ${INGRESS_NODE} \
        --timeout-response 300000ms \
        --deploy-id-cron-jobs none \
        --node-name ${TARGET_NODE} \
        --replicas 2 \
        --cmd 'cd /home/dd, \
            underpost clone underpostnet/engine-test-lampp, \
            mkdir -p /home/dd/engine, \
            cp -a /home/dd/engine-test-lampp/. /home/dd/engine/, \
            rm -rf /home/dd/engine-test-lampp, \
            cd /home/dd/engine, \
            npm install, \
            npm link --force, \
    underpost start dd-lampp production --build --run --private-test-repo'"
}

main "$@"
