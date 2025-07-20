#!/bin/bash
set -euo pipefail

sudo snap install jq
# sudo snap install --channel=3.0/stable maas
sudo snap install maas

# Get default interface and IP address
INTERFACE=$(ip route | grep default | awk '{print $5}')
IP_ADDRESS=$(ip -4 addr show dev "$INTERFACE" | grep -oP '(?<=inet\s)\d+(\.\d+){3}')

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

cd /home/dd/engine

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

maas "$MAAS_ADMIN_USERNAME" maas set-config name=upstream_dns value=8.8.8.8
