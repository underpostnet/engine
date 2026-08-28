#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
TARGET_NODE=hp-envy-iso-ram-rocky9
INGRESS_NODE=localhost.localdomain

main() {
    deploy_start "Starting remote deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Build dd-cyberia configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build dd-cyberia --conf"

    deploy_step "Wait for target node readiness" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && kubectl wait --for=condition=Ready node/${TARGET_NODE} --timeout=2m"

    deploy_step "Wait for ingress rollout" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && kubectl rollout status deployment/underpost-ingress -n default --timeout=5m"

    deploy_step "Wait for gateway rollout" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && kubectl rollout status deployment/underpost-gateway -n default --timeout=5m"

    deploy_step "Deploy cyberia mmo server instance" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run instance \
          --kubeadm \
          --gateway-api \
          --image-pull-policy Always \
          --node-name ${TARGET_NODE} \
          --ingress-node ${INGRESS_NODE} \
          --ssh-key-path /home/dd/tmp/897as9dxhaskd9 \
          --deploy-id dd-cyberia \
          --instance-id mmo-server"

}

main "$@"
