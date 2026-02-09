#!/usr/bin/env bash
# disk-devices.sh
# List block devices with detailed info, including by-id names
# Usage: sudo ./disk-devices.sh
set -euo pipefail

sudo bash -c 'printf "NODE\tTYPE\tSIZE\tFSTYPE\tLABEL\tUUID\tMOUNTPOINT\tBY-ID\n"; \
lsblk -pnl -o NAME,TYPE,SIZE,FSTYPE,LABEL,UUID,MOUNTPOINT | while read -r DEV TYPE SIZE FS LBL UUID MNT; do \
    node=$(readlink -f "$DEV"); \
    byid=$(find /dev/disk/by-id/ -maxdepth 1 -lname "*${node##*/}" ! -name "nvme-eui*" ! -name "dm-uuid*" 2>/dev/null | head -n 1); \
    [ -z "$byid" ] && byid=$(find /dev/disk/by-id/ -maxdepth 1 -lname "*${node##*/}" 2>/dev/null | head -n 1); \
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$node" "$TYPE" "$SIZE" "$FS" "$LBL" "$UUID" "$MNT" "$(basename "$byid" 2>/dev/null)"; \
done' | column -s $'\t' -t
