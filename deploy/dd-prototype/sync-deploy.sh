#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain

main() {
    deploy_start "Starting remote sync and deploy"

    prepare_host "$ENGINE_ROOT"

    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd dd-prototype production), underpost start dd-prototype production --build --run --skip-pull-repo-base"

    deploy_step "Sync dd-prototype cluster" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync \
          --deploy-id dd-prototype \
          --kubeadm \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --cmd '${pod_cmd}'"

}

main "$@"
