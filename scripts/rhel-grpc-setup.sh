#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────
# rhel-grpc-setup.sh — Install gRPC / Protocol Buffers system
# packages on RHEL / Rocky Linux / AlmaLinux / Fedora.
#
# Installs:
#   1. protobuf-compiler (protoc) + protobuf-devel
#   2. grpc / grpc-devel / grpc-plugins (C++ libs + plugin binaries)
#
# For Go-specific tooling (protoc-gen-go, protoc-gen-go-grpc,
# go mod tidy, proto codegen) use:
#   ./cyberia-server/scripts/grpc-setup.sh
#
# Usage:
#   sudo ./scripts/rhel-grpc-setup.sh
# ──────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: sudo $0"
  echo "Installs protobuf + gRPC system packages via dnf."
  echo "For Go codegen plugins, run: ./cyberia-server/scripts/grpc-setup.sh"
  exit 0
fi

# ── 1. Enable EPEL (needed for protobuf / grpc on RHEL) ──────────
echo ">>> Enabling EPEL repository..."
sudo dnf install -y epel-release || true
sudo dnf install -y dnf-plugins-core || true

# On RHEL proper, enable CRB/PowerTools for devel headers
if grep -qi 'Red Hat Enterprise' /etc/os-release 2>/dev/null; then
  sudo dnf config-manager --set-enabled codeready-builder-for-rhel-"$(rpm -E %rhel)"-"$(uname -m)-rpms" 2>/dev/null || true
elif grep -qi 'Rocky\|AlmaLinux' /etc/os-release 2>/dev/null; then
  sudo dnf config-manager --set-enabled crb 2>/dev/null || \
    sudo dnf config-manager --set-enabled powertools 2>/dev/null || true
fi

# ── 2. Install protobuf compiler + gRPC system packages ──────────
echo ">>> Installing protobuf-compiler, protobuf-devel, grpc, grpc-devel, grpc-plugins..."
sudo dnf install -y \
  protobuf-compiler \
  protobuf-devel \
  grpc \
  grpc-devel \
  grpc-plugins

# ── 3. Verify protoc ─────────────────────────────────────────────
if command -v protoc &>/dev/null; then
  echo ">>> protoc installed: $(protoc --version)"
else
  echo "WARNING: protoc not found in PATH after install." >&2
fi

echo ">>> gRPC system packages setup complete."
