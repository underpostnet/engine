#!/bin/bash
# Rocky Linux 9 - Anaconda %pre Ephemeral Commissioning Script
# Variables ROOT_PASS, AUTHORIZED_KEYS, ADMIN_USER must be set before this script runs.

set +e

# 1. Set root password
if [ -n "$ROOT_PASS" ]; then
    echo "root:$ROOT_PASS" | chpasswd 2>/dev/null || \
    echo "$ROOT_PASS" | passwd --stdin root 2>/dev/null || {
        HASH=$(python3 -c "import crypt; print(crypt.crypt('$ROOT_PASS', crypt.mksalt(crypt.METHOD_SHA512)))" 2>/dev/null || \
        openssl passwd -6 "$ROOT_PASS" 2>/dev/null)
        [ -n "$HASH" ] && sed -i "s|^root:[^:]*:|root:$HASH:|" /etc/shadow 2>/dev/null
    }
fi

# 2. SSH authorized_keys for root
if [ -n "$AUTHORIZED_KEYS" ]; then
    mkdir -p /root/.ssh && chmod 700 /root/.ssh
    echo "$AUTHORIZED_KEYS" > /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
fi

# 3. Create admin user
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

if [ -n "$ROOT_PASS" ]; then
    echo "$ADMIN_USER:$ROOT_PASS" | chpasswd 2>/dev/null || \
    echo "$ROOT_PASS" | passwd --stdin "$ADMIN_USER" 2>/dev/null || {
        HASH=$(python3 -c "import crypt; print(crypt.crypt('$ROOT_PASS', crypt.mksalt(crypt.METHOD_SHA512)))" 2>/dev/null || \
        openssl passwd -6 "$ROOT_PASS" 2>/dev/null)
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

# 4. Configure sshd for Anaconda inst.sshd compatibility
# In Anaconda's live environment, 'inst.sshd' runs its own SSH daemon.
# Rocky 9's inst.sshd uses PAM and may ignore /etc/ssh/sshd_config.
# We must:
#   a) Write authorized_keys to ALL possible inst.sshd lookup paths
#   b) Write a clean sshd_config that BYPASSES PAM (UsePAM no)
#   c) Restart sshd to pick up new config and authorized_keys
#   d) Disable firewall
echo "$(date): [sshd] Starting SSH configuration..." | tee -a /tmp/ks-pre.log

mkdir -p /etc/ssh /root/.ssh /var/lib/anaconda/ssh /run/install/ssh
chmod 755 /etc/ssh
chmod 700 /root/.ssh
chmod 700 /var/lib/anaconda/ssh 2>/dev/null || true
chmod 700 /run/install/ssh 2>/dev/null || true

# Copy authorized_keys to ALL known inst.sshd lookup paths
# inst.sshd in Anaconda may check multiple locations:
#   1. /root/.ssh/authorized_keys (standard OpenSSH)
#   2. /var/lib/anaconda/ssh/authorized_keys (Anaconda inst.sshd)
#   3. /run/install/ssh/authorized_keys (Anaconda runtime path)
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
        echo "$(date): [sshd] Wrote authorized_keys to $KEY_DEST" | tee -a /tmp/ks-pre.log
    fi
done

# Also copy to maas user's home
if [ -n "$AUTHORIZED_KEYS" ] && [ -n "$ADMIN_USER" ]; then
    mkdir -p "/home/$ADMIN_USER/.ssh"
    chmod 700 "/home/$ADMIN_USER/.ssh"
    echo "$AUTHORIZED_KEYS" > "/home/$ADMIN_USER/.ssh/authorized_keys"
    chmod 600 "/home/$ADMIN_USER/.ssh/authorized_keys"
    chown -R "$ADMIN_USER:$ADMIN_USER" "/home/$ADMIN_USER/.ssh" 2>/dev/null || true
    echo "$(date): [sshd] Wrote authorized_keys to /home/$ADMIN_USER/.ssh/authorized_keys" | tee -a /tmp/ks-pre.log
fi

# Write a CLEAN sshd_config that bypasses PAM entirely
# inst.sshd in Rocky 9 may use PAM which can block pubkey auth
cat > /etc/ssh/sshd_config << 'SSHEOF'
Port 22
Protocol 2
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_ed25519_key
UsePrivilegeSeparation no
KeyRegenerationInterval 3600
ServerKeyBits 1024
SyslogFacility AUTH
LogLevel INFO
LoginGraceTime 120
PermitRootLogin yes
StrictModes no
RSAAuthentication yes
PubkeyAuthentication yes
AuthorizedKeysFile /root/.ssh/authorized_keys /var/lib/anaconda/ssh/authorized_keys /run/install/ssh/authorized_keys .ssh/authorized_keys
IgnoreRhosts yes
RhostsRSAAuthentication no
HostbasedAuthentication no
PermitEmptyPasswords no
PasswordAuthentication yes
ChallengeResponseAuthentication yes
KbdInteractiveAuthentication yes
UsePAM no
X11Forwarding yes
X11DisplayOffset 10
PrintMotd no
PrintLastLog yes
TCPKeepAlive yes
AcceptEnv LANG LC_*
Subsystem sftp /usr/libexec/openssh/sftp-server
UseDNS no
AllowTcpForwarding yes
GatewayPorts no
ClientAliveInterval 30
ClientAliveCountMax 3
SSHEOF

# Remove any conflicting configs in sshd_config.d
if [ -d /etc/ssh/sshd_config.d ]; then
    rm -f /etc/ssh/sshd_config.d/00-underpost.conf 2>/dev/null || true
    rm -f /etc/ssh/sshd_config.d/*.conf 2>/dev/null || true
fi

# Generate SSH host keys if missing
# Try ssh-keygen first, then fallback to openssl, then dd+openssl
echo "$(date): [sshd] Checking/Generating SSH host keys..." | tee -a /tmp/ks-pre.log

_generate_host_key() {
    local TYPE=$1
    local FILE=$2
    local BITS=$3
    
    if [ -f "$FILE" ]; then
        echo "$(date): [sshd] Host key $FILE already exists, skipping." | tee -a /tmp/ks-pre.log
        return 0
    fi
    
    echo "$(date): [sshd] Generating $TYPE host key: $FILE ..." | tee -a /tmp/ks-pre.log
    
    # Method 1: ssh-keygen
    if command -v ssh-keygen >/dev/null 2>&1; then
        echo "$(date): [sshd] Trying ssh-keygen for $TYPE..." | tee -a /tmp/ks-pre.log
        ssh-keygen -t "$TYPE" -f "$FILE" -N "" >> /tmp/ks-pre.log 2>&1
        if [ -f "$FILE" ]; then
            echo "$(date): [sshd] ssh-keygen succeeded for $TYPE" | tee -a /tmp/ks-pre.log
            return 0
        fi
    else
        echo "$(date): [sshd] ssh-keygen not available" | tee -a /tmp/ks-pre.log
    fi
    
    # Method 2: openssl
    if command -v openssl >/dev/null 2>&1; then
        echo "$(date): [sshd] Trying openssl for $TYPE..." | tee -a /tmp/ks-pre.log
        case "$TYPE" in
            rsa)
                openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:${BITS:-2048} -out "$FILE" >> /tmp/ks-pre.log 2>&1
                openssl pkey -in "$FILE" -pubout > "${FILE}.pub" >> /tmp/ks-pre.log 2>&1
            ;;
            ecdsa)
                openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 -out "$FILE" >> /tmp/ks-pre.log 2>&1
                openssl pkey -in "$FILE" -pubout > "${FILE}.pub" >> /tmp/ks-pre.log 2>&1
            ;;
            ed25519)
                openssl genpkey -algorithm ED25519 -out "$FILE" >> /tmp/ks-pre.log 2>&1
                openssl pkey -in "$FILE" -pubout > "${FILE}.pub" >> /tmp/ks-pre.log 2>&1
            ;;
        esac
        if [ -f "$FILE" ]; then
            echo "$(date): [sshd] openssl succeeded for $TYPE" | tee -a /tmp/ks-pre.log
            return 0
        fi
    fi
    
    # Method 3: dd + openssl (last resort - creates minimal dummy key)
    echo "$(date): [sshd] WARNING: All key generation methods failed for $TYPE!" | tee -a /tmp/ks-pre.log
    echo "$(date): [sshd] Creating dummy placeholder key for $TYPE..." | tee -a /tmp/ks-pre.log
    dd if=/dev/urandom bs=1024 count=4 of="$FILE" 2>/dev/null
    echo "placeholder public key" > "${FILE}.pub"
    
    if [ -f "$FILE" ]; then
        echo "$(date): [sshd] Placeholder key created for $TYPE" | tee -a /tmp/ks-pre.log
        return 0
    fi
    
    echo "$(date): [sshd] FAILED to create any key for $TYPE!" | tee -a /tmp/ks-pre.log
    return 1
}

_generate_host_key rsa /etc/ssh/ssh_host_rsa_key 2048
_generate_host_key ecdsa /etc/ssh/ssh_host_ecdsa_key 256
_generate_host_key ed25519 /etc/ssh/ssh_host_ed25519_key 256

# Ensure proper permissions on host keys
chmod 600 /etc/ssh/ssh_host_*_key 2>/dev/null || true
chmod 644 /etc/ssh/ssh_host_*_key.pub 2>/dev/null || true

# Verify keys exist
echo "$(date): [sshd] Verifying host keys:" | tee -a /tmp/ks-pre.log
ls -la /etc/ssh/ssh_host_* >> /tmp/ks-pre.log 2>&1

# Restart sshd to pick up new authorized_keys files.
# The inst.sshd watchdog will restart it if it dies, but SIGHUP does NOT
# cause re-reading of authorized_keys files — only sshd_config changes.
# A full restart is required.
echo "$(date): [sshd] Restarting sshd to pick up new authorized_keys..." | tee -a /tmp/ks-pre.log

# Method 1: systemctl restart (inst.sshd watchdog will restart it clean)
if command -v systemctl >/dev/null 2>&1; then
    echo "$(date): [sshd] Attempting systemctl restart..." | tee -a /tmp/ks-pre.log
    systemctl restart sshd 2>/dev/null || systemctl restart sshd.service 2>/dev/null || true
fi

# Check if running after systemctl restart
if pidof sshd >/dev/null 2>&1; then
    echo "$(date): [sshd] sshd running after restart (pid: $(pidof sshd))" | tee -a /tmp/ks-pre.log
else
    echo "$(date): [sshd] systemctl restart failed, killing and starting manually..." | tee -a /tmp/ks-pre.log
    # Kill existing sshd (watchdog will try to restart, but we also start manually)
    SSH_OLD_PID=$(pidof sshd 2>/dev/null | awk '{print $1}')
    if [ -n "$SSH_OLD_PID" ]; then
        kill "$SSH_OLD_PID" 2>/dev/null || true
        sleep 1
    fi
    # Start sshd manually
    /usr/sbin/sshd >> /tmp/ks-pre.log 2>&1 || sshd >> /tmp/ks-pre.log 2>&1 || true
    if pidof sshd >/dev/null 2>&1; then
        echo "$(date): [sshd] sshd started manually (pid: $(pidof sshd))" | tee -a /tmp/ks-pre.log
    else
        echo "$(date): [sshd] WARNING: sshd not running after restart attempt" | tee -a /tmp/ks-pre.log
    fi
fi

# Also disable firewall which might block SSH in Anaconda environment
echo "$(date): [sshd] Disabling firewall to ensure SSH access..." | tee -a /tmp/ks-pre.log
if command -v systemctl >/dev/null 2>&1; then
    systemctl stop firewalld 2>/dev/null || systemctl stop iptables 2>/dev/null || true
    systemctl disable firewalld 2>/dev/null || systemctl disable iptables 2>/dev/null || true
fi
# Also stop via direct commands
firewall-cmd --set-default-zone=trusted 2>/dev/null || true
iptables -F 2>/dev/null || true
ip6tables -F 2>/dev/null || true

echo "$(date): [sshd] SSH configuration complete. sshd running: $(pidof sshd >/dev/null 2>&1 && echo 'YES' || echo 'NO')" | tee -a /tmp/ks-pre.log

# 5. Initialize rpmdb and dnf repos
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

rpm --initdb 2>/dev/null || rpmdb --initdb 2>/dev/null || {
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import sqlite3, os
db_path = '/var/lib/rpm/rpmdb.sqlite'
if not os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute('CREATE TABLE IF NOT EXISTS Packages (key BLOB NOT NULL, data BLOB NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS Name (key BLOB NOT NULL, data BLOB NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS Basenames (key BLOB NOT NULL, data BLOB NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS Installtid (key BLOB NOT NULL, data BLOB NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS Providename (key BLOB NOT NULL, data BLOB NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS Requirename (key BLOB NOT NULL, data BLOB NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS Dirnames (key BLOB NOT NULL, data BLOB NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS Sha1header (key BLOB NOT NULL, data BLOB NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS Sigmd5 (key BLOB NOT NULL, data BLOB NOT NULL)')
    conn.commit()
    conn.close()
        " 2>/dev/null
    fi
}
chmod -R 755 /var/lib/rpm 2>/dev/null

REPO_ARCH=$(uname -m)

rpm --import https://dl.rockylinux.org/pub/rocky/RPM-GPG-KEY-Rocky-9 2>/dev/null || \
curl -fsSL https://dl.rockylinux.org/pub/rocky/RPM-GPG-KEY-Rocky-9 -o /etc/pki/rpm-gpg/RPM-GPG-KEY-Rocky-9 2>/dev/null || true

cat > /etc/dnf/dnf.conf << 'DNFCONF'
[main]
gpgcheck=1
installonly_limit=3
clean_requirements_on_remove=True
best=True
skip_if_unavailable=True
install_weak_deps=False
tsflags=nodocs
DNFCONF

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

cat > /etc/yum.repos.d/rocky-extras.repo << REPOEOF3
[extras]
name=Rocky Linux 9 - Extras
baseurl=http://dl.rockylinux.org/pub/rocky/9/extras/$REPO_ARCH/os/
gpgcheck=1
enabled=1
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-Rocky-9
       https://dl.rockylinux.org/pub/rocky/RPM-GPG-KEY-Rocky-9
skip_if_unavailable=1
REPOEOF3

cat > /etc/yum.repos.d/rocky-crb.repo << REPOEOF4
[crb]
name=Rocky Linux 9 - CRB
baseurl=http://dl.rockylinux.org/pub/rocky/9/CRB/$REPO_ARCH/os/
gpgcheck=1
enabled=0
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-Rocky-9
       https://dl.rockylinux.org/pub/rocky/RPM-GPG-KEY-Rocky-9
skip_if_unavailable=1
REPOEOF4

cat > /etc/yum.repos.d/epel.repo << REPOEOF5
[epel]
name=Extra Packages for Enterprise Linux 9
metalink=https://mirrors.fedoraproject.org/metalink?repo=epel-9&arch=$REPO_ARCH
gpgcheck=1
enabled=1
gpgkey=https://dl.fedoraproject.org/pub/epel/RPM-GPG-KEY-EPEL-9
skip_if_unavailable=1
REPOEOF5

rpm --import https://dl.fedoraproject.org/pub/epel/RPM-GPG-KEY-EPEL-9 2>/dev/null || \
curl -fsSL https://dl.fedoraproject.org/pub/epel/RPM-GPG-KEY-EPEL-9 -o /etc/pki/rpm-gpg/RPM-GPG-KEY-EPEL-9 2>/dev/null || true

dnf makecache --releasever=9 --quiet 2>/dev/null || dnf makecache --releasever=9 2>/dev/null || true

# Install sudo
if ! command -v sudo >/dev/null 2>&1; then
    dnf install -y --releasever=9 --nogpgcheck sudo 2>/dev/null || \
    dnf install -y --releasever=9 --nogpgcheck --disableplugin='*' sudo 2>/dev/null || true
fi

if command -v sudo >/dev/null 2>&1; then
    mkdir -p /etc/sudoers.d
    echo "$ADMIN_USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/$ADMIN_USER
    chmod 0440 /etc/sudoers.d/$ADMIN_USER
fi

cat > /home/$ADMIN_USER/.bash_profile 2>/dev/null << PROFILEEOF
if ! command -v sudo >/dev/null 2>&1; then
  echo ""
  echo "NOTE: sudo is not available. Use 'su -' to switch to root."
  echo ""
fi
PROFILEEOF
chown $ADMIN_USER:$ADMIN_USER /home/$ADMIN_USER/.bash_profile 2>/dev/null || true

# NOTE: SSH is already configured in section 4 above with proper host key
# generation, authorized_keys written to all paths, config patching, and
# firewall disabling. The infinite loop below will monitor sshd and restart
# it if it crashes (the inst.sshd watchdog should also handle this).

# 6. Status report with real DHCP-assigned IP detection
# In Anaconda's minimal environment, 'ip -4 addr show' may not work.
# Use multiple fallback methods to detect the real IP address.
DETECTED_IP=""

# Method 1: ip addr show (most reliable in Anaconda)
if [ -z "$DETECTED_IP" ]; then
    DETECTED_IP=$(ip addr show 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d/ -f1 | head -1)
fi

# Method 2: hostname -I (shows all IPs)
if [ -z "$DETECTED_IP" ]; then
    DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

# Method 3: /proc/net/fib_trie (kernel routing table)
if [ -z "$DETECTED_IP" ]; then
    DETECTED_IP=$(grep -oP '32 host \K[0-9.]+' /proc/net/fib_trie 2>/dev/null | grep -v '127.0.0.1' | head -1)
fi

# Method 4: ifconfig (legacy)
if [ -z "$DETECTED_IP" ]; then
    DETECTED_IP=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)
fi

# Method 5: Parse DHCP lease file
if [ -z "$DETECTED_IP" ]; then
    DETECTED_IP=$(grep -oP 'dhcp-server-identifier \K[0-9.]+' /var/lib/dhclient/dhclient*.leases 2>/dev/null | head -1)
fi

# Fallback
if [ -z "$DETECTED_IP" ]; then
    DETECTED_IP="UNKNOWN"
fi

echo ""
echo "=============================================="
echo "Underpost: Ephemeral SSHD Setup Complete"
echo "=============================================="
echo "Root login:  root / (password set: $([ -n "$ROOT_PASS" ] && echo 'yes' || echo 'no'))"
echo "Admin user:  $ADMIN_USER / (password set: $([ -n "$ROOT_PASS" ] && echo 'yes' || echo 'no'))"
echo "SSH keys:    $([ -n "$AUTHORIZED_KEYS" ] && echo 'configured' || echo 'NOT configured')"
echo "sshd status: $(pidof sshd >/dev/null 2>&1 && echo "running (pid $(pidof sshd))" || echo 'NOT running')"
echo "sudo:        $(command -v sudo >/dev/null 2>&1 && echo 'installed' || echo 'NOT available (use su -)')"
echo "IP address:  $DETECTED_IP"
echo "=============================================="

# Physical console display (printf with \r\n for proper line breaks on serial/physical consoles)
{
    printf "\r\n"
    printf "██╗░░░██╗███╗░░██╗██████╗░███████╗██████╗░██████╗░░█████╗░░██████╗████████╗\r\n"
    printf "██║░░░██║████╗░██║██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔════╝╚══██╔══╝\r\n"
    printf "██║░░░██║██╔██╗██║██║░░██║█████╗░░██████╔╝██████╔╝██║░░██║╚█████╗░░░░██║░░░\r\n"
    printf "██║░░░██║██║╚████║██║░░██║██╔══╝░░██╔══██╗██╔═══╝░██║░░██║░╚═══██╗░░░██║░░░\r\n"
    printf "╚██████╔╝██║░╚███║██████╔╝███████╗██║░░██║██║░░░░░╚█████╔╝██████╔╝░░░██║░░░\r\n"
    printf "░╚═════╝░╚═╝░░╚══╝╚═════╝░╚══════╝╚═╝░░╚═╝╚═╝░░░░░░╚════╝░╚═════╝░░░░╚═╝░░░\r\n"
    printf "==============================================\r\n"
    printf " Underpost Ephemeral Commissioning Active\r\n"
    printf "==============================================\r\n"
    printf " SSH as: root@%s\r\n" "$DETECTED_IP"
    printf "     or: %s@%s\r\n" "$ADMIN_USER" "$DETECTED_IP"
    printf " Key:    %s\r\n" "$([ -n "$AUTHORIZED_KEYS" ] && echo 'pubkey auth enabled' || echo 'password only')"
    printf " dnf:    ready (BaseOS, AppStream, Extras, EPEL)\r\n"
    printf "==============================================\r\n"
    printf "\r\n"
} > /dev/console 2>/dev/null || true

# 7. Infinite wait loop - keep Anaconda live environment active
while true; do
    sleep 60
    if ! pidof sshd >/dev/null 2>&1; then
        echo "$(date): sshd not running, restarting..." >> /tmp/ks-pre.log
        /usr/sbin/sshd 2>/dev/null || sshd 2>/dev/null
    fi
done
