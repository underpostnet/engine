#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
TARGET_NODE=localhost.localdomain
INGRESS_NODE=localhost.localdomain

# Asset repositories are committed only when they actually changed, so the
# status query stays outside deploy_step: its stdout is the value we branch on.
has_changes() {
    local path="$1"
    
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && node bin cmt $path --has-changes" | tr -d '\n'
}

main() {
    deploy_start "Starting remote sync and deploy"
    
    prepare_host "$ENGINE_ROOT"
    
    deploy_step "Run tests" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && npm run test"
    
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
    
    if [ "$(has_changes src/client/public/cyberia)" = "1" ]; then
        deploy_step "Commit cyberia public assets" \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && node bin cmt src/client/public/cyberia feat 'Update cyberia public assets'"
    fi
    
    if [ "$(has_changes src/client/public/underpost)" = "1" ]; then
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
    
    deploy_step "Build cyberia deployment bundle" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/deploy cyberia"
    
    deploy_step "Clean build artifacts" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && underpost run clean"
    
    deploy_step "Load dd-cyberia production environment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin app load --env production --args deploy-id=dd-cyberia"
    
    deploy_step "Build cyberia manifests" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/cyberia run-workflow build-manifest"
    
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
          --cmd 'cd /home/dd/engine, \
            underpost clone underpostnet/engine-cyberia, \
            mkdir -p /home/dd/engine/src/client/public/itemledger \
              /home/dd/engine/src/client/public/cryptokoyn \
              /home/dd/engine/src/client/components/cryptokoyn \
              /home/dd/engine/src/client/components/itemledger \
              /home/dd/engine/hardhat, \
            cp -a ./engine-cyberia/src/client/public/itemledger/. /home/dd/engine/src/client/public/itemledger/, \
            cp -a ./engine-cyberia/src/client/public/cryptokoyn/. /home/dd/engine/src/client/public/cryptokoyn/, \
            cp -a ./engine-cyberia/src/client/components/cryptokoyn/. /home/dd/engine/src/client/components/cryptokoyn/, \
            cp -a ./engine-cyberia/src/client/components/itemledger/. /home/dd/engine/src/client/components/itemledger/, \
            cp -a ./engine-cyberia/src/client/Itemledger.index.js /home/dd/engine/src/client/Itemledger.index.js, \
            cp -a ./engine-cyberia/src/client/Cryptokoyn.index.js /home/dd/engine/src/client/Cryptokoyn.index.js, \
            rm -rf ./engine-cyberia, \
            sudo rm -rf ./engine-private/, \
            node bin clone underpostnet/engine-cyberia-private, \
            sudo mv ./engine-cyberia-private ./engine-private, \
            node bin app load --env production --args deploy-id=dd-cyberia, \
            sudo chown -R dd:dd /home/dd/engine/src/client/public/cyberia, \
            node bin/cyberia run-workflow import-default-items --clean, \
            node bin/cyberia run-workflow import-default-items, \
            npm install, \
            npm link --force, \
            node bin app load --env production --args deploy-id=dd-cyberia, \
            node bin client dd-cyberia, \
    node bin start dd-cyberia production --run'"

}

main "$@"
