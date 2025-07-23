#!/bin/bash
set -euo pipefail

# Disable firewalld
sudo systemctl disable --now iptables
sudo systemctl disable --now ufw
sudo systemctl disable --now firewalld

# Enable IP forwarding and configure NAT
echo "net.ipv4.ip_forward = 1" | sudo tee -a /etc/sysctl.conf
echo "net.ipv6.conf.all.forwarding = 1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Accept all traffic
sudo iptables -P INPUT ACCEPT
sudo iptables -P FORWARD ACCEPT
sudo iptables -P OUTPUT ACCEPT

# List iptables rules
sudo iptables -L -n
sysctl net.ipv4.ip_forward