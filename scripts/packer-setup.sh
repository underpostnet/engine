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

# 3a) Install NBD and filesystem tools required for MAAS image creation
sudo dnf install -y libnbd nbdkit e2fsprogs kmod-kvdo kmod

# 4) Install UEFI firmware for x86_64 and ARM64
sudo dnf install -y edk2-ovmf edk2-aarch64

# 5) Create symlinks for qemu-system-* binaries (Rocky/RHEL uses qemu-kvm instead)
# Packer expects standard qemu-system-* names, but RHEL-based distros use qemu-kvm
if [ -f /usr/libexec/qemu-kvm ] && [ ! -f /usr/bin/qemu-system-x86_64 ]; then
    echo "Creating symlink: /usr/bin/qemu-system-x86_64 -> /usr/libexec/qemu-kvm"
    sudo ln -sf /usr/libexec/qemu-kvm /usr/bin/qemu-system-x86_64
fi

if [ -f /usr/libexec/qemu-kvm ] && [ ! -f /usr/bin/qemu-system-aarch64 ]; then
    echo "Creating symlink: /usr/bin/qemu-system-aarch64 -> /usr/libexec/qemu-kvm"
    sudo ln -sf /usr/libexec/qemu-kvm /usr/bin/qemu-system-aarch64
fi

# 6) Create symlinks for OVMF/AAVMF firmware files in expected locations
# Rocky/RHEL stores OVMF in /usr/share/edk2/ovmf, but Packer expects /usr/share/OVMF
if [ -f /usr/share/edk2/ovmf/OVMF_CODE.fd ] && [ ! -f /usr/share/OVMF/OVMF_CODE.fd ]; then
    echo "Creating symlink: /usr/share/OVMF/OVMF_CODE.fd -> /usr/share/edk2/ovmf/OVMF_CODE.fd"
    sudo ln -sf /usr/share/edk2/ovmf/OVMF_CODE.fd /usr/share/OVMF/OVMF_CODE.fd
fi

# Create AAVMF symlinks for ARM64 support
if [ -d /usr/share/edk2/aarch64 ] && [ ! -d /usr/share/AAVMF ]; then
    echo "Creating symlink: /usr/share/AAVMF -> /usr/share/edk2/aarch64"
    sudo ln -sf /usr/share/edk2/aarch64 /usr/share/AAVMF
fi
