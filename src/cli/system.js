/**
 * System provisioning module for Underpost CLI.
 * This module provides a factory for generating shell commands to provision systems based on their OS type.
 * It includes methods for basic system setup, user creation, timezone configuration, and keyboard layout settings.
 * The provisioning steps are tailored for both Ubuntu and Rocky Linux distributions, ensuring compatibility and ease of use.
 * @module src/cli/system.js
 * @namespace UnderpostSystemProvisionig
 */

import fs from 'fs-extra';

/**
 * @class UnderpostSystemProvisionig
 * @description A class that encapsulates the system provisioning logic for Underpost CLI. It provides a structured way to generate shell commands for provisioning systems based on their OS type, including Ubuntu and Rocky Linux. The class contains a static API object with a factory for different provisioning steps, making it easy to extend and maintain.
 * @memberof UnderpostSystemProvisionig
 */
class UnderpostSystemProvisionig {
  static API = {
    /**
     * @property {object} factory
     * @description A factory object containing functions for system provisioning based on OS type.
     * Each OS type (e.g., 'ubuntu') provides methods for base system setup, user creation,
     * timezone configuration, and keyboard layout settings.
     * @memberof UnderpostSystemProvisionig
     */
    factory: {
      /**
       * @property {object} ubuntu
       * @description Provisioning steps for Ubuntu-based systems.
       * @memberof UnderpostSystemProvisionig
       */
      ubuntu: {
        /**
         * @method base
         * @description Generates shell commands for basic Ubuntu system provisioning.
         * This includes updating package lists, installing essential build tools,
         * kernel modules, cloud-init, SSH server, and other core utilities.
         * @param {object} params - The parameters for the function.
         * @memberof UnderpostSystemProvisionig
         * @returns {string[]} An array of shell commands.
         */
        base: () => [
          // Configure APT sources for Ubuntu ports
          `cat <<SOURCES | tee /etc/apt/sources.list
deb http://ports.ubuntu.com/ubuntu-ports noble main restricted universe multiverse
deb http://ports.ubuntu.com/ubuntu-ports noble-updates main restricted universe multiverse
deb http://ports.ubuntu.com/ubuntu-ports noble-security main restricted universe multiverse
SOURCES`,

          // Update package lists and perform a full system upgrade
          `apt update -qq`,
          `apt -y full-upgrade`,

          // Install all essential packages in one consolidated step
          `DEBIAN_FRONTEND=noninteractive apt install -y build-essential xinput x11-xkb-utils usbutils uuid-runtime linux-image-generic systemd-sysv openssh-server sudo locales udev util-linux iproute2 netplan.io ca-certificates curl wget chrony apt-utils tzdata kmod keyboard-configuration console-setup iputils-ping`,

          // Ensure systemd is the init system
          `ln -sf /lib/systemd/systemd /sbin/init`,

          // Clean up
          `apt-get clean`,
        ],
        /**
         * @method user
         * @description Generates shell commands for creating a root user and configuring SSH access.
         * This is a critical security step for initial access to the provisioned system.
         * @memberof UnderpostSystemProvisionig
         * @returns {string[]} An array of shell commands.
         */
        user: () => [
          `useradd -m -s /bin/bash -G sudo root`, // Create a root user with bash shell and sudo privileges.
          `echo 'root:root' | chpasswd`, // Set a default password for the root user (consider more secure methods for production).
          `mkdir -p /home/root/.ssh`, // Create .ssh directory for authorized keys.
          // Add the public SSH key to authorized_keys for passwordless login.
          `echo '${fs.readFileSync(
            `/home/dd/engine/engine-private/deploy/id_rsa.pub`,
            'utf8',
          )}' > /home/root/.ssh/authorized_keys`,
          `chown -R root /home/root/.ssh`, // Set ownership for security.
          `chmod 700 /home/root/.ssh`, // Set permissions for the .ssh directory.
          `chmod 600 /home/root/.ssh/authorized_keys`, // Set permissions for authorized_keys.
        ],
        /**
         * @method timezone
         * @description Generates shell commands for configuring the system timezone and Chrony (NTP client).
         * Accurate time synchronization is essential for logging, security, and distributed systems.
         * @param {object} params - The parameters for the function.
         * @param {string} params.timezone - The timezone string (e.g., 'America/New_York').
         * @param {string} params.chronyConfPath - The path to the Chrony configuration file.
         * @param {string} [alias='chrony'] - The alias for the chrony service.
         * @memberof UnderpostSystemProvisionig
         * @returns {string[]} An array of shell commands.
         */
        timezone: ({ timezone, chronyConfPath }, alias = 'chrony') => [
          `export DEBIAN_FRONTEND=noninteractive`, // Set non-interactive mode for Debian packages.
          `ln -fs /usr/share/zoneinfo/${timezone} /etc/localtime`, // Symlink timezone.
          `sudo dpkg-reconfigure --frontend noninteractive tzdata`, // Reconfigure timezone data.
          `sudo timedatectl set-timezone ${timezone}`, // Set timezone using timedatectl.
          `sudo timedatectl set-ntp true`, // Enable NTP synchronization.

          // Write the Chrony configuration file.
          `echo '
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
# pool 2.pool.ntp.org iburst
server ${process.env.MAAS_NTP_SERVER} iburst

# Record the rate at which the system clock gains/losses time.
driftfile /var/lib/chrony/drift

# Allow the system clock to be stepped in the first three updates
# if its offset is larger than 1 second.
makestep 1.0 3

# Enable kernel synchronization of the real-time clock (RTC).
rtcsync

# Enable hardware timestamping on all interfaces that support it.
#hwtimestamp *

# Increase the minimum number of selectable sources required to adjust
# the system clock.
#minsources 2

# Allow NTP client access from local network.
#allow 192.168.0.0/16

# Serve time even if not synchronized to a time source.
#local stratum 10

# Specify file containing keys for NTP authentication.
keyfile /etc/chrony.keys

# Get TAI-UTC offset and leap seconds from the system tz database.
leapsectz right/UTC

# Specify directory for log files.
logdir /var/log/chrony

# Select which information is logged.
#log measurements statistics tracking
' > ${chronyConfPath}`,
          `systemctl stop ${alias}`, // Stop Chrony service before reconfiguring.

          // Enable, restart, and check status of Chrony service.
          `sudo systemctl enable --now ${alias}`,
          `sudo systemctl restart ${alias}`,

          // Wait for chrony to synchronize
          `echo "Waiting for chrony to synchronize..."`,
          `for i in {1..30}; do chronyc tracking | grep -q "Leap status     : Normal" && break || sleep 2; done`,

          `sudo systemctl status ${alias}`,

          // Verify Chrony synchronization.
          `chronyc sources`,
          `chronyc tracking`,

          `chronyc sourcestats -v`, // Display source statistics.
          `timedatectl status`, // Display current time and date settings.
        ],
        /**
         * @method keyboard
         * @description Generates shell commands for configuring the keyboard layout.
         * This ensures correct input behavior on the provisioned system.
         * @param {string} [keyCode='en'] - The keyboard layout code (e.g., 'en', 'es').
         * @memberof UnderpostSystemProvisionig
         * @returns {string[]} An array of shell commands.
         */
        keyboard: (keyCode = 'en') => [
          `sudo locale-gen en_US.UTF-8`,
          `sudo update-locale LANG=en_US.UTF-8`,
          `sudo sed -i 's/XKBLAYOUT="us"/XKBLAYOUT="${keyCode}"/' /etc/default/keyboard`,
          `sudo dpkg-reconfigure --frontend noninteractive keyboard-configuration`,
          `sudo systemctl restart keyboard-setup.service`,
        ],
      },
      /**
       * @property {object} rocky
       * @description Provisioning steps for Rocky Linux-based systems.
       * @memberof UnderpostSystemProvisionig
       */
      rocky: {
        /**
         * @method base
         * @description Generates shell commands for basic Rocky Linux system provisioning.
         * This includes installing Node.js, npm, and underpost CLI tools.
         * @param {object} params - The parameters for the function.
         * @memberof UnderpostSystemProvisionig
         * @returns {string[]} An array of shell commands.
         */
        base: () => [
          // Update system and install EPEL repository
          `dnf -y update`,
          `dnf -y install epel-release`,

          // Install essential system tools (avoiding duplicates from container packages)
          `dnf -y install --allowerasing bzip2 openssh-server nano vim-enhanced less openssl-devel git gnupg2 libnsl perl`,
          `dnf clean all`,

          // Install Node.js
          `curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -`,
          `dnf install -y nodejs`,
          `dnf clean all`,

          // Verify Node.js and npm versions
          `node --version`,
          `npm --version`,

          // Install underpost ci/cd cli
          `npm install -g underpost`,
          `underpost --version`,
        ],
        /**
         * @method user
         * @description Generates shell commands for creating a root user and configuring SSH access on Rocky Linux.
         * This is a critical security step for initial access to the provisioned system.
         * @memberof UnderpostSystemProvisionig
         * @returns {string[]} An array of shell commands.
         */
        user: () => [
          `useradd -m -s /bin/bash -G wheel root`, // Create a root user with bash shell and wheel group (sudo on RHEL)
          `echo 'root:root' | chpasswd`, // Set a default password for the root user
          `mkdir -p /home/root/.ssh`, // Create .ssh directory for authorized keys
          // Add the public SSH key to authorized_keys for passwordless login
          `echo '${fs.readFileSync(
            `/home/dd/engine/engine-private/deploy/id_rsa.pub`,
            'utf8',
          )}' > /home/root/.ssh/authorized_keys`,
          `chown -R root:root /home/root/.ssh`, // Set ownership for security
          `chmod 700 /home/root/.ssh`, // Set permissions for the .ssh directory
          `chmod 600 /home/root/.ssh/authorized_keys`, // Set permissions for authorized_keys
        ],
        /**
         * @method timezone
         * @description Generates shell commands for configuring the system timezone on Rocky Linux.
         * @param {object} params - The parameters for the function.
         * @param {string} params.timezone - The timezone string (e.g., 'America/Santiago').
         * @param {string} params.chronyConfPath - The path to the Chrony configuration file (optional).
         * @memberof UnderpostSystemProvisionig
         * @returns {string[]} An array of shell commands.
         */
        timezone: ({ timezone, chronyConfPath = '/etc/chrony.conf' }) => [
          // Set system timezone using both methods (for chroot and running system)
          `ln -sf /usr/share/zoneinfo/${timezone} /etc/localtime`,
          `echo '${timezone}' > /etc/timezone`,
          `timedatectl set-timezone ${timezone} 2>/dev/null`,

          // Configure chrony with local NTP server and common NTP pools
          `echo '# Local NTP server' > ${chronyConfPath}`,
          `echo 'server 192.168.1.1 iburst prefer' >> ${chronyConfPath}`,
          `echo '' >> ${chronyConfPath}`,
          `echo '# Fallback public NTP servers' >> ${chronyConfPath}`,
          `echo 'server 0.pool.ntp.org iburst' >> ${chronyConfPath}`,
          `echo 'server 1.pool.ntp.org iburst' >> ${chronyConfPath}`,
          `echo 'server 2.pool.ntp.org iburst' >> ${chronyConfPath}`,
          `echo 'server 3.pool.ntp.org iburst' >> ${chronyConfPath}`,
          `echo '' >> ${chronyConfPath}`,
          `echo '# Configuration' >> ${chronyConfPath}`,
          `echo 'driftfile /var/lib/chrony/drift' >> ${chronyConfPath}`,
          `echo 'makestep 1.0 3' >> ${chronyConfPath}`,
          `echo 'rtcsync' >> ${chronyConfPath}`,
          `echo 'logdir /var/log/chrony' >> ${chronyConfPath}`,

          // Enable chronyd to start on boot
          `systemctl enable chronyd 2>/dev/null`,

          // Create systemd link for boot (works in chroot)
          `mkdir -p /etc/systemd/system/multi-user.target.wants`,
          `ln -sf /usr/lib/systemd/system/chronyd.service /etc/systemd/system/multi-user.target.wants/chronyd.service 2>/dev/null`,

          // Start chronyd if systemd is running
          `systemctl start chronyd 2>/dev/null`,

          // Restart chronyd to apply configuration
          `systemctl restart chronyd 2>/dev/null`,

          // Force immediate time synchronization (only if chronyd is running)
          `chronyc makestep 2>/dev/null`,

          // Verify timezone configuration
          `ls -l /etc/localtime`,
          `cat /etc/timezone || echo 'No /etc/timezone file'`,
          `timedatectl status 2>/dev/null || echo 'Timezone set to ${timezone} (timedatectl not available in chroot)'`,
          `chronyc tracking 2>/dev/null || echo 'Chrony configured but not running (will start on boot)'`,
        ],
        /**
         * @method keyboard
         * @description Generates shell commands for configuring the keyboard layout on Rocky Linux.
         * This uses localectl to set the keyboard layout for both console and X11.
         * @param {string} [keyCode='us'] - The keyboard layout code (e.g., 'us', 'es').
         * @memberof UnderpostSystemProvisionig
         * @returns {string[]} An array of shell commands.
         */
        keyboard: (keyCode = 'us') => [
          // Configure vconsole.conf for console keyboard layout (persistent)
          `echo 'KEYMAP=${keyCode}' > /etc/vconsole.conf`,
          `echo 'FONT=latarcyrheb-sun16' >> /etc/vconsole.conf`,

          // Configure locale.conf for system locale
          `echo 'LANG=en_US.UTF-8' > /etc/locale.conf`,
          `echo 'LC_ALL=en_US.UTF-8' >> /etc/locale.conf`,

          // Set keyboard layout using localectl (works if systemd is running)
          `localectl set-locale LANG=en_US.UTF-8 2>/dev/null`,
          `localectl set-keymap ${keyCode} 2>/dev/null`,
          `localectl set-x11-keymap ${keyCode} 2>/dev/null`,

          // Configure X11 keyboard layout file directly
          `mkdir -p /etc/X11/xorg.conf.d`,
          `echo 'Section "InputClass"' > /etc/X11/xorg.conf.d/00-keyboard.conf`,
          `echo '    Identifier "system-keyboard"' >> /etc/X11/xorg.conf.d/00-keyboard.conf`,
          `echo '    MatchIsKeyboard "on"' >> /etc/X11/xorg.conf.d/00-keyboard.conf`,
          `echo '    Option "XkbLayout" "${keyCode}"' >> /etc/X11/xorg.conf.d/00-keyboard.conf`,
          `echo 'EndSection' >> /etc/X11/xorg.conf.d/00-keyboard.conf`,

          // Load the keymap immediately (if not in chroot)
          `loadkeys ${keyCode} 2>/dev/null || echo 'Keymap ${keyCode} configured (loadkeys not available in chroot)'`,

          // Verify configuration
          `echo 'Keyboard configuration files:'`,
          `cat /etc/vconsole.conf`,
          `cat /etc/locale.conf`,
          `cat /etc/X11/xorg.conf.d/00-keyboard.conf 2>/dev/null || echo 'X11 config created'`,
          `localectl status 2>/dev/null || echo 'Keyboard layout set to ${keyCode} (localectl not available in chroot)'`,
        ],
      },
    },
  };
}

export default UnderpostSystemProvisionig;
