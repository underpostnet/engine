#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

DEPLOY_ID=dd-test
DEPLOY_ENV="${DEPLOY_ENV:-production}"
DEPLOY_IMAGE="${DEPLOY_IMAGE:-$DEPLOY_WP_IMAGE}"

main() {
    deploy_start "Starting remote init deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Build $DEPLOY_ID configuration" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/build $DEPLOY_ID --conf"

    cluster_placement

    [ -z "${UNDERPOST_NODES_WORKLOADS:-}" ] || deploy_step "Wait for target node readiness" \
        cluster_wait_any_node "$UNDERPOST_NODES_WORKLOADS"

    local pod_cmd
    pod_cmd="$(pod_bootstrap_cmd $DEPLOY_ID $DEPLOY_ENV), \
        underpost start $DEPLOY_ID $DEPLOY_ENV --build --run --pull-bundle --skip-pull-repo-base"

    deploy_step "Deploy $DEPLOY_ID $DEPLOY_ENV" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin deploy $DEPLOY_ID $DEPLOY_ENV \
          --versions green \
          --replicas 1 \
          --image '${DEPLOY_IMAGE}' \
          --kubeadm \
          --timeout-response 10000ms \
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
          --timeout-response 10000ms \
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
