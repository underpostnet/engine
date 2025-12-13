#!/usr/bin/env bash
# packer-setup.sh
# RHEL/CentOS/Rocky helper to prepare a host for building both amd64 and aarch64 Packer images.
# Installs packer (repo fallback), libvirt/qemu tooling, NBD/filesystem tools, UEFI firmware for x86_64 and aarch64,
# registers qemu-user binfmt for cross-chroot use and compiles qemu-system-aarch64 when repo packages are missing.
# Usage: sudo ./packer-setup.sh

set -euo pipefail

print(){ printf "[setup] %s\n" "$*"; }
err(){ printf "[setup] ERROR: %s\n" "$*" >&2; }

if [[ $(id -u) -ne 0 ]]; then
  err "This script requires root. Run with sudo."; exit 3
fi

# Detect host arch
HOST_RAW_ARCH=$(uname -m)
case "$HOST_RAW_ARCH" in
  x86_64) HOST_ARCH=amd64;;
  aarch64) HOST_ARCH=arm64;;
  *) HOST_ARCH="$HOST_RAW_ARCH";;
esac
print "Host architecture: $HOST_RAW_ARCH -> normalized: $HOST_ARCH"

# Ensure RHEL-family
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  ID_LC=${ID,,}
  ID_LIKE=${ID_LIKE,,}
else
  ID_LC=unknown; ID_LIKE=unknown
fi
if [[ $ID_LC != "rocky" && $ID_LC != "rhel" && $ID_LC != "centos" && $ID_LIKE != *"rhel"* ]]; then
  err "This script targets RHEL/CentOS/Rocky family. Detected: $ID_LC (like: $ID_LIKE). Exiting."; exit 4
fi
print "Distro detected: $PRETTY_NAME"

# Enable helpful repos and install helpers
print "Installing dnf-plugins-core and enabling CRB/PowerTools (if available)"
set +e
dnf install -y dnf-plugins-core >/dev/null 2>&1 || true
dnf config-manager --set-enabled crb >/dev/null 2>&1 || true
dnf config-manager --set-enabled powertools >/dev/null 2>&1 || true
# EPEL
if ! rpm -q epel-release >/dev/null 2>&1; then
  print "Installing epel-release"
  dnf install -y epel-release || true
fi
set -e

# 1) Try to install packer from distro repos, otherwise add HashiCorp repo and install
print "Attempting to install packer from distro repos"
if dnf install -y packer >/dev/null 2>&1; then
  print "Packer installed from distro repo"
else
  print "packer not available in distro repos or install failed. Adding HashiCorp repo and retrying."
  # HashiCorp RPM repo for RHEL/CentOS/Rocky family (works for EL8/EL9)
  if ! rpm -q hashicorp >/dev/null 2>&1; then
    cat >/etc/yum.repos.d/hashicorp.repo <<'EOF'
[hashicorp]
name=HashiCorp Stable - $basearch
baseurl=https://rpm.releases.hashicorp.com/RHEL/$releasever/$basearch/stable
enabled=1
gpgcheck=1
gpgkey=https://rpm.releases.hashicorp.com/gpg
EOF
  fi
  if dnf makecache >/dev/null 2>&1 && dnf install -y packer >/dev/null 2>&1; then
    print "Packer installed from HashiCorp repo"
  else
    err "Packer install from repo failed. You can install packer manually from HashiCorp releases if needed.";
  fi
fi

# 2) Install libvirt, qemu tooling and enable libvirtd
print "Installing libvirt, qemu and related tooling (best-effort)"
LIBVIRT_PKGS=(libvirt libvirt-daemon qemu-kvm qemu-img virt-install bridge-utils)
# attempt to include qemu-system-aarch64 and qemu-system-x86_64 if available
LIBVIRT_PKGS+=(qemu-system-aarch64 qemu-system-x86_64 qemu-system-arm)

# Some packages may not exist exactly with those names; install best-effort
for pkg in "${LIBVIRT_PKGS[@]}"; do
  dnf install -y "$pkg" >/dev/null 2>&1 || print "Package $pkg not available via dnf (skipping)"
done

print "Enabling and starting libvirtd"
systemctl enable --now libvirtd || err "Failed to enable/start libvirtd"
systemctl status libvirtd --no-pager || true

# 3) Install NBD and filesystem tools required for MAAS image creation
print "Installing NBD and filesystem tooling: libnbd, nbdkit, e2fsprogs, kmod packages (best-effort)"
NBDS=(libnbd nbdkit e2fsprogs kmod-kvdo kmod)
for pkg in "${NBDS[@]}"; do
  dnf install -y "$pkg" >/dev/null 2>&1 || print "Package $pkg not available via dnf (skipping)"
done

# 4) Install UEFI firmware for x86_64 and ARM64
print "Installing edk2 / OVMF UEFI firmware packages (x86_64 and aarch64)"
UEFI_PKGS=(edk2-ovmf edk2-aarch64 edk2-ovmf-aarch64)
for pkg in "${UEFI_PKGS[@]}"; do
  dnf install -y "$pkg" >/dev/null 2>&1 || print "UEFI package $pkg not available (skipping)"
done

# 5) Ensure qemu-user-static for chroot/debootstrap cross-execution and register binfmt via podman
print "Installing qemu-user-static and registering binfmt handlers via podman"
if ! rpm -q qemu-user-static >/dev/null 2>&1; then
  dnf install -y qemu-user-static >/dev/null 2>&1 || print "qemu-user-static not in repos (will extract from container)"
fi

if command -v podman >/dev/null 2>&1; then
  # Register binfmt handlers
  podman run --rm --privileged multiarch/qemu-user-static --reset -p yes || print "podman run for qemu-user-static failed (skip)"

  # Extract static binaries to /usr/bin if not already present from RPM
  if ! command -v qemu-aarch64-static >/dev/null 2>&1; then
    print "Extracting qemu static binaries from multiarch/qemu-user-static container"
    CONTAINER_ID=$(podman create multiarch/qemu-user-static:latest)

    # Extract the binaries we need
    for arch in aarch64 arm armeb; do
      if podman cp "$CONTAINER_ID:/usr/bin/qemu-${arch}-static" "/usr/bin/qemu-${arch}-static" 2>/dev/null; then
        chmod +x "/usr/bin/qemu-${arch}-static"
        print "Installed qemu-${arch}-static to /usr/bin/"
      fi
    done

    podman rm "$CONTAINER_ID" >/dev/null 2>&1 || true
  fi
else
  print "podman not available. Install podman to register binfmt for container/chroot convenience."
fi

# 6) Check qemu-system-aarch64 availability and 'virt' machine support; offer compile if missing
check_qemu_system_aarch64(){
  # Explicitly check /usr/local/bin first (where compiled QEMU installs)
  if [ -x /usr/local/bin/qemu-system-aarch64 ]; then
    QBIN=/usr/local/bin/qemu-system-aarch64
  elif command -v qemu-system-aarch64 >/dev/null 2>&1; then
    QBIN=$(command -v qemu-system-aarch64)
  else
    return 1
  fi

  print "qemu-system-aarch64 found at $QBIN"
  if $QBIN -machine help 2>/dev/null | grep -q '\bvirt\b'; then
    print "qemu-system-aarch64 supports 'virt' -> good for full-system ARM emulation"
    return 0
  else
    err "qemu-system-aarch64 present but 'virt' not listed -> may be missing aarch64 softmmu"
    return 2
  fi
}

if check_qemu_system_aarch64; then
  print "qemu-system-aarch64 is ready"
else
  rc=$?
  if [[ $rc -eq 1 ]]; then
    print "qemu-system-aarch64 not found in installed packages"
  else
    print "qemu-system-aarch64 present but incomplete"
  fi

  # Try install from repo explicitly
  print "Attempting to install qemu-system-aarch64 via dnf (best-effort)"
  if dnf install -y qemu-system-aarch64 >/dev/null 2>&1; then
    print "Installed qemu-system-aarch64 from repo"
  else
    print "qemu-system-aarch64 not available in enabled repos."
  fi

  if check_qemu_system_aarch64; then
    print "qemu-system-aarch64 now available after package install"
  else
    print "Compiling QEMU with aarch64-softmmu target. Installing build deps..."
    dnf groupinstall -y 'Development Tools' || true
    dnf install -y git libaio-devel libgcrypt-devel libfdt-devel glib2-devel zlib-devel pixman-devel libseccomp-devel libusb1-devel openssl-devel bison flex python3 python3-pip ninja-build || true

    # Install required Python packages for QEMU build
    print "Installing Python dependencies for QEMU build"
    python3 -m pip install --upgrade pip || true
    python3 -m pip install tomli meson || true

    TMPDIR=$(mktemp -d)
    print "Cloning QEMU source to $TMPDIR/qemu"
    git clone --depth 1 https://gitlab.com/qemu-project/qemu.git "$TMPDIR/qemu"
    cd "$TMPDIR/qemu"

    print "Configuring QEMU build"
    if ./configure --target-list=aarch64-softmmu --enable-virtfs; then
      print "Configure successful, building QEMU..."
      if make -j"$(nproc)"; then
        print "Build successful, installing..."
        make install || err "QEMU install failed"
        # Update PATH to include /usr/local/bin where QEMU was installed
        export PATH="/usr/local/bin:$PATH"
        hash -r || true
      else
        err "QEMU build (make) failed"
      fi
    else
      err "QEMU configure failed. Check dependencies."
    fi

    if check_qemu_system_aarch64; then
      print "Successfully compiled and installed qemu-system-aarch64"
    else
      err "Compiled QEMU but qemu-system-aarch64 still missing or lacks 'virt'. Check logs in $TMPDIR/qemu"
    fi

    cd /
    rm -rf "$TMPDIR" || true
    print "Removed build directory $TMPDIR"
  fi
fi

# 7) Summary and verification commands for the user
print "\n=== Summary / Quick verification commands ==="
if command -v packer >/dev/null 2>&1; then print "packer: $(command -v packer)"; else print "packer: NOT INSTALLED"; fi
# Check /usr/local/bin explicitly for compiled qemu
if [ -x /usr/local/bin/qemu-system-aarch64 ]; then
  print "qemu-system-aarch64: /usr/local/bin/qemu-system-aarch64"
elif command -v qemu-system-aarch64 >/dev/null 2>&1; then
  print "qemu-system-aarch64: $(command -v qemu-system-aarch64)"
else
  print "qemu-system-aarch64: NOT INSTALLED"
fi
if command -v qemu-aarch64-static >/dev/null 2>&1; then print "qemu-aarch64-static: $(command -v qemu-aarch64-static)"; else print "qemu-aarch64-static: NOT INSTALLED"; fi
print "libvirtd status:"
systemctl status libvirtd --no-pager || true

cat <<'EOF'

=== Example Packer qemu builder snippets ===

# aarch64 on x86_64 host (use qemu-system-aarch64 with TCG):
{
  "type": "qemu",
  "qemu_binary": "/usr/local/bin/qemu-system-aarch64",
  "accelerator": "tcg",
  "format": "raw",
  "disk_size": "8192",
  "headless": true,
  "qemuargs": [
    ["-machine", "virt,highmem=on"],
    ["-cpu", "cortex-a57"],
    ["-bios", "/usr/share/edk2-aarch64/QEMU_EFI.fd"],
    ["-device", "virtio-net-device,netdev=net0"],
    ["-netdev", "user,id=net0,hostfwd=tcp::2222-:22"]
  ]
}

# x86_64 on arm64 host (use kvm when available):
{
  "type": "qemu",
  "qemu_binary": "/usr/bin/qemu-system-x86_64",
  "accelerator": "kvm",
  "format": "raw",
  "disk_size": "8192",
  "headless": true,
  "qemuargs": [
    ["-machine", "pc,q35"],
    ["-cpu", "host"],
    ["-bios", "/usr/share/ovmf/OVMF_CODE.fd"],
    ["-device", "virtio-net-pci,netdev=net0"],
    ["-netdev", "user,id=net0,hostfwd=tcp::2223-:22"]
  ]
}

EOF

print "Done. If any package failed to install due to repo availability, consider enabling CRB/powertools, adding a trusted COPR or rebuild repo for qemu, or compiling QEMU locally as the script offered."

exit 0
