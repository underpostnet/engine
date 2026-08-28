# Host preparation for deploy/<deploy-id>/*.sh. Sourced, never executed directly.
# Requires lib/logging.sh for deploy_step.

ENGINE_SRC_REPO="${ENGINE_SRC_REPO:-underpostnet/engine-test-test}"
# ENGINE_SRC_PRIVATE_REPO="${ENGINE_SRC_PRIVATE_REPO:-underpostnet/engine-private}"
ENGINE_SRC_PRIVATE_REPO="underpostnet/engine-private"

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

# The in-pod bootstrap, emitted as a `--cmd` payload (comma-separated: `underpost deploy`
# splits on commas, one shell command per element).
#
# A pod starts from an image whose global `underpost` is only as new as the last image build,
# and the engine shells out to that bare command on every production path
# (`options.dev ? 'node bin' : 'underpost'`). Replacing the image's engine with this deploy's
# own source and repointing the global bin at it is what makes the pod run the CLI that
# deployed it rather than the one its image was published with.
#
# Pair it with `--skip-pull-base` on the `underpost start` that follows: this *is* the pull
# `start --build` performs, so leaving it on clones and installs the same tree twice.
#
# Usage: pod_bootstrap_cmd <owner/repo>   e.g. pod_bootstrap_cmd underpostnet/engine-test
pod_bootstrap_cmd() {
    local repo="$1"
    local name="${repo##*/}"
    
    printf '%s' "cd /home/dd, \
underpost clone ${repo}, \
mkdir -p /home/dd/engine, \
cp -a /home/dd/${name}/. /home/dd/engine/, \
rm -rf /home/dd/${name}, \
cd /home/dd/engine, \
npm install, \
    npm link --force"
}
