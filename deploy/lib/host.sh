# Host preparation for deploy/<deploy-id>/*.sh. Sourced, never executed directly.
# Requires lib/github-actions-logging.sh for deploy_step.

# The host configuration store, if this node has one.
#
# Every step below drives the CLI through `sudo`, so the store the CLI writes is root's, not the
# store of whoever sourced this file. Both are looked at, the sourcing account first, so a script
# run as root and a script run as an operator with sudo read the same node configuration.
#
# Usage: host_config_path
host_config_path() {
    local root path

    root="$(npm root -g 2>/dev/null)" || root=''
    path="$root/underpost/.env"
    if [ -n "$root" ] && [ -f "$path" ]; then
        printf '%s' "$path"
        return 0
    fi

    # Only when the sourcing account has no store of its own: `sudo -n` is non-interactive, so a
    # host without passwordless sudo declines instead of prompting.
    root="$(sudo -n -- /bin/bash -lc 'npm root -g' 2>/dev/null)" || root=''
    path="$root/underpost/.env"
    [ -n "$root" ] && [ -f "$path" ] && printf '%s' "$path"

    return 0
}

# One key of this node's resolved host configuration, read straight out of the store the host
# domain owns (`underpost host get|set`). Pure shell for the same reason `deploy_id_from_repo`
# is: it resolves the manifest that makes that CLI runnable, so it cannot ask the CLI.
#
# Usage: host_config <key>
host_config() {
    local key="$1" path value

    path="$(host_config_path)"
    [ -n "$path" ] || return 0

    value="$(sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" "$path" | tail -n 1)"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    printf '%s' "$value"
}

# The repository pair a node prepares itself from: the environment, then the node's own host
# configuration, where `underpost wireguard --sync` records the pair it moved the node onto.
# Named nowhere else — left empty, the pull resolves the pairing itself.
ENGINE_SRC_REPO="${ENGINE_SRC_REPO:-$(host_config ENGINE_SRC_REPO)}"
ENGINE_SRC_PRIVATE_REPO="${ENGINE_SRC_PRIVATE_REPO:-$(host_config ENGINE_SRC_PRIVATE_REPO)}"

# The deploy id a source repository belongs to: `engine-cyberia` and `engine-test-cyberia` are
# both `dd-cyberia`. Pure shell on purpose — it resolves the manifest that makes the CLI
# runnable, so it cannot be resolved by running the CLI. Prints nothing for a repository that
# names no deploy (the monorepo itself), which callers read as "leave the checkout's own".
#
# Usage: deploy_id_from_repo [owner/repo]
deploy_id_from_repo() {
    local name="${1:-$ENGINE_SRC_REPO}"
    name="${name##*/}"
    name="${name#engine-test-}"
    name="${name#engine-}"
    name="${name%-private}"

    [ -n "$name" ] && [ "$name" != "engine" ] && printf 'dd-%s' "$name"
}

# Installs the node's dependencies from the deploy's own package manifest and links the checkout's
# CLI globally. Every later bare `underpost` command must execute this checkout, never a package
# left behind by an older image or host preparation.
#
# A deploy id owns its dependency set the same way it owns the rest of its configuration, and
# `engine-private/conf/<deploy-id>/package.json` is where that set lives. The checkout's own
# manifest is not it: a product tree declares only what it publishes, so installing against it
# prunes packages the CLI imports — and the CLI is what pulls and repairs the checkout, so the
# node loses the ability to fix itself. A deploy with no manifest of its own installs the
# checkout's, which is the previous behaviour.
#
# Usage: install_deploy_dependencies <engine-root> [deploy-id]
install_deploy_dependencies() {
    local engine_root="${1:-/home/dd/engine}"
    local deploy_id="$2"
    local manifest="engine-private/conf/$deploy_id/package.json"

    if [ -n "$deploy_id" ] && [ -f "$engine_root/$manifest" ]; then
        deploy_step "Install dependencies ($deploy_id)" \
        sudo -n -- /bin/bash -lc "cd $engine_root && cp -a ./$manifest ./package.json && npm install"
    else
        deploy_step "Install dependencies" \
        sudo -n -- /bin/bash -lc "cd $engine_root && npm install"
    fi

    deploy_step "Link underpost CLI" \
    sudo -n -- /bin/bash -lc \
    "cd $engine_root && npm link --force && test \"\$(readlink -f \"\$(command -v underpost)\")\" = \"\$(readlink -f ./bin/index.js)\""
}

# Brings a node to the state every deploy assumes: the engine source at HEAD, its dependencies
# installed, its CLI globally linked, and the host configuration loaded into the underpost root
# env store. `host load` is the one entry point for that store — see `underpost host`.
#
# Dependencies are installed before the pull, not only after: the pull runs through this
# checkout's own CLI, so a tree whose node_modules no longer match its manifest cannot repair
# itself — the entrypoint fails to import long before it can replace the source. They are
# installed again after it, because the pull resets the checkout to its remote and takes
# `package.json` with it.
prepare_host() {
    local engine_root="${1:-/home/dd/engine}"
    local src_repo="${2:-$ENGINE_SRC_REPO}"
    local src_private_repo="${3:-$ENGINE_SRC_PRIVATE_REPO}"
    local deploy_id="${4:-$(deploy_id_from_repo "$src_repo")}"
    
    install_deploy_dependencies "$engine_root" "$deploy_id"
    
    deploy_step "Pull repository" \
    sudo -n -- /bin/bash -lc \
    "cd $engine_root && node bin run pull $src_repo${src_private_repo:+ --repo-engine-private $src_private_repo}"
    
    install_deploy_dependencies "$engine_root" "$deploy_id"
    
    deploy_step "Load host config" \
    sudo -n -- /bin/bash -lc "cd $engine_root && node bin host load"
}

# Whether a tracked path carries uncommitted changes, as `1` or empty.
#
# An asset repository is committed only when it actually changed, so this stays outside
# `deploy_step`: its stdout is the value the caller branches on, and a step's logging would
# swallow it. The engine root is a parameter rather than an inherited global so a script that
# drives more than one checkout cannot read the wrong one.
#
# Usage: has_changes <path> [engine-root]
has_changes() {
    local path="$1"
    local engine_root="${2:-${ENGINE_ROOT:-/home/dd/engine}}"
    
    sudo -n -- /bin/bash -lc \
    "cd $engine_root && node bin cmt $path --has-changes" | tr -d '\n'
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
# Pair it with `--skip-pull-repo-base` on the `underpost start` that follows: this *is* the pull
# `start --build` performs, so leaving it on clones and installs the same tree twice.
#
# In-pod bootstrap, emitted as a `--cmd` payload (comma-separated). Three stages, in order:
# the deploy's own source replaces the image's engine and the global bin is repointed at it;
# that CLI then stamps `container-status`, which is why the stamp cannot come first — an image
# predating the state domain answers `unknown command 'state'`. The caller appends the start.
#
# The global npm prefix is handed to the container user before either npm call: the manifest's
# `install` hook installs global tooling and `npm link` publishes the CLI there, and both write
# a tree the image left owned by root.
#
# Usage: pod_bootstrap_cmd <deploy-id> [env] [owner/repo]
pod_bootstrap_cmd() {
    local deploy_id="$1"
    local env="${2:-production}"
    local repo="${3:-underpostnet/engine-test-${deploy_id#dd-}}"
    local name="${repo##*/}"
    
    printf '%s' "cd /home/dd, \
underpost clone ${repo}, \
mkdir -p /home/dd/engine, \
cp -a /home/dd/${name}/. /home/dd/engine/, \
rm -rf /home/dd/${name}, \
cd /home/dd/engine, \
sudo mkdir -p \$(npm prefix -g)/lib/node_modules \$(npm prefix -g)/bin, \
sudo chown -R \$(id -u):\$(id -g) \$(npm prefix -g)/lib/node_modules \$(npm prefix -g)/bin, \
npm install, \
npm link --force, \
test \"\$(readlink -f \"\$(command -v underpost)\")\" = \"\$(readlink -f ./bin/index.js)\", \
    underpost state set container-status ${deploy_id}-${env}-build-deployment"
}
