#!/usr/bin/env bash
set -euo pipefail

url="${1:-}"
[[ "$url" =~ ^tftp://([^/]+)(/.+)$ ]] || { echo "Usage: $0 tftp://host/path"; exit 2; }
host="${BASH_REMATCH[1]}"
path="${BASH_REMATCH[2]}"
outfile="/tmp/$(basename "$path")"

if command -v curl >/dev/null 2>&1; then
  curl -f --silent --output "$outfile" "$url" && echo "OK: $outfile ($(stat -c%s "$outfile") bytes)" || { echo "curl: failed"; exit 3; }
elif command -v tftp >/dev/null 2>&1; then
  printf "get %s %s\nquit\n" "$path" "$outfile" | tftp "$host" \
    && [[ -s "$outfile" ]] \
    && echo "OK: $outfile ($(stat -c%s "$outfile") bytes)" \
    || { echo "tftp: failed"; exit 3; }
else
  echo "Install 'curl' or 'tftp-client' (sudo dnf install -y curl tftp-client)"; exit 4
fi
