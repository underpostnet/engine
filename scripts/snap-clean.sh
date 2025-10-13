#!/usr/bin/env bash
# cleanup-snap.sh
# Remove all disabled snap revisions to free up disk space.

set -euo pipefail

# Ensure we’re running as root
if [[ $EUID -ne 0 ]]; then
    echo "Please run this script with sudo or as root."
    exit 1
fi

echo "Gathering list of snaps with disabled revisions..."
snap list --all \
| awk '/disabled/ {print $1, $3}' \
| while read -r pkg rev; do
    echo "  -> Removing $pkg (revision $rev)..."
    snap remove "$pkg" --revision="$rev"
done

echo "Cleanup complete."
echo
echo "Tip: Limit how many revisions Snap retains by setting:"
echo "  sudo snap set system refresh.retain=2"
echo "Then apply with:"
echo "  sudo snap refresh"
