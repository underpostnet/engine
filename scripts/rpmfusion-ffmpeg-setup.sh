#!/usr/bin/env bash
set -euo pipefail

# Purpose: enable required repos (CRB, EPEL, RPM Fusion) and attempt to install ffmpeg on Rocky/Alma/RHEL-9 compatible systems.

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "This script must be run as root or with sudo. Exiting."
  exit 1
fi

echo "1) Ensure dnf-plugins-core is available (for config-manager)"
dnf -y install dnf-plugins-core || true

echo "2) Enable CodeReady / CRB (needed for some deps, e.g. ladspa)"
# On RHEL you'd use subscription-manager; on CentOS/Rocky/Alma use config-manager
dnf config-manager --set-enabled crb || true

echo "3) Install EPEL release (required by some ffmpeg deps)"
dnf -y install https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm || true

echo "4) Add RPM Fusion (free + nonfree) repositories"
# Using mirrors.rpmfusion.org recommended links
dnf -y install https://mirrors.rpmfusion.org/free/el/rpmfusion-free-release-9.noarch.rpm \
               https://mirrors.rpmfusion.org/nonfree/el/rpmfusion-nonfree-release-9.noarch.rpm || true

echo "5) Refresh metadata and update system"
dnf -y makecache
# Optional: update system packages (comment out if you don't want a full update)
# dnf -y update

echo "6) Try to install audio helper packages that sometimes block ffmpeg (ladspa, rubberband)"
# These may be provided by CRB/EPEL or other compatible repos
dnf -y install ladspa || echo "ladspa not available from enabled repos (will try later)"
dnf -y install rubberband || echo "rubberband not available from enabled repos (will try later)"

echo "7) Try installing ffmpeg (several fallbacks tried)"
if dnf -y install ffmpeg ffmpeg-devel --allowerasing; then
  echo "ffmpeg installed successfully (used --allowerasing)."
elif dnf -y install ffmpeg ffmpeg-devel --nobest; then
  echo "ffmpeg installed successfully (used --nobest)."
elif dnf -y install ffmpeg ffmpeg-devel --skip-broken; then
  echo "ffmpeg installed (skip-broken). Some optional packages may have been skipped."
else
  echo "Automatic install failed."
  echo "Helpful troubleshooting steps:"
  echo " - Check which repo provides ladspa: dnf repoquery --whatprovides 'ladspa'"
  echo " - Check which package provides librubberband: dnf repoquery --whatprovides 'librubberband.so.2'"
  echo " - Try enabling CRB and EPEL (we already attempted that). If ladspa/rubberband are still missing you can fetch their EL9 rpm from a trusted mirror or build them."
  echo " - Example manual install (ONLY if you trust the source): sudo dnf install /path/to/ladspa-*.el9.rpm /path/to/rubberband-*.el9.rpm"
  echo " - After satisfying ladspa/rubberband, rerun: sudo dnf install ffmpeg ffmpeg-devel"
  exit 2
fi

echo "\nInstallation finished. Verify with: ffmpeg -version"
exit 0
