#!/usr/bin/env bash

for iface_path in /sys/class/net/*; do
  name=$(basename "$iface_path")
  mac=$(< "$iface_path/address")
  ip=$(ip -4 addr show dev "$name" \
       | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || echo "—")
  operstate=$(< "$iface_path/operstate")
  mtu=$(< "$iface_path/mtu")

  # Driver: módulo kernel que maneja esta interfaz
  if [ -L "$iface_path/device/driver" ]; then
    driver=$(basename "$(readlink -f "$iface_path/device/driver")")
  else
    driver="—"
  fi

  # Vendor:Device ID PCI
  pci_dev="$iface_path/device"
  if [ -f "$pci_dev/vendor" ] && [ -f "$pci_dev/device" ]; then
    vendor_id=$(< "$pci_dev/vendor")
    device_id=$(< "$pci_dev/device")
    # pasamos de 0x8086 a 8086, etc.
    vendor_id=${vendor_id#0x}
    device_id=${device_id#0x}
    pci="${vendor_id}:${device_id}"
  else
    pci="—"
  fi

  # Link Speed: lectura directa de /sys/class/net/<iface>/speed
  speed=$(cat "$iface_path/speed" 2>/dev/null || echo "—")

  echo "Interface: $name"
  echo "  MAC:          $mac"
  echo "  IPv4:         $ip"
  echo "  Estado:       $operstate"
  echo "  MTU:          $mtu"
  echo "  Driver:       $driver"
  echo "  PCI Vendor:Device ID: $pci"
  echo "  Link Speed:   ${speed}Mb/s"
  echo
done
