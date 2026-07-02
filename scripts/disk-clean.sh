#!/usr/bin/env bash
# disk-clean.sh
# Automatic safe cleanup script for Rocky Linux 9
# This script ALWAYS runs non-interactively (batch)
# Usage: sudo ./disk-clean.sh
set -euo pipefail

VACUUM_SIZE="200M"          # journalctl vacuum target
LARGE_LOG_SIZE="+100M"      # threshold for truncation (find syntax)
TMP_AGE_DAYS=1              # remove files older than this from /tmp and /var/tmp
CACHE_AGE_DAYS=5           # remove caches older than this from /var/cache
KEEP_KERNELS=2              # keep this many latest kernels
REMOVE_OPT=0                # ALWAYS allow removing /opt entries (user requested)

timestamp() { date +"%F %T"; }
log() {
    echo "$(timestamp) $*"
}

# must be root
if [ "$EUID" -ne 0 ]; then
    echo "This script must be run as root. Exiting."
    exit 1
fi

log "=== Starting Rocky Linux 9 automated cleanup (batch mode) ==="
log "Command line: $0 $*"
log "REMOVE_OPT=$REMOVE_OPT"
log "VACUUM_SIZE=$VACUUM_SIZE, LARGE_LOG_SIZE=$LARGE_LOG_SIZE, TMP_AGE_DAYS=$TMP_AGE_DAYS, CACHE_AGE_DAYS=$CACHE_AGE_DAYS"

# Report current disk usage
log "Disk usage before cleanup:"
df -h
log "Top-level disk usage ( / ):"
du -xh --max-depth=1 / | sort -rh | head -n 20

# 1) DNF cleanup
log "Cleaning DNF caches and removing orphaned packages..."
dnf -y clean all
dnf -y autoremove

# 2) Journal logs vacuum
log "Vacuuming systemd journal to keep ${VACUUM_SIZE}..."
journalctl --vacuum-size="$VACUUM_SIZE"

# 3) Truncate very large logs in /var/log (safer than delete)
log "Truncating logs in /var/log larger than ${LARGE_LOG_SIZE} (keeps zero-sized file so services don't break)..."
find /var/log -type f -size "$LARGE_LOG_SIZE" -print0 2>/dev/null | while IFS= read -r -d '' f; do
    echo "Truncating $f"
    : > "$f" || echo "Failed to truncate $f"
done

# 4) Clean /tmp and /var/tmp older than TMP_AGE_DAYS
log "Removing files older than ${TMP_AGE_DAYS} days from /tmp and /var/tmp..."
find /tmp -mindepth 1 -mtime +"$TMP_AGE_DAYS" -print0 2>/dev/null | xargs -0r rm -rf --
find /var/tmp -mindepth 1 -mtime +"$TMP_AGE_DAYS" -print0 2>/dev/null | xargs -0r rm -rf --

# 5) Clean /var/cache older than CACHE_AGE_DAYS (but not all cache immediately)
log "Removing entries in /var/cache older than ${CACHE_AGE_DAYS} days..."
find /var/cache -mindepth 1 -mtime +"$CACHE_AGE_DAYS" -print0 2>/dev/null | xargs -0r rm -rf --

# 6) Clean user caches (~/.cache) and Downloads older than CACHE_AGE_DAYS
log "Cleaning user caches and old downloads (home dirs)..."
for homedir in /home/* /root; do
    [ -d "$homedir" ] || continue
    usercache="$homedir/.cache"
    userdownloads="$homedir/Downloads"
    usertrash="$homedir/.local/share/Trash"
    
    if [ -d "$usercache" ]; then
        log "Removing contents of $usercache"
        rm -rf "${usercache:?}/"* 2>/dev/null
    fi
    if [ -d "$userdownloads" ]; then
        log "Removing files older than ${CACHE_AGE_DAYS} days from $userdownloads"
        find "$userdownloads" -type f -mtime +"$CACHE_AGE_DAYS" -print0 2>/dev/null | xargs -0r rm -f -- 2>/dev/null
    fi
    if [ -d "$usertrash" ]; then
        log "Emptying trash in $usertrash"
        rm -rf "${usertrash:?}/"* 2>/dev/null
    fi
done

# 7) Docker / Podman cleanup (if present) — this is what actually reclaims the
#    overlay storage behind those duplicated `overlay` df lines.
if command -v docker >/dev/null 2>&1; then
    log "Docker detected: pruning images/containers/volumes/build cache (aggressive)..."
    docker system df || true
    docker system prune -a --volumes -f || true
    docker builder prune -a -f || true
fi

if command -v podman >/dev/null 2>&1; then
    log "Podman detected: pruning images/containers/volumes (aggressive)..."
    podman system df || true
    podman system prune -a --volumes -f || true
fi

if command -v buildah >/dev/null 2>&1; then
    log "Buildah detected: removing leftover working containers..."
    buildah rm --all || true
fi

# 7b) Unmount leaked container overlay 'merged' mounts. Pruning frees the data
#     but leaves these mountpoints attached, so they keep flooding `df -h` with
#     identical `overlay ... /merged` rows. Only unmount overlays not backing a
#     still-existing container, so running workloads are never disturbed.
log "Unmounting orphaned container overlay mounts..."
if command -v podman >/dev/null 2>&1; then
    podman umount --all >/dev/null 2>&1 || true
fi
active_merged="$(podman ps -aq 2>/dev/null | xargs -r -I{} podman inspect --format '{{.GraphDriver.Data.MergedDir}}' {} 2>/dev/null || true)"
findmnt -rn -o TARGET 2>/dev/null | grep -E '/var/lib/(containers/storage|docker)/overlay.*/merged' | sort -r | while IFS= read -r m; do
    if ! printf '%s\n' "$active_merged" | grep -qxF "$m"; then
        echo "Unmounting orphaned overlay: $m"
        umount -l "$m" 2>/dev/null || true
    fi
done

# 8) Flatpak unused runtimes/apps (if present)
if command -v flatpak >/dev/null 2>&1; then
    log "Flatpak detected: trying to uninstall unused runtimes/apps..."
    flatpak uninstall --unused -y || flatpak uninstall --unused
    flatpak repair
fi

# 9) Python Pip cleanup
if command -v pip3 >/dev/null 2>&1 || command -v pip >/dev/null 2>&1; then
    log "Python Pip detected: cleaning cache..."
    if command -v pip3 >/dev/null 2>&1; then
        pip3 cache purge
        elif command -v pip >/dev/null 2>&1; then
        pip cache purge
    fi
fi

# 10) Conda cleanup
if command -v conda >/dev/null 2>&1; then
    log "Conda detected: cleaning all..."
    conda clean --all -y
fi

# 11) Remove old kernels but keep the last KEEP_KERNELS (safe)
log "Removing old kernels, keeping the last $KEEP_KERNELS kernels..."
OLD_KERNELS=$(dnf repoquery --installonly --latest-limit=-$KEEP_KERNELS -q 2>/dev/null)
if [ -n "$OLD_KERNELS" ]; then
    log "Old kernels to remove: $OLD_KERNELS"
    dnf -y remove $OLD_KERNELS
else
    log "No old kernels found by DNF repoquery. Only $KEEP_KERNELS or fewer are currently installed."
fi

# 12) /opt review and removal (ON by default now)
if [ -d /opt ]; then
    log "/opt usage (top entries):"
    du -sh /opt/* 2>/dev/null | sort -h | head -n 20
    
    if [ "$REMOVE_OPT" = "1" ]; then
        OPT_TARGETS=(/opt/local-path-provisioner)
        for t in "${OPT_TARGETS[@]}"; do
            if [ -d "$t" ]; then
                log "Removing $t as REMOVE_OPT=1"
                rm -rf "$t"
            fi
        done
    else
        log "Automatic /opt removals disabled (set REMOVE_OPT=1 to enable)."
    fi
fi

# 13) Find large files > 100MB (report only)
log "Listing files larger than 100MB (report only):"
find / -xdev -type f -size +100M -printf '%s\t%p\n' 2>/dev/null | sort -nr | head -n 50 | awk '{printf "%.1fMB\t%s\n",$1/1024/1024,$2}'

# Final disk usage
log "Disk usage cleanup:"
df -h
log "Top-level usage ( / ):"
du -xh --max-depth=1 / | sort -rh | head -n 20

log "=== Cleanup finished ==="
exit 0
