#!/bin/bash
set -euo pipefail

# Install jq for JSON parsing
sudo snap install jq

# Install MAAS
sudo snap install maas

# Get default interface and IP address
INTERFACE=$(ip route | grep default | awk '{print $5}')
IP_ADDRESS=$(ip -4 addr show dev "$INTERFACE" | grep -oP '(?<=inet\s)\d+(\.\d+){3}')

# Change to the engine directory (assuming this is where your MAAS related configs are)
cd /home/dd/engine

# Load secrets for MAAS database and admin credentials
underpost secret underpost --create-from-file /home/dd/engine/engine-private/conf/dd-cron/.env.production

# Extract configuration values from secrets
DB_PG_MAAS_USER=$(node bin config get --plain DB_PG_MAAS_USER)
DB_PG_MAAS_PASS=$(node bin config get --plain DB_PG_MAAS_PASS)
DB_PG_MAAS_HOST=$(node bin config get --plain DB_PG_MAAS_HOST)
DB_PG_MAAS_NAME=$(node bin config get --plain DB_PG_MAAS_NAME)

MAAS_ADMIN_USERNAME=$(node bin config get --plain MAAS_ADMIN_USERNAME)
MAAS_ADMIN_EMAIL=$(node bin config get --plain MAAS_ADMIN_EMAIL)
MAAS_ADMIN_PASS=$(node bin config get --plain MAAS_ADMIN_PASS)

# Initialize MAAS region+rack controller
maas init region+rack \
    --database-uri "postgres://${DB_PG_MAAS_USER}:${DB_PG_MAAS_PASS}@${DB_PG_MAAS_HOST}/${DB_PG_MAAS_NAME}" \
    --maas-url http://${IP_ADDRESS}:5240/MAAS

# Allow MAAS to initialize (wait for services to come up)
echo "Waiting for MAAS to initialize..."
sleep 30

# Create MAAS administrator account
maas createadmin \
    --username "$MAAS_ADMIN_USERNAME" \
    --password "$MAAS_ADMIN_PASS" \
    --email "$MAAS_ADMIN_EMAIL"

# Get the API key for the admin user
APIKEY=$(maas apikey --username "$MAAS_ADMIN_USERNAME")

# Login to MAAS using the admin profile
echo "Logging into MAAS..."
maas login "$MAAS_ADMIN_USERNAME" "http://localhost:5240/MAAS/" "$APIKEY"

# Set upstream DNS for MAAS
echo "Setting upstream DNS to 8.8.8.8..."
maas "$MAAS_ADMIN_USERNAME" maas set-config name=upstream_dns value=8.8.8.8

# echo "Downloading Ubuntu Noble amd64/ga-24.04 image..."
# maas $MAAS_ADMIN_USERNAME boot-source-selections create 1 \
#     os="ubuntu" release="noble" arches="amd64" \
#     subarches="ga-24.04" labels="*"

# echo "Downloading Ubuntu Noble arm64/ga-24.04 image..."
# maas $MAAS_ADMIN_USERNAME boot-source-selections create 1 \
#     os="ubuntu" release="noble" arches="arm64" \
#     subarches="ga-24.04" labels="*"

# Import the newly selected boot images
# echo "Importing boot images (this may take some time)..."
# maas "$MAAS_ADMIN_USERNAME" boot-resources import

# Disable the MAAS HTTP proxy
echo "Disabling MAAS HTTP proxy..."
maas "$MAAS_ADMIN_USERNAME" maas set-config name=enable_http_proxy value=false

# Disable DNSSEC validation
echo "Disabling DNSSEC validation..."
maas "$MAAS_ADMIN_USERNAME" maas set-config name=dnssec_validation value=no

# Set network discovery interval to 10 minutes (600 seconds)
echo "Setting network discovery interval to 10 minutes..."
maas "$MAAS_ADMIN_USERNAME" maas set-config name=active_discovery_interval value=600

SSH_KEY=$(cat ~/.ssh/id_rsa.pub)
maas $MAAS_ADMIN_USERNAME sshkeys create "key=$SSH_KEY"

echo "MAAS setup script completed with new configurations."


# maas $MAAS_ADMIN_USERNAME maas set-config name=default_storage_layout value=lvm
# maas $MAAS_ADMIN_USERNAME maas set-config name=network_discovery value=disabled
# maas $MAAS_ADMIN_USERNAME maas set-config name=enable_analytics value=false
# maas $MAAS_ADMIN_USERNAME maas set-config name=enable_third_party_drivers value=false
# maas $MAAS_ADMIN_USERNAME maas set-config name=curtin_verbose value=true



echo "Configuring DHCP for the subnet's fabric (untagged VLAN)..."

# Derive FABRIC_ID and VLAN_VID from the subnet that matches our CIDR
SUBNET_CIDR="192.168.1.0/24"
SUBNET_JSON=$(maas "$MAAS_ADMIN_USERNAME" subnets read | jq -r '.[] | select(.cidr == "'"$SUBNET_CIDR"'")')
SUBNET_ID=$(echo "$SUBNET_JSON" | jq -r '.id')
FABRIC_ID=$(echo "$SUBNET_JSON" | jq -r '.vlan.fabric_id')
VLAN_VID=$(echo "$SUBNET_JSON" | jq -r '.vlan.vid')
FABRIC_NAME=$(echo "$SUBNET_JSON" | jq -r '.vlan.fabric')
echo "Detected subnet $SUBNET_CIDR on $FABRIC_NAME (fabric ID: $FABRIC_ID, VLAN VID: $VLAN_VID)"
RACK_CONTROLLER_ID=$(maas "$MAAS_ADMIN_USERNAME" rack-controllers read | jq -r '[.[] | select(.ip_addresses[] == "'"$IP_ADDRESS"'") | .system_id] | .[0]')

if [ -z "$RACK_CONTROLLER_ID" ] || [ "$RACK_CONTROLLER_ID" == "null" ]; then
    echo "Warning: Could not find Rack Controller by IP $IP_ADDRESS. Attempting to use the first available Rack Controller..."
    RACK_CONTROLLER_ID=$(maas "$MAAS_ADMIN_USERNAME" rack-controllers read | jq -r '.[0].system_id')
fi

if [ -z "$RACK_CONTROLLER_ID" ] || [ "$RACK_CONTROLLER_ID" == "null" ]; then
    echo "Error: Could not find any Rack Controller."
    exit 1
fi

START_IP="192.168.1.191"
END_IP="192.168.1.254"

if [ -z "$FABRIC_ID" ] || [ "$FABRIC_ID" == "null" ]; then
    echo "Error: Could not find FABRIC_ID for subnet '$SUBNET_CIDR'. Please ensure the subnet exists in MAAS."
    exit 1
fi

# Create a Dynamic IP Range for enlistment, commissioning, and deployment
echo "Creating dynamic IP range from $START_IP to $END_IP..."
maas "$MAAS_ADMIN_USERNAME" ipranges create type=dynamic start_ip="$START_IP" end_ip="$END_IP" || echo "Dynamic IP range likely already exists or conflicts. Proceeding..."

# Enable DHCP on the VLAN associated with the subnet
echo "Enabling DHCP on VLAN $VLAN_VID for $FABRIC_NAME (fabric ID: $FABRIC_ID)..."
maas "$MAAS_ADMIN_USERNAME" vlan update "$FABRIC_ID" "$VLAN_VID" dhcp_on=true primary_rack="$RACK_CONTROLLER_ID"

echo "Setting gateway IP for subnet $SUBNET_CIDR (ID: $SUBNET_ID) to $IP_ADDRESS..."
maas "$MAAS_ADMIN_USERNAME" subnet update $SUBNET_ID gateway_ip=$IP_ADDRESS
