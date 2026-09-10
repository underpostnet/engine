#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/state.sh"

DEPLOY_ID=dd-core

main() {
    stream_state "$ENGINE_ROOT" "$DEPLOY_ID"
}

main "$@"
