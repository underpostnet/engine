#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
INGRESS_NODE=localhost.localdomain

main() {
    echo "Starting remote deploy"

    prepare_host "$ENGINE_ROOT"

    run_quiet \
        "Deploy dd-core" \
        "Target pod:" \
        14 \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run deploy dd-core --gateway-api --ingress-node ${INGRESS_NODE}"
}

main "$@"
