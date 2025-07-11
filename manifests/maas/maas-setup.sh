#!/bin/bash
set -euo pipefail

# Update LXD and install dependencies
sudo snap install --channel=latest/stable lxd
sudo snap refresh --channel=latest/stable lxd
sudo snap install jq
sudo snap install maas

# Get default interface and IP address
INTERFACE=$(ip route | grep default | awk '{print $5}')
IP_ADDRESS=$(ip -4 addr show dev "$INTERFACE" | grep -oP '(?<=inet\s)\d+(\.\d+){3}')

# Install and persist iptables NAT rules (Rocky Linux compatible)
sudo dnf install -y iptables-services
sudo systemctl enable --now iptables

# Enable IP forwarding and configure NAT
sudo sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/' /etc/sysctl.conf
sudo sysctl -p
sudo iptables -t nat -A POSTROUTING -o "$INTERFACE" -j SNAT --to "$IP_ADDRESS"
sudo service iptables save

# LXD preseed
cd /home/dd/engine
lxd init --preseed <manifests/maas/lxd-preseed.yaml

# Wait for LXD to be ready
lxd waitready

# Load secrets
underpost secret underpost --create-from-file /home/dd/engine/engine-private/conf/dd-cron/.env.production

# Extract config values
DB_PG_MAAS_USER=$(node bin config get --plain DB_PG_MAAS_USER)
DB_PG_MAAS_PASS=$(node bin config get --plain DB_PG_MAAS_PASS)
DB_PG_MAAS_HOST=$(node bin config get --plain DB_PG_MAAS_HOST)
DB_PG_MAAS_NAME=$(node bin config get --plain DB_PG_MAAS_NAME)

MAAS_ADMIN_USERNAME=$(node bin config get --plain MAAS_ADMIN_USERNAME)
MAAS_ADMIN_EMAIL=$(node bin config get --plain MAAS_ADMIN_EMAIL)
MAAS_ADMIN_PASS=$(node bin config get --plain MAAS_ADMIN_PASS)

# Initialize MAAS
maas init region+rack \
    --database-uri "postgres://${DB_PG_MAAS_USER}:${DB_PG_MAAS_PASS}@${DB_PG_MAAS_HOST}/${DB_PG_MAAS_NAME}" \
    --maas-url http://${IP_ADDRESS}:5240/MAAS

# Let MAAS initialize
sleep 30

# Create admin and get API key
maas createadmin \
    --username "$MAAS_ADMIN_USERNAME" \
    --password "$MAAS_ADMIN_PASS" \
    --email "$MAAS_ADMIN_EMAIL"

APIKEY=$(maas apikey --username "$MAAS_ADMIN_USERNAME")

# Login to MAAS
maas login "$MAAS_ADMIN_USERNAME" "http://localhost:5240/MAAS/" "$APIKEY"

# Configure MAAS networking
SUBNET=10.10.10.0/24
FABRIC_ID=$(maas "$MAAS_ADMIN_USERNAME" subnet read "$SUBNET" | jq -r ".vlan.fabric_id")
VLAN_TAG=$(maas "$MAAS_ADMIN_USERNAME" subnet read "$SUBNET" | jq -r ".vlan.vid")
PRIMARY_RACK=$(maas "$MAAS_ADMIN_USERNAME" rack-controllers read | jq -r ".[] | .system_id")

maas "$MAAS_ADMIN_USERNAME" subnet update "$SUBNET" gateway_ip=10.10.10.1
maas "$MAAS_ADMIN_USERNAME" ipranges create type=dynamic start_ip=10.10.10.200 end_ip=10.10.10.254
maas "$MAAS_ADMIN_USERNAME" vlan update "$FABRIC_ID" "$VLAN_TAG" dhcp_on=True primary_rack="$PRIMARY_RACK"
maas "$MAAS_ADMIN_USERNAME" maas set-config name=upstream_dns value=8.8.8.8

# Register LXD as VM host
VM_HOST_ID=$(maas "$MAAS_ADMIN_USERNAME" vm-hosts create \
    password=password \
    type=lxd \
    power_address="https://${IP_ADDRESS}:8443" \
    project=maas | jq '.id')

# Set VM host CPU oversubscription
maas "$MAAS_ADMIN_USERNAME" vm-host update "$VM_HOST_ID" cpu_over_commit_ratio=4
