#!/usr/bin/env bash
set -euo pipefail


# Script to install a recommended base package set on Rocky Linux.
# Usage examples:
#   sudo ./scripts/rocky-setup.sh                # interactive (will prompt about Development Tools)
#   sudo ./scripts/rocky-setup.sh --install-dev  # non-interactive: install Development Tools
#   INSTALL_DEV=1 sudo ./scripts/rocky-setup.sh  # same as --install-dev
#   sudo ./scripts/rocky-setup.sh --yes          # skip prompts and assume defaults

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
)

# Defaults
INSTALL_DEV=0
ASSUME_YES=0

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
    --yes|-y|--assume-yes)
      ASSUME_YES=1
      shift
      ;;
    --help|-h)
      cat <<EOF
Usage: sudo ./scripts/rocky-setup.sh [options]

Options:
  --install-dev, --yes-dev    Install Development Tools group (gcc, make, etc.)
  --no-install-dev            Explicitly skip Development Tools
  --yes, -y, --assume-yes     Assume defaults / non-interactive
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

# Helper: prompt unless ASSUME_YES
prompt_install_dev() {
  if [[ $ASSUME_YES -eq 1 ]]; then
    return 1  # means do NOT prompt (we treat ASSUME_YES as 'no' for optional install unless INSTALL_DEV set)
  fi

  read -r -p "Do you want to install the 'Development Tools' group (gcc, make, etc.)? [y/N]: " answer
  if [[ "${answer,,}" == "y" || "${answer,,}" == "yes" ]]; then
    return 0
  fi
  return 1
}

# Refresh cache and install basic packages
echo "[+] Refreshing DNF cache..."
sudo dnf makecache --refresh

echo "[+] Installing dnf-plugins-core and epel-release (if not present)..."
sudo dnf -y install dnf-plugins-core epel-release

echo "[+] Refreshing DNF cache after enabling repositories..."
sudo dnf makecache --refresh

echo "[+] Installing base packages: ${#PACKAGES[@]} packages"
sudo dnf -y install "${PACKAGES[@]}"

# Decide on Development Tools
if [[ $INSTALL_DEV -eq 1 ]]; then
  echo "[+] Installing Development Tools (requested)..."
  sudo dnf -y groupinstall "Development Tools"
else
  if prompt_install_dev; then
    echo "[+] Installing Development Tools (prompt confirmed)..."
    sudo dnf -y groupinstall "Development Tools"
  else
    echo "[+] Skipping Development Tools. To auto-enable, run with --install-dev or set INSTALL_DEV=1"
  fi
fi

echo "[+] Updating all packages to latest versions..."
sudo dnf -y update

# Cleanup
echo "[+] Cleanup: remove unnecessary packages and old metadata"
sudo dnf -y autoremove || true
sudo dnf clean all || true

cat <<EOF

Installation complete.
- To allow SSH access (if this is a VM or server), open port 22 in firewalld:
  sudo firewall-cmd --add-service=ssh --permanent && sudo firewall-cmd --reload
- If you installed Development Tools, you will have gcc, make, etc.

Examples:
  sudo ./scripts/rocky-setup.sh --install-dev
  INSTALL_DEV=1 sudo ./scripts/rocky-setup.sh
  sudo ./scripts/rocky-setup.sh --yes

Customize PACKAGES=(...) inside this script according to your needs (docker, podman, kube, mssql-tools, etc.).
EOF
