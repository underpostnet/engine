#!/usr/bin/env bash
set -euo pipefail

# Script to install a recommended base package set on Rocky Linux.
# Usage examples:
#   sudo ./scripts/rocky-setup.sh                # install base packages
#   sudo ./scripts/rocky-setup.sh --install-dev  # install base packages + Development Tools
#   INSTALL_DEV=1 sudo ./scripts/rocky-setup.sh  # same as --install-dev

PACKAGES=(
  dnf-plugins-core
  epel-release
  vim
  nano
  bash-completion
  curl
  wget
  unzip
  zip
  tar
  gzip
  bzip2
  rsync
  git
  python3
  python3-pip
  openssh-server
  openssh-clients
  firewalld
  chrony
  NetworkManager
  which
  net-tools
  bind-utils
  tcpdump
)

# Defaults
INSTALL_DEV=0

# Parse CLI args (simple)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dev|--yes-dev)
      INSTALL_DEV=1
      shift
      ;;
    --no-install-dev)
      INSTALL_DEV=0
      shift
      ;;
    --help|-h)
      cat <<EOF
Usage: sudo ./scripts/rocky-setup.sh [options]

Options:
  --install-dev, --yes-dev    Install Development Tools group (gcc, make, etc.)
  --no-install-dev            Explicitly skip Development Tools
  --help, -h                  Show this help and exit

You can also set the environment variable INSTALL_DEV=1 to enable development tools.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Environment variable overrides (if set)
if [[ "${INSTALL_DEV:-}" =~ ^(1|y|yes|true)$ ]]; then
  INSTALL_DEV=1
fi

# Refresh cache and install basic packages
echo "[+] Refreshing DNF cache..."
dnf makecache --refresh -y

echo "[+] Installing dnf-plugins-core and epel-release (if not present)..."
dnf install dnf-plugins-core epel-release -y

echo "[+] Refreshing DNF cache after enabling repositories..."
dnf makecache --refresh -y

echo "[+] Installing base packages: ${#PACKAGES[@]} packages"
dnf install "${PACKAGES[@]}" -y

# Decide on Development Tools
if [[ $INSTALL_DEV -eq 1 ]]; then
  echo "[+] Installing Development Tools..."
  dnf groupinstall "Development Tools" -y
else
  echo "[+] Skipping Development Tools. To enable, run with --install-dev or set INSTALL_DEV=1"
fi

echo "[+] Updating all packages to latest versions..."
dnf update -y --skip-broken --nobest

# Cleanup
echo "[+] Cleanup: remove unnecessary packages and old metadata"
dnf autoremove -y
dnf clean all

cat <<EOF

Installation complete.
- To allow SSH access (if this is a VM or server), open port 22 in firewalld:
  sudo firewall-cmd --add-service=ssh --permanent && sudo firewall-cmd --reload
- If you installed Development Tools, you will have gcc, make, etc.

Examples:
  sudo ./scripts/rocky-setup.sh --install-dev
  INSTALL_DEV=1 sudo ./scripts/rocky-setup.sh

Customize PACKAGES=(...) inside this script according to your needs (docker, podman, kube, mssql-tools, etc.).
EOF
