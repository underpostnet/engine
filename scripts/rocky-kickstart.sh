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

# 4. Configure sshd
if [ -f /etc/ssh/sshd_config ]; then
  sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
  sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
  sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
  sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication yes/' /etc/ssh/sshd_config
  sed -i 's/^#*UsePAM.*/UsePAM yes/' /etc/ssh/sshd_config
  sed -i 's/^#*KbdInteractiveAuthentication.*/KbdInteractiveAuthentication yes/' /etc/ssh/sshd_config
  grep -q "^PasswordAuthentication" /etc/ssh/sshd_config || echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config
  grep -q "^PermitRootLogin" /etc/ssh/sshd_config || echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
  grep -q "^PubkeyAuthentication" /etc/ssh/sshd_config || echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config
else
  mkdir -p /etc/ssh
  cat > /etc/ssh/sshd_config << 'SSHEOF'
Port 22
PermitRootLogin yes
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PasswordAuthentication yes
ChallengeResponseAuthentication yes
KbdInteractiveAuthentication yes
UsePAM yes
Subsystem sftp /usr/libexec/openssh/sftp-server
SSHEOF
fi

if [ -d /etc/ssh/sshd_config.d ]; then
  cat > /etc/ssh/sshd_config.d/00-underpost.conf << 'SSHCONF'
PermitRootLogin yes
PasswordAuthentication yes
PubkeyAuthentication yes
KbdInteractiveAuthentication yes
SSHCONF
fi

if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
  ssh-keygen -A 2>/dev/null || {
    ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key -N "" 2>/dev/null
    ssh-keygen -t ecdsa -f /etc/ssh/ssh_host_ecdsa_key -N "" 2>/dev/null
    ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N "" 2>/dev/null
  }
fi

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

# Restart sshd
if command -v systemctl >/dev/null 2>&1; then
  systemctl restart sshd 2>/dev/null || systemctl restart sshd.service 2>/dev/null
fi
SSHD_PID=$(cat /var/run/sshd.pid 2>/dev/null || pidof sshd 2>/dev/null | awk '{print $1}')
[ -n "$SSHD_PID" ] && kill -HUP "$SSHD_PID" 2>/dev/null
if ! pidof sshd >/dev/null 2>&1; then
  /usr/sbin/sshd 2>/dev/null || sshd 2>/dev/null
fi

# 6. Status report
DETECTED_IP=$(ip -4 addr show | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d/ -f1 | head -1)

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
