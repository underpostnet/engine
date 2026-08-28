#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine

main() {
    deploy_start "Starting remote release deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Install underpost CLI" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && npm install -g underpost"

    deploy_step "Resync secrets" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin host load"

    deploy_step "Configure git" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run --dev git-conf"

    deploy_step "Build and publish docker images" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run docker-image"
}

main "$@"
