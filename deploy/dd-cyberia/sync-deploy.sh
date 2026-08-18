#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"

ENGINE_ROOT=/home/dd/engine
TARGET_NODE=localhost.localdomain
INGRESS_NODE=localhost.localdomain

# Asset repositories are committed only when they actually changed, so the
# status query stays outside run_quiet: its stdout is the value we branch on.
has_changes() {
    local path="$1"

    sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin cmt $path --has-changes" | tr -d '\n'
}

main() {
    echo "Starting remote sync and deploy"

    run_quiet \
        "Pull repository" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run pull"

    run_quiet \
        "Install dependencies" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && npm install"

    run_quiet \
        "Sync secrets" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run secret"

    run_quiet \
        "Run tests" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && npm run test"

    run_quiet \
        "Clean cyberia public assets" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run clean src/client/public/cyberia"

    run_quiet \
        "Clean underpost public assets" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run clean src/client/public/underpost"

    run_quiet \
        "Initialize cyberia assets repository" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin cmt src/client/public/cyberia --init-repo"

    run_quiet \
        "Initialize underpost assets repository" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin cmt src/client/public/underpost --init-repo"

    run_quiet \
        "Pull cyberia public assets" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin fs src/client/public/cyberia --pull --recursive --deploy-id dd-cyberia"

    run_quiet \
        "Pull underpost public assets" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin fs src/client/public/underpost --pull --recursive --deploy-id dd-cyberia --storage-file-path './engine-private/conf/dd-cyberia/storage.underpost.json'"

    if [ "$(has_changes src/client/public/cyberia)" = "1" ]; then
        run_quiet \
            "Commit cyberia public assets" \
            "Target pod:" \
            14 \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && node bin cmt src/client/public/cyberia feat 'Update cyberia public assets'"
    fi

    if [ "$(has_changes src/client/public/underpost)" = "1" ]; then
        run_quiet \
            "Commit underpost public assets" \
            "Target pod:" \
            14 \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && node bin cmt src/client/public/underpost feat 'Update underpost public assets'"
    fi

    run_quiet \
        "Apply format fixes" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && npm run fix"

    run_quiet \
        "Reinstall dependencies" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && npm install"

    run_quiet \
        "Build cyberia deployment bundle" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/deploy cyberia"

    run_quiet \
        "Clean build artifacts" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && underpost run clean"

    run_quiet \
        "Load dd-cyberia production environment" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin env dd-cyberia production"

    run_quiet \
        "Build cyberia manifests" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/cyberia run-workflow build-manifest"

    run_quiet \
        "Sync dd-cyberia cluster" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync 'dd-cyberia,1,,underpost/engine-cyberia:latest' \
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
            node bin env dd-cyberia production, \
            node ./engine-private/itc-scripts/dd-cyberia-0.js, \
            sudo chown -R dd:dd /home/dd/engine/src/client/public/cyberia, \
            node bin/cyberia run-workflow import-default-items --clean, \
            node bin/cyberia run-workflow import-default-items, \
            node bin env dd-cyberia production, \
            node bin client dd-cyberia, \
            node bin start dd-cyberia production --run'"
}

main "$@"
