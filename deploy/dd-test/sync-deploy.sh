#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain
TARGET_NODE=hp-envy-iso-ram-rocky9

# Base source the pod bootstraps from. `pod_bootstrap_cmd` derives its checkout directory from
# this name, so the repository is stated once and can be repointed without touching the command.
POD_SRC_REPO="${POD_SRC_REPO:-underpostnet/engine-test-test}"

main() {
    deploy_start "Starting remote sync and deploy"
    
    prepare_host "$ENGINE_ROOT"
    
    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd dd-test production "$POD_SRC_REPO"), underpost start dd-test production --build --run --skip-pull-repo-base"

    deploy_step "Sync dd-test cluster" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync \
          --deploy-id dd-test \
          --replicas 1 \
          --image underpost/wp:v3.3.73 \
          --kubeadm \
          --deploy-id-cron-jobs none \
          --timeout-response 300000ms \
          --node-name ${TARGET_NODE} \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --cmd '${pod_cmd}'"

}

main "$@"
