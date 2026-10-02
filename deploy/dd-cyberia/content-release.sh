#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"
source "$SCRIPT_DIR/../lib/content-release.sh"

DEPLOY_ID=dd-cyberia
DEPLOY_ENV="${DEPLOY_ENV:-production}"
TARGET_NODE="${TARGET_NODE:-$HOST_NODE}"

# Operator entry point for the live content release: status, validate <id>, promote <id>,
# rollback, retire, prune [--keep n]. Each runs in a Release Job on the image the live colour
# serves. Nothing here drops a served database.
main() {
    if [ $# -eq 0 ]; then
        echo "usage: $0 <status | validate <id> | promote <id> | rollback | retire | prune [--keep n]>" >&2
        exit 2
    fi
    deploy_start "Content release $*"
    local image
    image="$(live_image)"
    deploy_step "Project data-release credentials" apply_release_secret
    deploy_step "cyberia content-release $*" content_release_job "content-release-$1" "$image" "$@"
}

main "$@"
