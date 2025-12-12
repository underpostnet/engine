#!/usr/bin/env bash
# Script to install Packer and libvirt/qemu tooling on Rocky Linux.
# Usage: sudo ./scripts/packer-setup.sh

set -euo pipefail


# 1) Replace/add the correct HashiCorp repo for RHEL/Rocky
sudo dnf config-manager --add-repo https://rpm.releases.hashicorp.com/RHEL/hashicorp.repo

# Refresh dnf metadata
sudo dnf clean all
sudo dnf makecache --refresh

# 2) Try to install packer from the repo
sudo dnf install -y packer || echo "packer install from repo failed, try manual install (see below)"

# 3) Install libvirt/qemu tooling then start the service
sudo dnf install -y libvirt libvirt-daemon qemu-kvm qemu-img virt-install bridge-utils
sudo systemctl enable --now libvirtd
sudo systemctl status libvirtd --no-pager
