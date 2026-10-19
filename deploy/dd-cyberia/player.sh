#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"
source "$SCRIPT_DIR/../lib/content-release.sh"

DEPLOY_ID=dd-cyberia
DEPLOY_ENV="${DEPLOY_ENV:-production}"
TARGET_NODE="${TARGET_NODE:-$HOST_NODE}"

player_job() {
    local image
    image="$(live_image)"
    deploy_start "cyberia $*"
    deploy_step "Project data-release credentials" apply_release_secret
    release_job "$1-$2" "$image" "node bin/cyberia $*"
}

usage() {
    echo "usage: $0 player <command> [args]" >&2
    exit 2
}

main() {
    case "${1:-}" in
        player) [ $# -ge 2 ] || usage; player_job "$@" ;;
        *) usage ;;
    esac
}

main "$@"
