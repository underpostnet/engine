# Shared deploy constants for deploy/<deploy-id>/*.sh. Sourced by lib/host.sh and lib/state.sh,
# never executed directly.
#
# One home for every value more than one deploy script needs, so renaming a node or moving a
# checkout is a single edit instead of a sweep. Every name here resolves from the environment
# first, which is how a run is retargeted without editing a script.

# The engine checkout every step runs in. The library helpers take it as an argument and fall
# back to this, so a caller driving a second checkout passes that one explicitly.
ENGINE_ROOT="${ENGINE_ROOT:-/home/dd/engine}"

# The fleet's nodes, named once. A deploy pins its own placement in TARGET_NODE, declared beside
# its deploy id and left empty where the CLI resolves the node itself.
#
# `node bin deploy` publishes that flag as `--node` while `run sync` and `run instance` publish
# it as `--node-name`. Both are public option names, so a script holds the value once and spells
# the flag the way the command it drives publishes it.
HOST_NODE="${HOST_NODE:-localhost.localdomain}"
WORKER_NODE="${WORKER_NODE:-hp-envy-iso-ram-rocky9}"

# The node carrying the shared host-network ingress.
INGRESS_NODE="${INGRESS_NODE:-$HOST_NODE}"

# The key the sync and instance steps ship volume data with.
DEPLOY_SSH_KEY_PATH="${DEPLOY_SSH_KEY_PATH:-/home/dd/tmp/897as9dxhaskd9}"

# The published image the WordPress deploys run. Pinned rather than derived from the checkout's
# version: a tag is only deployable once the release workflow has published it.
DEPLOY_WP_IMAGE="${DEPLOY_WP_IMAGE:-underpost/wp:v3.3.73}"
