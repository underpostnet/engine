#!/usr/bin/env bash
# RHEL / Rocky Linux — Generate local TLS cert + fullchain (cert + root CA) using mkcert
# Usage:
#   ./scripts/ssl.sh /path/to/target "localhost 127.0.0.1 ::1"

set -euo pipefail
IFS=$'\n\t'

err() { echo "[ERROR] $*" >&2; }
info() { echo "[INFO] $*"; }

print_usage() {
  cat <<'EOF'
Usage: $0 TARGET_DIR "domain1 domain2 ..."
Example: $0 /etc/ssl/local "localhost 127.0.0.1 ::1"

Outputs created in TARGET_DIR:
 - <name>.pem          : leaf/server certificate
 - <name>-key.pem      : private key
 - <name>-fullchain.pem: certificate followed by root CA (use for servers needing full chain)
 - rootCA.pem          : local root CA (if OpenSSL fallback used or copied from mkcert CAROOT)
EOF
}

if [[ ${1-} == "-h" || ${1-} == "--help" ]]; then
  print_usage; exit 0; fi

TARGET_DIR="${1-}"
DOMAINS="${2-}"

if [[ -z "$TARGET_DIR" ]]; then read -rp "Target directory to store certificates (absolute path): " TARGET_DIR; fi
if [[ -z "$DOMAINS" ]]; then read -rp "Space-separated domains/IPs to include (e.g. 'localhost 127.0.0.1 api.myapp.test'): " DOMAINS; fi

TARGET_DIR="$(realpath -m "$TARGET_DIR")"
mkdir -p "$TARGET_DIR"
IFS=' ' read -r -a DOMAIN_ARR <<< "$DOMAINS"
if [[ ${#DOMAIN_ARR[@]} -eq 0 ]]; then err "No domains provided. Exiting."; exit 1; fi

NAME_SAFE="${DOMAIN_ARR[0]//[^a-zA-Z0-9_.-]/_}"
CERT_FILE="$TARGET_DIR/${NAME_SAFE}.pem"
KEY_FILE="$TARGET_DIR/${NAME_SAFE}-key.pem"
FULLCHAIN_FILE="$TARGET_DIR/${NAME_SAFE}-fullchain.pem"
ROOT_PEM="$TARGET_DIR/rootCA.pem"

info "Target dir: $TARGET_DIR"
info "Domains: ${DOMAIN_ARR[*]}"
info "Outputs: $CERT_FILE, $KEY_FILE, $FULLCHAIN_FILE, $ROOT_PEM"

# Install prerequisites
if ! command -v dnf >/dev/null 2>&1; then err "dnf not found. This script expects RHEL/Rocky with dnf."; exit 1; fi

SUDO=""
if [ "$EUID" -ne 0 ]; then
  SUDO="sudo"
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v certutil >/dev/null 2>&1 || ! command -v update-ca-trust >/dev/null 2>&1; then
  $SUDO dnf install -y curl nss-tools ca-certificates
fi

# The mkcert release this script installs, and the SHA-256 of each build.
MKCERT_VERSION='v1.4.4'

# Download and install mkcert binary (no 'go install')
download_mkcert_binary() {
  local arch sha256
  case "$(uname -m)" in
    x86_64|amd64) arch='linux-amd64'; sha256='6d31c65b03972c6dc4a14ab429f2928300518b26503f58723e532d1b0a3bbb52' ;;
    aarch64|arm64) arch='linux-arm64'; sha256='b98f2cc69fd9147fe4d405d859c57504571adec0d3611c3eefd04107c7ac00d0' ;;
    *) err "No pinned mkcert build for $(uname -m)"; return 1 ;;
  esac
  local url="https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-${arch}"
  local tmp_bin
  tmp_bin="$(mktemp /tmp/mkcert.XXXXXX)"
  info "Downloading mkcert ${MKCERT_VERSION} ${arch}"
  if ! curl -fsSL -o "$tmp_bin" "$url"; then rm -f "$tmp_bin"; err "mkcert download failed"; return 1; fi
  if ! echo "${sha256}  ${tmp_bin}" | sha256sum -c --quiet -; then
    rm -f "$tmp_bin"; err "mkcert checksum mismatch; not installed"; return 1
  fi
  $SUDO install -m 0755 "$tmp_bin" /usr/local/bin/mkcert
  rm -f "$tmp_bin"
  info "mkcert installed to /usr/local/bin/mkcert"
}

use_mkcert() {
  if ! command -v mkcert >/dev/null 2>&1; then
    info "mkcert not found — attempting to download/install binary"
    download_mkcert_binary || return 1
  fi
  MKCERT_BIN="$(command -v mkcert || echo /usr/local/bin/mkcert)"
  info "Running mkcert -install as sudo (if necessary)"
  if ! $SUDO "$MKCERT_BIN" -install >/dev/null 2>&1; then
    if ! "$MKCERT_BIN" -install >/dev/null 2>&1; then
      err "mkcert -install failed"; return 1
    fi
  fi
  MK_ARGS=()
  for d in "${DOMAIN_ARR[@]}"; do MK_ARGS+=("$d"); done
  info "Generating cert+key with mkcert"
  if ! "$MKCERT_BIN" -cert-file "$CERT_FILE" -key-file "$KEY_FILE" "${MK_ARGS[@]}"; then err "mkcert failed to generate"; return 1; fi
  # copy root CA from mkcert CAROOT into TARGET_DIR
  if ROOT_FROM_MKCERT="$($MKCERT_BIN -CAROOT 2>/dev/null)"; then
    if [[ -f "$ROOT_FROM_MKCERT/rootCA.pem" ]]; then
      cp "$ROOT_FROM_MKCERT/rootCA.pem" "$ROOT_PEM"
      info "Copied mkcert root CA to $ROOT_PEM"
    fi
  fi
  # create fullchain (cert followed by root CA)
  if [[ -f "$ROOT_PEM" ]]; then
    cat "$CERT_FILE" "$ROOT_PEM" > "$FULLCHAIN_FILE"
    info "Created fullchain: $FULLCHAIN_FILE"
  else
    cp "$CERT_FILE" "$FULLCHAIN_FILE"
    info "No root CA found to append; fullchain contains only leaf cert: $FULLCHAIN_FILE"
  fi
  return 0
}

use_openssl() {
  command -v openssl >/dev/null 2>&1 || { err "openssl required"; return 1; }
  ROOT_KEY="$TARGET_DIR/rootCA.key"
  if [[ ! -f "$ROOT_KEY" || ! -f "$ROOT_PEM" ]]; then
    openssl genrsa -out "$ROOT_KEY" 4096
    openssl req -x509 -new -nodes -key "$ROOT_KEY" -sha256 -days 3650 -out "$ROOT_PEM" -subj "/CN=Local Development Root CA"
  fi
  CSR_KEY="$TARGET_DIR/${NAME_SAFE}.key"
  CSR_PEM="$TARGET_DIR/${NAME_SAFE}.csr"
  openssl genrsa -out "$CSR_KEY" 2048
  openssl req -new -key "$CSR_KEY" -out "$CSR_PEM" -subj "/CN=${DOMAIN_ARR[0]}"
  V3EXT="$TARGET_DIR/v3.ext"
  printf 'authorityKeyIdentifier=keyid,issuer\nbasicConstraints=CA:FALSE\nkeyUsage = digitalSignature, keyEncipherment\nsubjectAltName = @alt_names\n\n[alt_names]\n' > "$V3EXT"
  DNS=1; IP=1
  for d in "${DOMAIN_ARR[@]}"; do
    if [[ "$d" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$d" == *":"* ]]; then
      printf 'IP.%d = %s\n' "$IP" "$d" >> "$V3EXT"; IP=$((IP+1))
    else
      printf 'DNS.%d = %s\n' "$DNS" "$d" >> "$V3EXT"; DNS=$((DNS+1))
    fi
  done
  if openssl x509 -req -in "$CSR_PEM" -CA "$ROOT_PEM" -CAkey "$ROOT_KEY" -CAcreateserial -out "$CERT_FILE" -days 825 -sha256 -extfile "$V3EXT"; then
    mv -f "$CSR_KEY" "$KEY_FILE"
    # create fullchain: leaf + root
    cat "$CERT_FILE" "$ROOT_PEM" > "$FULLCHAIN_FILE"
    $SUDO cp "$ROOT_PEM" /etc/pki/ca-trust/source/anchors/
    $SUDO update-ca-trust extract
    if command -v certutil >/dev/null 2>&1; then
      mkdir -p "$HOME/.pki/nssdb"
      certutil -d sql:$HOME/.pki/nssdb -A -t "CT,C,C" -n "Local Dev Root CA" -i "$ROOT_PEM"
    fi
    info "OpenSSL created cert, key and fullchain"
    return 0
  fi
  err "OpenSSL failed to create certificate"
  return 1
}

# main
if use_mkcert; then
  info "Done: created cert, key, fullchain and root CA in $TARGET_DIR"
  exit 0
else
  info "mkcert flow failed — trying OpenSSL fallback"
  if use_openssl; then
    info "Done: created cert, key, fullchain and root CA in $TARGET_DIR"
    exit 0
  fi
fi

err "Failed to create certificates with mkcert or OpenSSL"
exit 2
