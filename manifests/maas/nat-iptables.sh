#!/bin/bash
set -euo pipefail

# Disable firewalld
sudo systemctl disable --now iptables
sudo systemctl disable --now ufw
sudo systemctl disable --now firewalld


# Remove any existing entries, then append exactly one
sudo sed -i '/^net.ipv4.ip_forward/d' /etc/sysctl.conf
sudo sed -i '/^net.ipv6.conf.all.forwarding/d' /etc/sysctl.conf
echo "net.ipv4.ip_forward = 1"               | sudo tee -a /etc/sysctl.conf
echo "net.ipv6.conf.all.forwarding = 1"       | sudo tee -a /etc/sysctl.conf
# ---

sudo sysctl -p

# Accept all traffic
sudo iptables -P INPUT ACCEPT
sudo iptables -P FORWARD ACCEPT
sudo iptables -P OUTPUT ACCEPT

# List iptables rules and forwarding flag
sudo iptables -L -n
sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding
