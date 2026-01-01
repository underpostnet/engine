#!/usr/bin/env bash
# ip-info.sh
# Retrieve information about an IP address or hostname
# Usage: ip-info.sh <IP-or-hostname>

set -euo pipefail
IFS=$'
	'

if [[ ${#} -lt 1 ]]; then
  echo "Usage: $0 <IP-or-hostname>"
  exit 1
fi
TARGET="$1"

# Detect package manager
PKG_MANAGER=""
if command -v dnf >/dev/null 2>&1; then
  PKG_MANAGER=dnf
elif command -v yum >/dev/null 2>&1; then
  PKG_MANAGER=yum
fi

# Commands we need (bind-utils provides dig)
REQUIRED_CMDS=(curl jq whois dig traceroute)
PKGS=(curl jq whois bind-utils traceroute)

missing=()
for i in "${!REQUIRED_CMDS[@]}"; do
  cmd=${REQUIRED_CMDS[$i]}
  if ! command -v "$cmd" >/dev/null 2>&1; then
    missing+=("${PKGS[$i]}")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  if [[ -z "$PKG_MANAGER" ]]; then
    echo "Missing packages: ${missing[*]}
No supported package manager found. Install: ${missing[*]} and re-run."
    exit 1
  fi
  if [[ $EUID -ne 0 && -z "$(command -v sudo)" ]]; then
    echo "Missing packages: ${missing[*]}
Run as root or install sudo."
    exit 1
  fi
  echo "Installing missing: ${missing[*]}"
  sudo $PKG_MANAGER install -y ${missing[*]} >/dev/null
fi

# Resolve to IP(s)
resolve_ips(){
  if getent ahosts "$TARGET" >/dev/null 2>&1; then
    getent ahosts "$TARGET" | awk '{print $1}' | sort -u
  else
    dig +short "$TARGET" | awk '/^[0-9]/ {print $1}' | sort -u
  fi
}

mapfile -t IPS < <(resolve_ips)
if [[ ${#IPS[@]} -eq 0 ]]; then
  IPS=("$TARGET")
fi

format(){
  if command -v jq >/dev/null 2>&1; then
    jq '.' 2>/dev/null || cat
  else
    cat
  fi
}

for IP in "${IPS[@]}"; do
  printf "
===== %s (resolved: %s) =====

" "$TARGET" "$IP"

  echo "-- REVERSE DNS --"
  dig -x "$IP" +short

  echo "
-- WHOIS --"
  whois "$IP" | sed -n '1,80p'

  echo "
-- IPINFO (ipinfo.io) --"
  curl -sS "https://ipinfo.io/$IP/json" | format

  echo "
-- IP-API (ip-api.com) --"
  curl -sS "http://ip-api.com/json/$IP?fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,query" | format

  echo "
-- IPWHOIS (ipwhois.app) --"
  curl -sS "https://ipwhois.app/json/$IP" | format

  echo "
-- GEOPLUGIN --"
  curl -sS "http://www.geoplugin.net/json.gp?ip=$IP" | format

  echo "
-- TRACEROUTE --"
  traceroute -m 20 "$IP"

  if [[ "$TARGET" =~ [A-Za-z] ]]; then
    echo "
-- DNS RECORDS for $TARGET --"
    dig +short A "$TARGET"
    dig +short AAAA "$TARGET"
    dig +short MX "$TARGET"
    dig +short TXT "$TARGET"
  fi

  echo "
===== done: $IP =====
"
done
