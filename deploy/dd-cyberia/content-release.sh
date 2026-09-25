#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"
source "$SCRIPT_DIR/../lib/content-release.sh"

DEPLOY_ID=dd-cyberia
DEPLOY_ENV="${DEPLOY_ENV:-production}"

# Operator entry point for the live content release: status, validate <id>, promote <id>,
# rollback, prune [--keep n]. Nothing here drops a served database.
main() {
    if [ $# -eq 0 ]; then
        echo "usage: $0 <status | validate <id> | promote <id> | rollback | prune [--keep n]>" >&2
        exit 2
    fi
    deploy_start "Content release $*"
    deploy_step "cyberia content-release $*" content_release_exec "$@"
}

main "$@"
