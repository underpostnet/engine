#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/logging.sh"

# Runs in the workflow's rockylinux:9 container against the checked-out
# workspace instead of over SSH, so the repository root is this script's
# grandparent rather than a fixed remote path.
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

main() {
    echo "Starting github pages deploy"

    cd "$REPO_ROOT"

    run_quiet \
        "Install required packages" \
        "Target pod:" \
        14 \
        dnf install -y sudo tar gzip bzip2 git

    run_quiet \
        "Install curl" \
        "Target pod:" \
        14 \
        dnf install -y curl --allowerasing

    run_quiet \
        "Add Node.js repository" \
        "Target pod:" \
        14 \
        bash -c "curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -"

    run_quiet \
        "Install Node.js" \
        "Target pod:" \
        14 \
        dnf install nodejs -y

    run_quiet \
        "Install dependencies" \
        "Target pod:" \
        14 \
        npm install

    run_quiet \
        "Build dd-github-pages configuration" \
        "Target pod:" \
        14 \
        node bin new --default-conf --conf-workflow-id dd-github-pages

    run_quiet \
        "Create dd-github-pages deployment" \
        "Target pod:" \
        14 \
        node bin new --deploy-id dd-github-pages

    run_quiet \
        "Load dd-github-pages production environment" \
        "Target pod:" \
        14 \
        node bin app load --env production --args deploy-id=dd-github-pages

    run_quiet \
        "Build dd-github-pages client" \
        "Target pod:" \
        14 \
        env NODE_ENV=production node bin client dd-github-pages '' underpostnet.github.io /pwa-microservices-template-ghpkg
}

main "$@"
