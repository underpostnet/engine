#!/usr/bin/env bash
set -euo pipefail

# MAAS NAT + firewall helper
# - Enables IPv4 forwarding and masquerading for the MAAS/provisioning subnet
# - Opens the MAAS API on the uplink zone when requested
# - Opens provisioning and optional NFS services on the zone bound to MAAS_LAN_CIDR
#
# Usage examples:
#   sudo MAAS_LAN_CIDR="192.168.1.0/24" PUBLIC_ZONE="public" ./maas-nat-firewalld.sh
#   sudo NFS_MODE="v3" CONFIGURE_NFS_V3_PORTS="true" ./maas-nat-firewalld.sh

MAAS_LAN_CIDR="${MAAS_LAN_CIDR:-192.168.1.0/24}"
PUBLIC_ZONE="${PUBLIC_ZONE:-public}"
TRUSTED_ZONE="${TRUSTED_ZONE:-trusted}"
NFS_MODE="${NFS_MODE:-v4}"                    # v4 or v3
CONFIGURE_NFS_V3_PORTS="${CONFIGURE_NFS_V3_PORTS:-false}"
EXPOSE_MAAS_API_PUBLIC="${EXPOSE_MAAS_API_PUBLIC:-true}"

# Fixed NFSv3 ports (only used when CONFIGURE_NFS_V3_PORTS=true)
NFS_MOUNTD_PORT="${NFS_MOUNTD_PORT:-20048}"
NFS_STATD_PORT="${NFS_STATD_PORT:-32765}"
# Outgoing port must differ from the listen port; rpc.statd exits 255 if they match.
NFS_STATD_OUTGOING_PORT="${NFS_STATD_OUTGOING_PORT:-32766}"
NFS_LOCKD_PORT="${NFS_LOCKD_PORT:-32803}"
NFS_LOCKD_UDP_PORT="${NFS_LOCKD_UDP_PORT:-${NFS_LOCKD_PORT}}"
NFS_CONF_DROPIN="/etc/nfs.conf.d/99-maas-nfs-v3-ports.conf"

case "${NFS_MODE}" in
    v3|v4) ;;
    *)
        echo "[ERROR] NFS_MODE must be 'v3' or 'v4'." >&2
        exit 1
    ;;
esac

# Ensure the kernel NFS server is enabled and actually running. `exportfs -rav` only populates the
# export table; it does not start nfsd, and `systemctl try-restart` is a no-op when the unit is
# stopped. Without this, clients hang on mount because nothing listens on 2049/mountd.
ensure_nfs_server_running() {
    if [[ "${NFS_MODE}" == "v3" ]]; then
        # NFSv3 depends on the portmapper and the status monitor.
        sudo systemctl enable --now rpcbind 2>/dev/null || true
        sudo systemctl enable --now rpc-statd 2>/dev/null || true
    fi
    
    local unit=""
    for candidate in nfs-server nfs-kernel-server; do
        if systemctl cat "${candidate}.service" >/dev/null 2>&1; then
            unit="${candidate}"
            break
        fi
    done
    if [[ -z "${unit}" ]]; then
        echo "[ERROR] No NFS server unit found (nfs-server/nfs-kernel-server). Install nfs-utils or nfs-kernel-server." >&2
        return 1
    fi
    
    echo "[INFO] Enabling and (re)starting ${unit} to apply exports and fixed ports..."
    sudo systemctl enable "${unit}" 2>/dev/null || true
    sudo systemctl restart "${unit}"
}

echo "[INFO] Enabling firewalld..."
sudo systemctl enable --now firewalld

echo "[INFO] Enabling kernel forwarding..."
sudo tee /etc/sysctl.d/99-maas-nat.conf >/dev/null <<'EOF'
net.ipv4.ip_forward = 1
EOF

sudo sysctl --system >/dev/null

echo "[INFO] Allowing NAT for the MAAS LAN..."
sudo firewall-cmd --permanent --zone="${PUBLIC_ZONE}" --add-masquerade
sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-source="${MAAS_LAN_CIDR}"

echo "[INFO] Opening MAAS services on the MAAS LAN zone..."
sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-port=5240/tcp
for service in dns dhcp tftp; do
    sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-service="${service}"
done

if [[ "${EXPOSE_MAAS_API_PUBLIC}" == "true" ]]; then
    echo "[INFO] Opening MAAS API on the uplink zone..."
    sudo firewall-cmd --permanent --zone="${PUBLIC_ZONE}" --add-port=5240/tcp
fi

echo "[INFO] Opening NFS ports on the MAAS LAN zone..."

if [[ "${NFS_MODE}" == "v4" ]]; then
    # NFSv4 normally needs only TCP 2049.
    sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-port=2049/tcp
else
    # NFSv3 side-band daemons need fixed ports for deterministic firewall rules.
    if [[ "${CONFIGURE_NFS_V3_PORTS}" != "true" ]]; then
        echo "[ERROR] NFSv3 requires CONFIGURE_NFS_V3_PORTS=true for consistent firewalld rules." >&2
        echo "[ERROR] Re-run with CONFIGURE_NFS_V3_PORTS=true or switch to NFS_MODE=v4." >&2
        exit 1
    fi
    
    echo "[INFO] Writing fixed NFSv3 port configuration..."
    sudo install -d -m 0755 /etc/nfs.conf.d
        sudo tee "${NFS_CONF_DROPIN}" >/dev/null <<EOF
[nfsd]
vers3=y

[mountd]
port=${NFS_MOUNTD_PORT}

[statd]
port=${NFS_STATD_PORT}
outgoing-port=${NFS_STATD_OUTGOING_PORT}

[lockd]
port=${NFS_LOCKD_PORT}
udp-port=${NFS_LOCKD_UDP_PORT}
EOF
    
    sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-service=rpc-bind
    sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-port=2049/tcp
    for proto in tcp udp; do
        sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-port="${NFS_MOUNTD_PORT}/${proto}"
        sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-port="${NFS_STATD_PORT}/${proto}"
        # Outgoing port is the fixed source for SM_NOTIFY; peers need to reach it.
        sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-port="${NFS_STATD_OUTGOING_PORT}/${proto}"
    done
    sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-port="${NFS_LOCKD_PORT}/tcp"
    sudo firewall-cmd --permanent --zone="${TRUSTED_ZONE}" --add-port="${NFS_LOCKD_UDP_PORT}/udp"
fi

ensure_nfs_server_running

echo "[INFO] Reloading firewall..."
sudo firewall-cmd --reload

echo
echo "[INFO] Firewall status:"
sudo firewall-cmd --zone="${PUBLIC_ZONE}" --list-all
echo
echo "[INFO] MAAS LAN zone (${TRUSTED_ZONE}):"
sudo firewall-cmd --zone="${TRUSTED_ZONE}" --list-all

echo
echo "[INFO] MAAS NAT + firewall configuration completed."
