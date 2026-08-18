#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# LXD VM OS base setup. Runs inside the VM via `lxc exec`. Idempotent.
# ---------------------------------------------------------------------------

# lxdbr0 is a plain L2 bridge: LXD runs no DHCP/DNS on it (MAAS owns
# provisioning), so VMs configure their NIC statically and deterministically.
# The host pins the gateway (10.250.250.1) on the bridge and provides NAT; no
# resolver listens there, so DNS must use public/MAAS resolvers, not the gateway.
# LXD_NET_MODE=dhcp opts back into DHCP-first for VMs on a MAAS-served segment.
LXD_NET_MODE="${LXD_NET_MODE:-static}"
LXD_FALLBACK_IPV4_CIDR="${LXD_FALLBACK_IPV4_CIDR:-10.250.250.100/24}"
LXD_FALLBACK_GATEWAY="${LXD_FALLBACK_GATEWAY:-10.250.250.1}"
LXD_FALLBACK_DNS="${LXD_FALLBACK_DNS:-1.1.1.1 8.8.8.8}"
ROCKY_MIRROR_HOST="${ROCKY_MIRROR_HOST:-mirrors.rockylinux.org}"

current_ipv4() {
    ip -4 addr show "$IFACE" | awk '/inet /{print $2; exit}'
}

wait_for_ipv4() {
    local current_ip=""
    
    for _ in $(seq 1 10); do
        current_ip="$(current_ipv4)"
        if [ -n "$current_ip" ]; then
            echo "$current_ip"
            return 0
        fi
        sleep 1
    done
    
    return 1
}

refresh_resolver_state() {
    if command -v resolvectl >/dev/null 2>&1; then
        sudo resolvectl flush-caches || true
    fi
    
    if [ -f /run/NetworkManager/resolv.conf ]; then
        sudo ln -sf /run/NetworkManager/resolv.conf /etc/resolv.conf || true
    fi
}

verify_name_resolution() {
    getent ahostsv4 "$ROCKY_MIRROR_HOST" >/dev/null 2>&1
}

retry_dnf() {
    local attempt=1
    local max_attempts=3
    
    until "$@"; do
        if [ "$attempt" -ge "$max_attempts" ]; then
            return 1
        fi
        
        echo "DNF command failed (attempt $attempt/$max_attempts): $*"
        echo "Refreshing resolver state before retry..."
        refresh_resolver_state
        verify_name_resolution || true
        attempt=$((attempt + 1))
    done
}

# k3s derives the node name from the system hostname. The Rocky image keeps
# "localhost.localdomain" for every VM, so without this every node would try to
# register under the same name — the second one is rejected ("Node password
# rejected, duplicate hostname"). Pin the hostname to the LXD instance name so
# node names are unique and deterministic (control plane labeling relies on it).
if [ -n "${LXD_NODE_NAME:-}" ] && [ "$(hostname)" != "$LXD_NODE_NAME" ]; then
    echo "--- Hostname ---"
    echo "Setting hostname to ${LXD_NODE_NAME} (k3s node name)..."
    sudo hostnamectl set-hostname "$LXD_NODE_NAME" 2>/dev/null || sudo hostname "$LXD_NODE_NAME"
fi

echo "--- Network Configuration ---"

# 1. Detect primary non-loopback interface
IFACE=$(ip -o link show up | awk -F': ' '$2!="lo"{print $2; exit}')
echo "Using network interface: ${IFACE:-none}"

if [ -z "$IFACE" ]; then
    echo "CRITICAL ERROR: No network interface detected."
    exit 1
fi

# 2. Force NetworkManager initialization if interface lacks an IP address
CURRENT_IP="$(current_ipv4 || true)"

if command -v nmcli >/dev/null 2>&1 && [ -z "$CURRENT_IP" ]; then
    echo "Inspecting NetworkManager profiles..."
    
    # Check if a profile is tracking this device
    NM_CON=$(nmcli -t -f NAME,DEVICE connection show | awk -F: -v iface="$IFACE" '$2==iface{print $1; exit}')
    
    if [ -z "$NM_CON" ]; then
        echo "No connection profile matches $IFACE. Forcing generation of profile 'k3s-net'..."
        nmcli connection add type ethernet con-name k3s-net ifname "$IFACE"
        NM_CON="k3s-net"
    fi

    apply_static_ipv4() {
        echo "Applying static LXD bridge address ${LXD_FALLBACK_IPV4_CIDR} (gw ${LXD_FALLBACK_GATEWAY}, dns ${LXD_FALLBACK_DNS})..."
        nmcli connection modify "$NM_CON" \
        connection.autoconnect yes \
        connection.interface-name "$IFACE" \
        ipv4.method manual \
        ipv4.addresses "$LXD_FALLBACK_IPV4_CIDR" \
        ipv4.gateway "$LXD_FALLBACK_GATEWAY" \
        ipv4.dns "$LXD_FALLBACK_DNS" \
        ipv4.ignore-auto-dns yes \
        ipv6.method ignore
        nmcli connection up "$NM_CON"
        CURRENT_IP="$(wait_for_ipv4 || true)"
    }

    # Static-first: lxdbr0 has no DHCP, so a DHCP attempt only adds a ~45s
    # activation timeout per boot. DHCP is opt-in for VMs on a MAAS-served
    # segment (LXD_NET_MODE=dhcp), with a static fallback if no lease appears.
    if [ "$LXD_NET_MODE" = "dhcp" ]; then
        echo "Configuring DHCP-first NetworkManager profile '$NM_CON'..."
        nmcli connection modify "$NM_CON" \
        connection.autoconnect yes \
        connection.interface-name "$IFACE" \
        ipv4.method auto \
        ipv4.dhcp-client-id mac \
        ipv4.ignore-auto-dns no \
        ipv6.method ignore
        echo "Bringing network interface up with DHCP..."
        nmcli connection up "$NM_CON" || echo "DHCP activation failed; static fallback will be applied."
        CURRENT_IP="$(wait_for_ipv4 || true)"
        if [ -z "$CURRENT_IP" ]; then
            echo "No DHCP lease on $IFACE."
            apply_static_ipv4
        fi
    else
        echo "Configuring static NetworkManager profile '$NM_CON' for the plain LXD bridge..."
        apply_static_ipv4
    fi
fi

# 3. Give the network interface a short window to settle and lease an IP address
echo "Waiting for IP address allocation..."
CURRENT_IP="${CURRENT_IP:-$(wait_for_ipv4 || true)}"
if [ -n "$CURRENT_IP" ]; then
    echo "Interface $IFACE successfully initialized with IP: $CURRENT_IP"
fi

# 4. Verify DNS and outbound connectivity before proceeding (Fail Closed)
echo "Verifying internet and DNS connectivity..."
refresh_resolver_state
if ! verify_name_resolution; then
    echo "CRITICAL ERROR: DNS lookup failed for $ROCKY_MIRROR_HOST. Diagnostic snapshot:"
    echo "=== /etc/resolv.conf ==="
    cat /etc/resolv.conf || true
    echo "=== Interface State ==="
    ip -4 addr show "$IFACE" || true
    echo "=== Routing Table ==="
    ip route show || true
    echo "=== NetworkManager Status ==="
    nmcli device status || true
    exit 1
fi

if ! timeout 15 curl -fsSL --max-time 10 "https://${ROCKY_MIRROR_HOST}" -o /dev/null; then
    echo "CRITICAL ERROR: Network/DNS remains unreachable. Diagnostic snapshot:"
    echo "=== /etc/resolv.conf ==="
    cat /etc/resolv.conf || true
    echo "=== Interface State ==="
    ip -4 addr show "$IFACE" || true
    echo "=== Routing Table ==="
    ip route show || true
    echo "=== NetworkManager Status ==="
    nmcli device status || true
    exit 1
fi

echo "--- Disk Resizing ---"
if ! command -v parted >/dev/null 2>&1; then
    sudo dnf install -y parted
fi

set +e
sudo parted /dev/sda ---pretend-input-tty <<EOF
unit s
resizepart 2 100%
Yes
quit
EOF
set -e

sudo resize2fs /dev/sda2
echo "Disk partition and filesystem resized successfully."

echo "--- Package Installation ---"
retry_dnf sudo dnf install -y epel-release
retry_dnf sudo dnf install -y tar bzip2 git curl jq
retry_dnf sudo dnf -y update

echo "--- Kernel Modules for K3s ---"
sudo modprobe br_netfilter
echo "br_netfilter" | sudo tee /etc/modules-load.d/k3s-br_netfilter.conf > /dev/null

echo "Setup complete. System is ready for k3s-node-setup.sh"