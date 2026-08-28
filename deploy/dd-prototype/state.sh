#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/state.sh"

ENGINE_ROOT=/home/dd/engine

main() {
    stream_state "$ENGINE_ROOT"
}

main "$@"
