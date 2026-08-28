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

    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd underpostnet/engine-core), \
        underpost start dd-core production --build --run --skip-pull-base"

    deploy_step "Sync dd-core cluster" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync \
          --deploy-id dd-core \
          --kubeadm \
          --node-name ${TARGET_NODE} \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --ssh-key-path /home/dd/tmp/897as9dxhaskd9 \
          --cmd '${pod_cmd}'"

    # State domain: read the deployment's live execution state, health and metrics off the
    # cluster and export them to the CD job. RUN_QUIET_CI, exported by the workflow, is what
    # survives the SSH hop, so this reports as GitHub Actions annotations rather than plain JSON.
    deploy_step "Export dd-core runtime state" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && RUN_QUIET_CI=${RUN_QUIET_CI:-} node bin state publish \
          --env production \
          --args deploy-id=dd-core"
}

main "$@"
