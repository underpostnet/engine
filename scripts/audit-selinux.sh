#!/usr/bin/env bash
set -euo pipefail

SINCE="recent"
FAIL_ON_AVC="1"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --since)
            [ "$#" -ge 2 ] || { echo "--since requires an ausearch time value" >&2; exit 2; }
            SINCE="$2"
            shift 2
            ;;
        --no-fail)
            FAIL_ON_AVC="0"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--since recent|today|boot|TIME] [--no-fail]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 2
            ;;
    esac
done

command -v getenforce >/dev/null 2>&1 || {
    echo "SELinux userspace is unavailable. Install policycoreutils." >&2
    exit 2
}
command -v ausearch >/dev/null 2>&1 || {
    echo "ausearch is unavailable. Install audit and start auditd." >&2
    exit 2
}

MODE="$(getenforce)"
echo "SELinux mode: $MODE"
[ "$MODE" = "Enforcing" ] || echo "WARNING: expected Enforcing mode" >&2
command -v sestatus >/dev/null 2>&1 && sestatus

AUDIT=(ausearch)
[ "$(id -u)" -eq 0 ] || AUDIT=(sudo ausearch)
RAW_FILE="$(mktemp /tmp/underpost-selinux-avc.XXXXXX)"
trap 'rm -f "$RAW_FILE"' EXIT

"${AUDIT[@]}" -m AVC,USER_AVC,SELINUX_ERR -ts "$SINCE" --raw > "$RAW_FILE" 2>/dev/null || true
if ! grep -q '^type=' "$RAW_FILE"; then
    echo "No SELinux AVC denials found since: $SINCE"
    [ "$MODE" = "Enforcing" ]
    exit
fi

echo "SELinux AVC denials found since: $SINCE" >&2
"${AUDIT[@]}" -m AVC,USER_AVC,SELINUX_ERR -ts "$SINCE" -i || true
if command -v sealert >/dev/null 2>&1; then
    echo "sealert analysis:"
    sealert -a "$RAW_FILE" || true
else
    echo "Install setroubleshoot-server for sealert analysis." >&2
fi

[ "$FAIL_ON_AVC" = "0" ] || exit 1
