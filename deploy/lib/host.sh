# Host preparation for deploy/<deploy-id>/*.sh. Sourced, never executed directly.
# Requires lib/logging.sh for deploy_step.

ENGINE_SRC_REPO="${ENGINE_SRC_REPO:-underpostnet/engine-test-test}"
ENGINE_SRC_PRIVATE_REPO="${ENGINE_SRC_PRIVATE_REPO:-underpostnet/engine-private}"

# Brings a node to the state every deploy assumes: the engine source at HEAD, its dependencies
# installed, and the host configuration loaded into the underpost root env store. `host load`
# is the one entry point for that store — see `underpost host`.
prepare_host() {
    local engine_root="${1:-/home/dd/engine}"
    local src_repo="${2:-$ENGINE_SRC_REPO}"
    local src_private_repo="${3:-$ENGINE_SRC_PRIVATE_REPO}"
    
    deploy_step "Pull repository" \
    sudo -n -- /bin/bash -lc \
    "cd $engine_root && node bin run pull $src_repo${src_private_repo:+ --repo-engine-private $src_private_repo}"
    
    deploy_step "Install dependencies" \
    sudo -n -- /bin/bash -lc "cd $engine_root && npm install"
    
    deploy_step "Load host config" \
    sudo -n -- /bin/bash -lc "cd $engine_root && node bin host load"
}
