#!/bin/bash
set -euo pipefail

# Enable firewalld
sudo systemctl enable --now firewalld

# Optional: persistent IP forwarding
sudo tee /etc/sysctl.d/99-forwarding.conf >/dev/null <<'EOF'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
EOF

sudo sysctl --system

# Open SSH + web + custom ports in the default zone
sudo firewall-cmd --permanent --zone=public --add-service=ssh
sudo firewall-cmd --permanent --zone=public --add-port=80/tcp
sudo firewall-cmd --permanent --zone=public --add-port=443/tcp
sudo firewall-cmd --permanent --zone=public --add-port=5000/tcp
sudo firewall-cmd --permanent --zone=public --add-port=9090/tcp

# Apply changes
sudo firewall-cmd --reload

# Show status
sudo sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding
sudo firewall-cmd --zone=public --list-all