#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

ENGINE_ROOT=/home/dd/engine
DEPLOY_ID=dd-test

main() {
    deploy_start "Syncing $DEPLOY_ID package manifest"

    install_deploy_dependencies "$ENGINE_ROOT" "$DEPLOY_ID"
}

main "$@"
