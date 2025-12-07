#!/usr/bin/env bash
# disk-clean.sh
# Safe, interactive disk cleanup for Rocky/RHEL-like systems.

set -u # Detect undefined variables (removed -e to handle errors manually where it matters)
IFS=$'\n\t'

AUTO_YES=0
LXD_FLAG=0
VACUUM_SIZE="500M"
TMP_AGE_DAYS=7
LOG_GZ_AGE_DAYS=90
ROOT_CACHE_AGE_DAYS=30
AGGRESSIVE=0

# Colors for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
  cat <<EOF
Usage: $0 [--yes] [--aggressive] [--lxd] [--vacuum-size SIZE]

Options:
  --yes            run destructive actions without asking
  --aggressive     clean user caches (npm, pip, conda, root .cache)
  --lxd            enable lxc image prune
  --vacuum-size X  set journalctl --vacuum-size (default: $VACUUM_SIZE)
  -h, --help       show this help
EOF
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) AUTO_YES=1; shift;;
    --aggressive) AGGRESSIVE=1; shift;;
    --lxd) LXD_FLAG=1; shift;;
    --vacuum-size) VACUUM_SIZE="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1"; usage; exit 2;;
  esac
done

log() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

run() {
  # Runs the command safely
  echo "+ $*"
  # Execute the command passed as arguments, preserving quotes/spaces
  "$@" || {
      warn "Command failed (non-critical): $*"
      return 0
  }
}

confirm() {
  if [[ $AUTO_YES -eq 1 ]]; then
    return 0
  fi
  # Use </dev/tty to ensure we read from user even inside a pipe loop
  read -r -p "$1 [y/N]: " ans </dev/tty
  case "$ans" in
    [Yy]|[Yy][Ee][Ss]) return 0;;
    *) return 1;;
  esac
}

require_root() {
  if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root."
    exit 1
  fi
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

require_root

log "Starting cleanup (aggressive=$AGGRESSIVE)"

# 1) Package Manager (DNF)
if command_exists dnf; then
  log "Cleaning DNF caches"
  run dnf clean all
  run rm -rf /var/cache/dnf
  if confirm "Run 'dnf autoremove -y' for orphan packages?"; then
    run dnf autoremove -y
  else
    log "Skipped dnf autoremove"
  fi
else
  warn "dnf not found"
fi

# 2) Journal logs
if command_exists journalctl; then
  log "Current Journal disk usage:"
  journalctl --disk-usage || true

  if confirm "Run 'journalctl --vacuum-size=$VACUUM_SIZE'?"; then
    run journalctl --vacuum-size="$VACUUM_SIZE"
  else
    log "Skipped journal vacuum"
  fi
fi

# 3) /var/tmp
if [[ -d /var/tmp ]]; then
  if confirm "Delete files in /var/tmp older than $TMP_AGE_DAYS days?"; then
    find /var/tmp -mindepth 1 -mtime +$TMP_AGE_DAYS -delete
  fi
fi

# 4) Old compressed logs
if [[ -d /var/log ]]; then
  if confirm "Delete compressed logs (.gz) in /var/log older than $LOG_GZ_AGE_DAYS days?"; then
    find /var/log -type f -name '*.gz' -mtime +$LOG_GZ_AGE_DAYS -delete
  fi
fi

# 5) Snap: disabled revisions
if command_exists snap; then
  log "Searching for old Snap revisions"
  # Save to variable only if successful
  disabled_snaps=$(snap list --all 2>/dev/null | awk '/disabled/ {print $1, $3}') || disabled_snaps=""

  if [[ -n "$disabled_snaps" ]]; then
    echo "Disabled snap revisions found:"
    echo "$disabled_snaps"
    if confirm "Remove all disabled revisions?"; then
      while read -r pkg rev; do
        [[ -z "$pkg" ]] && continue
        log "Removing snap $pkg (revision $rev)"
        run snap remove "$pkg" --revision="$rev"
      done <<< "$disabled_snaps"

      log "Setting snap retention to 2"
      run snap set system refresh.retain=2
    fi
  else
    log "No disabled snap revisions found."
  fi
fi

# 6) LXD
if command_exists lxc; then
  if [[ $LXD_FLAG -eq 1 ]]; then
    if confirm "Run 'lxc image prune'?"; then
      run lxc image prune -f
    fi
  else
     log "Skipping LXD (use --lxd to enable)"
  fi
fi

# 7) Docker / Containerd
if command_exists docker; then
  if confirm "Run 'docker system prune -a --volumes'? (WARNING: Removes stopped containers)"; then
    run docker system prune -a --volumes -f
  fi
elif command_exists crictl; then
  if confirm "Attempt to remove images with crictl?"; then
    run crictl rmi --prune
  fi
fi

# 8) Large Files (>1G) - Completely rewritten logic
log "Scanning for files larger than 1G (this may take a while)..."

# Use while loop with find -print0 to handle filenames with spaces safely
FOUND_LARGE=0
# Note: find does not modify filesystem here, safe to run always
while IFS= read -r -d '' file; do
  FOUND_LARGE=1
  # Get readable size to show user
  filesize=$(du -h "$file" | cut -f1)

  echo -e "Large file found: ${YELLOW}$file${NC} (Size: $filesize)"

  if confirm "  -> Delete this file?"; then
    run rm -vf "$file"
  else
    log "Skipped: $file"
  fi
done < <(find / -xdev -type f -size +1G -print0 2>/dev/null)

if [[ $FOUND_LARGE -eq 0 ]]; then
  log "No files >1G found in /"
fi

# 9) Aggressive Caches
if [[ $AGGRESSIVE -eq 1 ]]; then
  log "Aggressive mode enabled"
  command_exists npm && confirm "Run 'npm cache clean --force'?" && run npm cache clean --force
  command_exists pip && confirm "Run 'pip cache purge'?" && run pip cache purge
  command_exists conda && confirm "Run 'conda clean --all -y'?" && run conda clean --all -y

  if [[ -d /root/.cache ]]; then
    if confirm "Delete /root/.cache (> $ROOT_CACHE_AGE_DAYS days)?"; then
       find /root/.cache -type f -mtime +$ROOT_CACHE_AGE_DAYS -delete
    fi
  fi
fi

# 10) Final
log "Final disk usage:"
df -h --total | grep total || df -h /

log "Cleanup finished."
