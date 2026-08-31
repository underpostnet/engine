#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
TARGET_NODE=localhost.localdomain
INGRESS_NODE=localhost.localdomain

# Base source the pod bootstraps from. The private configuration repository is not named here:
# `underpost start --build` derives it from the deploy id and clones it into ./engine-private.
POD_SRC_REPO="${POD_SRC_REPO:-underpostnet/engine-test-cyberia}"

main() {
    deploy_start "Starting remote sync and deploy"
    
    prepare_host "$ENGINE_ROOT"
    
    # deploy_step "Run tests" \
    #     sudo -n -- /bin/bash -lc \
    #     "cd $ENGINE_ROOT && npm run test"
    
    deploy_step "Clean cyberia public assets" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin run clean src/client/public/cyberia"
    
    deploy_step "Clean underpost public assets" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin run clean src/client/public/underpost"
    
    deploy_step "Initialize cyberia assets repository" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin cmt src/client/public/cyberia --init-repo"
    
    deploy_step "Initialize underpost assets repository" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin cmt src/client/public/underpost --init-repo"
    
    deploy_step "Pull cyberia public assets" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin fs src/client/public/cyberia --pull --recursive --deploy-id dd-cyberia"
    
    deploy_step "Pull underpost public assets" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin fs src/client/public/underpost \
          --deploy-id dd-cyberia \
          --pull \
          --recursive \
    --storage-file-path './engine-private/conf/dd-cyberia/storage.underpost.json'"
    
    if [ "$(has_changes src/client/public/cyberia "$ENGINE_ROOT")" = "1" ]; then
        deploy_step "Commit cyberia public assets" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin cmt src/client/public/cyberia feat 'Update cyberia public assets'"
    fi
    
    if [ "$(has_changes src/client/public/underpost "$ENGINE_ROOT")" = "1" ]; then
        deploy_step "Commit underpost public assets" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin cmt src/client/public/underpost feat 'Update underpost public assets'"
    fi
    
    deploy_step "Apply format fixes" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && npm run fix"
    
    deploy_step "Reinstall dependencies" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && npm install"
    
    deploy_step "Install dd-cyberia catalog dependencies" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin package dd-cyberia --install"
    
    deploy_step "Clean build artifacts" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && underpost run clean"
    
    deploy_step "Load dd-cyberia production environment" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin app load --env production --args deploy-id=dd-cyberia"
    
    deploy_step "Build cyberia manifests" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin/cyberia run-workflow build-manifest"
    
    # Two commands, one bootstrap: `pod_bootstrap_cmd` replaces the image's engine with this
    # deploy's source and repoints the global bin at it — without that, the first step needing
    # the current CLI answered `unknown command 'app'`. `start --build` then owns the rest
    # (private conf clone, dependencies, `app load`, client bundle) and `--skip-pull-repo-base` tells
    # it the source is already in place, so the checkout is pulled exactly once.
    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd dd-cyberia production "$POD_SRC_REPO"), \
        node bin start dd-cyberia production --build --run --skip-pull-repo-base"

    deploy_step "Sync dd-cyberia cluster" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin run sync \
          --deploy-id dd-cyberia \
          --replicas 1 \
          --image underpost/engine-cyberia:latest \
          --kubeadm \
          --deploy-id-cron-jobs none \
          --timeout-response 300000ms \
          --node-name ${TARGET_NODE} \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --ssh-key-path /home/dd/tmp/897as9dxhaskd9 \
          --image-pull-policy Always \
          --cmd '${pod_cmd}'"
    
}

main "$@"
