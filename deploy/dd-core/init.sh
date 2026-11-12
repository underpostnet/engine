#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

DEPLOY_ID=dd-core
DEPLOY_ENV="${DEPLOY_ENV:-production}"

main() {
    deploy_start "Starting remote init deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Build $DEPLOY_ID configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build $DEPLOY_ID --conf"

    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd $DEPLOY_ID $DEPLOY_ENV), \
        underpost start $DEPLOY_ID $DEPLOY_ENV --build --run --skip-pull-repo-base"

    deploy_step "Deploy $DEPLOY_ID $DEPLOY_ENV" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy $DEPLOY_ID $DEPLOY_ENV \
          --versions green \
          --replicas 1 \
          --kubeadm \
          --sync \
          --build-manifest \
          --cmd '${pod_cmd}'"

    deploy_step "Apply $DEPLOY_ID workloads" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy $DEPLOY_ID $DEPLOY_ENV \
          --kubeadm \
          --disable-update-proxy"

    deploy_step "Promote $DEPLOY_ID deployment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin monitor $DEPLOY_ID $DEPLOY_ENV \
          --ready-deployment \
          --promote \
          --versions green \
          --replicas 1"

    deploy_step "Reconcile $DEPLOY_ID TLS" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin tls reconcile \
          --deploy-id $DEPLOY_ID \
          --env $DEPLOY_ENV \
          --apply"
}

main "$@"
