#!/usr/bin/env bash
# Script to Initialize VARS files for Packer builds
# Usage: sudo ./scripts/packer-setup.sh

set -euo pipefail

# Packer needs writable VARS files for UEFI boot
PACKER_DIR="$(dirname "$0")/../packer/images"

# Find all packer image directories and create VARS files
for image_dir in "$PACKER_DIR"/*; do
    if [ -d "$image_dir" ]; then
        image_name=$(basename "$image_dir")
        echo "Checking UEFI VARS files for $image_name..."

        # Create x86_64 VARS file if it doesn't exist
        if [ ! -f "$image_dir/x86_64_VARS.fd" ]; then
            for src in /usr/share/edk2/ovmf/OVMF_VARS.fd /usr/share/OVMF/OVMF_VARS.fd; do
                if [ -f "$src" ]; then
                    cp "$src" "$image_dir/x86_64_VARS.fd"
                    echo "Created $image_dir/x86_64_VARS.fd from $src"
                    break
                fi
            done
        fi

        # Create aarch64 VARS file if it doesn't exist
        if [ ! -f "$image_dir/aarch64_VARS.fd" ]; then
            for src in /usr/share/AAVMF/AAVMF_VARS.fd /usr/share/edk2/aarch64/AAVMF_VARS.fd /usr/share/edk2/aarch64/QEMU_VARS.fd; do
                if [ -f "$src" ]; then
                    cp "$src" "$image_dir/aarch64_VARS.fd"
                    echo "Created $image_dir/aarch64_VARS.fd from $src"
                    break
                fi
            done
        fi
    fi
done

echo "Packer and QEMU setup complete!"
