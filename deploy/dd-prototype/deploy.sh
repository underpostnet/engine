#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain

main() {
    deploy_start "Starting remote deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Deploy dd-prototype" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run deploy dd-prototype --gateway-api --ingress-node ${INGRESS_NODE}"

    # State domain: read the deployment's live execution state, health and metrics off the
    # cluster and export them to the CD job. RUN_QUIET_CI, exported by the workflow, is what
    # survives the SSH hop, so this reports as GitHub Actions annotations rather than plain JSON.
    deploy_step "Export dd-prototype runtime state" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && RUN_QUIET_CI=${RUN_QUIET_CI:-} node bin state publish \
          --env production \
          --args deploy-id=dd-prototype"
}

main "$@"
