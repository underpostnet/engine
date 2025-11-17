#!/usr/bin/env bash
set -u -o pipefail

for iface_path in /sys/class/net/*; do
  [ -e "$iface_path" ] || continue
  name=$(basename "$iface_path")

  # MAC address
  if [ -r "$iface_path/address" ]; then
    mac=$(< "$iface_path/address")
  else
    mac="—"
  fi

  # IPv4: collect all IPv4 CIDRs, strip masks, join with commas (or show —)
  ip_info=$(ip -4 -o addr show dev "$name" 2>/dev/null | awk '{print $4}')
  if [ -n "$ip_info" ]; then
    # Use word-splitting intentionally to iterate lines from ip_info
    ip=$(printf "%s\n" $ip_info | awk -F/ '{print $1}' | paste -sd, -)
  else
    ip="—"
  fi

  # operstate and mtu
  operstate=$(< "$iface_path/operstate" 2>/dev/null || echo "—")
  mtu=$(< "$iface_path/mtu" 2>/dev/null || echo "—")

  # Driver (if available)
  if [ -e "$iface_path/device/driver" ]; then
    driver=$(basename "$(readlink -f "$iface_path/device/driver")")
  else
    driver="—"
  fi

  # PCI vendor:device (if available)
  pci_dev="$iface_path/device"
  if [ -r "$pci_dev/vendor" ] && [ -r "$pci_dev/device" ]; then
    vendor_id=$(< "$pci_dev/vendor")
    device_id=$(< "$pci_dev/device")
    vendor_id=${vendor_id#0x}
    device_id=${device_id#0x}
    pci="${vendor_id}:${device_id}"
  else
    pci="—"
  fi

  # Link speed: only append unit if numeric
  speed=$(cat "$iface_path/speed" 2>/dev/null || echo "—")
  if [[ "$speed" =~ ^[0-9]+$ ]]; then
    speed_label="${speed} Mb/s"
  else
    speed_label="$speed"
  fi

  # Print formatted output
  printf 'Interface: %s\n' "$name"
  printf '  MAC:          %s\n' "$mac"
  printf '  IPv4:         %s\n' "$ip"
  printf '  State:        %s\n' "$operstate"
  printf '  MTU:          %s\n' "$mtu"
  printf '  Driver:       %s\n' "$driver"
  printf '  PCI Vendor:Device: %s\n' "$pci"
  printf '  Link Speed:   %s\n\n' "$speed_label"

done
