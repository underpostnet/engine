#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain
TARGET_NODE=hp-envy-iso-ram-rocky9

main() {
    echo "Starting remote sync and deploy"

    prepare_host "$ENGINE_ROOT"

    run_quiet \
        "Sync dd-core cluster" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync --kubeadm --gateway-api --ingress-node ${INGRESS_NODE} --node-name ${TARGET_NODE} --ssh-key-path /home/dd/tmp/897as9dxhaskd9 dd-core"
}

main "$@"
