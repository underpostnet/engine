#!/bin/bash
set -euo pipefail

echo "[INFO] Enabling firewalld..."
sudo systemctl enable --now firewalld

echo "[INFO] Configuring kernel networking..."

sudo tee /etc/sysctl.d/99-kubernetes.conf >/dev/null <<'EOF'
# Kubernetes networking
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1

# Required for Kubernetes iptables
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1

# Better conntrack handling
net.netfilter.nf_conntrack_max = 131072
EOF

# Load br_netfilter immediately
sudo modprobe br_netfilter

# Apply sysctl
sudo sysctl --system

echo "[INFO] Opening common WAN/public services..."

# Public services
sudo firewall-cmd --permanent --zone=public --add-service=ssh
sudo firewall-cmd --permanent --zone=public --add-service=http
sudo firewall-cmd --permanent --zone=public --add-service=https

echo "[INFO] Opening Kubernetes control plane ports..."

# Kubernetes API Server
sudo firewall-cmd --permanent --zone=public --add-port=6443/tcp

# etcd
sudo firewall-cmd --permanent --zone=public --add-port=2379-2380/tcp

# kubelet API
sudo firewall-cmd --permanent --zone=public --add-port=10250/tcp

# kube-scheduler
sudo firewall-cmd --permanent --zone=public --add-port=10259/tcp

# kube-controller-manager
sudo firewall-cmd --permanent --zone=public --add-port=10257/tcp

echo "[INFO] Opening Kubernetes networking ports..."

# CoreDNS
sudo firewall-cmd --permanent --zone=public --add-port=53/tcp
sudo firewall-cmd --permanent --zone=public --add-port=53/udp

# NodePort Services
sudo firewall-cmd --permanent --zone=public --add-port=30000-32767/tcp
sudo firewall-cmd --permanent --zone=public --add-port=30000-32767/udp

# Calico VXLAN
sudo firewall-cmd --permanent --zone=public --add-port=4789/udp

# Calico BGP
sudo firewall-cmd --permanent --zone=public --add-port=179/tcp

# Calico Typha (required for multi-node Calico deployments)
sudo firewall-cmd --permanent --zone=public --add-port=5473/tcp

# Calico WireGuard (optional encrypted overlay)
sudo firewall-cmd --permanent --zone=public --add-port=51820/udp
sudo firewall-cmd --permanent --zone=public --add-port=51821/udp

# Flannel VXLAN (UDP, required if using Flannel CNI)
sudo firewall-cmd --permanent --zone=public --add-port=8472/udp

# kube-proxy healthz
sudo firewall-cmd --permanent --zone=public --add-port=10256/tcp

# metrics-server
sudo firewall-cmd --permanent --zone=public --add-port=4443/tcp

echo "[INFO] Configuring trusted zone for inter-node pod/service CIDRs..."
# Allow all traffic from the default pod CIDR and service CIDR so that
# cross-node pod-to-pod and service routing works without explicit per-port rules.
sudo firewall-cmd --permanent --zone=trusted --add-source=192.168.0.0/16
sudo firewall-cmd --permanent --zone=trusted --add-source=10.96.0.0/12

echo "[INFO] Enabling masquerade and forwarding..."

sudo firewall-cmd --permanent --zone=public --add-masquerade

echo "[INFO] Reloading firewall..."

sudo firewall-cmd --reload

echo
echo "[INFO] Sysctl status:"
sudo sysctl \
  net.ipv4.ip_forward \
  net.ipv6.conf.all.forwarding \
  net.bridge.bridge-nf-call-iptables \
  net.bridge.bridge-nf-call-ip6tables

echo
echo "[INFO] Firewall status:"
sudo firewall-cmd --zone=public --list-all

echo
echo "[INFO] Kubernetes firewall configuration completed."