#!/bin/bash
# Rocky Linux 9 - Anaconda %pre Ephemeral Commissioning + Disk Install Script
#
# This script runs inside the ephemeral Anaconda live environment (booted via
# iPXE/HTTP with inst.sshd). It drives the full unattended lifecycle:
#
#   1. ephemeral boot up        (Anaconda live, this %pre script starts)
#   2. ssh ready                (key-only sshd up and verified listening)
#   3. metadata posted          (async POST stage=ssh-ready to bootstrap server)
#   4. remote install executed  (controller SSHes in and runs the installer,
#                                or AUTO_INSTALL fallback self-triggers it)
#   5. disk installation        (POST stage=installing; Rocky written to disk)
#   6. install completed        (POST stage=completed)
#   7. reboot                   (boot order points at the freshly written disk)
#   8. boot into deployed OS
#
# Variables injected by the kickstart %pre header (kickstart.js):
#   ROOT_PASS, AUTHORIZED_KEYS, ADMIN_USER,
#   BOOTSTRAP_URL, WORKFLOW_ID, SYSTEM_ID, TARGET_HOSTNAME,
#   SSH_PORT, INSTALL_DISK_HINT, AUTO_INSTALL

set +e

SSH_PORT="${SSH_PORT:-22}"
AUTO_INSTALL="${AUTO_INSTALL:-1}"
# Fallback: if no remote install trigger arrives within this window, the
# ephemeral runtime self-installs so a single missed handshake never bricks the
# flow. The controller normally triggers far sooner over SSH.
AUTO_INSTALL_FALLBACK_SECONDS="${AUTO_INSTALL_FALLBACK_SECONDS:-600}"

KS_LOG=/tmp/ks-pre.log
READY_FLAG=/tmp/.underpost-ssh-ready-posted
TRIGGER_FILE=/tmp/.underpost-install-trigger
INSTALL_LOCK=/tmp/.underpost-install-running
INSTALL_DONE=/tmp/.underpost-install-done
INSTALLER=/usr/local/bin/underpost-install.sh
TARGET_MNT=/mnt/sysimage-underpost

log() { echo "$(date): $*" | tee -a "$KS_LOG"; }

# Reference feedback on the physical/serial console. Use printf with \r\n so
# lines render correctly on serial and physical terminals. Best-effort: never
# fails if /dev/console is unavailable.
console_log() { printf "[underpost] %s\r\n" "$*" > /dev/console 2>/dev/null || true; }

# ---------------------------------------------------------------------------
# 1. Root password (emergency console fallback only; SSH stays key-only)
# ---------------------------------------------------------------------------
if [ -n "$ROOT_PASS" ]; then
    echo "root:$ROOT_PASS" | chpasswd 2>/dev/null || \
    echo "$ROOT_PASS" | passwd --stdin root 2>/dev/null || {
        HASH=$(python3 -c "import crypt; print(crypt.crypt('$ROOT_PASS', crypt.mksalt(crypt.METHOD_SHA512)))" 2>/dev/null || \
        openssl passwd -6 "$ROOT_PASS" 2>/dev/null)
        [ -n "$HASH" ] && sed -i "s|^root:[^:]*:|root:$HASH:|" /etc/shadow 2>/dev/null
    }
fi

if [ -n "$AUTHORIZED_KEYS" ]; then
    mkdir -p /root/.ssh && chmod 700 /root/.ssh
    echo "$AUTHORIZED_KEYS" > /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
fi

# ---------------------------------------------------------------------------
# 2. Admin user (parity with previous behavior)
# ---------------------------------------------------------------------------
if command -v useradd >/dev/null 2>&1; then
    useradd -m -G wheel "$ADMIN_USER" 2>/dev/null || true
else
    NEXT_UID=$(awk -F: 'BEGIN{max=999} $3>max && $3<60000{max=$3} END{print max+1}' /etc/passwd 2>/dev/null || echo 1001)
    if ! grep -q "^$ADMIN_USER:" /etc/passwd 2>/dev/null; then
        echo "$ADMIN_USER:x:$NEXT_UID:$NEXT_UID:$ADMIN_USER:/home/$ADMIN_USER:/bin/bash" >> /etc/passwd
        echo "$ADMIN_USER:x:$NEXT_UID:" >> /etc/group 2>/dev/null
        echo "$ADMIN_USER:!:19000:0:99999:7:::" >> /etc/shadow 2>/dev/null
        mkdir -p /home/$ADMIN_USER
    fi
fi

if [ -n "$ADMIN_PASS" ]; then
    echo "$ADMIN_USER:$ADMIN_PASS" | chpasswd 2>/dev/null || \
    echo "$ADMIN_PASS" | passwd --stdin "$ADMIN_USER" 2>/dev/null || {
        HASH=$(python3 -c "import crypt; print(crypt.crypt('$ADMIN_PASS', crypt.mksalt(crypt.METHOD_SHA512)))" 2>/dev/null || \
        openssl passwd -6 "$ADMIN_PASS" 2>/dev/null)
        [ -n "$HASH" ] && sed -i "s|^$ADMIN_USER:[^:]*:|$ADMIN_USER:$HASH:|" /etc/shadow 2>/dev/null
    }
fi

if [ -n "$AUTHORIZED_KEYS" ]; then
    mkdir -p /home/$ADMIN_USER/.ssh && chmod 700 /home/$ADMIN_USER/.ssh
    echo "$AUTHORIZED_KEYS" > /home/$ADMIN_USER/.ssh/authorized_keys
    chmod 600 /home/$ADMIN_USER/.ssh/authorized_keys
    chown -R $ADMIN_USER:$ADMIN_USER /home/$ADMIN_USER/.ssh 2>/dev/null || true
fi

if [ -d /etc/sudoers.d ]; then
    echo "$ADMIN_USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/$ADMIN_USER
    chmod 0440 /etc/sudoers.d/$ADMIN_USER
    elif [ -f /etc/sudoers ]; then
    echo "$ADMIN_USER ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
fi

# ---------------------------------------------------------------------------
# 3. Configure sshd for key-only automation
# ---------------------------------------------------------------------------
log "[sshd] Starting SSH configuration..."

mkdir -p /etc/ssh /root/.ssh /var/lib/anaconda/ssh /run/install/ssh
chmod 755 /etc/ssh
chmod 700 /root/.ssh
chmod 700 /var/lib/anaconda/ssh 2>/dev/null || true
chmod 700 /run/install/ssh 2>/dev/null || true

for KEY_DEST in \
/root/.ssh/authorized_keys \
/var/lib/anaconda/ssh/authorized_keys \
/run/install/ssh/authorized_keys; do
    mkdir -p "$(dirname "$KEY_DEST")"
    chmod 700 "$(dirname "$KEY_DEST")" 2>/dev/null || true
    if [ -n "$AUTHORIZED_KEYS" ]; then
        echo "$AUTHORIZED_KEYS" > "$KEY_DEST"
        chmod 600 "$KEY_DEST"
        chown root:root "$KEY_DEST" 2>/dev/null || true
        log "[sshd] Wrote authorized_keys to $KEY_DEST"
    fi
done

if [ -n "$AUTHORIZED_KEYS" ] && [ -n "$ADMIN_USER" ]; then
    mkdir -p "/home/$ADMIN_USER/.ssh"
    chmod 700 "/home/$ADMIN_USER/.ssh"
    echo "$AUTHORIZED_KEYS" > "/home/$ADMIN_USER/.ssh/authorized_keys"
    chmod 600 "/home/$ADMIN_USER/.ssh/authorized_keys"
    chown -R "$ADMIN_USER:$ADMIN_USER" "/home/$ADMIN_USER/.ssh" 2>/dev/null || true
    log "[sshd] Wrote authorized_keys to /home/$ADMIN_USER/.ssh/authorized_keys"
fi

# Key-only when keys are present; fall back to password auth only if no key was
# injected (so automation is never fully locked out). Root login is permitted
# strictly via authorized keys (prohibit-password) for non-interactive batch
# command execution from the controller.
if [ -n "$AUTHORIZED_KEYS" ]; then
    SSHD_PASSWORD_AUTH="no"
    SSHD_PERMIT_ROOT="prohibit-password"
    SSHD_KBD_INTERACTIVE="no"
    log "[sshd] authorized_keys present -> key-only mode (PasswordAuthentication no, PermitRootLogin prohibit-password)"
else
    SSHD_PASSWORD_AUTH="yes"
    SSHD_PERMIT_ROOT="yes"
    SSHD_KBD_INTERACTIVE="yes"
    log "[sshd] WARNING: no authorized_keys injected -> falling back to password auth"
fi

cat > /etc/ssh/sshd_config << SSHEOF
Port ${SSH_PORT}
Protocol 2
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_ed25519_key
SyslogFacility AUTH
LogLevel INFO
LoginGraceTime 120
PermitRootLogin ${SSHD_PERMIT_ROOT}
StrictModes no
PubkeyAuthentication yes
AuthorizedKeysFile /root/.ssh/authorized_keys /var/lib/anaconda/ssh/authorized_keys /run/install/ssh/authorized_keys .ssh/authorized_keys
IgnoreRhosts yes
HostbasedAuthentication no
PermitEmptyPasswords no
PasswordAuthentication ${SSHD_PASSWORD_AUTH}
ChallengeResponseAuthentication ${SSHD_KBD_INTERACTIVE}
KbdInteractiveAuthentication ${SSHD_KBD_INTERACTIVE}
UsePAM no
X11Forwarding no
PrintMotd no
TCPKeepAlive yes
AcceptEnv LANG LC_*
Subsystem sftp /usr/libexec/openssh/sftp-server
UseDNS no
AllowTcpForwarding yes
ClientAliveInterval 30
ClientAliveCountMax 3
SSHEOF

if [ -d /etc/ssh/sshd_config.d ]; then
    rm -f /etc/ssh/sshd_config.d/*.conf 2>/dev/null || true
fi

log "[sshd] Checking/Generating SSH host keys..."

_generate_host_key() {
    local TYPE=$1
    local FILE=$2
    local BITS=$3

    if [ -f "$FILE" ]; then
        log "[sshd] Host key $FILE already exists, skipping."
        return 0
    fi

    log "[sshd] Generating $TYPE host key: $FILE ..."

    if command -v ssh-keygen >/dev/null 2>&1; then
        ssh-keygen -t "$TYPE" -f "$FILE" -N "" >> "$KS_LOG" 2>&1
        [ -f "$FILE" ] && { log "[sshd] ssh-keygen succeeded for $TYPE"; return 0; }
    fi

    if command -v openssl >/dev/null 2>&1; then
        case "$TYPE" in
            rsa)     openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:${BITS:-2048} -out "$FILE" >> "$KS_LOG" 2>&1 ;;
            ecdsa)   openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 -out "$FILE" >> "$KS_LOG" 2>&1 ;;
            ed25519) openssl genpkey -algorithm ED25519 -out "$FILE" >> "$KS_LOG" 2>&1 ;;
        esac
        openssl pkey -in "$FILE" -pubout > "${FILE}.pub" 2>> "$KS_LOG"
        [ -f "$FILE" ] && { log "[sshd] openssl succeeded for $TYPE"; return 0; }
    fi

    log "[sshd] WARNING: key generation fallback for $TYPE (placeholder)"
    dd if=/dev/urandom bs=1024 count=4 of="$FILE" 2>/dev/null
    echo "placeholder public key" > "${FILE}.pub"
    [ -f "$FILE" ]
}

_generate_host_key rsa /etc/ssh/ssh_host_rsa_key 2048
_generate_host_key ecdsa /etc/ssh/ssh_host_ecdsa_key 256
_generate_host_key ed25519 /etc/ssh/ssh_host_ed25519_key 256

chmod 600 /etc/ssh/ssh_host_*_key 2>/dev/null || true
chmod 644 /etc/ssh/ssh_host_*_key.pub 2>/dev/null || true

log "[sshd] Restarting sshd to apply key-only config..."
if command -v systemctl >/dev/null 2>&1; then
    systemctl restart sshd 2>/dev/null || systemctl restart sshd.service 2>/dev/null || true
fi
if ! pidof sshd >/dev/null 2>&1; then
    SSH_OLD_PID=$(pidof sshd 2>/dev/null | awk '{print $1}')
    [ -n "$SSH_OLD_PID" ] && { kill "$SSH_OLD_PID" 2>/dev/null || true; sleep 1; }
    /usr/sbin/sshd >> "$KS_LOG" 2>&1 || sshd >> "$KS_LOG" 2>&1 || true
fi
pidof sshd >/dev/null 2>&1 && log "[sshd] sshd running (pid: $(pidof sshd))" || log "[sshd] WARNING: sshd not running"

# Disable firewall so the controller can reach sshd / the install can fetch packages.
if command -v systemctl >/dev/null 2>&1; then
    systemctl stop firewalld 2>/dev/null || systemctl stop iptables 2>/dev/null || true
    systemctl disable firewalld 2>/dev/null || systemctl disable iptables 2>/dev/null || true
fi
firewall-cmd --set-default-zone=trusted 2>/dev/null || true
iptables -F 2>/dev/null || true
ip6tables -F 2>/dev/null || true

# ---------------------------------------------------------------------------
# 4. dnf repos (used by the live environment for the installer's package pull)
# ---------------------------------------------------------------------------
mkdir -p /var/lib/rpm /var/cache/dnf /var/log/dnf /etc/yum.repos.d /etc/pki/rpm-gpg /etc/dnf/vars
echo "9" > /etc/dnf/vars/releasever

if ! grep -q "^VERSION_ID=" /etc/os-release 2>/dev/null; then
  cat > /etc/os-release << 'OSREL'
NAME="Rocky Linux"
VERSION="9"
ID="rocky"
ID_LIKE="rhel centos fedora"
VERSION_ID="9"
PLATFORM_ID="platform:el9"
PRETTY_NAME="Rocky Linux 9 (Ephemeral Anaconda)"
ANSI_COLOR="0;32"
HOME_URL="https://rockylinux.org/"
OSREL
fi

[ ! -f /etc/system-release ] && echo "Rocky Linux release 9 (Ephemeral)" > /etc/system-release

REPO_ARCH=$(uname -m)

rpm --import https://dl.rockylinux.org/pub/rocky/RPM-GPG-KEY-Rocky-9 2>/dev/null || \
curl -fsSL https://dl.rockylinux.org/pub/rocky/RPM-GPG-KEY-Rocky-9 -o /etc/pki/rpm-gpg/RPM-GPG-KEY-Rocky-9 2>/dev/null || true

cat > /etc/yum.repos.d/rocky-baseos.repo << REPOEOF
[baseos]
name=Rocky Linux 9 - BaseOS
baseurl=http://dl.rockylinux.org/pub/rocky/9/BaseOS/$REPO_ARCH/os/
gpgcheck=1
enabled=1
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-Rocky-9
       https://dl.rockylinux.org/pub/rocky/RPM-GPG-KEY-Rocky-9
skip_if_unavailable=1
REPOEOF

cat > /etc/yum.repos.d/rocky-appstream.repo << REPOEOF2
[appstream]
name=Rocky Linux 9 - AppStream
baseurl=http://dl.rockylinux.org/pub/rocky/9/AppStream/$REPO_ARCH/os/
gpgcheck=1
enabled=1
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-Rocky-9
       https://dl.rockylinux.org/pub/rocky/RPM-GPG-KEY-Rocky-9
skip_if_unavailable=1
REPOEOF2

# ---------------------------------------------------------------------------
# 5. Bootstrap status POST helper (async, idempotent per stage, retry+backoff)
# ---------------------------------------------------------------------------
detect_ip() {
    local ip=""
    ip=$(ip addr show 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d/ -f1 | head -1)
    [ -z "$ip" ] && ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -z "$ip" ] && ip=$(grep -oP '32 host \K[0-9.]+' /proc/net/fib_trie 2>/dev/null | grep -v '127.0.0.1' | head -1)
    [ -z "$ip" ] && ip="UNKNOWN"
    echo "$ip"
}

detect_mac() {
    local iface
    iface=$(ip -o link show up 2>/dev/null | awk -F': ' '$2!="lo"{print $2; exit}')
    [ -n "$iface" ] && cat "/sys/class/net/$iface/address" 2>/dev/null || echo "UNKNOWN"
}

detect_vendor_model() {
    local vendor product
    vendor=$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null | tr -d '\n')
    product=$(cat /sys/class/dmi/id/product_name 2>/dev/null | tr -d '\n')
    echo "${vendor} ${product}" | sed 's/^ *//;s/ *$//'
}

# Pure-bash HTTP POST over /dev/tcp. Last-resort transport when neither curl nor
# wget is present in the minimal Anaconda %pre environment.
_raw_http_post() {
    local url="$1" body="$2"
    local rest host port path
    rest="${url#http://}"
    path="/${rest#*/}"
    rest="${rest%%/*}"
    host="${rest%%:*}"
    port="${rest##*:}"
    [ "$host" = "$port" ] && port=80
    exec 3<>"/dev/tcp/${host}/${port}" 2>/dev/null || return 1
    printf 'POST %s HTTP/1.0\r\nHost: %s\r\nContent-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' \
        "$path" "$host" "${#body}" "$body" >&3 2>/dev/null || { exec 3>&- 2>/dev/null; return 1; }
    # Read (and discard) the response so the server flushes; ignore failures.
    timeout 8 cat <&3 >/dev/null 2>&1
    exec 3>&- 2>/dev/null
    return 0
}

# post_status <stage> [extra_json_fields]
# Posts a lifecycle event to ${BOOTSTRAP_URL}/status. Tries curl, then wget, then
# a raw /dev/tcp HTTP POST so a missing http client never silently drops events.
# Retries with backoff but never blocks installation forever (capped attempts).
post_status() {
    local stage="$1"; shift
    local extra="$1"
    if [ -z "$BOOTSTRAP_URL" ]; then
        log "[post] BOOTSTRAP_URL unset, skipping stage=$stage"
        return 0
    fi

    local ip mac model ts payload url
    ip=$(detect_ip)
    mac=$(detect_mac)
    model=$(detect_vendor_model)
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    payload="{\"stage\":\"${stage}\",\"workflowId\":\"${WORKFLOW_ID}\",\"hostname\":\"${TARGET_HOSTNAME}\",\"systemId\":\"${SYSTEM_ID}\",\"ip\":\"${ip}\",\"mac\":\"${mac}\",\"sshPort\":${SSH_PORT},\"hardware\":\"${model}\",\"timestamp\":\"${ts}\"${extra:+,${extra}}}"
    url="${BOOTSTRAP_URL%/}/status"

    # Reference feedback on the physical console for every lifecycle stage.
    console_log "stage=${stage} ip=${ip}${extra:+ ${extra}}"

    log "[post] stage=$stage -> $url (curl=$(command -v curl >/dev/null 2>&1 && echo y || echo n) wget=$(command -v wget >/dev/null 2>&1 && echo y || echo n))"
    log "[post] payload=$payload"

    local attempt=1 max=4 delay=3
    while [ "$attempt" -le "$max" ]; do
        if command -v curl >/dev/null 2>&1 && \
            curl -fsS -m 10 -X POST -H 'Content-Type: application/json' -d "$payload" "$url" >> "$KS_LOG" 2>&1; then
            log "[post] stage=$stage delivered via curl (attempt $attempt)"
            return 0
        fi
        if command -v wget >/dev/null 2>&1 && \
            wget -q -T 10 -O - --header='Content-Type: application/json' --post-data="$payload" "$url" >> "$KS_LOG" 2>&1; then
            log "[post] stage=$stage delivered via wget (attempt $attempt)"
            return 0
        fi
        if _raw_http_post "$url" "$payload"; then
            log "[post] stage=$stage delivered via /dev/tcp (attempt $attempt)"
            return 0
        fi
        log "[post] stage=$stage attempt $attempt/$max failed; retrying in ${delay}s"
        sleep "$delay"
        delay=$((delay * 2))
        attempt=$((attempt + 1))
    done
    log "[post] stage=$stage giving up after $max attempts (non-fatal)"
    return 1
}

# Early heartbeat: announce the ephemeral runtime is up and that %pre reached the
# networking/POST stage. If even this never reaches the controller, the problem
# is transport/network — not disk detection or sshd.
post_status "ephemeral-boot" "\"detail\":\"%pre reached network/post stage\""

# ---------------------------------------------------------------------------
# 6. Safe install-disk detection for a real physical machine
# ---------------------------------------------------------------------------
# Rules (deterministic):
#   - honor INSTALL_DISK_HINT if it is a valid block device
#   - only whole disks (TYPE=disk), writable (RO=0), non-removable (RM=0)
#   - skip USB-attached media (TRAN=usb) and zram/loop/ram devices
#   - skip the device backing the live/ephemeral root, if any is disk-backed
#   - among the remaining, prefer internal bus order (nvme > sata/sas) then
#     largest size, and pick the smallest stable /dev/disk/by-id name for it
detect_install_disk() {
    if [ -n "$INSTALL_DISK_HINT" ] && [ -b "$INSTALL_DISK_HINT" ]; then
        echo "$INSTALL_DISK_HINT"
        return 0
    fi

    # Device currently backing the live root filesystem (avoid wiping ourselves).
    local live_src live_disk=""
    live_src=$(findmnt -n -o SOURCE / 2>/dev/null)
    if [ -n "$live_src" ] && [ -b "$live_src" ]; then
        live_disk=$(lsblk -no PKNAME "$live_src" 2>/dev/null | head -1)
        [ -z "$live_disk" ] && live_disk=$(basename "$live_src")
    fi

    # Emit "score name size" per candidate, sort, take the top.
    local best=""
    best=$(lsblk -dn -o NAME,TYPE,SIZE,RM,RO,TRAN -b 2>/dev/null | while read -r name type size rm ro tran; do
        [ "$type" = "disk" ] || continue
        [ "$ro" = "0" ] || continue
        [ "$rm" = "0" ] || continue
        case "$name" in
            loop*|ram*|zram*|sr*|fd*) continue ;;
        esac
        [ "$tran" = "usb" ] && continue
        [ -n "$live_disk" ] && [ "$name" = "$live_disk" ] && continue

        # Bus preference weight (higher = preferred), then size as tiebreaker.
        local weight=0
        case "$tran" in
            nvme) weight=3 ;;
            sata|sas|ata) weight=2 ;;
            *) weight=1 ;;
        esac
        # score = weight * 1e15 + size ; keeps weight dominant, size as tiebreak
        printf '%d %s\n' "$(( weight * 1000000000000000 + ${size:-0} ))" "/dev/$name"
    done | sort -rn | head -1 | awk '{print $2}')

    [ -z "$best" ] && return 1

    # Prefer a stable /dev/disk/by-id symlink for the chosen device.
    local byid
    byid=$(for l in /dev/disk/by-id/*; do
        [ -e "$l" ] || continue
        case "$l" in *-part*) continue ;; esac
        if [ "$(readlink -f "$l")" = "$(readlink -f "$best")" ]; then
            echo "$l"
        fi
    done 2>/dev/null | grep -v '/wwn-' | head -1)

    [ -n "$byid" ] && echo "$byid" || echo "$best"
}

# ---------------------------------------------------------------------------
# 7. Write the unattended installer (run by the controller over SSH, or by the
#    AUTO_INSTALL fallback). It detects the disk, installs Rocky 9, posts
#    completion, and reboots into the deployed OS.
# ---------------------------------------------------------------------------
mkdir -p /usr/local/bin
cat > "$INSTALLER" << INSTALLEOF
#!/bin/bash
# Underpost unattended Rocky Linux 9 installer (runs inside the ephemeral env).
set +e

KS_LOG="$KS_LOG"
INSTALL_LOCK="$INSTALL_LOCK"
INSTALL_DONE="$INSTALL_DONE"
TARGET_MNT="$TARGET_MNT"
AUTHORIZED_KEYS='$AUTHORIZED_KEYS'
ADMIN_USER='$ADMIN_USER'
DEPLOY_USER='$DEPLOY_USER'
TARGET_HOSTNAME='$TARGET_HOSTNAME'
NET_IP='$NET_IP'
NET_PREFIX='$NET_PREFIX'
NET_GATEWAY='$NET_GATEWAY'
NET_DNS='$NET_DNS'
TIMEZONE='$TIMEZONE'
KEYBOARD_LAYOUT='$KEYBOARD_LAYOUT'
CHRONY_CONF_PATH='$CHRONY_CONF_PATH'
# Passwords are carried base64-encoded so any character survives intact. Decoding
# tries base64 then python3 so a minimal environment never yields empty passwords.
ks_b64d() { printf %s "\$1" | base64 -d 2>/dev/null || printf %s "\$1" | python3 -c 'import sys,base64;sys.stdout.buffer.write(base64.b64decode(sys.stdin.read().strip()))' 2>/dev/null; }
ROOT_PASS_B64='$ROOT_PASS_B64'
ADMIN_PASS_B64='$ADMIN_PASS_B64'
DEPLOY_PASS_B64='$DEPLOY_PASS_B64'
ROOT_PASS="\$(ks_b64d "\$ROOT_PASS_B64")"
ADMIN_PASS="\$(ks_b64d "\$ADMIN_PASS_B64")"
DEPLOY_PASS="\$(ks_b64d "\$DEPLOY_PASS_B64")"
[ -z "\$ADMIN_PASS" ] && ADMIN_PASS="\$ROOT_PASS"
[ -z "\$DEPLOY_PASS" ] && DEPLOY_PASS="\$ROOT_PASS"

ilog() {
    echo "\$(date): [install] \$*" | tee -a "\$KS_LOG"
    printf "[underpost-install] %s\r\n" "\$*" > /dev/console 2>/dev/null || true
}

# Prove the installer actually launched (distinguishes "never started" from
# "started and exited early"). Posted before any guard so it always fires once.
ilog "installer process started (pid \$\$)"
post_status "install-start" "\"detail\":\"installer launched\""

# Single-flight guard.
if [ -f "\$INSTALL_LOCK" ]; then
    ilog "installer already running (lock present), exiting"
    exit 0
fi
if [ -f "\$INSTALL_DONE" ]; then
    ilog "install already completed, exiting"
    exit 0
fi
touch "\$INSTALL_LOCK"

post_status "installing" "\"detail\":\"partitioning\""

DISK="\$(detect_install_disk)"
if [ -z "\$DISK" ] || [ ! -b "\$DISK" ]; then
    ilog "FATAL: no valid install disk detected"
    post_status "failed" "\"detail\":\"no install disk detected\""
    rm -f "\$INSTALL_LOCK"
    exit 1
fi
REAL_DISK="\$(readlink -f "\$DISK")"
ilog "Selected install disk: \$DISK (\$REAL_DISK)"
post_status "installing" "\"detail\":\"target \$REAL_DISK\",\"disk\":\"\$REAL_DISK\""

# Detect firmware mode.
if [ -d /sys/firmware/efi ]; then
    FW="uefi"
else
    FW="bios"
fi
ilog "Firmware mode: \$FW"

# Partition naming helper (nvme0n1p1 vs sda1).
part() {
    case "\$REAL_DISK" in
        *[0-9]) echo "\${REAL_DISK}p\$1" ;;
        *) echo "\${REAL_DISK}\$1" ;;
    esac
}

ilog "Wiping and partitioning \$REAL_DISK ..."
umount -R "\$TARGET_MNT" 2>/dev/null || true
swapoff -a 2>/dev/null || true
wipefs -a "\$REAL_DISK" >> "\$KS_LOG" 2>&1
sgdisk --zap-all "\$REAL_DISK" >> "\$KS_LOG" 2>&1 || dd if=/dev/zero of="\$REAL_DISK" bs=1M count=10 2>/dev/null

if [ "\$FW" = "uefi" ]; then
    sgdisk -n 1:0:+600M -t 1:ef00 -c 1:"EFI System" "\$REAL_DISK" >> "\$KS_LOG" 2>&1
    sgdisk -n 2:0:+1024M -t 2:8300 -c 2:"boot" "\$REAL_DISK" >> "\$KS_LOG" 2>&1
    sgdisk -n 3:0:0      -t 3:8300 -c 3:"root" "\$REAL_DISK" >> "\$KS_LOG" 2>&1
    EFI_PART="\$(part 1)"; BOOT_PART="\$(part 2)"; ROOT_PART="\$(part 3)"
else
    sgdisk -n 1:0:+2M    -t 1:ef02 -c 1:"BIOS boot" "\$REAL_DISK" >> "\$KS_LOG" 2>&1
    sgdisk -n 2:0:+1024M -t 2:8300 -c 2:"boot" "\$REAL_DISK" >> "\$KS_LOG" 2>&1
    sgdisk -n 3:0:0      -t 3:8300 -c 3:"root" "\$REAL_DISK" >> "\$KS_LOG" 2>&1
    BOOT_PART="\$(part 2)"; ROOT_PART="\$(part 3)"
fi

partprobe "\$REAL_DISK" >> "\$KS_LOG" 2>&1 || true
udevadm settle 2>/dev/null || sleep 3

ilog "Creating filesystems ..."
[ "\$FW" = "uefi" ] && mkfs.vfat -F32 "\$EFI_PART" >> "\$KS_LOG" 2>&1
mkfs.xfs -f "\$BOOT_PART" >> "\$KS_LOG" 2>&1
mkfs.xfs -f "\$ROOT_PART" >> "\$KS_LOG" 2>&1

ilog "Mounting target ..."
mkdir -p "\$TARGET_MNT"
mount "\$ROOT_PART" "\$TARGET_MNT" || { ilog "FATAL: mount root failed"; post_status "failed" "\"detail\":\"mount root failed\""; rm -f "\$INSTALL_LOCK"; exit 1; }
mkdir -p "\$TARGET_MNT/boot"
mount "\$BOOT_PART" "\$TARGET_MNT/boot"
if [ "\$FW" = "uefi" ]; then
    mkdir -p "\$TARGET_MNT/boot/efi"
    mount "\$EFI_PART" "\$TARGET_MNT/boot/efi"
fi

post_status "installing" "\"detail\":\"installing packages\",\"disk\":\"\$REAL_DISK\""

ilog "Installing base packages with dnf --installroot ..."
PKGS="@core kernel grub2-tools openssh-server NetworkManager chrony dracut-config-generic rocky-release"
if [ "\$FW" = "uefi" ]; then
    PKGS="\$PKGS grub2-efi-x64 shim-x64 efibootmgr"
else
    PKGS="\$PKGS grub2-pc"
fi

dnf -y --installroot="\$TARGET_MNT" --releasever=9 \
    --setopt=install_weak_deps=False --nogpgcheck \
    install \$PKGS >> "\$KS_LOG" 2>&1
DNF_RC=\$?
if [ "\$DNF_RC" -ne 0 ]; then
    ilog "FATAL: dnf install failed (rc=\$DNF_RC)"
    post_status "failed" "\"detail\":\"dnf install rc=\$DNF_RC\""
    rm -f "\$INSTALL_LOCK"
    exit 1
fi

ilog "Generating fstab ..."
ROOT_UUID=\$(blkid -s UUID -o value "\$ROOT_PART")
BOOT_UUID=\$(blkid -s UUID -o value "\$BOOT_PART")
{
    echo "UUID=\$ROOT_UUID / xfs defaults 0 0"
    echo "UUID=\$BOOT_UUID /boot xfs defaults 0 0"
    if [ "\$FW" = "uefi" ]; then
        EFI_UUID=\$(blkid -s UUID -o value "\$EFI_PART")
        echo "UUID=\$EFI_UUID /boot/efi vfat umask=0077,shortname=winnt 0 2"
    fi
} > "\$TARGET_MNT/etc/fstab"

# Bind mounts for chroot.
for d in dev proc sys run; do mount --bind /\$d "\$TARGET_MNT/\$d"; done

ilog "Configuring installed system (hostname, network, ssh, users) ..."
echo "\${TARGET_HOSTNAME:-rocky9}" > "\$TARGET_MNT/etc/hostname"

chroot "\$TARGET_MNT" /bin/bash -s << CHROOTEOF >> "\$KS_LOG" 2>&1
set +e
systemctl enable sshd NetworkManager chronyd 2>/dev/null

# SELinux -> permissive in the DEPLOYED OS. Critical: with SELinux enforcing on
# first boot, files written from this installer chroot (authorized_keys, home
# dirs) carry the wrong security context, so sshd drops sessions ("Connection
# reset by peer") and PAM can block console logins. Permissive ignores contexts
# (no relabel reboot needed) and matches what kubeadm/cluster.js expect.
sed -i 's/^SELINUX=.*/SELINUX=permissive/' /etc/selinux/config 2>/dev/null || true

# Ensure sshd host keys exist so sshd actually starts on first boot.
ssh-keygen -A 2>/dev/null || true

# Disable firewalld so the controller can reach sshd on first boot.
systemctl disable firewalld 2>/dev/null || true
systemctl mask firewalld 2>/dev/null || true

# Static networking bound to the primary wired NIC by MAC so the deployed OS is
# reachable at the same IP the commission used (NetworkManager keyfile).
if [ -n "\${NET_IP}" ]; then
    PRIMARY_IF=\\\$(ls /sys/class/net | grep -E '^(en|eth)' | head -1)
    PRIMARY_MAC=\\\$(cat /sys/class/net/\\\$PRIMARY_IF/address 2>/dev/null)
    mkdir -p /etc/NetworkManager/system-connections
    NMFILE=/etc/NetworkManager/system-connections/underpost.nmconnection
    {
        echo "[connection]"
        echo "id=underpost"
        echo "type=ethernet"
        echo "autoconnect=true"
        echo "autoconnect-priority=999"
        echo "[ethernet]"
        [ -n "\\\$PRIMARY_MAC" ] && echo "mac-address=\\\$PRIMARY_MAC"
        echo "[ipv4]"
        echo "method=manual"
        echo "addresses=\${NET_IP}/\${NET_PREFIX}"
        echo "gateway=\${NET_GATEWAY}"
        echo "dns=\${NET_DNS};"
        echo "[ipv6]"
        echo "method=ignore"
    } > "\\\$NMFILE"
    chmod 600 "\\\$NMFILE"
fi

# Timezone + NTP (chrony) for the deployed OS. Mirrors the Rocky branch of
# src/cli/system.js (rocky.timezone): localtime symlink, /etc/timezone, a chrony
# config with a local + public NTP pool, and chronyd enabled on boot.
if [ -n "\${TIMEZONE}" ]; then
    ln -sf /usr/share/zoneinfo/\${TIMEZONE} /etc/localtime
    echo "\${TIMEZONE}" > /etc/timezone
    timedatectl set-timezone \${TIMEZONE} 2>/dev/null || true
    {
        echo "# Underpost-managed chrony configuration"
        [ -n "\${NET_GATEWAY}" ] && echo "server \${NET_GATEWAY} iburst prefer"
        echo "server 0.pool.ntp.org iburst"
        echo "server 1.pool.ntp.org iburst"
        echo "server 2.pool.ntp.org iburst"
        echo "server 3.pool.ntp.org iburst"
        echo "driftfile /var/lib/chrony/drift"
        echo "makestep 1.0 3"
        echo "rtcsync"
        echo "logdir /var/log/chrony"
    } > "\${CHRONY_CONF_PATH:-/etc/chrony.conf}"
    systemctl enable chronyd 2>/dev/null || true
fi

# Keyboard layout + locale for the deployed OS. Mirrors the Rocky branch of
# src/cli/system.js (rocky.keyboard): vconsole.conf, locale.conf, X11 keymap.
if [ -n "\${KEYBOARD_LAYOUT}" ]; then
    echo "KEYMAP=\${KEYBOARD_LAYOUT}" > /etc/vconsole.conf
    echo "FONT=latarcyrheb-sun16" >> /etc/vconsole.conf
    echo "LANG=en_US.UTF-8" > /etc/locale.conf
    mkdir -p /etc/X11/xorg.conf.d
    {
        echo 'Section "InputClass"'
        echo '    Identifier "system-keyboard"'
        echo '    MatchIsKeyboard "on"'
        echo '    Option "XkbLayout" "\${KEYBOARD_LAYOUT}"'
        echo 'EndSection'
    } > /etc/X11/xorg.conf.d/00-keyboard.conf
    localectl set-keymap \${KEYBOARD_LAYOUT} 2>/dev/null || true
    localectl set-x11-keymap \${KEYBOARD_LAYOUT} 2>/dev/null || true
fi

# Key-only SSH on the installed system.
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/00-underpost.conf <<SSHDEOF
PermitRootLogin prohibit-password
PubkeyAuthentication yes
PasswordAuthentication no
SSHDEOF

# Create the admin login accounts. create_user <name> writes the authorized key,
# wheel membership and passwordless sudo. Passwords are applied after the chroot.
create_user() {
    [ -z "\\\$1" ] && return 0
    id "\\\$1" >/dev/null 2>&1 || useradd -m -G wheel "\\\$1"
    usermod -aG wheel "\\\$1" 2>/dev/null || true
    mkdir -p /home/\\\$1/.ssh && chmod 700 /home/\\\$1/.ssh
    cat > /home/\\\$1/.ssh/authorized_keys <<KEYEOF
\${AUTHORIZED_KEYS}
KEYEOF
    chmod 600 /home/\\\$1/.ssh/authorized_keys
    chown -R "\\\$1:\\\$1" /home/\\\$1/.ssh
    echo "\\\$1 ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/\\\$1
    chmod 0440 /etc/sudoers.d/\\\$1
}

mkdir -p /root/.ssh && chmod 700 /root/.ssh
cat > /root/.ssh/authorized_keys <<KEYEOF3
\${AUTHORIZED_KEYS}
KEYEOF3
chmod 600 /root/.ssh/authorized_keys

create_user "\${ADMIN_USER}"
create_user "\${DEPLOY_USER}"

# Build initramfs for the installed kernel.
KVER=\\\$(ls /lib/modules | head -1)
[ -n "\\\$KVER" ] && dracut -f /boot/initramfs-\\\$KVER.img "\\\$KVER"
CHROOTEOF

# Set console passwords AFTER the chroot heredoc, from decoded installer vars.
# Primary path: pipe 'user:password' into 'chroot chpasswd' (keeps password
# characters out of any heredoc). Fallback: hash with openssl and apply via
# 'usermod -p' so a chpasswd/PAM quirk in the installroot never leaves an
# account locked. Verifies the shadow field is a real hash afterwards.
set_password() {
    local u="\$1" p="\$2"
    [ -z "\$u" ] || [ -z "\$p" ] && return 0
    printf '%s:%s\n' "\$u" "\$p" | chroot "\$TARGET_MNT" chpasswd 2>>"\$KS_LOG"
    local field
    field=\$(chroot "\$TARGET_MNT" getent shadow "\$u" 2>/dev/null | cut -d: -f2)
    case "\$field" in
        '\$'*) ilog "\$u password set (chpasswd)"; return 0 ;;
    esac
    local hash
    hash=\$(printf %s "\$p" | openssl passwd -6 -stdin 2>/dev/null)
    if [ -n "\$hash" ]; then
        chroot "\$TARGET_MNT" usermod -p "\$hash" "\$u" 2>>"\$KS_LOG" && ilog "\$u password set (openssl hash fallback)"
    else
        ilog "WARNING: failed to set password for \$u"
    fi
}
set_password root "\$ROOT_PASS"
set_password "\$ADMIN_USER" "\$ADMIN_PASS"
set_password "\$DEPLOY_USER" "\$DEPLOY_PASS"

post_status "installing" "\"detail\":\"installing bootloader\",\"disk\":\"\$REAL_DISK\""

ilog "Installing bootloader (\$FW) on \$REAL_DISK ..."
if [ "\$FW" = "uefi" ]; then
    chroot "\$TARGET_MNT" grub2-mkconfig -o /boot/grub2/grub.cfg >> "\$KS_LOG" 2>&1
    chroot "\$TARGET_MNT" mkdir -p /boot/efi/EFI/rocky
    chroot "\$TARGET_MNT" grub2-mkconfig -o /boot/efi/EFI/rocky/grub.cfg >> "\$KS_LOG" 2>&1
    # Drop any stale Rocky Linux UEFI entries to avoid duplicates.
    for b in \$(chroot "\$TARGET_MNT" efibootmgr 2>/dev/null | awk '/Rocky Linux/{print substr(\$1,5,4)}'); do
        chroot "\$TARGET_MNT" efibootmgr -b "\$b" -B >> "\$KS_LOG" 2>&1
    done
    # Create the boot entry (also prepends it to BootOrder).
    chroot "\$TARGET_MNT" efibootmgr -c -d "\$REAL_DISK" -p 1 -L "Rocky Linux" -l "\\\\EFI\\\\rocky\\\\shimx64.efi" >> "\$KS_LOG" 2>&1
    BOOT_RC=\$?
    # Set BootNext so the immediate post-install reboot boots the DISK, not the
    # USB iPXE installer — this overrides a USB-first firmware order for one boot,
    # so no manual BIOS change is needed to land in the freshly installed OS.
    NEW_BOOT=\$(chroot "\$TARGET_MNT" efibootmgr 2>/dev/null | awk '/Rocky Linux/{print substr(\$1,5,4); exit}')
    if [ -n "\$NEW_BOOT" ]; then
        chroot "\$TARGET_MNT" efibootmgr -n "\$NEW_BOOT" >> "\$KS_LOG" 2>&1
        ilog "Set UEFI BootNext=\$NEW_BOOT (Rocky Linux on \$REAL_DISK); remove USB after this boot to stay on disk"
    fi
else
    chroot "\$TARGET_MNT" /bin/bash -c "grub2-install --target=i386-pc \$REAL_DISK && \
        grub2-mkconfig -o /boot/grub2/grub.cfg" >> "\$KS_LOG" 2>&1
    BOOT_RC=\$?
fi

# Teardown mounts.
for d in dev proc sys run; do umount -l "\$TARGET_MNT/\$d" 2>/dev/null; done
umount -R "\$TARGET_MNT" 2>/dev/null || true

if [ "\$BOOT_RC" -ne 0 ]; then
    ilog "FATAL: bootloader install failed (rc=\$BOOT_RC)"
    post_status "failed" "\"detail\":\"bootloader rc=\$BOOT_RC\""
    rm -f "\$INSTALL_LOCK"
    exit 1
fi

touch "\$INSTALL_DONE"
ilog "Install completed on \$REAL_DISK. Rebooting into deployed OS (BootNext set to disk)."
ilog "If it boots the USB again, remove the USB stick now — the OS is on \$REAL_DISK."
ilog "Console login: 'root', '\${ADMIN_USER}'\$([ -n "\$DEPLOY_USER" ] && echo " or '\$DEPLOY_USER'") (password \$([ -n "\$ROOT_PASS" ] && echo set || echo NOT-set)). SSH is key-only at \${NET_IP:-dhcp}."
post_status "completed" "\"detail\":\"install ok, rebooting into disk\",\"disk\":\"\$REAL_DISK\",\"loginUser\":\"\${ADMIN_USER}\",\"deployUser\":\"\${DEPLOY_USER}\",\"passwordSet\":\$([ -n "\$ROOT_PASS" ] && echo true || echo false),\"staticIp\":\"\${NET_IP}\",\"bootNext\":\"\${NEW_BOOT:-}\""
rm -f "\$INSTALL_LOCK"
sync
sleep 3
reboot -f || systemctl reboot || echo b > /proc/sysrq-trigger
INSTALLEOF
chmod +x "$INSTALLER"
log "[install] Wrote unattended installer to $INSTALLER"

# Export helpers used by the installer (it sources nothing; functions are
# re-declared above). The installer relies on post_status/detect_install_disk
# being defined in its own process, so embed minimal copies inline.
# To keep one source of truth, re-export them via a sourced fragment.
cat > /usr/local/bin/underpost-install-helpers.sh << HELPEREOF
$(declare -f log)
$(declare -f console_log)
$(declare -f detect_ip)
$(declare -f detect_mac)
$(declare -f detect_vendor_model)
$(declare -f post_status)
$(declare -f detect_install_disk)
BOOTSTRAP_URL='$BOOTSTRAP_URL'
WORKFLOW_ID='$WORKFLOW_ID'
SYSTEM_ID='$SYSTEM_ID'
TARGET_HOSTNAME='$TARGET_HOSTNAME'
SSH_PORT='$SSH_PORT'
INSTALL_DISK_HINT='$INSTALL_DISK_HINT'
HELPEREOF
# Prepend a source of the helpers into the installer so its post_status /
# detect_install_disk calls resolve.
sed -i "2i source /usr/local/bin/underpost-install-helpers.sh" "$INSTALLER"

# ---------------------------------------------------------------------------
# 8. Physical console banner + SSH-ready handshake
# ---------------------------------------------------------------------------
DETECTED_IP=$(detect_ip)

echo ""
echo "=============================================="
echo "Underpost: Ephemeral SSHD Setup Complete"
echo "=============================================="
echo "Root login:  root (key-only: $([ -n "$AUTHORIZED_KEYS" ] && echo yes || echo no))"
echo "Admin user:  $ADMIN_USER"
echo "SSH keys:    $([ -n "$AUTHORIZED_KEYS" ] && echo 'configured' || echo 'NOT configured')"
echo "sshd status: $(pidof sshd >/dev/null 2>&1 && echo "running (pid $(pidof sshd))" || echo 'NOT running')"
echo "IP address:  $DETECTED_IP"
echo "Installer:   $INSTALLER"
echo "=============================================="

{
    printf "\r\n"
    printf "██╗░░░██╗███╗░░██╗██████╗░███████╗██████╗░██████╗░░█████╗░░██████╗████████╗\r\n"
    printf "██║░░░██║████╗░██║██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔════╝╚══██╔══╝\r\n"
    printf "██║░░░██║██╔██╗██║██║░░██║█████╗░░██████╔╝██████╔╝██║░░██║╚█████╗░░░░██║░░░\r\n"
    printf "██║░░░██║██║╚████║██║░░██║██╔══╝░░██╔══██╗██╔═══╝░██║░░██║░╚═══██╗░░░██║░░░\r\n"
    printf "╚██████╔╝██║░╚███║██████╔╝███████╗██║░░██║██║░░░░░╚█████╔╝██████╔╝░░░██║░░░\r\n"
    printf "░╚═════╝░╚═╝░░╚══╝╚═════╝░╚══════╝╚═╝░░╚═╝╚═╝░░░░░░╚════╝░╚═════╝░░░░╚═╝░░░\r\n"
    printf "==============================================\r\n"
    printf " Underpost Network Ephemeral Commissioning Active\r\n"
    printf "==============================================\r\n"
    printf " SSH as: root@%s -p %s (key-only)\r\n" "$DETECTED_IP" "$SSH_PORT"
    printf " Stage:  awaiting remote install trigger\r\n"
    printf " Disk:   auto-detect (hint: %s)\r\n" "${INSTALL_DISK_HINT:-none}"
    printf "==============================================\r\n"
    printf "\r\n"
} > /dev/console 2>/dev/null || true

# Best-effort check that sshd is accepting connections on the configured port.
# Reported as metadata in the ssh-ready event but does NOT gate the POST: the
# controller needs the announcement regardless, and inst.sshd may name/track the
# daemon in ways pidof misses.
ssh_is_ready() {
    if command -v ss >/dev/null 2>&1; then
        ss -lnt 2>/dev/null | grep -q ":${SSH_PORT} " && return 0
    fi
    if command -v netstat >/dev/null 2>&1; then
        netstat -lnt 2>/dev/null | grep -q ":${SSH_PORT} " && return 0
    fi
    timeout 3 bash -c "</dev/tcp/127.0.0.1/${SSH_PORT}" >/dev/null 2>&1
}

# Give sshd a brief window to come up, but never block the announcement.
for _ in $(seq 1 15); do
    ssh_is_ready && break
    sleep 2
done

SSHD_LISTENING=$(ssh_is_ready && echo true || echo false)
SSHD_PID=$(pidof sshd 2>/dev/null | awk '{print $1}')
log "[ready] sshd_listening=${SSHD_LISTENING} sshd_pid=${SSHD_PID:-none} port=${SSH_PORT}"

# Idempotent: only POST ssh-ready once per boot/session. Posted unconditionally
# (best effort) so a strict readiness probe never swallows the handshake.
if [ ! -f "$READY_FLAG" ]; then
    if post_status "ssh-ready" "\"detail\":\"ephemeral runtime ready\",\"sshdListening\":${SSHD_LISTENING},\"sshdPid\":\"${SSHD_PID:-}\",\"installer\":\"${INSTALLER}\""; then
        touch "$READY_FLAG"
        log "[ready] ssh-ready handshake posted"
    else
        log "[ready] ssh-ready POST failed; will retry in lifecycle loop"
    fi
fi

# ---------------------------------------------------------------------------
# 9. Lifecycle wait loop
#    - keep sshd alive (inst.sshd watchdog should also handle this)
#    - run the installer when the controller drops a trigger file over SSH,
#      e.g.  ssh root@host 'touch /tmp/.underpost-install-trigger'
#      or directly:  ssh root@host '/usr/local/bin/underpost-install.sh'
#    - AUTO_INSTALL fallback self-triggers after AUTO_INSTALL_FALLBACK_SECONDS
# ---------------------------------------------------------------------------
INSTALL_LOG=/tmp/underpost-install.log
LAUNCHED_FLAG=/tmp/.underpost-install-launched

# Launch the installer fully detached from this loop process via setsid + closed
# stdio, so it keeps running independently of any sshd session or signal. Guarded
# by LAUNCHED_FLAG so trigger + fallback never double-launch.
launch_installer() {
    [ -f "$LAUNCHED_FLAG" ] && return 0
    touch "$LAUNCHED_FLAG"
    log "[loop] launching installer ($INSTALLER), log -> $INSTALL_LOG"
    console_log "remote command received: starting disk install ($INSTALLER)"
    if command -v setsid >/dev/null 2>&1; then
        setsid bash "$INSTALLER" >> "$INSTALL_LOG" 2>&1 < /dev/null &
    else
        nohup bash "$INSTALLER" >> "$INSTALL_LOG" 2>&1 < /dev/null &
    fi
}

START_TS=$(date +%s)
LOOP_N=0
while true; do
    [ -f "$INSTALL_DONE" ] && { log "[loop] install done; idle"; sleep 60; continue; }

    LOOP_N=$((LOOP_N + 1))

    # Keep retrying the ssh-ready handshake until it is acknowledged so a flaky
    # first POST never strands the controller.
    if [ ! -f "$READY_FLAG" ]; then
        if post_status "ssh-ready" "\"detail\":\"retry from lifecycle loop\",\"installer\":\"${INSTALLER}\""; then
            touch "$READY_FLAG"
            log "[loop] ssh-ready handshake posted (retry)"
        fi
    fi

    # Periodic heartbeat so the controller log shows the runtime is alive while
    # it waits for a trigger.
    if [ "$((LOOP_N % 4))" -eq 0 ]; then
        post_status "heartbeat" "\"detail\":\"awaiting install trigger\",\"uptimeSec\":$(( $(date +%s) - START_TS ))" >/dev/null 2>&1 || true
    fi

    if ! pidof sshd >/dev/null 2>&1; then
        log "[loop] sshd not running, restarting..."
        /usr/sbin/sshd 2>/dev/null || sshd 2>/dev/null
    fi

    if [ -f "$TRIGGER_FILE" ] && [ ! -f "$INSTALL_DONE" ]; then
        log "[loop] install trigger detected"
        console_log "ssh install trigger detected"
        rm -f "$TRIGGER_FILE"
        launch_installer
    fi

    if [ "$AUTO_INSTALL" = "1" ] && [ ! -f "$LAUNCHED_FLAG" ] && [ ! -f "$INSTALL_DONE" ]; then
        NOW=$(date +%s)
        if [ "$((NOW - START_TS))" -ge "$AUTO_INSTALL_FALLBACK_SECONDS" ]; then
            log "[loop] AUTO_INSTALL fallback timeout reached; self-triggering installer"
            launch_installer
        fi
    fi

    sleep 15
done
