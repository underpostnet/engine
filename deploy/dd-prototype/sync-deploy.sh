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
    pod_cmd="$(pod_bootstrap_cmd underpostnet/engine-prototype), \
        underpost start dd-prototype production --build --run --skip-pull-base"

    deploy_step "Sync dd-prototype cluster" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync \
          --deploy-id dd-prototype \
          --kubeadm \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --cmd '${pod_cmd}'"

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
