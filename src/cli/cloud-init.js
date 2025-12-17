/**
 * Cloud-init module for managing the generation and deployment of cloud-init configuration files
 * and associated scripts for baremetal provisioning.
 * @module src/cli/cloud-init.js
 * @namespace UnderpostCloudInit
 */

import dotenv from 'dotenv';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import UnderpostBaremetal from './baremetal.js';
import { loggerFactory } from '../server/logger.js';
import { getNpmRootPath } from '../server/conf.js';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostCloudInit
 * @description Manages the generation and deployment of cloud-init configuration files
 * and associated scripts for baremetal provisioning. This class provides methods
 * to build various shell scripts and a cloud-init configuration file tailored
 * for MAAS (Metal as a Service) integration.
 * @memberof UnderpostCloudInit
 */
class UnderpostCloudInit {
  static API = {
    /**
     * @method buildTools
     * @description Builds and writes various shell scripts and configuration files
     * to the NFS host path, which are then used by the target baremetal machine
     * during the cloud-init process.
     * @param {object} params - The parameters for building the tools.
     * @param {string} params.workflowId - The identifier for the specific workflow configuration.
     * @param {string} params.nfsHostPath - The base path on the NFS host where tools will be written.
     * @param {string} params.hostname - The hostname of the target baremetal machine.
     * @param {object} params.callbackMetaData - Metadata about the callback, used for dynamic configuration.
     * @param {boolean} params.dev - Development mode flag.
     * @returns {void}
     * @memberof UnderpostCloudInit
     */
    buildTools({ workflowId, nfsHostPath, hostname, callbackMetaData, dev }) {
      // Destructure workflow configuration for easier access.
      const { systemProvisioning, chronyc, networkInterfaceName, debootstrap, keyboard } =
        UnderpostBaremetal.API.loadWorkflowsConfig()[workflowId];
      const { timezone, chronyConfPath } = chronyc;
      // Define the specific directory for underpost tools within the NFS host path.
      const nfsHostToolsPath = `${nfsHostPath}/underpost`;

      // Determine the root path for npm and underpost based on development mode.
      const npmRoot = getNpmRootPath();
      const underpostRoot = dev === true ? '.' : `${npmRoot}/underpost`;

      // Use a switch statement to handle different system provisioning types.
      switch (systemProvisioning) {
        case 'ubuntu': {
          // Ensure the target directory for tools is clean and exists.
          if (fs.existsSync(`${nfsHostToolsPath}`)) fs.removeSync(`${nfsHostToolsPath}`);
          fs.mkdirSync(`${nfsHostToolsPath}`, { recursive: true });

          // Build and write the date configuration script.
          logger.info('Build', `${nfsHostToolsPath}/date.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/date.sh`,
            UnderpostBaremetal.API.stepsRender(
              UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].timezone({
                timezone,
                chronyConfPath,
              }),
              false,
            ),
            'utf8',
          );

          // Build and write the keyboard configuration script.
          logger.info('Build', `${nfsHostToolsPath}/keyboard.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/keyboard.sh`,
            UnderpostBaremetal.API.stepsRender(
              UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].keyboard(keyboard.layout),
              false,
            ),
            'utf8',
          );

          // Build and write the hosts file configuration script.
          logger.info('Build', `${nfsHostToolsPath}/host.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/host.sh`,
            `echo -e "127.0.0.1   localhost\n127.0.1.1   ${hostname}" | tee -a /etc/hosts`,
            'utf8',
          );

          // Build and write the DNS configuration script.
          logger.info('Build', `${nfsHostToolsPath}/dns.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/dns.sh`,
            `rm /etc/resolv.conf
echo 'nameserver 8.8.8.8' > /run/systemd/resolve/stub-resolv.conf
ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf`,
            'utf8',
          );

          // Build and write the main startup script for cloud-init.
          logger.info('Build', `${nfsHostToolsPath}/start.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/start.sh`,
            `#!/bin/bash
set -x
# sudo cloud-init --all-stages
${UnderpostBaremetal.API.stepsRender(
  [
    `/underpost/date.sh`,
    `sleep 3`,
    `/underpost/reset.sh`,
    `sleep 3`,
    `cloud-init init --local`,
    `sleep 3`,
    `cloud-init init`,
    `sleep 3`,
    `cloud-init modules --mode=config`,
    `sleep 3`,
    `cloud-init modules --mode=final`,
    `sleep 3`,
    `/underpost/enlistment.sh`,
  ],
  false,
)}`,
            'utf8',
          );

          // Build and write the cloud-init reset script.
          logger.info('Build', `${nfsHostToolsPath}/reset.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/reset.sh`,
            `sudo cloud-init clean --seed --configs all --machine-id # --logs
sudo rm -rf /var/lib/cloud/*
echo '' > /var/log/cloud-init.log
echo '' > /var/log/cloud-init-output.log`,
            'utf8',
          );

          // Build and write the cloud-init help script.
          logger.info('Build', `${nfsHostToolsPath}/help.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/help.sh`,
            `echo "=== Cloud init utils ==="
echo "sudo cloud-init --all-stages"
echo "sudo cloud-init clean --logs --seed --configs all --machine-id --reboot"
echo "sudo cloud-init init --local"
echo "sudo cloud-init init"
echo "sudo cloud-init modules --mode=config"
echo "sudo cloud-init modules --mode=final"`,
            'utf8',
          );

          // Build and write the test script for verifying configuration.
          logger.info('Build', `${nfsHostToolsPath}/test.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/test.sh`,
            `echo -e "\necho -e "\n=== Registered users ==="
cut -d: -f1 /etc/passwd
=== Current date/time ==="
date '+%Y-%m-%d %H:%M:%S'
echo -e "\n=== Timezone Configuration ==="
timedatectl status
echo -e "\n=== Chrony Synchronization Status ==="
chronyc tracking
echo -e "\n=== Chrony Sources ==="
chronyc sources
echo -e "\n=== Keyboard layout ==="
cat /etc/default/keyboard`,
            'utf8',
          );

          // Build and write the shutdown script.
          logger.info('Build', `${nfsHostToolsPath}/shutdown.sh`);
          fs.writeFileSync(`${nfsHostToolsPath}/shutdown.sh`, `sudo shutdown -h now`, 'utf8');

          // Build and write the MAC address retrieval script.
          logger.info('Build', `${nfsHostToolsPath}/mac.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/mac.sh`,
            `echo "$(cat /sys/class/net/${networkInterfaceName}/address)" > /underpost/mac`,
            'utf8',
          );

          // Copy the device scan script from manifests.
          logger.info('Build', `${nfsHostToolsPath}/device_scan.sh`);
          fs.copySync(`${underpostRoot}/scripts/device-scan.sh`, `${nfsHostToolsPath}/device_scan.sh`);

          // Build and write the config path script.
          logger.info('Build', `${nfsHostToolsPath}/config-path.sh`);
          fs.writeFileSync(`${nfsHostToolsPath}/config-path.sh`, `echo "/etc/cloud/cloud.cfg.d/90_maas.cfg"`, 'utf8');

          // Build and write the MAAS enlistment script.
          logger.info('Build', `${nfsHostToolsPath}/enlistment.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/enlistment.sh`,
            `#!/bin/bash
set -x

# ------------------------------------------------------------
# Step: Commission a machine in MAAS using OAuth1 authentication
# ------------------------------------------------------------

MACHINE_ID=$(cat /underpost/system-id)
CONSUMER_KEY=$(cat /underpost/consumer-key)
TOKEN_KEY=$(cat /underpost/token-key)
TOKEN_SECRET=$(cat /underpost/token-secret)

echo ">>> Starting MAAS machine commissioning for system_id: $MACHINE_ID …"

curl -X POST \\
  --fail --location --verbose --include --raw --trace-ascii /dev/stdout\\
  --header "Authorization:\\
  OAuth oauth_version=1.0,\\
  oauth_signature_method=PLAINTEXT,\\
  oauth_consumer_key=$CONSUMER_KEY,\\
  oauth_token=$TOKEN_KEY,\\
  oauth_signature=&$TOKEN_SECRET,\\
  oauth_nonce=$(uuidgen),\\
  oauth_timestamp=$(date +%s)"\\
  -F "commissioning_scripts=20-maas-01-install-lldpd"\\
  -F "enable_ssh=1"\\
  -F "skip_bmc_config=1"\\
  -F "skip_networking=1"\\
  -F "skip_storage=1"\\
  -F "testing_scripts=none"\\
  http://${callbackMetaData.runnerHost.ip}:5240/MAAS/api/2.0/machines/$MACHINE_ID/op-commission \\
  2>&1 | tee /underpost/enlistment.log || echo "ERROR: MAAS commissioning returned code $?"`,
            'utf8',
          );

          // Import SSH keys for root user.
          logger.info('Import ssh keys');
          shellExec(`sudo rm -rf ${nfsHostPath}/root/.ssh`);
          shellExec(`sudo rm -rf ${nfsHostPath}/home/root/.ssh`); // Ensure home root .ssh is also clean.
          logger.info('Copy', `/root/.ssh -> ${nfsHostPath}/root/.ssh`);
          fs.copySync(`/root/.ssh`, `${nfsHostPath}/root/.ssh`);

          // Enable execution permissions for all generated scripts and run a test.
          logger.info('Enable tools execution and test');
          UnderpostBaremetal.API.crossArchRunner({
            nfsHostPath,
            debootstrapArch: debootstrap.image.architecture,
            callbackMetaData,
            steps: [
              `chmod +x /underpost/date.sh`,
              `chmod +x /underpost/keyboard.sh`,
              `chmod +x /underpost/dns.sh`,
              `chmod +x /underpost/help.sh`,
              `chmod +x /underpost/config-path.sh`,
              `chmod +x /underpost/host.sh`,
              `chmod +x /underpost/test.sh`,
              `chmod +x /underpost/start.sh`,
              `chmod +x /underpost/reset.sh`,
              `chmod +x /underpost/shutdown.sh`,
              `chmod +x /underpost/device_scan.sh`,
              `chmod +x /underpost/mac.sh`,
              `chmod +x /underpost/enlistment.sh`,
              `sudo chmod 700 ~/.ssh/`, // Set secure permissions for .ssh directory.
              `sudo chmod 600 ~/.ssh/authorized_keys`, // Set secure permissions for authorized_keys.
              `sudo chmod 644 ~/.ssh/known_hosts`, // Set permissions for known_hosts.
              `sudo chmod 600 ~/.ssh/id_rsa`, // Set secure permissions for private key.
              `sudo chmod 600 /etc/ssh/ssh_host_ed25519_key`, // Set secure permissions for host key.
              `chown -R root:root ~/.ssh`, // Ensure root owns the .ssh directory.
              `/underpost/test.sh`, // Run the test script to verify setup.
            ],
          });

          break;
        }
        default:
          // Throw an error if an unsupported system provisioning type is provided.
          throw new Error('Invalid system provisioning: ' + systemProvisioning);
      }
    },

    /**
     * @method configFactory
     * @description Generates the cloud-init configuration file (`90_maas.cfg`)
     * for MAAS integration. This configuration includes hostname, network settings,
     * user accounts, SSH keys, timezone, NTP, and various cloud-init modules.
     * @param {object} params - The parameters for generating the configuration.
     * @param {string} params.controlServerIp - The IP address of the MAAS control server.
     * @param {string} params.hostname - The hostname of the target baremetal machine.
     * @param {string} params.commissioningDeviceIp - The IP address to assign to the commissioning device.
     * @param {string} params.gatewayip - The gateway IP address for the network.
     * @param {string} params.mac - The MAC address of the network interface.
     * @param {string} params.timezone - The timezone to set for the machine.
     * @param {string} params.chronyConfPath - The path to the Chrony configuration file.
     * @param {string} params.networkInterfaceName - The name of the primary network interface.
     * @param {object} [authCredentials={}] - Optional MAAS authentication credentials.
     * @param {string} [path='/etc/cloud/cloud.cfg.d/90_maas.cfg'] - The target path for the cloud-init configuration file.
     * @returns {string} The generated cloud-init configuration content.
     * @memberof UnderpostCloudInit
     */
    configFactory(
      {
        controlServerIp,
        hostname,
        commissioningDeviceIp,
        gatewayip,
        mac,
        timezone,
        chronyConfPath,
        networkInterfaceName,
      },
      authCredentials = { consumer_key: '', consumer_secret: '', token_key: '', token_secret: '' },
      path = '/etc/cloud/cloud.cfg.d/90_maas.cfg',
    ) {
      const { consumer_key, consumer_secret, token_key, token_secret } = authCredentials;
      // Configure cloud-init for MAAS using a heredoc string.
      const cloudConfigSrc = `
#cloud-config

hostname: ${hostname}
fqdn: ${hostname}.maas
# prefer_fqdn_over_hostname: true
# metadata_url: http://${controlServerIp}:5240/MAAS/metadata
# metadata_url: http://${controlServerIp}:5248/MAAS/metadata

# Check:
# /MAAS/metadata/latest/enlist-preseed/?op=get_enlist_preseed

# Debug:
# https://maas.io/docs/how-to-use-logging

datasource_list: [ MAAS ]
datasource:
  MAAS:
    metadata_url: http://${controlServerIp}:5240/MAAS/metadata/
    ${
      authCredentials?.consumer_key
        ? `consumer_key: ${consumer_key}
    consumer_secret: ${consumer_secret}
    token_key: ${token_key}
    token_secret: ${token_secret}`
        : ''
    }


users:
- name: ${process.env.MAAS_ADMIN_USERNAME}
  sudo: ["ALL=(ALL) NOPASSWD:ALL"]
  shell: /bin/bash
  lock_passwd: false
  groups: sudo,users,admin,wheel,lxd
  plain_text_passwd: '${process.env.MAAS_ADMIN_USERNAME}'
  ssh_authorized_keys:
    - ${fs.readFileSync(`/home/dd/engine/engine-private/deploy/id_rsa.pub`, 'utf8')}

# manage_resolv_conf: true
# resolv_conf:
#   nameservers: [8.8.8.8]

# keyboard:
#   layout: es

# check timedatectl on hostname
# timezone: America/Santiago
timezone: ${timezone}

ntp:
  enabled: true
  servers:
    - ${process.env.MAAS_NTP_SERVER}
  ntp_client: chrony
  config:
    confpath: ${chronyConfPath}

# ssh:
#   allow-pw: false
#   install-server: true

# ssh_pwauth: false

package_update: true
package_upgrade: true
packages:
  - git
  - htop
  - chrony
  - lldpd
  - lshw

resize_rootfs: false
growpart:
  mode: "off"
network:
  version: 2
  ethernets:
    ${networkInterfaceName}:
      match:
        macaddress: "${mac}"
      mtu: 1500
      set-name: ${networkInterfaceName}
      dhcp4: false
      addresses:
        - ${commissioningDeviceIp}/24
      routes:
        - to: default
          via: ${gatewayip}
#      gateway4: ${gatewayip}
      nameservers:
        addresses:
          - ${process.env.MAAS_DNS}

final_message: "====== Cloud init finished ======"

# power_state:
#   mode: reboot
#   message: Rebooting after initial setup
#   timeout: 30
#   condition: True

bootcmd:
  - echo "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -"
  - echo "Init bootcmd"
  - echo "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -"
${UnderpostBaremetal.API.stepsRender(
  [`/underpost/dns.sh`, `/underpost/host.sh`, `/underpost/mac.sh`, `cat /underpost/mac`],
  true,
)}
runcmd:
  - echo "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -"
  - echo "Init runcmd"
  - echo "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -"

# If this is set, 'root' will not be able to ssh in and they
# will get a message to login instead as the default $user
disable_root: true

# This will cause the set+update hostname module to not operate (if true)
preserve_hostname: false

# The modules that run in the 'init' stage
cloud_init_modules:
  - migrator
  - seed_random
  - bootcmd
  - write-files
  - growpart
  - resizefs
  - set_hostname
  - update_hostname
  - update_etc_hosts
  - ca-certs
  - rsyslog
  - users-groups
  - ssh

# The modules that run in the 'config' stage
cloud_config_modules:
# Emit the cloud config ready event
# this can be used by upstart jobs for 'start on cloud-config'.
  - emit_upstart
  - disk_setup
  - mounts
  - ssh-import-id
  - locale
  - set-passwords
  - grub-dpkg
  - apt-pipelining
  - apt-configure
  - package-update-upgrade-install
  - landscape
  - timezone
  - puppet
  - chef
  - salt-minion
  - mcollective
  - disable-ec2-metadata
  - runcmd
  - byobu
  - ssh-import-id
  - ntp


# phone_home:
#   url: "http://${controlServerIp}:5240/MAAS/metadata/v1/?op=phone_home"
#   post: all
#   tries: 3

# The modules that run in the 'final' stage
cloud_final_modules:
  - rightscale_userdata
  - scripts-vendor
  - scripts-per-once
  - scripts-per-boot
#  - scripts-per-instance
  - scripts-user
  - ssh-authkey-fingerprints
  - keys-to-console
#  - phone-home
  - final-message
  - power-state-change
`;
      return { cloudConfigPath: path, cloudConfigSrc };
    },

    /**
     * @method authCredentialsFactory
     * @description Retrieves MAAS API key credentials from the MAAS CLI.
     * This method parses the output of `maas apikey` to extract the consumer key,
     * consumer secret, token key, and token secret.
     * @returns {object} An object containing the MAAS authentication credentials.
     * @memberof UnderpostCloudInit
     * @throws {Error} If the MAAS API key format is invalid.
     */
    authCredentialsFactory() {
      // Expected formats:
      // <consumer_key>:<consumer_token>:<secret> (older format)
      // <consumer_key>:<consumer_secret>:<token_key>:<token_secret> (newer format)
      // Commands used to generate API keys:
      // maas apikey --with-names --username ${process.env.MAAS_ADMIN_USERNAME}
      // maas ${process.env.MAAS_ADMIN_USERNAME} account create-authorisation-token
      // maas apikey --generate --username ${process.env.MAAS_ADMIN_USERNAME}
      // Reference: https://github.com/CanonicalLtd/maas-docs/issues/647

      const parts = shellExec(`maas apikey --with-names --username ${process.env.MAAS_ADMIN_USERNAME}`, {
        stdout: true,
      })
        .trim()
        .split(`\n`)[0] // Take only the first line of output.
        .split(':'); // Split by colon to get individual parts.

      let consumer_key, consumer_secret, token_key, token_secret;

      // Determine the format of the API key and assign parts accordingly.
      if (parts.length === 4) {
        [consumer_key, consumer_secret, token_key, token_secret] = parts;
      } else if (parts.length === 3) {
        // Handle older 3-part format, setting consumer_secret as empty.
        [consumer_key, token_key, token_secret] = parts;
        consumer_secret = '""';
        token_secret = token_secret.split(' MAAS consumer')[0].trim(); // Clean up token secret.
      } else {
        // Throw an error if the format is not recognized.
        throw new Error('Invalid token format');
      }

      logger.info('Maas api token generated', { consumer_key, consumer_secret, token_key, token_secret });
      return { consumer_key, consumer_secret, token_key, token_secret };
    },

    /**
     * @method diskDeploymentUserDataFactory
     * @description Generates cloud-init user-data configuration for MAAS disk-based deployments.
     * This is used during the MAAS deployment phase (not commissioning) to configure
     * the machine after the OS is installed to disk. MAAS injects this via its metadata service.
     * Supports abstract configuration for any system provisioning type (ubuntu, rocky, etc.)
     * and architecture (amd64, arm64, etc.).
     * @param {object} params - The parameters for building the user-data.
     * @param {string} params.hostname - The hostname for the deployed machine.
     * @param {string} params.timezone - The timezone to configure.
     * @param {string} params.chronyConfPath - Path to chrony configuration.
     * @param {string} params.ntpServer - NTP server address.
     * @param {string} params.keyboardLayout - Keyboard layout (e.g., 'es', 'us').
     * @param {string} params.sshPublicKey - SSH public key for admin user.
     * @param {string} params.adminUsername - Admin username for the system.
     * @param {string} params.systemProvisioning - System provisioning type ('ubuntu', 'rocky', etc.).
     * @param {string[]} params.packages - Array of package names to install (system-specific).
     * @param {string} params.architecture - Architecture identifier (e.g., 'amd64', 'arm64/generic').
     * @param {boolean} params.enlistment - Whether to perform MAAS enlistment after deployment.
     * @param {object} params.maasConfig - MAAS configuration for enlistment.
     * @returns {string} The cloud-init user-data YAML content.
     * @memberof UnderpostCloudInit
     */
    diskDeploymentUserDataFactory({
      hostname,
      timezone = 'UTC',
      chronyConfPath = '/etc/chrony/chrony.conf',
      ntpServer = '0.pool.ntp.org',
      keyboardLayout = 'us',
      sshPublicKey,
      adminUsername = 'admin',
      systemProvisioning = 'ubuntu',
      packages = [],
      architecture = 'amd64',
      enlistment = false,
      maasConfig = {},
    }) {
      const { ip, systemId, consumerKey, tokenKey, tokenSecret } = maasConfig;

      // Determine package manager and service names based on system provisioning type
      const isRHELBased = systemProvisioning === 'rocky' || systemProvisioning === 'rhel';
      const packageManager = isRHELBased ? 'dnf' : 'apt';
      const chronySvcName = isRHELBased ? 'chronyd' : 'chrony';
      const sshSvcName = isRHELBased ? 'sshd' : 'ssh';

      // Build default package list if none provided
      let finalPackages = packages && packages.length > 0 ? packages : this._getDefaultPackages(systemProvisioning);

      // Build runcmd based on system type
      let runCmds = [
        `systemctl enable ${sshSvcName}`,
        `systemctl start ${sshSvcName}`,
        `systemctl enable lldpd`,
        `systemctl start lldpd`,
        `systemctl enable ${chronySvcName}`,
        `systemctl restart ${chronySvcName}`,
        `timedatectl set-timezone ${timezone}`,
      ];

      if (enlistment) {
        runCmds.push(
          `echo ">>> Starting MAAS machine commissioning for system_id: ${systemId} …"`,
          `curl -X POST \\
  --fail --location --verbose --include --raw --trace-ascii /dev/stdout\\
  --header "Authorization:\\
  OAuth oauth_version=1.0,\\
  oauth_signature_method=PLAINTEXT,\\
  oauth_consumer_key=${consumerKey},\\
  oauth_token=${tokenKey},\\
  oauth_signature=&${tokenSecret},\\
  oauth_nonce=$(uuidgen),\\
  oauth_timestamp=$(date +%s)"\\
  -F "commissioning_scripts=20-maas-01-install-lldpd"\\
  -F "enable_ssh=1"\\
  -F "skip_bmc_config=1"\\
  -F "skip_networking=1"\\
  -F "skip_storage=1"\\
  -F "testing_scripts=none"\\
  http://${ip}:5240/MAAS/api/2.0/machines/${systemId}/op-commission`,
        );
      }

      // Determine package update method
      const packageUpdateBlock = isRHELBased
        ? `package_update: true
package_upgrade: true
package_reboot_if_required: true`
        : `package_update: true
package_upgrade: false`;

      return `#cloud-config
# MAAS Disk-Based Deployment User-Data
# This configuration is applied by MAAS after deploying the OS to disk
# Generated for: ${hostname}
# System: ${systemProvisioning} | Architecture: ${architecture}

hostname: ${hostname}
fqdn: ${hostname}.maas
prefer_fqdn_over_hostname: true

# User configuration
users:
  - name: ${adminUsername}
    sudo: ["ALL=(ALL) NOPASSWD:ALL"]
    shell: /bin/bash
    lock_passwd: false
    groups: ${isRHELBased ? 'wheel,users,adm,systemd-journal' : 'sudo,users,admin,wheel,adm,systemd-journal'}
    plain_text_passwd: '${adminUsername}'
    ssh_authorized_keys:
      - ${sshPublicKey}

# Timezone configuration
timezone: ${timezone}

# NTP configuration
ntp:
  enabled: true
  servers:
    - ${ntpServer}
    - 1.pool.ntp.org
    - 2.pool.ntp.org
  ntp_client: chrony
  config:
    confpath: ${chronyConfPath}

# Keyboard layout
keyboard:
  layout: ${keyboardLayout}

# SSH configuration
ssh:
  install-server: true
  allow-pw: true
ssh_pwauth: true

# Package installation
${packageUpdateBlock}
packages:
${finalPackages.map((pkg) => `  - ${pkg}`).join('\n')}

# Enable services
runcmd:
${runCmds.map((cmd) => `  - ${cmd}`).join('\n')}

# Final message
final_message: "System deployment complete for ${hostname} at \$TIMESTAMP"
`;
    },

    /**
     * @method _getDefaultPackages
     * @private
     * @description Returns default package list based on system provisioning type.
     * @param {string} systemProvisioning - The system provisioning type ('ubuntu', 'rocky', etc.).
     * @memberof UnderpostCloudInit
     * @returns {string[]} Array of package names.
     */
    _getDefaultPackages(systemProvisioning) {
      const isRHELBased = systemProvisioning === 'rocky' || systemProvisioning === 'rhel';

      const commonPackages = [
        'git',
        'htop',
        'curl',
        'wget',
        'chrony',
        'lldpd',
        'lshw',
        'smartmontools',
        'net-tools',
        'util-linux',
      ];

      if (isRHELBased) {
        return ['epel-release', ...commonPackages];
      }

      return commonPackages;
    },
  };
}

export default UnderpostCloudInit;
