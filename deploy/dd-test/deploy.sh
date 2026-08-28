#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain

main() {
    deploy_start "Starting remote deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Deploy dd-test" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run deploy dd-test --gateway-api --ingress-node ${INGRESS_NODE}"

}

main "$@"
