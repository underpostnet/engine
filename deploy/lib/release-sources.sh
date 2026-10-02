# The Cyberia product repositories at the revisions the deployment lock pins. Sourced after host.sh;
# the checkouts land under $ENGINE_ROOT, where `bin/cyberia` reads them.

# `<name> <repository> <profile>` lines; with --locked, the repositories the lock pins, each with
# its revision as a fourth field. On a CLI failure, its output goes to stderr.
#
# Usage: release_repositories [--locked]
release_repositories() {
    local output
    if ! output="$(sudo -n -- /bin/bash -lc "cd $ENGINE_ROOT && node bin/cyberia release list ${1:-}")"; then
        printf '%s\n' "$output" >&2
        return 1
    fi
    grep -E '^[a-z0-9-]+ [^ ]+ [a-z-]+( [0-9a-f]{40})?$' <<<"$output"
}

# Syncs every product repository from a source channel at its branch tip, the deployment with its
# lock included, then pins each locked one at its revision. Sets RELEASE_REPOSITORIES to the
# `<name> <repository> <profile>` lines.
#
# Usage: sync_release_sources <public|private>
sync_release_sources() {
    local repositories locked entry name repository profile revision
    repositories="$(release_repositories)"
    mapfile -t RELEASE_REPOSITORIES <<<"$repositories"
    for entry in "${RELEASE_REPOSITORIES[@]}"; do
        read -r name repository profile <<<"$entry"
        sync_checkout "$(source_repository "$repository" "$1")" "$ENGINE_ROOT" "$name"
    done
    locked="$(release_repositories --locked)"
    while read -r name repository profile revision; do
        pin_checkout "$name" "$revision"
    done <<<"$locked"
}
