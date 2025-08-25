# GPUs and drivers in use
sudo lspci -nnk | egrep -i 'vga|3d' -A3

# modules loaded relevant
lsmod | egrep 'nvidia|nouveau|amdgpu' || true

# if exists nvidia tool
nvidia-smi 2>/dev/null || echo "nvidia-smi not found"

# kernel related errors
sudo dmesg | egrep -i 'nvidia|nouveau|amdgpu' --color=auto

# recent system errors / gdm / mutter / X
sudo journalctl -b -p err --no-pager | head -n 200
journalctl -b _COMM=gdm --no-pager | tail -n 200
journalctl -b _COMM=Xorg --no-pager | tail -n 200

# X log (if exists)
sudo grep -E "(EE|WW|NVIDIA|nouveau|amdgpu)" /var/log/Xorg.0.log || true
