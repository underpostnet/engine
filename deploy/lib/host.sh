# Host preparation for deploy/<deploy-id>/*.sh. Sourced, never executed directly.
# Requires lib/logging.sh for run_quiet.

# Brings a node to the state every deploy assumes: this repository at HEAD, its dependencies
# installed, and the host configuration loaded into the underpost root env store. `host load`
# is the one entry point for that store — see `underpost host`.
prepare_host() {
    local engine_root="${1:-/home/dd/engine}"

    run_quiet "Pull repository" "Target pod:" 14 \
        sudo -n -- /bin/bash -lc "cd $engine_root && node bin run pull"

    run_quiet "Install dependencies" "Target pod:" 14 \
        sudo -n -- /bin/bash -lc "cd $engine_root && npm install"

    run_quiet "Load host config" "Target pod:" 14 \
        sudo -n -- /bin/bash -lc "cd $engine_root && node bin host load"
}
