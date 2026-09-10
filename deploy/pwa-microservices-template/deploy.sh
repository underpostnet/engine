#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"

# Runs in the workflow's rockylinux:9 container against the checked-out
# workspace instead of over SSH, so the repository root is this script's
# grandparent rather than a fixed remote path.
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DEPLOY_ID=dd-github-pages

main() {
    deploy_start "Starting github pages deploy"

    cd "$REPO_ROOT"

    deploy_step "Install required packages" \
        dnf install -y sudo tar gzip bzip2 git

    deploy_step "Install curl" \
        dnf install -y curl --allowerasing

    deploy_step "Add Node.js repository" \
        bash -c "curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -"

    deploy_step "Install Node.js" \
        dnf install nodejs -y

    deploy_step "Install dependencies" \
        npm install

    deploy_step "Build $DEPLOY_ID configuration" \
        node bin new --default-conf --conf-workflow-id $DEPLOY_ID

    deploy_step "Create $DEPLOY_ID deployment" \
        node bin new --deploy-id $DEPLOY_ID

    deploy_step "Load $DEPLOY_ID production environment" \
        node bin app load --env production --args deploy-id=$DEPLOY_ID

    deploy_step "Build $DEPLOY_ID client" \
        env NODE_ENV=production node bin client $DEPLOY_ID '' underpostnet.github.io /pwa-microservices-template-ghpkg
}

main "$@"
