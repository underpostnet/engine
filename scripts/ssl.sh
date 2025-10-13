#!/usr/bin/env bash
# RHEL / Rocky Linux — Generate local TLS cert + fullchain (cert + root CA) using mkcert (no go) or OpenSSL fallback.
# Usage:
#   ./generate-local-ssl-fullchain.sh /path/to/target "localhost 127.0.0.1 ::1"

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
sudo dnf install -y curl nss-tools ca-certificates || true

# Download and install mkcert binary (no 'go install')
download_mkcert_binary() {
  UNAME_M=$(uname -m)
  case "$UNAME_M" in
    x86_64|amd64) ARCH_STR='linux-amd64' ;;
    aarch64|arm64) ARCH_STR='linux-arm64' ;;
    *) ARCH_STR='linux-amd64' ;;
  esac
  info "Searching mkcert release for $ARCH_STR"
  ASSET_URL=$(curl -sS "https://api.github.com/repos/FiloSottile/mkcert/releases/latest" | \
    grep -E '"browser_download_url":' | grep -i "$ARCH_STR" | head -n1 | sed -E 's/.*"(https:[^"]+)".*/\1/' || true)
  if [[ -z "$ASSET_URL" ]]; then
    ASSET_URL=$(curl -sS "https://api.github.com/repos/FiloSottile/mkcert/releases/latest" | \
      grep -E '"browser_download_url":' | grep -i 'linux' | grep -i 'amd64' | head -n1 | sed -E 's/.*"(https:[^"]+)".*/\1/' || true)
  fi
  if [[ -z "$ASSET_URL" ]]; then err "Could not find mkcert asset for your arch"; return 1; fi
  TMP_BIN="$(mktemp -u /tmp/mkcert.XXXXXX)"
  if curl -fSL -o "$TMP_BIN" "$ASSET_URL"; then
    sudo mv "$TMP_BIN" /usr/local/bin/mkcert
    sudo chmod +x /usr/local/bin/mkcert
    info "mkcert installed to /usr/local/bin/mkcert"
    return 0
  fi
  return 1
}

use_mkcert() {
  if ! command -v mkcert >/dev/null 2>&1; then
    info "mkcert not found — attempting to download/install binary"
    download_mkcert_binary || return 1
  fi
  MKCERT_BIN="$(command -v mkcert || echo /usr/local/bin/mkcert)"
  info "Running mkcert -install as sudo (if necessary)"
  if ! sudo "$MKCERT_BIN" -install >/dev/null 2>&1; then
    if ! "$MKCERT_BIN" -install >/dev/null 2>&1; then
      err "mkcert -install failed"; return 1
    fi
  fi
  MK_ARGS=()
  for d in "${DOMAIN_ARR[@]}"; do MK_ARGS+=("$d"); done
  info "Generating cert+key with mkcert"
  if ! "$MKCERT_BIN" -cert-file "$CERT_FILE" -key-file "$KEY_FILE" "${MK_ARGS[@]}"; then err "mkcert failed to generate"; return 1; fi
  # copy root CA from mkcert CAROOT into TARGET_DIR
  if ROOT_FROM_MKCERT="$($MKCERT_BIN -CAROOT 2>/dev/null || true)"; then
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
    sudo cp "$ROOT_PEM" /etc/pki/ca-trust/source/anchors/ || true
    sudo update-ca-trust extract || true
    if command -v certutil >/dev/null 2>&1; then
      mkdir -p "$HOME/.pki/nssdb"
      certutil -d sql:$HOME/.pki/nssdb -A -t "CT,C,C" -n "Local Dev Root CA" -i "$ROOT_PEM" || true
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
