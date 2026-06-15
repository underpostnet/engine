#!/usr/bin/env bash
set -euo pipefail

echo "1) Ensure dnf-plugins-core is installed"
dnf -y install dnf-plugins-core

echo "2) Enable CRB"
dnf config-manager --set-enabled crb || true

echo "3) Install EPEL"
dnf -y install epel-release \
|| dnf -y install https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm

echo "4) Install RPM Fusion repositories"
dnf -y install \
https://download1.rpmfusion.org/free/el/rpmfusion-free-release-9.noarch.rpm \
https://download1.rpmfusion.org/nonfree/el/rpmfusion-nonfree-release-9.noarch.rpm


echo "5) Install libwebp-tools (for ffmpeg to support WebP)"
dnf -y install libwebp-tools

echo "6) Refresh metadata"
dnf clean all
dnf makecache --refresh

echo "7) Install ffmpeg"
dnf -y install ffmpeg ffmpeg-devel --allowerasing

echo
echo "Done."
ffmpeg -version | head -n 1