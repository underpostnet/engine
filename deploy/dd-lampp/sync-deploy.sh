#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain

main() {
    deploy_start "Starting remote sync and deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Sync dd-lampp cluster" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --timeout-response 300000ms --deploy-id-cron-jobs none --deploy-id dd-lampp --replicas 1 --image underpost/wp:v3.3.0"
}

main "$@"
