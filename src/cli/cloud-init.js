import dotenv from 'dotenv';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import UnderpostBaremetal from './baremetal.js';
import { loggerFactory } from '../server/logger.js';
import { getNpmRootPath } from '../server/conf.js';

dotenv.config();

const logger = loggerFactory(import.meta);

class UnderpostCloudInit {
  static API = {
    buildTools({ workflowId, nfsHostPath, hostname, callbackMetaData, dev }) {
      const { systemProvisioning, chronyc, networkInterfaceName, debootstrap } =
        UnderpostBaremetal.API.workflowsConfig[workflowId];
      const { timezone, chronyConfPath } = chronyc;
      const nfsHostToolsPath = `${nfsHostPath}/underpost`;

      // Determine the root path for npm and underpost.
      const npmRoot = getNpmRootPath();
      const underpostRoot = dev === true ? '.' : `${npmRoot}/underpost`;

      switch (systemProvisioning) {
        case 'ubuntu': {
          if (fs.existsSync(`${nfsHostToolsPath}`)) fs.removeSync(`${nfsHostToolsPath}`);
          fs.mkdirSync(`${nfsHostToolsPath}`, { recursive: true });

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

          logger.info('Build', `${nfsHostToolsPath}/keyboard.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/keyboard.sh`,
            UnderpostBaremetal.API.stepsRender(
              UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].keyboard(),
              false,
            ),
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/host.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/host.sh`,
            `echo -e "127.0.0.1   localhost\n127.0.1.1   ${hostname}" | tee -a /etc/hosts`,
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/dns.sh`);
          // echo "nameserver ${process.env.MAAS_DNS}" | tee /etc/resolv.conf > /dev/null
          fs.writeFileSync(
            `${nfsHostToolsPath}/dns.sh`,
            `rm /etc/resolv.conf
echo 'nameserver 8.8.8.8' > /run/systemd/resolve/stub-resolv.conf
ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf`,
            'utf8',
          );

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

          logger.info('Build', `${nfsHostToolsPath}/reset.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/reset.sh`,
            `sudo cloud-init clean --seed --configs all --machine-id # --logs
sudo rm -rf /var/lib/cloud/*
echo '' > /var/log/cloud-init.log
echo '' > /var/log/cloud-init-output.log`,
            'utf8',
          );

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

          logger.info('Build', `${nfsHostToolsPath}/test.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/test.sh`,
            `echo -e "\n=== Current date/time ==="
date '+%Y-%m-%d %H:%M:%S'
echo -e "\n=== Keyboard layout ==="
cat /etc/default/keyboard
echo -e "\n=== Registered users ==="
cut -d: -f1 /etc/passwd`,
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/shutdown.sh`);
          fs.writeFileSync(`${nfsHostToolsPath}/shutdown.sh`, `sudo shutdown -h now`, 'utf8');

          logger.info('Build', `${nfsHostToolsPath}/mac.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/mac.sh`,
            `echo "$(cat /sys/class/net/${networkInterfaceName}/address)" > /underpost/mac`,
            'utf8',
          );

          logger.info('Build', `${nfsHostToolsPath}/device_scan.sh`);
          fs.copySync(`${underpostRoot}/manifests/maas/device-scan.sh`, `${nfsHostToolsPath}/device_scan.sh`);

          logger.info('Build', `${nfsHostToolsPath}/config-path.sh`);
          fs.writeFileSync(`${nfsHostToolsPath}/config-path.sh`, `echo "/etc/cloud/cloud.cfg.d/90_maas.cfg"`, 'utf8');

          logger.info('Build', `${nfsHostToolsPath}/enlistment.sh`);
          fs.writeFileSync(`${nfsHostToolsPath}/enlistment.sh`, ``, 'utf8');

          logger.info('Import ssh keys');
          shellExec(`sudo rm -rf ${nfsHostPath}/root/.ssh`);
          shellExec(`sudo rm -rf ${nfsHostPath}/home/root/.ssh`);
          logger.info('Copy', `/root/.ssh -> ${nfsHostPath}/root/.ssh`);
          fs.copySync(`/root/.ssh`, `${nfsHostPath}/root/.ssh`);

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
              `sudo chmod 700 ~/.ssh/`,
              `sudo chmod 600 ~/.ssh/authorized_keys`,
              `sudo chmod 644 ~/.ssh/known_hosts`,
              `sudo chmod 600 ~/.ssh/id_rsa`,
              `sudo chmod 600 /etc/ssh/ssh_host_ed25519_key`,
              `chown -R root:root ~/.ssh`,
              `/underpost/test.sh`,
            ],
          });

          break;
        }
        default:
          throw new Error('Invalid system provisioning: ' + systemProvisioning);
      }
    },
    configFactory(
      {
        controlServerIp,
        hostname,
        nfsHostPath,
        commissioningDeviceIp,
        gatewayip,
        auth,
        mac,
        timezone,
        chronyConfPath,
        networkInterfaceName,
      },
      authCredentials = { consumer_key: '', consumer_secret: '', token_key: '', token_secret: '' },
      path = '/etc/cloud/cloud.cfg.d/90_maas.cfg',
    ) {
      const { consumer_key, consumer_secret, token_key, token_secret } = authCredentials;
      // Configure cloud-init for MAAS
      return `cat <<EOF_MAAS_CFG > ${path}
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
      !auth
        ? ''
        : `consumer_key: ${consumer_key}
    consumer_secret: ${consumer_secret}
    token_key: ${token_key}
    token_secret: ${token_secret}`
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
  - snapd
  - chrony
resize_rootfs: false
growpart:
  mode: "off"
network:
  version: 2
  ethernets:
    ${networkInterfaceName}:
      match:
        macaddress: "${
          fs.existsSync(`${nfsHostPath}/underpost/mac`)
            ? fs.readFileSync(`${nfsHostPath}/underpost/mac`, 'utf8').trim()
            : mac
        }"
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
#  - scripts-user
  - ssh-authkey-fingerprints
  - keys-to-console
#  - phone-home
  - final-message
  - power-state-change
EOF_MAAS_CFG`;
    },
  };
}

export default UnderpostCloudInit;
